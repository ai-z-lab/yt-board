const organizeTemplates = {
  general: {
    label: '汎用リサーチ',
    promptFocus: '要点、論点、見る価値、追加調査',
  },
  sns: {
    label: 'SNS投稿ネタ化',
    promptFocus: 'X/Threads向けの切り口、炎上注意点、投稿案',
  },
  youtube: {
    label: 'YouTube企画化',
    promptFocus: '動画企画、ショート化、台本の切り口',
  },
  note: {
    label: 'note記事化',
    promptFocus: '記事テーマ、見出し、読者に刺さる論点',
  },
  aiNews: {
    label: 'AIニュース分析',
    promptFocus: '事実確認、一次情報、リスク、活用可能性',
  },
  manager: {
    label: '管理職・現場視点',
    promptFocus: '現場で起きそうなズレ、管理職への示唆',
  },
  fortiesReal: {
    label: '40代のリアル',
    promptFocus: '管理職、現場、AI活用、働き方、SNS、世代間ギャップの観点で整理',
  },
};

const defaultTemplate = 'general';

const watchDecisionLabels = {
  A: 'A 全部見る',
  B: 'B 該当箇所だけ見る',
  C: 'C 要約で十分',
  D: 'D 保留',
};

const storageKey = 'yt-board:v2:local-videos';
const geminiWorkerEndpointKey = 'yt-board:v2:gemini-worker-endpoint';

const state = {
  sampleVideos: [],
  localVideos: [],
  watchDecision: 'all',
  deepDiveOnly: false,
  contentUseOnly: false,
  formVisible: false,
};

const elements = {
  watchDecisionFilter: document.querySelector('#decisionFilter'),
  deepDiveFilter: document.querySelector('#deepDiveFilter'),
  contentUseFilter: document.querySelector('#postCandidateFilter'),
  resetFilters: document.querySelector('#resetFilters'),
  resultCount: document.querySelector('#resultCount'),
  videoList: document.querySelector('#videoList'),
  emptyState: document.querySelector('#emptyState'),
  template: document.querySelector('#videoCardTemplate'),
  toggleForm: document.querySelector('#toggleForm'),
  addVideoPanel: document.querySelector('#addVideoPanel'),
  addVideoForm: document.querySelector('#addVideoForm'),
  formStatus: document.querySelector('#formStatus'),
  exportButton: document.querySelector('#exportButton'),
  importInput: document.querySelector('#importInput'),
  importStatus: document.querySelector('#importStatus'),
  toggleDetails: document.querySelector('#toggleDetails'),
  detailFields: document.querySelector('#detailFields'),
  fetchVideoInfo: document.querySelector('#fetchVideoInfo'),
  autoFillStatus: document.querySelector('#autoFillStatus'),
  thumbnailPreview: document.querySelector('#thumbnailPreview'),
};

const requiredVideoFields = [
  'id',
  'channel',
  'title',
  'url',
];

const localOnlyFields = ['source'];

const analysisPreferredFields = [
  'summary',
  'points',
  'insight',
  'watchDecision',
  'deepDive',
  'contentUse',
  'risks',
  'recommendedAction',
  'status',
  'geminiModel',
  'geminiAnalyzedAt',
  'templateName',
];

async function loadVideos() {
  try {
    const [baseVideos, analysisVideos] = await Promise.all([
      fetchVideoJson('./videos.json', { required: true }),
      fetchVideoJson('./data/videos.json', { required: false }),
    ]);

    const mergedSamples = mergeVideoCollections(baseVideos, analysisVideos);
    validateVideos(mergedSamples);
    state.sampleVideos = mergedSamples.map((video) => ({ ...video, source: 'sample' }));
    state.localVideos = mergeLocalVideosWithAnalysis(loadLocalVideos(), analysisVideos);
    renderVideos();
  } catch (error) {
    showLoadError(error);
  }
}

async function fetchVideoJson(path, { required }) {
  const response = await fetch(path, { cache: 'no-cache' });

  if (!response.ok) {
    if (!required && response.status === 404) {
      return [];
    }

    throw new Error(`${path}を読み込めませんでした: ${response.status}`);
  }

  const data = await response.json();
  if (!Array.isArray(data)) {
    throw new Error(`${path}の形式が不正です: 配列である必要があります。`);
  }

  return data.map((video) => normalizeVideo(video));
}

function getVideoMergeKey(video) {
  return video.videoId || extractYouTubeVideoId(video.url) || video.id;
}

function mergeAnalysisFields(target, analysis) {
  const merged = { ...target, ...analysis };

  analysisPreferredFields.forEach((field) => {
    if (analysis[field] !== undefined && analysis[field] !== null) {
      merged[field] = analysis[field];
    }
  });

  return normalizeVideo(merged);
}

function mergeVideoCollections(baseVideos, analysisVideos) {
  const videosByKey = new Map();
  const orderedKeys = [];

  baseVideos.forEach((video) => {
    const key = getVideoMergeKey(video);
    videosByKey.set(key, video);
    orderedKeys.push(key);
  });

  analysisVideos.forEach((analysisVideo) => {
    const key = getVideoMergeKey(analysisVideo);
    if (!orderedKeys.includes(key)) {
      orderedKeys.unshift(key);
    }

    videosByKey.set(key, mergeAnalysisFields(videosByKey.get(key) || {}, analysisVideo));
  });

  return orderedKeys.map((key) => videosByKey.get(key));
}

