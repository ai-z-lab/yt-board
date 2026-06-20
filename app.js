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

const decisionLabels = {
  A: 'A 全部見る',
  B: 'B 該当箇所だけ見る',
  C: 'C 要約で十分',
  D: 'D 保留',
};

const storageKey = 'yt-board:v2:local-videos';

const state = {
  sampleVideos: [],
  localVideos: [],
  decision: 'all',
  deepDiveOnly: false,
  postCandidateOnly: false,
  formVisible: false,
};

const elements = {
  decisionFilter: document.querySelector('#decisionFilter'),
  deepDiveFilter: document.querySelector('#deepDiveFilter'),
  postCandidateFilter: document.querySelector('#postCandidateFilter'),
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
  'channelName',
  'title',
  'url',
  'publishedDate',
  'summary',
  'keyPoints',
  'fortiesInsight',
  'decision',
  'deepDive',
  'postCandidate',
];

const localOnlyFields = ['id', 'source'];

async function loadVideos() {
  try {
    const response = await fetch('./videos.json', { cache: 'no-cache' });

    if (!response.ok) {
      throw new Error(`videos.jsonを読み込めませんでした: ${response.status}`);
    }

    const videos = await response.json();
    validateVideos(videos);
    state.sampleVideos = videos.map((video) => normalizeVideo({ ...video, source: 'sample' }));
    state.localVideos = loadLocalVideos();
    renderVideos();
  } catch (error) {
    showLoadError(error);
  }
}

