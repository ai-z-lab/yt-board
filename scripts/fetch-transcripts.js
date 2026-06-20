#!/usr/bin/env node

const fs = require('node:fs/promises');
const path = require('node:path');

const DATA_FILE = path.resolve(__dirname, '../data/videos.json');
const TRANSCRIPT_LANGUAGES = ['ja', 'en'];

function extractYouTubeVideoId(url) {
  if (typeof url !== 'string' || url.trim() === '') {
    return '';
  }

  const trimmedUrl = url.trim();

  try {
    const parsedUrl = new URL(trimmedUrl);
    const hostname = parsedUrl.hostname.replace(/^www\./, '');

    if (hostname === 'youtu.be') {
      return parsedUrl.pathname.split('/').filter(Boolean)[0] || '';
    }

    if (hostname === 'youtube.com' || hostname.endsWith('.youtube.com')) {
      if (parsedUrl.pathname === '/watch') {
        return parsedUrl.searchParams.get('v') || '';
      }

      const pathParts = parsedUrl.pathname.split('/').filter(Boolean);
      if (['embed', 'shorts', 'live'].includes(pathParts[0])) {
        return pathParts[1] || '';
      }
    }
  } catch (error) {
    const match = trimmedUrl.match(/(?:v=|youtu\.be\/|embed\/|shorts\/|live\/)([a-zA-Z0-9_-]{6,})/);
    return match ? match[1] : '';
  }

  return '';
}

function decodeXmlText(text) {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function parseTranscriptXml(xml) {
  const segments = [...xml.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/g)];

  return segments
    .map((segment) => decodeXmlText(segment[1]))
    .filter(Boolean)
    .join('\n')
    .trim();
}

async function fetchTranscript(videoId) {
  for (const language of TRANSCRIPT_LANGUAGES) {
    const transcriptUrl = new URL('https://video.google.com/timedtext');
    transcriptUrl.searchParams.set('v', videoId);
    transcriptUrl.searchParams.set('lang', language);

    const response = await fetch(transcriptUrl);

    if (!response.ok) {
      continue;
    }

    const xml = await response.text();
    const transcript = parseTranscriptXml(xml);

    if (transcript) {
      return transcript;
    }
  }

  return '';
}

async function main() {
  const rawJson = await fs.readFile(DATA_FILE, 'utf8');
  const videos = JSON.parse(rawJson);

  if (!Array.isArray(videos)) {
    throw new Error('data/videos.json must contain an array of videos.');
  }

  let availableCount = 0;
  let unavailableCount = 0;

  const updatedVideos = [];

  for (const video of videos) {
    const updatedVideo = { ...video };
    const videoId = updatedVideo.videoId || extractYouTubeVideoId(updatedVideo.url);

    if (videoId) {
      updatedVideo.videoId = videoId;
    }

    if (!videoId) {
      updatedVideo.transcriptStatus = 'unavailable';
      unavailableCount += 1;
      console.warn(`Skipped: videoId could not be extracted for ${updatedVideo.id || updatedVideo.title || updatedVideo.url}`);
      updatedVideos.push(updatedVideo);
      continue;
    }

    try {
      const transcript = await fetchTranscript(videoId);

      if (transcript) {
        updatedVideo.transcript = transcript;
        updatedVideo.transcriptStatus = 'available';
        updatedVideo.transcriptSourceNote = updatedVideo.transcriptSourceNote || 'GitHub ActionsでYouTube字幕を取得';
        availableCount += 1;
        console.log(`Available: ${updatedVideo.id || videoId}`);
      } else {
        updatedVideo.transcriptStatus = 'unavailable';
        unavailableCount += 1;
        console.warn(`Unavailable: empty transcript for ${updatedVideo.id || videoId}`);
      }
    } catch (error) {
      updatedVideo.transcriptStatus = 'unavailable';
      unavailableCount += 1;
      console.warn(`Unavailable: ${updatedVideo.id || videoId} (${error.message})`);
    }

    updatedVideos.push(updatedVideo);
  }

  await fs.writeFile(DATA_FILE, `${JSON.stringify(updatedVideos, null, 2)}\n`);
  console.log(`Done. available=${availableCount}, unavailable=${unavailableCount}, total=${updatedVideos.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