function mergeLocalVideosWithAnalysis(localVideos, analysisVideos) {
  const analysisByKey = new Map(analysisVideos.map((video) => [getVideoMergeKey(video), video]));
  const mergedVideos = localVideos.map((video) => {
    const analysisVideo = analysisByKey.get(getVideoMergeKey(video));
    return analysisVideo ? normalizeLocalVideo(mergeAnalysisFields(video, analysisVideo)) : video;
  });

  if (JSON.stringify(mergedVideos) !== JSON.stringify(localVideos)) {
    localStorage.setItem(storageKey, JSON.stringify(mergedVideos, null, 2));
  }

  return mergedVideos;
}

function hasRequiredVideoValue(video, field) {
  return field in video && video[field] !== undefined && video[field] !== null && String(video[field]).trim() !== '';
}

function validateVideos(videos, options = {}) {
  const { allowLocalFields = false } = options;

  if (!Array.isArray(videos)) {
    throw new Error('動画データの形式が不正です: 配列である必要があります。');
  }

  videos.forEach((video, index) => {
    const missingField = requiredVideoFields.find((field) => !hasRequiredVideoValue(video, field));

    if (missingField) {
      throw new Error(`動画データの形式が不正です: ${index + 1}件目に${missingField}がありません。`);
    }

    if (!allowLocalFields) {
      const unsupportedLocalField = localOnlyFields.find((field) => field in video);

      if (unsupportedLocalField) {
        throw new Error(`videos.jsonの形式が不正です: ${index + 1}件目に${unsupportedLocalField}は不要です。`);
      }
    }
  });
}

function loadLocalVideos() {
  const saved = localStorage.getItem(storageKey);

  if (!saved) {
    return [];
  }

  try {
    const videos = JSON.parse(saved).map((video) => normalizeLocalVideo(video));
    validateVideos(videos, { allowLocalFields: true });

    const normalizedData = JSON.stringify(videos, null, 2);
    if (normalizedData !== saved) {
      localStorage.setItem(storageKey, normalizedData);
    }

    return videos;
  } catch (error) {
    console.error(error);
    setStatus(elements.importStatus, '保存済みデータの形式が不正だったため、localStorageの追加データは読み込みませんでした。', 'error');
    return [];
  }
}

function saveLocalVideos() {
  localStorage.setItem(storageKey, JSON.stringify(state.localVideos, null, 2));
}

function normalizeTemplate(template) {
  return template in organizeTemplates ? template : defaultTemplate;
}

function getTemplateLabel(template) {
  return organizeTemplates[normalizeTemplate(template)].label;
}

function normalizeVideo(video) {
  const points = video.points ?? video.keyPoints;
  const transcript = normalizeTranscript(video);
  const normalized = {
    id: video.id || createLocalId(),
    channel: video.channel || video.channelName || 'チャンネル未取得',
    title: video.title || video.videoTitle || video.videoId || extractYouTubeVideoId(video.url) || 'タイトル未取得',
    url: video.url ?? '',
    publishedDate: video.publishedDate || '',
    summary: video.summary || '未整理',
    points: Array.isArray(points) && points.length > 0 ? points : ['未整理'],
    insight: video.insight ?? video.fortiesInsight ?? '未整理',
    watchDecision: ['A', 'B', 'C', 'D'].includes(video.watchDecision ?? video.decision) ? (video.watchDecision ?? video.decision) : 'D',
    deepDive: normalizeDeepDive(video.deepDive),
    contentUse: ['X', 'note', 'YouTube', 'なし'].includes(video.contentUse ?? video.postCandidate) ? (video.contentUse ?? video.postCandidate) : 'なし',
    risks: typeof video.risks === 'string' ? video.risks : '',
    recommendedAction: typeof video.recommendedAction === 'string' ? video.recommendedAction : '',
    status: typeof video.status === 'string' ? video.status : '',
    templateName: typeof video.templateName === 'string' ? video.templateName : '',
    geminiModel: typeof video.geminiModel === 'string' ? video.geminiModel : '',
    geminiAnalyzedAt: typeof video.geminiAnalyzedAt === 'string' ? video.geminiAnalyzedAt : '',
    note: typeof video.note === 'string' ? video.note : '',
    transcript,
    transcriptSourceNote: typeof video.transcriptSourceNote === 'string' ? video.transcriptSourceNote : '',
    transcriptStatus: normalizeTranscriptStatus(video.transcriptStatus, transcript),
    transcriptError: typeof video.transcriptError === 'string' ? video.transcriptError : '',
    transcriptUpdatedAt: typeof video.transcriptUpdatedAt === 'string' ? video.transcriptUpdatedAt : '',
    source: video.source,
    organizeTemplate: normalizeTemplate(video.organizeTemplate),
    videoId: video.videoId || extractYouTubeVideoId(video.url) || '',
    thumbnailUrl: video.thumbnailUrl || getYouTubeThumbnailUrl(video.videoId || extractYouTubeVideoId(video.url)) || '',
  };

  if (normalized.source === undefined) {
    delete normalized.source;
  }

  return normalized;
}

function normalizeTranscript(video) {
  if (typeof video.transcript === 'string') {
    return video.transcript;
  }

  if (typeof video.transcriptText === 'string') {
    return video.transcriptText;
  }

  if (typeof video.bodyText === 'string') {
    return video.bodyText;
  }

  return '';
}

function hasTranscript(video) {
  return typeof video.transcript === 'string' && video.transcript.trim().length > 0;
}

function normalizeTranscriptStatus(status, transcript = '') {
  if (status === 'available' || status === 'unavailable' || status === 'checking') {
    return status;
  }

  return typeof transcript === 'string' && transcript.trim() ? 'available' : 'unchecked';
}

function normalizeLocalVideo(video) {
  return {
    ...normalizeVideo(video),
    id: video.id || createLocalId(),
    source: 'local',
  };
}

