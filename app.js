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

async function loadVideos() {
  try {
    const response = await fetch('videos.json');

    if (!response.ok) {
      throw new Error(`videos.jsonを読み込めませんでした: ${response.status}`);
    }

    state.videos = await response.json();
    renderVideos();
  } catch (error) {
    elements.videoList.innerHTML = `<p class="empty-state">${error.message}</p>`;
    elements.resultCount.textContent = '0件';
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
  elements.videoList.innerHTML = '';
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
