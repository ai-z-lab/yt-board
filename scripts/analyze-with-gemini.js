#!/usr/bin/env node

const fs = require('node:fs/promises');
const path = require('node:path');

const DEFAULT_DATA_FILE = path.resolve(__dirname, '../data/videos.json');
const DEFAULT_MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash';
const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

function sanitizeVideoId(value) {
  return /^[A-Za-z0-9_-]{11}$/.test(value || '') ? value : '';
}

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

function toYouTubeUrl(target) {
  const videoId = extractYouTubeVideoId(target);
  if (!videoId) return '';
  return `https://www.youtube.com/watch?v=${videoId}`;
}

function parseArgs(argv) {
  const args = {
    dataFile: DEFAULT_DATA_FILE,
    target: '',
    note: '',
    template: '',
    model: DEFAULT_MODEL,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--url' || arg === '--video-id' || arg === '--target') args.target = argv[++i] || '';
    else if (arg === '--note') args.note = argv[++i] || '';
    else if (arg === '--template') args.template = argv[++i] || '';
    else if (arg === '--data') args.dataFile = path.resolve(argv[++i] || DEFAULT_DATA_FILE);
    else if (arg === '--model') args.model = argv[++i] || DEFAULT_MODEL;
    else if (!arg.startsWith('--') && !args.target) args.target = arg;
  }

  return args;
}

function buildPrompt({ youtubeUrl, note, template }) {
  return `以下のYouTube動画を、情報収集用に整理してください。

動画URL: ${youtubeUrl}
気になった理由・メモ: ${note || '未入力'}
テンプレート名: ${template || '未指定'}

目的は、動画を全部見る前に、
「見る価値があるか」
「発信ネタになるか」
「追加リサーチすべきか」
を判断することです。

出力は必ずJSONで返してください。Markdownやコードブロックは付けないでください。

JSON形式:
{
  "summary": "",
  "points": [],
  "insight": "",
  "watchDecision": "A/B/C/D",
  "deepDive": "あり/なし",
  "contentUse": "X/Threads/note/YouTube/なし",
  "risks": "",
  "recommendedAction": "",
  "status": "整理済み"
}`;
}

function extractResponseText(responseJson) {
  return responseJson?.candidates?.flatMap((candidate) => candidate.content?.parts || [])
    .map((part) => part.text || '')
    .join('\n')
    .trim() || '';
}

function parseJsonText(text) {
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch (error) {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw error;
  }
}

async function analyzeWithGemini({ apiKey, model, youtubeUrl, note, template }) {
  const response = await fetch(`${GEMINI_ENDPOINT}/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      contents: [{
        role: 'user',
        parts: [
          { file_data: { file_uri: youtubeUrl } },
          { text: buildPrompt({ youtubeUrl, note, template }) },
        ],
      }],
      generationConfig: { responseMimeType: 'application/json' },
    }),
  });

  const responseBody = await response.text();
  let responseJson;
  try {
    responseJson = JSON.parse(responseBody);
  } catch (error) {
    throw new Error(`Gemini API returned non-JSON response (${response.status}): ${responseBody.slice(0, 500)}`);
  }

  if (!response.ok) {
    throw new Error(responseJson.error?.message || `Gemini API request failed: ${response.status}`);
  }

  const text = extractResponseText(responseJson);
  if (!text) throw new Error('Gemini API response did not include text output.');
  return parseJsonText(text);
}

function findVideoIndex(videos, videoId, youtubeUrl) {
  return videos.findIndex((video) => {
    const currentVideoId = sanitizeVideoId(video.videoId) || extractYouTubeVideoId(video.url || video.id || '');
    return currentVideoId === videoId || video.url === youtubeUrl;
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is required. GitHub ActionsではGitHub Secretsに登録してください。');

  const youtubeUrl = toYouTubeUrl(args.target);
  const videoId = extractYouTubeVideoId(args.target);
  if (!youtubeUrl || !videoId) throw new Error('YouTube URLまたは11文字のvideoIdを指定してください。');

  const rawJson = await fs.readFile(args.dataFile, 'utf8').catch((error) => {
    if (error.code === 'ENOENT') return '[]';
    throw error;
  });
  const videos = JSON.parse(rawJson);
  if (!Array.isArray(videos)) throw new Error(`${args.dataFile} must contain an array of videos.`);

  const now = new Date().toISOString();
  const baseFields = {
    url: youtubeUrl,
    videoId,
    ...(args.note ? { note: args.note } : {}),
    ...(args.template ? { organizeTemplate: args.template } : {}),
    geminiAnalyzedAt: now,
    geminiModel: args.model,
  };

  let result;
  try {
    const analysis = await analyzeWithGemini({
      apiKey,
      model: args.model,
      youtubeUrl,
      note: args.note,
      template: args.template,
    });
    result = {
      ...baseFields,
      ...analysis,
      status: analysis.status || '整理済み',
      geminiError: '',
    };
    console.log(`organized: ${videoId}`);
  } catch (error) {
    result = {
      ...baseFields,
      status: '解析失敗',
      geminiError: error.message,
    };
    console.error(`failed: ${videoId} ${error.message}`);
  }

  const index = findVideoIndex(videos, videoId, youtubeUrl);
  if (index >= 0) videos[index] = { ...videos[index], ...result };
  else videos.push({ id: `manual-${videoId}`, ...result });

  await fs.writeFile(args.dataFile, `${JSON.stringify(videos, null, 2)}\n`);
  console.log(`Updated ${args.dataFile}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