function normalizeDeepDive(value) {
  if (value === true || value === 'あり') return 'あり';
  if (value === false || value === 'なし') return 'なし';
  return '未判定';
}

function extractYouTubeVideoId(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return '';
  }

  try {
    const url = new URL(rawUrl.trim());
    const hostname = url.hostname.toLowerCase().replace(/^www\./, '');
    const pathParts = url.pathname.split('/').filter(Boolean);

    if (hostname === 'youtube.com' || hostname === 'm.youtube.com') {
      if (url.pathname === '/watch') {
        return sanitizeYouTubeVideoId(url.searchParams.get('v'));
      }

      if (['shorts', 'embed'].includes(pathParts[0])) {
        return sanitizeYouTubeVideoId(pathParts[1]);
      }
    }

    if (hostname === 'youtu.be') {
      return sanitizeYouTubeVideoId(pathParts[0]);
    }
  } catch (error) {
    return '';
  }

  return '';
}

function sanitizeYouTubeVideoId(value) {
  return /^[A-Za-z0-9_-]{11}$/.test(value || '') ? value : '';
}

function getYouTubeThumbnailUrl(videoId) {
  return videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : '';
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

async function fetchTranscriptInBrowser(videoId) {
  const languages = ['ja', 'ja-JP', 'en', 'en-US'];
  const errors = [];

  for (const language of languages) {
    const transcriptUrl = new URL('https://video.google.com/timedtext');
    transcriptUrl.searchParams.set('v', videoId);
    transcriptUrl.searchParams.set('lang', language);

    try {
      const response = await fetch(transcriptUrl);
      if (!response.ok) {
        errors.push(`${language}: HTTP ${response.status}`);
        continue;
      }

      const transcript = parseTranscriptXml(await response.text());
      if (transcript) {
        return { transcript, source: `ブラウザ timedtext:${language}` };
      }

      errors.push(`${language}: 空の字幕`);
    } catch (error) {
      errors.push(`${language}: ${error.message}`);
    }
  }

  throw new Error(`ブラウザから字幕を取得できませんでした。CORS、YouTube側の制限、または字幕なしの可能性があります（${errors.join(' / ')}）。`);
}

function getFormControls() {
  return {
    url: elements.addVideoForm.elements.url,
    title: elements.addVideoForm.elements.title,
    channel: elements.addVideoForm.elements.channel,
  };
}

function updateThumbnailPreview(thumbnailUrl) {
  const image = elements.thumbnailPreview.querySelector('img');
  elements.thumbnailPreview.hidden = !thumbnailUrl;
  image.src = thumbnailUrl || '';
}

function getManualInputMessage(title, channel) {
  return !title.value.trim() || !channel.value.trim() ? 'タイトルとチャンネル名は手入力してください' : '';
}

function setVideoIdSuccessStatus(title, channel, suffix = '') {
  const manualInputMessage = getManualInputMessage(title, channel);
  const messages = ['動画IDを取得しました', suffix, manualInputMessage].filter(Boolean);
  setStatus(elements.autoFillStatus, messages.join('。'), 'success');
}

async function fetchVideoInfo() {
  const { url: urlInput, title, channel } = getFormControls();
  const rawUrl = urlInput.value.trim();
  const videoId = extractYouTubeVideoId(rawUrl);

  if (!rawUrl) {
    updateThumbnailPreview('');
    setStatus(elements.autoFillStatus, '', '');
    return;
  }

  if (!videoId) {
    updateThumbnailPreview('');
    setStatus(elements.autoFillStatus, '動画IDを取得できませんでした。対応しているYouTube URLか確認してください。', 'error');
    return;
  }

  updateThumbnailPreview(getYouTubeThumbnailUrl(videoId));
  setVideoIdSuccessStatus(title, channel);

  try {
    const oEmbedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(rawUrl)}&format=json`;
    const response = await fetch(oEmbedUrl);

    if (!response.ok) {
      throw new Error(`oEmbed request failed: ${response.status}`);
    }

    const data = await response.json();

    if (data.title && !title.value.trim()) {
      title.value = data.title;
    }

    if (data.author_name && !channel.value.trim()) {
      channel.value = data.author_name;
    }

    setVideoIdSuccessStatus(title, channel, '取得できた動画情報を反映しました');
  } catch (error) {
    console.warn(error);
    setVideoIdSuccessStatus(title, channel, 'タイトル・チャンネル名の自動取得はできませんでした');
  }
}


function createLocalId() {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') {
    return window.crypto.randomUUID();
  }

  return `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function showLoadError(error) {
  const message = error instanceof Error ? error.message : 'videos.jsonの読み込みに失敗しました。';
  const errorMessage = document.createElement('p');

  errorMessage.className = 'empty-state error-state';
  errorMessage.textContent = message;

  if (typeof elements.videoList.replaceChildren === 'function') {
    elements.videoList.replaceChildren(errorMessage);
  } else {
    elements.videoList.innerHTML = '';
    elements.videoList.append(errorMessage);
  }

  elements.emptyState.hidden = true;
  elements.resultCount.textContent = '0件';
}

function resetListState() {
  if (typeof elements.videoList.replaceChildren === 'function') {
    elements.videoList.replaceChildren();
  } else {
    elements.videoList.innerHTML = '';
  }
}

function getAllVideos() {
  const localKeys = new Set(state.localVideos.map((video) => getVideoMergeKey(video)));
  return [
    ...state.localVideos,
    ...state.sampleVideos.filter((video) => !localKeys.has(getVideoMergeKey(video))),
  ];
}

function getFilteredVideos() {
  return getAllVideos().filter((video) => {
    const matchesDecision = state.watchDecision === 'all' || video.watchDecision === state.watchDecision;
    const matchesDeepDive = !state.deepDiveOnly || video.deepDive === 'あり';
    const matchesPostCandidate = !state.contentUseOnly || video.contentUse !== 'なし';

    return matchesDecision && matchesDeepDive && matchesPostCandidate;
  });
}

function getOrganizeStatus(video) {
  const hasSummary = video.summary && video.summary !== '未整理';
  const hasPoints = Array.isArray(video.points) && video.points.some((point) => point && point !== '未整理');
  const hasInsight = video.insight && video.insight !== '未整理';
  const hasDecision = video.watchDecision && video.watchDecision !== 'D';
  const hasDeepDive = video.deepDive !== '未判定';
  const hasPostCandidate = video.contentUse && video.contentUse !== 'なし';

  return video.status || (hasSummary || hasPoints || hasInsight || hasDecision || hasDeepDive || hasPostCandidate ? '整理済み' : '未整理');
}


function getTranscriptStatusLabel(video, hasTranscriptText) {
  if (hasTranscriptText) return '本文あり：AI整理可能';
  if (video.transcriptStatus === 'unavailable') return '取得不可：本文なし';
  if (video.transcriptStatus === 'checking') return '取得確認中';
  return '本文なし：タイトル情報のみ';
}

function getTranscriptTrialMessage(video) {
  const messages = [];
  if (video.videoId) messages.push(`videoId: ${video.videoId}`);
  if (video.transcriptStatus === 'available' && video.transcriptUpdatedAt) messages.push(`取得済み: ${video.transcriptUpdatedAt}`);
  if (video.transcriptStatus === 'unavailable' && video.transcriptError) messages.push(`前回失敗: ${video.transcriptError}`);
  return messages.join(' / ');
}


function persistTranscriptTrialResult(videoId, result) {
  state.localVideos = state.localVideos.map((video) => video.id === videoId
    ? normalizeLocalVideo({ ...video, ...result })
    : video);
  saveLocalVideos();
}

async function tryFetchTranscript(video, button, statusElement) {
  const videoId = video.videoId || extractYouTubeVideoId(video.url);
  if (!videoId) {
    statusElement.textContent = 'videoIdを取得できませんでした。対応しているYouTube URLか確認してください。';
    statusElement.className = 'status-message error';
    return;
  }

  button.disabled = true;
  statusElement.textContent = `videoId=${videoId} でブラウザから文字起こし取得を試しています...`;
  statusElement.className = 'status-message';

  try {
    const result = await fetchTranscriptInBrowser(videoId);
    const update = {
      videoId,
      transcript: result.transcript,
      transcriptStatus: 'available',
      transcriptError: '',
      transcriptUpdatedAt: new Date().toISOString(),
      transcriptSourceNote: video.transcriptSourceNote || result.source,
    };

    if (video.source === 'local') {
      persistTranscriptTrialResult(video.id, update);
      setStatus(elements.importStatus, 'ブラウザから文字起こしを取得し、localStorageに保存しました。', 'success');
      renderVideos();
    } else {
      statusElement.textContent = '文字起こしを取得できました。サンプルカードは保存できないため、必要なら動画を追加して保存してください。';
      statusElement.className = 'status-message success';
    }
  } catch (error) {
    const update = {
      videoId,
      transcriptStatus: 'unavailable',
      transcriptError: error.message,
      transcriptUpdatedAt: new Date().toISOString(),
    };

    if (video.source === 'local') {
      persistTranscriptTrialResult(video.id, update);
      saveLocalVideos();
    }

    statusElement.textContent = error.message;
    statusElement.className = 'status-message error';
  } finally {
    button.disabled = false;
  }
}


function getGeminiWorkerEndpoint() {
  const configuredEndpoint = window.YT_BOARD_GEMINI_WORKER_URL || localStorage.getItem(geminiWorkerEndpointKey) || '';
  return String(configuredEndpoint).trim().replace(/\/$/, '');
}

function getGeminiStatusElement(card) {
  if (!card) {
    return null;
  }

  const existingStatus = card.querySelector('.gemini-analysis-status');
  if (existingStatus) {
    return existingStatus;
  }

  const statusElement = document.createElement('p');
  statusElement.className = 'gemini-analysis-status status-message';
  statusElement.setAttribute('aria-live', 'polite');
  card.querySelector('.card-actions')?.append(statusElement);
  return statusElement;
}

function normalizeGeminiAnalysis(data) {
  const points = Array.isArray(data.points) ? data.points : Array.isArray(data.keyPoints) ? data.keyPoints : [];
  return {
    summary: typeof data.summary === 'string' && data.summary.trim() ? data.summary.trim() : '未整理',
    points: points.map((point) => String(point).trim()).filter(Boolean).slice(0, 6),
    insight: typeof data.insight === 'string' && data.insight.trim() ? data.insight.trim() : '未整理',
    watchDecision: ['A', 'B', 'C', 'D'].includes(data.watchDecision) ? data.watchDecision : 'D',
    deepDive: normalizeDeepDive(data.deepDive),
    contentUse: ['X', 'note', 'YouTube', 'なし'].includes(data.contentUse) ? data.contentUse : 'なし',
    risks: typeof data.risks === 'string' ? data.risks : '',
    recommendedAction: typeof data.recommendedAction === 'string' ? data.recommendedAction : '',
    status: typeof data.status === 'string' && data.status.trim() ? data.status : '整理済み',
    templateName: typeof data.templateName === 'string' ? data.templateName : '',
    geminiModel: typeof data.geminiModel === 'string' ? data.geminiModel : '',
    geminiAnalyzedAt: typeof data.geminiAnalyzedAt === 'string' ? data.geminiAnalyzedAt : new Date().toISOString(),
  };
}

function findVideoByMergeKey(key) {
  return getAllVideos().find((video) => getVideoMergeKey(video) === key);
}

function updateCardWithAnalysis(card, analysis) {
  const organizeStatus = card.querySelector('.organize-status');
  const isOrganized = getOrganizeStatus(analysis) === '整理済み';
  organizeStatus.textContent = isOrganized ? '整理済み' : analysis.status || '未整理';
  organizeStatus.classList.toggle('is-strong', isOrganized);

  const watchDecision = card.querySelector('.decision');
  watchDecision.textContent = watchDecisionLabels[analysis.watchDecision] ?? analysis.watchDecision;
  watchDecision.classList.toggle('is-strong', analysis.watchDecision === 'A' || analysis.watchDecision === 'B');

  const deepDive = card.querySelector('.deep-dive');
  deepDive.textContent = analysis.deepDive;
  deepDive.classList.toggle('is-strong', analysis.deepDive === 'あり');

  const contentUse = card.querySelector('.post-candidate');
  contentUse.textContent = analysis.contentUse;
  contentUse.classList.toggle('is-strong', analysis.contentUse !== 'なし');

  card.querySelector('.summary').textContent = analysis.summary;
  card.querySelector('.summary-full').textContent = analysis.summary;
  card.querySelector('.insight').textContent = analysis.insight;
  card.querySelector('.risks').textContent = analysis.risks || 'なし';
  card.querySelector('.recommended-action').textContent = analysis.recommendedAction || 'なし';

  const points = card.querySelector('.points');
  points.replaceChildren();
  analysis.points.forEach((point) => {
    const item = document.createElement('li');
    item.textContent = point;
    points.append(item);
  });
}

function upsertAnalyzedVideo(video, analysis) {
  const key = getVideoMergeKey(video);
  const existingLocal = state.localVideos.find((localVideo) => getVideoMergeKey(localVideo) === key);
  const baseVideo = existingLocal || video;
  const analyzedVideo = normalizeLocalVideo({ ...baseVideo, ...analysis, source: 'local' });

  if (existingLocal) {
    state.localVideos = state.localVideos.map((localVideo) => getVideoMergeKey(localVideo) === key ? analyzedVideo : localVideo);
  } else {
    state.localVideos.unshift(analyzedVideo);
  }

  saveLocalVideos();
}

async function analyzeWithGemini(video, button, statusElement) {
  const card = button.closest('.video-card');
  const originalText = button.textContent;

  button.disabled = true;
  button.textContent = '解析中...';
  setStatus(statusElement, 'Geminiで解析中...', '');

  const endpoint = getGeminiWorkerEndpoint();
  if (!endpoint) {
    setStatus(statusElement, 'Gemini解析用のAPI endpointが未設定です', 'error');
    button.disabled = false;
    button.textContent = originalText;
    return;
  }

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        youtubeUrl: video.url,
        note: video.note || '',
        templateName: getTemplateLabel(video.organizeTemplate),
        templateKey: normalizeTemplate(video.organizeTemplate),
        title: video.title,
        channel: video.channel,
        transcript: video.transcript || '',
      }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || `Worker request failed: ${response.status}`);
    }

    const analysis = normalizeGeminiAnalysis(data);
    upsertAnalyzedVideo(video, analysis);
    if (card) {
      updateCardWithAnalysis(card, analysis);
    }
    setStatus(statusElement, '解析完了', 'success');
    setStatus(elements.importStatus, 'Gemini解析結果をカードへ反映し、localStorageに保存しました。', 'success');
  } catch (error) {
    console.error(error);
    const reason = error.message ? `: ${error.message}` : '';
    setStatus(statusElement, `解析に失敗しました${reason}`, 'error');
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
}

