const decisionLabels = {
  A: 'A 全部見る',
  B: 'B 該当箇所だけ見る',
  C: 'C 要約で十分',
  D: 'D 保留',
};

const state = {
  videos: [],
  decision: 'all',
  deepDiveOnly: false,
  postCandidateOnly: false,
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

async function loadVideos() {
  try {
    const response = await fetch('./videos.json', { cache: 'no-cache' });

    if (!response.ok) {
      throw new Error(`videos.jsonを読み込めませんでした: ${response.status}`);
    }

    const videos = await response.json();
    validateVideos(videos);
    state.videos = videos;
    renderVideos();
  } catch (error) {
    showLoadError(error);
  }
}

function validateVideos(videos) {
  if (!Array.isArray(videos)) {
    throw new Error('videos.jsonの形式が不正です: 配列である必要があります。');
  }

  videos.forEach((video, index) => {
    const missingField = requiredVideoFields.find((field) => !(field in video));

    if (missingField) {
      throw new Error(`videos.jsonの形式が不正です: ${index + 1}件目に${missingField}がありません。`);
    }

    if (!Array.isArray(video.keyPoints)) {
      throw new Error(`videos.jsonの形式が不正です: ${index + 1}件目のkeyPointsは配列である必要があります。`);
    }
  });
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

function getFilteredVideos() {
  return state.videos.filter((video) => {
    const matchesDecision = state.decision === 'all' || video.decision === state.decision;
    const matchesDeepDive = !state.deepDiveOnly || video.deepDive === true;
    const matchesPostCandidate = !state.postCandidateOnly || video.postCandidate !== 'なし';

    return matchesDecision && matchesDeepDive && matchesPostCandidate;
  });
}

function renderVideos() {
  const videos = getFilteredVideos();
  resetListState();
  elements.resultCount.textContent = `${videos.length}件`;
  elements.emptyState.hidden = videos.length > 0;

  videos.forEach((video) => {
    const card = elements.template.content.cloneNode(true);

    card.querySelector('.channel').textContent = video.channelName;
    card.querySelector('.published-date').textContent = video.publishedDate;
    card.querySelector('.title').textContent = video.title;

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
}

bindEvents();
loadVideos();
