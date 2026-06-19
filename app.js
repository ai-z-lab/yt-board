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
    state.sampleVideos = videos.map((video) => ({ ...video, source: 'sample' }));
    state.localVideos = loadLocalVideos();
    renderVideos();
  } catch (error) {
    showLoadError(error);
  }
}

function validateVideos(videos, options = {}) {
  const { allowLocalFields = false } = options;

  if (!Array.isArray(videos)) {
    throw new Error('動画データの形式が不正です: 配列である必要があります。');
  }

  videos.forEach((video, index) => {
    const missingField = requiredVideoFields.find((field) => !(field in video));

    if (missingField) {
      throw new Error(`動画データの形式が不正です: ${index + 1}件目に${missingField}がありません。`);
    }

    if (!Array.isArray(video.keyPoints)) {
      throw new Error(`動画データの形式が不正です: ${index + 1}件目のkeyPointsは配列である必要があります。`);
    }

    if (!['A', 'B', 'C', 'D'].includes(video.decision)) {
      throw new Error(`動画データの形式が不正です: ${index + 1}件目のdecisionが不正です。`);
    }

    if (typeof video.deepDive !== 'boolean') {
      throw new Error(`動画データの形式が不正です: ${index + 1}件目のdeepDiveはtrue/falseである必要があります。`);
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

function normalizeLocalVideo(video) {
  return {
    ...video,
    id: video.id || createLocalId(),
    source: 'local',
    keyPoints: Array.isArray(video.keyPoints) ? video.keyPoints : [],
  };
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

function renderVideos() {
  const videos = getFilteredVideos();
  resetListState();
  elements.resultCount.textContent = `${videos.length}件（サンプル${state.sampleVideos.length}件 / 追加${state.localVideos.length}件）`;
  elements.emptyState.hidden = videos.length > 0;

  videos.forEach((video) => {
    const card = elements.template.content.cloneNode(true);

    card.querySelector('.channel').textContent = video.channelName;
    card.querySelector('.published-date').textContent = video.publishedDate;
    card.querySelector('.title').textContent = video.title;

    const sourceBadge = card.querySelector('.source-badge');
    sourceBadge.textContent = video.source === 'local' ? '追加データ' : 'サンプル';
    sourceBadge.classList.toggle('is-local', video.source === 'local');

    const deleteButton = card.querySelector('.delete-video');
    deleteButton.hidden = video.source !== 'local';
    deleteButton.addEventListener('click', () => deleteLocalVideo(video.id));

    const link = card.querySelector('.url');
    link.href = video.url;
    link.textContent = video.url;
    link.setAttribute('aria-label', `${video.title}をYouTubeで開く`);

    const decision = card.querySelector('.decision');
    decision.textContent = decisionLabels[video.decision] ?? video.decision;
    decision.classList.toggle('is-strong', video.decision === 'A' || video.decision === 'B');

    const deepDive = card.querySelector('.deep-dive');
    deepDive.textContent = video.deepDive ? 'あり' : 'なし';
    deepDive.classList.toggle('is-strong', video.deepDive);

    const postCandidate = card.querySelector('.post-candidate');
    postCandidate.textContent = video.postCandidate;
    postCandidate.classList.toggle('is-strong', video.postCandidate !== 'なし');

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

function getFormVideo() {
  const formData = new FormData(elements.addVideoForm);
  const keyPoints = formData
    .get('keyPoints')
    .split('\n')
    .map((point) => point.trim())
    .filter(Boolean);

  return normalizeLocalVideo({
    channelName: formData.get('channelName').trim(),
    title: formData.get('title').trim(),
    url: formData.get('url').trim(),
    publishedDate: formData.get('publishedDate'),
    summary: formData.get('summary').trim(),
    keyPoints,
    fortiesInsight: formData.get('fortiesInsight').trim(),
    decision: formData.get('decision'),
    deepDive: formData.get('deepDive') === 'true',
    postCandidate: formData.get('postCandidate'),
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

  elements.addVideoForm.addEventListener('submit', addLocalVideo);
  elements.exportButton.addEventListener('click', exportLocalVideos);
  elements.importInput.addEventListener('change', importLocalVideos);
}

bindEvents();
loadVideos();