function renderVideos() {
  const videos = getFilteredVideos();
  resetListState();
  elements.resultCount.textContent = `${videos.length}件（サンプル${state.sampleVideos.length}件 / 追加${state.localVideos.length}件）`;
  elements.emptyState.hidden = videos.length > 0;

  videos.forEach((video) => {
    const card = elements.template.content.cloneNode(true);
    const article = card.querySelector('.video-card');
    article.dataset.videoKey = getVideoMergeKey(video);

    card.querySelector('.channel').textContent = video.channel;
    card.querySelector('.published-date').textContent = video.publishedDate || '公開日未入力';
    card.querySelector('.title').textContent = video.title;

    const sourceBadge = card.querySelector('.source-badge');
    sourceBadge.textContent = video.source === 'local' ? '追加データ' : 'サンプル';
    sourceBadge.classList.toggle('is-local', video.source === 'local');

    const deleteButton = card.querySelector('.delete-video');
    deleteButton.hidden = video.source !== 'local';
    deleteButton.addEventListener('click', () => deleteLocalVideo(video.id));

    const thumbnailUrl = video.thumbnailUrl || getYouTubeThumbnailUrl(video.videoId || extractYouTubeVideoId(video.url));
    const thumbnailLink = card.querySelector('.thumbnail-link');
    const thumbnail = card.querySelector('.thumbnail');

    if (thumbnailUrl) {
      thumbnailLink.hidden = false;
      thumbnailLink.href = video.url;
      thumbnail.src = thumbnailUrl;
      thumbnail.alt = `${video.title}のサムネイル`;
    }

    const link = card.querySelector('.url');
    link.href = video.url;
    link.textContent = video.url;
    link.setAttribute('aria-label', `${video.title}をYouTubeで開く`);

    card.querySelector('.note').textContent = video.note || 'メモなし';

    const organizeStatus = card.querySelector('.organize-status');
    const isOrganized = getOrganizeStatus(video) === '整理済み';
    organizeStatus.textContent = isOrganized ? '整理済み' : '未整理';
    organizeStatus.classList.toggle('is-strong', isOrganized);

    const watchDecision = card.querySelector('.decision');
    watchDecision.textContent = watchDecisionLabels[video.watchDecision] ?? video.watchDecision;
    watchDecision.classList.toggle('is-strong', video.watchDecision === 'A' || video.watchDecision === 'B');

    const deepDive = card.querySelector('.deep-dive');
    deepDive.textContent = video.deepDive;
    deepDive.classList.toggle('is-strong', video.deepDive === 'あり');

    const contentUse = card.querySelector('.post-candidate');
    contentUse.textContent = video.contentUse;
    contentUse.classList.toggle('is-strong', video.contentUse !== 'なし');

    const transcriptStatus = card.querySelector('.transcript-status');
    const hasTranscriptText = hasTranscript(video);
    transcriptStatus.textContent = getTranscriptStatusLabel(video, hasTranscriptText);
    transcriptStatus.classList.toggle('is-strong', hasTranscriptText);
    transcriptStatus.classList.toggle('is-warning', !hasTranscriptText);

    const transcriptNotice = card.querySelector('.transcript-notice');
    transcriptNotice.hidden = hasTranscriptText;

    card.querySelector('.organize-template').textContent = getTemplateLabel(video.organizeTemplate);

    const copyPromptButton = card.querySelector('.copy-prompt');
    copyPromptButton.textContent = hasTranscriptText ? '本文ベース整理プロンプトをコピー' : '仮判定プロンプトをコピー';
    copyPromptButton.addEventListener('click', () => copyPrompt(video, copyPromptButton));

    const transcriptTrialButton = card.querySelector('.try-transcript-fetch');
    const transcriptTrialStatus = card.querySelector('.transcript-trial-status');
    transcriptTrialStatus.textContent = getTranscriptTrialMessage(video);
    transcriptTrialButton.addEventListener('click', () => tryFetchTranscript(video, transcriptTrialButton, transcriptTrialStatus));

    const geminiAnalyzeButton = card.querySelector('.gemini-analyze');
    const geminiStatus = getGeminiStatusElement(article);
    geminiAnalyzeButton.addEventListener('click', (event) => {
      event.stopPropagation();
      analyzeWithGemini(video, geminiAnalyzeButton, geminiStatus);
    });

    const transcriptButton = card.querySelector('.add-transcript');
    const transcriptPanel = card.querySelector('.transcript-panel');
    transcriptButton.addEventListener('click', () => {
      transcriptPanel.hidden = !transcriptPanel.hidden;
      transcriptButton.textContent = transcriptPanel.hidden ? '文字起こしを追加' : '文字起こし欄を閉じる';
    });

    const editForm = card.querySelector('.edit-video-form');
    editForm.elements.transcript.value = video.transcript;
    editForm.elements.transcriptSourceNote.value = video.transcriptSourceNote;

    if (video.source === 'local') {
      editForm.addEventListener('submit', (event) => updateLocalVideoTranscript(event, video.id));
    } else {
      editForm.querySelector('.transcript-save').disabled = true;
      editForm.querySelector('.transcript-save').textContent = 'サンプルは保存不可';
      editForm.addEventListener('submit', (event) => {
        event.preventDefault();
        setStatus(elements.importStatus, 'サンプルデータは画面から更新できません。動画を追加してから文字起こしを保存してください。', 'error');
      });
    }

    card.querySelector('.summary').textContent = video.summary;
    card.querySelector('.summary-full').textContent = video.summary;
    card.querySelector('.insight').textContent = video.insight;
    card.querySelector('.risks').textContent = video.risks || 'なし';
    card.querySelector('.recommended-action').textContent = video.recommendedAction || 'なし';

    const analysisDetails = card.querySelector('.analysis-details');
    const toggleAnalysisButton = card.querySelector('.toggle-analysis');
    setAnalysisDetailsVisibility(toggleAnalysisButton, analysisDetails, false);

    const transcriptDetail = card.querySelector('.transcript-detail');
    const toggleTranscriptDetailButton = card.querySelector('.toggle-transcript-detail');
    const transcriptFull = card.querySelector('.transcript-full');
    transcriptFull.textContent = hasTranscriptText ? video.transcript : '文字起こし・本文は未入力です。';
    card.querySelector('.transcript-source-note').textContent = video.transcriptSourceNote ? `取得方法: ${video.transcriptSourceNote}` : '取得方法メモなし';
    toggleTranscriptDetailButton.addEventListener('click', () => {
      const isOpen = transcriptDetail.hidden;
      transcriptDetail.hidden = !isOpen;
      toggleTranscriptDetailButton.setAttribute('aria-expanded', String(isOpen));
      toggleTranscriptDetailButton.textContent = isOpen ? '文字起こしを閉じる' : '文字起こしを表示';
    });

    const points = card.querySelector('.points');
    video.points.forEach((point) => {
      const item = document.createElement('li');
      item.textContent = point;
      points.append(item);
    });

    elements.videoList.append(card);
  });
}


