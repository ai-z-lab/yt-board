export default {
  async fetch(request, env) {
    const corsHeaders = {
      'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (request.method !== 'POST') {
      return jsonResponse({ error: 'Method Not Allowed' }, 405, corsHeaders);
    }

    if (!env.GEMINI_API_KEY) {
      return jsonResponse({ error: 'GEMINI_API_KEY is not configured' }, 500, corsHeaders);
    }

    const payload = await request.json();
    const prompt = payload.prompt || buildFallbackPrompt(payload.video || {});
    const model = env.GEMINI_MODEL || 'gemini-1.5-flash';
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`;

    const geminiResponse = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `${prompt}\n\n必ずJSONのみで回答してください。` }] }],
        generationConfig: { responseMimeType: 'application/json' },
      }),
    });

    const geminiData = await geminiResponse.json();
    if (!geminiResponse.ok) {
      return jsonResponse({ error: geminiData.error?.message || 'Gemini API request failed' }, geminiResponse.status, corsHeaders);
    }

    const text = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    let analysis;
    try {
      analysis = JSON.parse(text);
    } catch (error) {
      analysis = { summary: text, points: [], status: '整理済み' };
    }

    return jsonResponse({
      analysis: {
        ...analysis,
        geminiModel: model,
        geminiAnalyzedAt: new Date().toISOString(),
      },
    }, 200, corsHeaders);
  },
};

function jsonResponse(body, status, headers) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function buildFallbackPrompt(video) {
  return [
    '以下のYouTube動画を情報収集用に整理し、summary, points, insight, watchDecision, deepDive, contentUse, risks, recommendedAction, status を持つJSONで返してください。',
    `タイトル: ${video.title || ''}`,
    `チャンネル: ${video.channel || ''}`,
    `URL: ${video.url || ''}`,
    `メモ: ${video.note || ''}`,
    `文字起こし: ${video.transcript || ''}`,
  ].join('\n');
}
