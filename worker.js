const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const geminiModel = 'gemini-1.5-flash';

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    if (request.method !== 'POST') {
      return jsonResponse({ error: 'POSTリクエストのみ対応しています。' }, 405);
    }

    if (!env.GEMINI_API_KEY) {
      return jsonResponse({ error: 'GEMINI_API_KEYがCloudflare Workerに設定されていません。' }, 500);
    }

    let payload;
    try {
      payload = await request.json();
    } catch (error) {
      return jsonResponse({ error: 'JSONボディを読み取れませんでした。' }, 400);
    }

    const youtubeUrl = typeof payload.youtubeUrl === 'string' ? payload.youtubeUrl.trim() : '';
    const note = typeof payload.note === 'string' ? payload.note.trim() : '';
    const templateName = typeof payload.templateName === 'string' ? payload.templateName.trim() : '';

    if (!youtubeUrl || !templateName) {
      return jsonResponse({ error: 'youtubeUrlとtemplateNameは必須です。' }, 400);
    }

    try {
      const geminiResult = await callGemini(env.GEMINI_API_KEY, {
        youtubeUrl,
        note,
        templateName,
        title: payload.title || '',
        channel: payload.channel || '',
        transcript: payload.transcript || '',
      });

      return jsonResponse({
        ...geminiResult,
        templateName,
        geminiModel,
        geminiAnalyzedAt: new Date().toISOString(),
      });
    } catch (error) {
      return jsonResponse({ error: error.message || 'Gemini API解析に失敗しました。' }, 502);
    }
  },
};

async function callGemini(apiKey, video) {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      generationConfig: {
        temperature: 0.2,
        responseMimeType: 'application/json',
      },
      contents: [
        {
          role: 'user',
          parts: [{ text: buildPrompt(video) }],
        },
      ],
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error?.message || `Gemini API error: ${response.status}`);
  }

  const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('').trim();
  if (!text) {
    throw new Error('Gemini APIから解析テキストが返りませんでした。');
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error('Gemini APIのJSON解析結果をパースできませんでした。');
  }
}

function buildPrompt(video) {
  return [
    'YouTube動画をyt-board用に解析してください。',
    '必ずJSONのみを返してください。Markdownや説明文は不要です。',
    '',
    'JSON schema:',
    '{',
    '  "summary": "string",',
    '  "points": ["string"],',
    '  "insight": "string",',
    '  "watchDecision": "A|B|C|D",',
    '  "deepDive": "あり|なし|未判定",',
    '  "contentUse": "X|note|YouTube|なし",',
    '  "risks": "string",',
    '  "recommendedAction": "string",',
    '  "status": "整理済み"',
    '}',
    '',
    `URL: ${video.youtubeUrl}`,
    `タイトル: ${video.title || '未入力'}`,
    `チャンネル: ${video.channel || '未入力'}`,
    `メモ: ${video.note || 'なし'}`,
    `テンプレート名: ${video.templateName}`,
    '',
    video.transcript
      ? `文字起こし・本文:\n${video.transcript}`
      : '文字起こし・本文なし。タイトル、URL、メモから分かる範囲の仮判定にしてください。動画内容を見た前提で断定しないでください。',
  ].join('\n');
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
}
