(function () {
  const endpointNotConfiguredMessage = 'Gemini解析用のAPI endpointが未設定です';

  function getConfig() {
    return window.YT_BOARD_CONFIG || {};
  }

  function getAnalyzeEndpoint() {
    return String(getConfig().geminiAnalyzeEndpoint || '').trim();
  }

  function buildAnalyzePayload(video, prompt) {
    return {
      video: {
        id: video.id,
        videoId: video.videoId,
        url: video.url,
        title: video.title,
        channel: video.channel,
        note: video.note,
        transcript: video.transcript,
        transcriptSourceNote: video.transcriptSourceNote,
        organizeTemplate: video.organizeTemplate,
      },
      prompt,
    };
  }

  async function analyzeVideo(video, { prompt } = {}) {
    const endpoint = getAnalyzeEndpoint();

    if (!endpoint) {
      const error = new Error(endpointNotConfiguredMessage);
      error.code = 'ENDPOINT_NOT_CONFIGURED';
      throw error;
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(buildAnalyzePayload(video, prompt || '')),
    });

    let data = null;
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      data = await response.json();
    } else {
      const text = await response.text();
      data = text ? { error: text } : {};
    }

    if (!response.ok) {
      const message = data?.error || data?.message || `Gemini解析APIの呼び出しに失敗しました: ${response.status}`;
      throw new Error(message);
    }

    return data?.analysis || data;
  }

  window.YtBoardGeminiClient = {
    endpointNotConfiguredMessage,
    getAnalyzeEndpoint,
    buildAnalyzePayload,
    analyzeVideo,
  };
}());