function setAnalysisDetailsVisibility(button, details, visible) {
  details.hidden = !visible;
  button.setAttribute('aria-expanded', String(visible));
  button.textContent = visible ? '詳細を閉じる' : '詳細を見る';
}

function toggleAnalysisDetails(button) {
  const card = button.closest('.video-card');

  if (!card) {
    return;
  }

  const details = card.querySelector('.analysis-details');

  if (!details) {
    return;
  }

  setAnalysisDetailsVisibility(button, details, details.hidden);
}

function buildAiPrompt(video) {
  const template = organizeTemplates[normalizeTemplate(video.organizeTemplate)];
  const note = video.note || 'メモなし';
  const transcript = typeof video.transcript === 'string' ? video.transcript : '';
  const transcriptSourceNote = video.transcriptSourceNote.trim() || '取得方法メモなし';
  const transcriptInstructions = hasTranscript(video)
    ? [
        '以下の文字起こし・本文をもとに整理してください。',
        'タイトルやサムネイルだけではなく、本文内容を優先して判断してください。',
        '',
        '【文字起こし・本文】',
        transcript,
      ]
    : [
        '本文なし。タイトル・概要情報からの仮判定として整理してください。',
        '注意：動画内容を見た前提で要約しないでください。タイトル、URL、メモから分かる範囲だけで推測と事実を分けてください。',
      ];

  return [
    '以下のYouTube動画を、情報収集用に整理してください。',
    '',
    '目的は、動画を全部見る前に、',
    '「見る価値があるか」',
    '「発信ネタになるか」',
    '「追加リサーチすべきか」',
    'を判断することです。',
    '',
    '重要：',
    '動画本文・文字起こし・字幕を確認できない場合は、内容を見た前提で要約しないでください。',
    'その場合は「タイトル・概要情報からの仮判定」と明記してください。',
    '推測で断定しないでください。',
    '',
    '動画情報：',
    `- タイトル：${video.title}`,
    `- チャンネル名：${video.channel}`,
    `- URL：${video.url}`,
    `- 気になった理由：${note}`,
    `- 選択テンプレート名：${template.label}`,
    `- 文字起こし取得方法メモ：${transcriptSourceNote}`,
    '',
    ...transcriptInstructions,
    '',
    '出力形式：',
    '',
    '1. 判定の前提',
    '動画本文を確認できたか。',
    '確認できない場合は、タイトル・概要情報ベースの仮判定と書く。',
    '',
    '2. 動画の結論',
    '一言で何を言っている動画か。',
    '',
    '3. 重要ポイント',
    '3〜5点で整理。',
    '',
    '4. テーマとの関係',
    'この動画がどんなテーマに関係するか。',
    '例：AI活用、働き方、SNS、メディア、管理職、現場、世代間ギャップ、ビジネス、生活改善など。',
    '',
    '5. 発信に使える角度',
    'X投稿、Threads、note、YouTubeショート、通常動画のどれに向くか。',
    '',
    '6. 深掘りすべき論点',
    '追加で調べるべき事実、公式情報、統計、反対意見があれば出す。',
    '',
    '7. 注意点',
    'この動画だけを根拠に発信すると危ない点、未確認情報、偏りを指摘。',
    '',
    '8. 視聴判断',
    'A：全部見るべき',
    'B：該当箇所だけ見ればよい',
    'C：要約だけで十分',
    'D：保留',
    '',
    '9. ボードに戻す用まとめ',
    '- 要約：',
    '- 重要ポイント：',
    '- 自分向け示唆：',
    '- 視聴判断：',
    '- 深掘り候補：',
    '- 投稿化候補：',
    '- 整理状態：',
  ].join('\n');
}

