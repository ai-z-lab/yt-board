#!/usr/bin/env node

const fs = require('node:fs/promises');
const path = require('node:path');

const DEFAULT_DATA_FILE = path.resolve(__dirname, '../data/videos.json');
const TRANSCRIPT_LANGUAGES = ['ja', 'ja-JP', 'en', 'en-US'];

function extractYouTubeVideoId(input) {
  if (typeof input !== 'string' || input.trim() === '') return '';
  const trimmed = input.trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(trimmed)) return trimmed;

  try {
    const url = new URL(trimmed);
    const hostname = url.hostname.toLowerCase().replace(/^www\./, '');
    const parts = url.pathname.split('/').filter(Boolean);

    if (hostname === 'youtu.be') return sanitizeVideoId(parts[0]);
    if (hostname === 'youtube.com' || hostname.endsWith('.youtube.com')) {
      if (url.pathname === '/watch') return sanitizeVideoId(url.searchParams.get('v'));
      if (['embed', 'shorts', 'live'].includes(parts[0])) return sanitizeVideoId(parts[1]);
    }
  } catch (error) {
    const match = trimmed.match(/(?:v=|youtu\.be\/|embed\/|shorts\/|live\/)([A-Za-z0-9_-]{11})/);
    return match ? match[1] : '';
  }

  return '';
}

function sanitizeVideoId(value) {
  return /^[A-Za-z0-9_-]{11}$/.test(value || '') ? value : '';
}

function decodeXmlText(text) {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseTranscriptXml(xml) {
  return [...xml.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/g)]
    .map((match) => decodeXmlText(match[1]))
    .filter(Boolean)
    .join('\n')
    .trim();
}

function parseCaptionTracks(watchHtml) {
  const playerResponseMatch = watchHtml.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\});\s*(?:var\s+meta|<\/script>)/s);
  if (!playerResponseMatch) return [];

  try {
    const playerResponse = JSON.parse(playerResponseMatch[1]);
    return playerResponse.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
  } catch (error) {
    return [];
  }
}

async function fetchTimedText(videoId, language) {
  const url = new URL('https://video.google.com/timedtext');
  url.searchParams.set('v', videoId);
  url.searchParams.set('lang', language);

  const response = await fetch(url, { headers: { 'User-Agent': 'yt-board transcript verifier' } });
  if (!response.ok) return '';
  return parseTranscriptXml(await response.text());
}

async function fetchTranscript(videoId) {
  const directErrors = [];

  for (const language of TRANSCRIPT_LANGUAGES) {
    try {
      const transcript = await fetchTimedText(videoId, language);
      if (transcript) return { transcript, source: `timedtext:${language}` };
      directErrors.push(`${language}: empty`);
    } catch (error) {
      directErrors.push(`${language}: ${error.message}`);
    }
  }

  const watchResponse = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; yt-board transcript verifier)' },
  });

  if (!watchResponse.ok) {
    throw new Error(`YouTube watch page request failed: ${watchResponse.status}; direct timedtext=${directErrors.join(', ')}`);
  }

  const tracks = parseCaptionTracks(await watchResponse.text());
  if (tracks.length === 0) {
    throw new Error(`captionTracks not found. 字幕がない、非公開/年齢制限、またはYouTube側の取得制限の可能性があります。direct timedtext=${directErrors.join(', ')}`);
  }

  const preferredTrack = tracks.find((track) => TRANSCRIPT_LANGUAGES.includes(track.languageCode)) || tracks[0];
  const response = await fetch(preferredTrack.baseUrl, { headers: { 'User-Agent': 'yt-board transcript verifier' } });
  if (!response.ok) throw new Error(`caption track request failed: ${response.status}`);

  const transcript = parseTranscriptXml(await response.text());
  if (!transcript) throw new Error('caption track returned empty transcript.');

  return { transcript, source: `captionTrack:${preferredTrack.languageCode || 'unknown'}` };
}

function parseArgs(argv) {
  const args = { dataFile: DEFAULT_DATA_FILE, target: '' };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--url' || arg === '--video-id' || arg === '--target') args.target = argv[++i] || '';
    else if (arg === '--data') args.dataFile = path.resolve(argv[++i] || DEFAULT_DATA_FILE);
    else if (!arg.startsWith('--') && !args.target) args.target = arg;
  }
  return args;
}

function applyUnavailable(video, videoId, reason) {
  return {
    ...video,
    ...(videoId ? { videoId } : {}),
    transcriptStatus: 'unavailable',
    transcriptError: reason,
    transcriptUpdatedAt: new Date().toISOString(),
  };
}

async function updateVideo(video) {
  const videoId = sanitizeVideoId(video.videoId) || extractYouTubeVideoId(video.url || video.id || '');
  if (!videoId) return applyUnavailable(video, '', 'YouTube URLまたはvideoIdから有効なvideoIdを取得できませんでした。');

  try {
    const result = await fetchTranscript(videoId);
    return {
      ...video,
      videoId,
      transcript: result.transcript,
      transcriptStatus: 'available',
      transcriptError: '',
      transcriptUpdatedAt: new Date().toISOString(),
      transcriptSourceNote: video.transcriptSourceNote || `Node.jsでYouTube字幕を取得（${result.source}）`,
    };
  } catch (error) {
    return applyUnavailable(video, videoId, error.message);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const rawJson = await fs.readFile(args.dataFile, 'utf8');
  const videos = JSON.parse(rawJson);
  if (!Array.isArray(videos)) throw new Error(`${args.dataFile} must contain an array of videos.`);

  const targetVideoId = extractYouTubeVideoId(args.target);
  const shouldProcess = (video) => !targetVideoId || video.videoId === targetVideoId || extractYouTubeVideoId(video.url) === targetVideoId;
  const targetExists = targetVideoId && videos.some(shouldProcess);
  const inputVideos = targetVideoId && !targetExists ? [{ id: `manual-${targetVideoId}`, url: `https://www.youtube.com/watch?v=${targetVideoId}` }] : videos;

  let availableCount = 0;
  let unavailableCount = 0;
  let skippedCount = 0;

  const updatedVideos = [];
  for (const video of inputVideos) {
    if (!shouldProcess(video)) {
      skippedCount += 1;
      updatedVideos.push(video);
      continue;
    }

    const updated = await updateVideo(video);
    if (updated.transcriptStatus === 'available') availableCount += 1;
    else unavailableCount += 1;
    console.log(`${updated.transcriptStatus}: ${updated.id || updated.videoId} ${updated.transcriptError || ''}`.trim());
    updatedVideos.push(updated);
  }

  await fs.writeFile(args.dataFile, `${JSON.stringify(updatedVideos, null, 2)}\n`);
  console.log(`Done. available=${availableCount}, unavailable=${unavailableCount}, skipped=${skippedCount}, total=${updatedVideos.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