function hasRequiredVideoValue(video, field) {
  return field in video && video[field] !== undefined && video[field] !== null;
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

    if (!Array.isArray(video.keyPoints)) {
      throw new Error(`動画データの形式が不正です: ${index + 1}件目のkeyPointsは配列である必要があります。`);
    }

    if (!['A', 'B', 'C', 'D'].includes(video.decision)) {
      throw new Error(`動画データの形式が不正です: ${index + 1}件目のdecisionが不正です。`);
    }

    if (typeof video.deepDive !== 'boolean' && video.deepDive !== null) {
      throw new Error(`動画データの形式が不正です: ${index + 1}件目のdeepDiveはtrue/false/nullである必要があります。`);
    }

    if (!['X', 'note', 'YouTube', 'なし'].includes(video.postCandidate)) {
      throw new Error(`動画データの形式が不正です: ${index + 1}件目のpostCandidateが不正です。`);
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
    const videos = JSON.parse(saved);
    validateVideos(videos, { allowLocalFields: true });
    return videos.map((video) => normalizeLocalVideo(video));
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
  return {
    ...video,
    organizeTemplate: normalizeTemplate(video.organizeTemplate),
  };
}

function normalizeLocalVideo(video) {
  return {
    ...video,
    id: video.id || createLocalId(),
    source: 'local',
    note: typeof video.note === 'string' ? video.note : '',
    publishedDate: video.publishedDate || '',
    summary: video.summary || '未整理',
    keyPoints: Array.isArray(video.keyPoints) && video.keyPoints.length > 0 ? video.keyPoints : ['未整理'],
    fortiesInsight: video.fortiesInsight || '未整理',
    decision: video.decision || 'D',
    deepDive: typeof video.deepDive === 'boolean' ? video.deepDive : null,
    postCandidate: video.postCandidate || 'なし',
    organizeTemplate: normalizeTemplate(video.organizeTemplate),
    videoId: video.videoId || extractYouTubeVideoId(video.url) || '',
    thumbnailUrl: video.thumbnailUrl || getYouTubeThumbnailUrl(video.videoId || extractYouTubeVideoId(video.url)) || '',
  };
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

function getFormControls() {
  return {
    url: elements.addVideoForm.elements.url,
    title: elements.addVideoForm.elements.title,
    channelName: elements.addVideoForm.elements.channelName,
  };
}

function updateThumbnailPreview(thumbnailUrl) {
  const image = elements.thumbnailPreview.querySelector('img');
  elements.thumbnailPreview.hidden = !thumbnailUrl;
  image.src = thumbnailUrl || '';
}

function getManualInputMessage(title, channelName) {
  return !title.value.trim() || !channelName.value.trim() ? 'タイトルとチャンネル名は手入力してください' : '';
}

function setVideoIdSuccessStatus(title, channelName, suffix = '') {
  const manualInputMessage = getManualInputMessage(title, channelName);
  const messages = ['動画IDを取得しました', suffix, manualInputMessage].filter(Boolean);
  setStatus(elements.autoFillStatus, messages.join('。'), 'success');
}

async function fetchVideoInfo() {
  const { url: urlInput, title, channelName } = getFormControls();
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
  setVideoIdSuccessStatus(title, channelName);

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

    if (data.author_name && !channelName.value.trim()) {
      channelName.value = data.author_name;
    }

    setVideoIdSuccessStatus(title, channelName, '取得できた動画情報を反映しました');
  } catch (error) {
    console.warn(error);
    setVideoIdSuccessStatus(title, channelName, 'タイトル・チャンネル名の自動取得はできませんでした');
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
  return [...state.sampleVideos, ...state.localVideos];
}

function getFilteredVideos() {
  return getAllVideos().filter((video) => {
    const matchesDecision = state.decision === 'all' || video.decision === state.decision;
    const matchesDeepDive = !state.deepDiveOnly || video.deepDive === true;
    const matchesPostCandidate = !state.postCandidateOnly || video.postCandidate !== 'なし';

    return matchesDecision && matchesDeepDive && matchesPostCandidate;
  });
}

function getOrganizeStatus(video) {
  const hasSummary = video.summary && video.summary !== '未整理';
  const hasPoints = Array.isArray(video.keyPoints) && video.keyPoints.some((point) => point && point !== '未整理');
  const hasInsight = video.fortiesInsight && video.fortiesInsight !== '未整理';
  const hasDecision = video.decision && video.decision !== 'D';
  const hasDeepDive = video.deepDive !== null;
  const hasPostCandidate = video.postCandidate && video.postCandidate !== 'なし';

  return hasSummary || hasPoints || hasInsight || hasDecision || hasDeepDive || hasPostCandidate ? '整理済み' : '未整理';
}

function renderVideos() {
  const videos = getFilteredVideos();
  resetListState();
  elements.resultCount.textContent = `${videos.length}件（サンプル${state.sampleVideos.length}件 / 追加${state.localVideos.length}件）`;
  elements.emptyState.hidden = videos.length > 0;

  videos.forEach((video) => {
    const card = elements.template.content.cloneNode(true);

    card.querySelector('.channel').textContent = video.channelName;
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

    const decision = card.querySelector('.decision');
    decision.textContent = decisionLabels[video.decision] ?? video.decision;
    decision.classList.toggle('is-strong', video.decision === 'A' || video.decision === 'B');

    const deepDive = card.querySelector('.deep-dive');
    deepDive.textContent = video.deepDive === null ? '未判定' : video.deepDive ? 'あり' : 'なし';
    deepDive.classList.toggle('is-strong', video.deepDive === true);

    const postCandidate = card.querySelector('.post-candidate');
    postCandidate.textContent = video.postCandidate;
    postCandidate.classList.toggle('is-strong', video.postCandidate !== 'なし');

    card.querySelector('.organize-template').textContent = getTemplateLabel(video.organizeTemplate);

    const copyPromptButton = card.querySelector('.copy-prompt');
    copyPromptButton.addEventListener('click', () => copyPrompt(video, copyPromptButton));

    card.querySelector('.summary').textContent = video.summary;
    card.querySelector('.insight').textContent = video.fortiesInsight;

    const points = card.querySelector('.points');
    video.keyPoints.forEach((point) => {
      const item = document.createElement('li');
      item.textContent = point;
      points.append(item);
    });

    elements.videoList.append(card);
  });
}

function buildAiPrompt(video) {
  const template = organizeTemplates[normalizeTemplate(video.organizeTemplate)];
  const note = video.note || 'メモなし';

  return [
    '以下のYouTube動画を、見る前に仕分けるために整理してください。',
    '',
    `整理テンプレート: ${template.label}`,
    `重視する観点: ${template.promptFocus}`,
    '',
    `タイトル: ${video.title}`,
    `チャンネル名: ${video.channelName}`,
    `URL: ${video.url}`,
    `気になった理由・メモ: ${note}`,
    '',
    '出力してほしい項目:',
    '1. 要約（3〜5行）',
    '2. 重要ポイント（箇条書き）',
    '3. 自分向け示唆',
    '4. テーマとの関係',
    '5. 視聴判断（A 全部見る / B 該当箇所だけ見る / C 要約で十分 / D 保留）',
    '6. 深掘り候補の有無',
    '7. 投稿化候補（X / note / YouTube / なし）',
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
  const keyPoints = (formData.get('keyPoints') || '')
    .split('\n')
    .map((point) => point.trim())
    .filter(Boolean);
  const deepDiveValue = formData.get('deepDive') || 'undecided';

  return normalizeLocalVideo({
    channelName: formData.get('channelName').trim(),
    title: formData.get('title').trim(),
    url: formData.get('url').trim(),
    videoId: extractYouTubeVideoId(formData.get('url').trim()),
    thumbnailUrl: getYouTubeThumbnailUrl(extractYouTubeVideoId(formData.get('url').trim())),
    note: formData.get('note').trim(),
    organizeTemplate: formData.get('organizeTemplate') || defaultTemplate,
    publishedDate: formData.get('publishedDate') || '',
    summary: (formData.get('summary') || '').trim() || '未整理',
    keyPoints: keyPoints.length > 0 ? keyPoints : ['未整理'],
    fortiesInsight: (formData.get('fortiesInsight') || '').trim() || '未整理',
    decision: formData.get('decision') || 'D',
    deepDive: deepDiveValue === 'undecided' ? null : deepDiveValue === 'true',
    postCandidate: formData.get('postCandidate') || 'なし',
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
      const videos = JSON.parse(reader.result);
      validateVideos(videos, { allowLocalFields: true });
      state.localVideos = videos.map((video) => normalizeLocalVideo(video));
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
  element.textContent = message;
  element.className = `status-message ${type}`;
}

function setDetailFieldsVisibility(visible) {
  elements.detailFields.hidden = !visible;
  elements.toggleDetails.setAttribute('aria-expanded', String(visible));
  elements.toggleDetails.textContent = visible ? '詳細を閉じる' : '詳細を入力する';
}

function bindEvents() {
  elements.decisionFilter.addEventListener('change', (event) => {
    state.decision = event.target.value;
    renderVideos();
  });

  elements.deepDiveFilter.addEventListener('change', (event) => {
    state.deepDiveOnly = event.target.checked;
    renderVideos();
  });

  elements.postCandidateFilter.addEventListener('change', (event) => {
    state.postCandidateOnly = event.target.checked;
    renderVideos();
  });

  elements.resetFilters.addEventListener('click', () => {
    state.decision = 'all';
    state.deepDiveOnly = false;
    state.postCandidateOnly = false;
    elements.decisionFilter.value = 'all';
    elements.deepDiveFilter.checked = false;
    elements.postCandidateFilter.checked = false;
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
}

bindEvents();
loadVideos();