async function copyPrompt(video, button) {
  const prompt = buildAiPrompt(video);
  const originalText = button.textContent;

  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(prompt);
    } else {
      const textarea = document.createElement('textarea');
      textarea.value = prompt;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.append(textarea);
      textarea.select();
      document.execCommand('copy');
      textarea.remove();
    }

    button.textContent = 'コピーしました';
    window.setTimeout(() => {
      button.textContent = originalText;
    }, 1800);
  } catch (error) {
    console.error(error);
    button.textContent = 'コピー失敗';
    window.setTimeout(() => {
      button.textContent = originalText;
    }, 1800);
  }
}

function getFormVideo() {
  const formData = new FormData(elements.addVideoForm);
  const points = (formData.get('points') || '')
    .split('\n')
    .map((point) => point.trim())
    .filter(Boolean);
  const deepDiveValue = formData.get('deepDive') || 'undecided';

  return normalizeLocalVideo({
    channel: formData.get('channel').trim(),
    title: formData.get('title').trim(),
    url: formData.get('url').trim(),
    videoId: extractYouTubeVideoId(formData.get('url').trim()),
    thumbnailUrl: getYouTubeThumbnailUrl(extractYouTubeVideoId(formData.get('url').trim())),
    note: formData.get('note').trim(),
    transcript: formData.get('transcript') || '',
    transcriptSourceNote: (formData.get('transcriptSourceNote') || '').trim(),
    organizeTemplate: formData.get('organizeTemplate') || defaultTemplate,
    publishedDate: formData.get('publishedDate') || '',
    summary: (formData.get('summary') || '').trim() || '未整理',
    points: points.length > 0 ? points : ['未整理'],
    insight: (formData.get('insight') || '').trim() || '未整理',
    watchDecision: formData.get('watchDecision') || 'D',
    deepDive: deepDiveValue === 'undecided' ? '未判定' : deepDiveValue === 'true' ? 'あり' : 'なし',
    contentUse: formData.get('contentUse') || 'なし',
    transcriptStatus: (formData.get('transcript') || '').trim() ? 'available' : 'unchecked',
  });
}

