import { mediaCoordinator } from '../src/lib/media-coordinator';
import { readMotionPause, shouldAutoPlayDecorativeMedia, writeMotionPause } from '../src/lib/motion-policy';

type ConnectionInfo = EventTarget & { saveData?: boolean };
const connection = (navigator as Navigator & { connection?: ConnectionInfo }).connection;
const reducedQuery = matchMedia('(prefers-reduced-motion: reduce)');
const motionToggle = document.querySelector<HTMLButtonElement>('[data-motion-toggle]');
const teaser = document.querySelector<HTMLElement>('[data-teaser-clip]');
const teaserVideo = teaser?.querySelector<HTMLVideoElement>('[data-teaser-video]');
const teaserSurface = teaser?.querySelector<HTMLElement>('[data-teaser-surface]');
const teaserToggle = teaser?.querySelector<HTMLButtonElement>('[data-teaser-toggle]');
const teaserStatus = teaser?.querySelector<HTMLElement>('[data-teaser-status]');
let userPaused = readMotionPause(() => window.sessionStorage);
let teaserInView = false;
let teaserManualPause = false;
let teaserActive = false;
let internalTeaserPause = false;
let revealObserver: IntersectionObserver | undefined;
let revealTimeout = 0;

const storage = () => window.sessionStorage;
const getSaveData = () => connection?.saveData === true;
const autoEligible = () => shouldAutoPlayDecorativeMedia({
  reducedMotion: reducedQuery.matches,
  saveData: getSaveData(),
  userPaused: userPaused || teaserManualPause,
  inViewport: teaserInView,
  documentVisible: document.visibilityState === 'visible',
});

function revealAll(): void {
  if (revealTimeout) window.clearTimeout(revealTimeout);
  revealObserver?.disconnect(); revealObserver = undefined;
  document.querySelectorAll<HTMLElement>('[data-reveal]').forEach((element) => { element.dataset.revealState = 'visible'; });
}

function setupReveals(): void {
  if (reducedQuery.matches || userPaused || !('IntersectionObserver' in window)) { revealAll(); return; }
  const items = [...document.querySelectorAll<HTMLElement>('[data-reveal]')].filter((item) => item.dataset.revealState !== 'visible');
  if (!items.length) return;
  items.forEach((item) => { item.dataset.revealState = 'waiting'; });
  try {
    revealObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          (entry.target as HTMLElement).dataset.revealState = 'visible';
          revealObserver?.unobserve(entry.target);
        }
      }
    }, { rootMargin: '80px 0px', threshold: 0.01 });
    items.forEach((item) => revealObserver?.observe(item));
    revealTimeout = window.setTimeout(revealAll, 1500);
  } catch { revealAll(); }
}

function renderMotionState(): void {
  const reduced = reducedQuery.matches;
  document.documentElement.classList.toggle('motion-active', !reduced && !userPaused);
  document.documentElement.classList.toggle('motion-paused', userPaused);
  document.documentElement.classList.toggle('motion-reduced', reduced);
  if (motionToggle) {
    motionToggle.hidden = false;
    motionToggle.disabled = reduced;
    motionToggle.setAttribute('aria-pressed', String(reduced || userPaused));
    motionToggle.textContent = reduced ? 'Reduced motion enabled' : userPaused ? 'Resume motion' : 'Pause motion';
  }
  if (reduced || userPaused) revealAll(); else setupReveals();
}

function renderTeaserButton(): void {
  if (!teaserToggle) return;
  teaserToggle.hidden = false;
  teaserToggle.textContent = teaserActive ? 'Pause preview' : teaserManualPause ? 'Resume preview' : 'Play silent preview';
  teaserToggle.setAttribute('aria-pressed', String(teaserActive));
}

function stopTeaser(message = 'Preview paused.', unload = true): void {
  if (!teaserVideo || !teaserActive && !teaserVideo.hasAttribute('src')) {
    if (teaserStatus && message) teaserStatus.textContent = message;
    renderTeaserButton();
    return;
  }
  const wasActive = teaserActive;
  teaserActive = false;
  internalTeaserPause = true;
  teaserVideo.pause();
  internalTeaserPause = false;
  if (unload) {
    teaserVideo.removeAttribute('src');
    teaserVideo.load();
    teaserVideo.hidden = true;
    teaserSurface?.querySelector('picture')?.removeAttribute('hidden');
  }
  if (wasActive) mediaCoordinator.release('rena-teaser');
  if (teaserStatus && message) teaserStatus.textContent = message;
  renderTeaserButton();
}