function addLocalVideo(event) {
  event.preventDefault();
  const video = getFormVideo();

  try {
    validateVideos([video], { allowLocalFields: true });
    state.localVideos.unshift(video);
    saveLocalVideos();
    elements.addVideoForm.reset();
    updateThumbnailPreview('');
    setStatus(elements.autoFillStatus, '', '');
    setDetailFieldsVisibility(false);
    setStatus(elements.formStatus, '動画を追加しました。ブラウザのlocalStorageに保存されています。', 'success');
    renderVideos();
  } catch (error) {
    const message = error instanceof Error ? error.message : '入力内容を確認してください。';
    setStatus(elements.formStatus, message, 'error');
  }
}

function updateLocalVideoTranscript(event, id) {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  state.localVideos = state.localVideos.map((video) => video.id === id
    ? normalizeLocalVideo({
        ...video,
        transcript: formData.get('transcript') || '',
        transcriptSourceNote: (formData.get('transcriptSourceNote') || '').trim(),
        transcriptStatus: (formData.get('transcript') || '').trim() ? 'available' : 'unchecked',
        transcriptError: '',
        transcriptUpdatedAt: new Date().toISOString(),
      })
    : video);
  saveLocalVideos();
  setStatus(elements.importStatus, '文字起こし・本文を更新しました。', 'success');
  renderVideos();
}

function deleteLocalVideo(id) {
  const target = state.localVideos.find((video) => video.id === id);

  if (!target || !window.confirm(`「${target.title}」を削除しますか？`)) {
    return;
  }

  state.localVideos = state.localVideos.filter((video) => video.id !== id);
  saveLocalVideos();
  setStatus(elements.importStatus, '追加データを削除しました。', 'success');
  renderVideos();
}

function exportLocalVideos() {
  const data = JSON.stringify(state.localVideos, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const date = new Date().toISOString().slice(0, 10);

  link.href = url;
  link.download = `yt-board-local-videos-${date}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  setStatus(elements.importStatus, '追加データをJSON形式でエクスポートしました。', 'success');
}

function importLocalVideos(event) {
  const file = event.target.files[0];

  if (!file) {
    return;
  }

  const reader = new FileReader();

  reader.addEventListener('load', () => {
    try {
      const videos = JSON.parse(reader.result).map((video) => normalizeLocalVideo(video));
      validateVideos(videos, { allowLocalFields: true });
      state.localVideos = videos;
      saveLocalVideos();
      setStatus(elements.importStatus, `${state.localVideos.length}件の追加データをインポートしました。`, 'success');
      renderVideos();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'JSONのインポートに失敗しました。';
      setStatus(elements.importStatus, message, 'error');
    } finally {
      elements.importInput.value = '';
    }
  });

  reader.readAsText(file);
}

function setStatus(element, message, type) {
  if (!element) {
    return;
  }

  element.textContent = message;
  element.className = `status-message ${type}`;
}

function setDetailFieldsVisibility(visible) {
  elements.detailFields.hidden = !visible;
  elements.toggleDetails.setAttribute('aria-expanded', String(visible));
  elements.toggleDetails.textContent = visible ? '詳細を閉じる' : '詳細を入力する';
}

function bindEvents() {
  elements.watchDecisionFilter.addEventListener('change', (event) => {
    state.watchDecision = event.target.value;
    renderVideos();
  });

  elements.deepDiveFilter.addEventListener('change', (event) => {
    state.deepDiveOnly = event.target.checked;
    renderVideos();
  });

  elements.contentUseFilter.addEventListener('change', (event) => {
    state.contentUseOnly = event.target.checked;
    renderVideos();
  });

  elements.resetFilters.addEventListener('click', () => {
    state.watchDecision = 'all';
    state.deepDiveOnly = false;
    state.contentUseOnly = false;
    elements.watchDecisionFilter.value = 'all';
    elements.deepDiveFilter.checked = false;
    elements.contentUseFilter.checked = false;
    renderVideos();
  });

  elements.toggleForm.addEventListener('click', () => {
    state.formVisible = !state.formVisible;
    elements.addVideoPanel.hidden = !state.formVisible;
    elements.toggleForm.textContent = state.formVisible ? '入力フォームを閉じる' : '動画を追加';
  });

  elements.toggleDetails.addEventListener('click', () => {
    setDetailFieldsVisibility(elements.detailFields.hidden);
  });

  elements.addVideoForm.addEventListener('reset', () => {
    window.setTimeout(() => {
      setDetailFieldsVisibility(false);
      updateThumbnailPreview('');
      setStatus(elements.autoFillStatus, '', '');
    }, 0);
  });

  elements.fetchVideoInfo.addEventListener('click', fetchVideoInfo);
  elements.addVideoForm.elements.url.addEventListener('blur', fetchVideoInfo);

  elements.addVideoForm.addEventListener('submit', addLocalVideo);
  elements.exportButton.addEventListener('click', exportLocalVideos);
  elements.importInput.addEventListener('change', importLocalVideos);
  elements.videoList.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) {
      return;
    }

    const geminiAnalyzeButton = event.target.closest('.gemini-analyze');

    if (geminiAnalyzeButton && elements.videoList.contains(geminiAnalyzeButton)) {
      const card = geminiAnalyzeButton.closest('.video-card');
      const video = card ? findVideoByMergeKey(card.dataset.videoKey) : null;
      const statusElement = getGeminiStatusElement(card);

      if (video && statusElement) {
        analyzeWithGemini(video, geminiAnalyzeButton, statusElement);
      } else {
        setStatus(statusElement, '解析に失敗しました: 対象の動画カードを特定できませんでした', 'error');
      }

      return;
    }

    const toggleAnalysisButton = event.target.closest('.toggle-analysis');

    if (!toggleAnalysisButton || !elements.videoList.contains(toggleAnalysisButton)) {
      return;
    }

    toggleAnalysisDetails(toggleAnalysisButton);
  });
}

bindEvents();
loadVideos();