function claimTeaser(): boolean {
  mediaCoordinator.claim('rena-teaser', () => stopTeaser('Preview stopped to play other media.'));
  return mediaCoordinator.getActiveOwner() === 'rena-teaser';
}

async function startTeaser(manual: boolean): Promise<void> {
  if (!teaserVideo || !teaserToggle) return;
  if (teaserActive) {
    if (teaserVideo.paused) {
      if (!claimTeaser()) return;
      try { await teaserVideo.play(); } catch { stopTeaser('Preview could not resume. Select Play preview to try again.', false); }
    }
    return;
  }
  if (!manual && !autoEligible()) return;
  if (manual) teaserManualPause = false;
  if (!claimTeaser()) return;
  const source = teaserVideo.dataset.src;
  if (!source) { mediaCoordinator.release('rena-teaser'); return; }
  teaserActive = true;
  teaserVideo.muted = true;
  teaserVideo.loop = true;
  teaserVideo.playsInline = true;
  teaserVideo.controls = true;
  teaserVideo.hidden = false;
  teaserSurface?.querySelector('picture')?.setAttribute('hidden', '');
  if (!teaserVideo.hasAttribute('src')) { teaserVideo.src = source; teaserVideo.load(); }
  if (teaserStatus) teaserStatus.textContent = 'Playing a silent preview.';
  renderTeaserButton();
  try { await teaserVideo.play(); }
  catch {
    teaserActive = false;
    mediaCoordinator.release('rena-teaser');
    if (teaserStatus) teaserStatus.textContent = 'The preview was blocked. Use the video controls to try again.';
    renderTeaserButton();
  }
}

function evaluateTeaser(): void {
  if (!teaserVideo) return;
  if (autoEligible()) { void startTeaser(false); }
  else if (teaserActive && (!documentVisible() || !teaserInView || reducedQuery.matches || getSaveData() || userPaused)) {
    if (reducedQuery.matches || getSaveData()) teaserManualPause = true;
    stopTeaser('Preview paused by motion, visibility, or data preferences.');
  }
}
function documentVisible(): boolean { return document.visibilityState === 'visible'; }

motionToggle?.addEventListener('click', () => {
  if (reducedQuery.matches) return;
  userPaused = !userPaused;
  writeMotionPause(storage, userPaused);
  if (userPaused) stopTeaser('Preview paused with motion.');
  renderMotionState();
  evaluateTeaser();
});

reducedQuery.addEventListener('change', () => {
  renderMotionState(); evaluateTeaser();
});
connection?.addEventListener('change', evaluateTeaser);
document.addEventListener('visibilitychange', evaluateTeaser);

if (teaser && teaserVideo) {
  teaserToggle?.addEventListener('click', () => {
    if (teaserActive) { teaserManualPause = true; stopTeaser('Preview paused. Select Resume preview to continue.'); }
    else { teaserManualPause = false; void startTeaser(true); }
  });
  teaserVideo.addEventListener('pause', () => {
    if (!teaserActive || internalTeaserPause) return;
    teaserActive = false; teaserManualPause = true;
    mediaCoordinator.release('rena-teaser');
    if (teaserStatus) teaserStatus.textContent = 'Preview paused. Select Resume preview to continue.';
    renderTeaserButton();
  });
  teaserVideo.addEventListener('play', () => {
    if (!claimTeaser()) { internalTeaserPause = true; teaserVideo.pause(); internalTeaserPause = false; return; }
    teaserManualPause = false;
    teaserActive = true; renderTeaserButton();
  });
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      teaserInView = entries.some((entry) => entry.isIntersecting);
      if (!teaserInView && teaserActive) stopTeaser('Preview paused outside the viewport.');
      else evaluateTeaser();
    }, { rootMargin: '160px 0px', threshold: 0.01 });
    observer.observe(teaser);
  }
}

renderMotionState();
renderTeaserButton();
document.documentElement.classList.add('motion-ready');
