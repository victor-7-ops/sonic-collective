import { mediaCoordinator } from '../src/lib/media-coordinator';
import { readMotionPause } from '../src/lib/motion-policy';

type ConnectionInfo = EventTarget & { saveData?: boolean };
const connection = (navigator as Navigator & { connection?: ConnectionInfo }).connection;
const reducedQuery = matchMedia('(prefers-reduced-motion: reduce)');
const teaser = document.querySelector<HTMLElement>('[data-teaser-clip]');
const video = teaser?.querySelector<HTMLVideoElement>('[data-teaser-video]');
const userPaused = readMotionPause(() => window.sessionStorage);
const owner = 'rena-teaser';
let inView = false;
let attempted = false;
let stopTimer: number | undefined;

function renderMotionState(): void {
  const reduced = reducedQuery.matches;
  document.documentElement.classList.toggle('motion-active', !reduced && !userPaused);
  document.documentElement.classList.toggle('motion-paused', userPaused);
  document.documentElement.classList.toggle('motion-reduced', reduced);
}

function stopPreview(): void {
  window.clearTimeout(stopTimer);
  if (video?.hasAttribute('src')) {
    video.pause();
    video.hidden = true;
    video.removeAttribute('src');
    video.load();
  }
  mediaCoordinator.release(owner);
}

async function evaluatePreview(): Promise<void> {
  if (!video?.dataset.src) return;
  if (!inView || document.hidden || reducedQuery.matches || connection?.saveData || userPaused) {
    stopPreview();
    return;
  }
  if (attempted || mediaCoordinator.getActiveOwner()) return;

  attempted = true;
  mediaCoordinator.claim(owner, stopPreview);
  video.src = video.dataset.src;
  try {
    await video.play();
    if (mediaCoordinator.getActiveOwner() !== owner) return;
    video.hidden = false;
    stopTimer = window.setTimeout(stopPreview, 4500);
  } catch {
    if (mediaCoordinator.getActiveOwner() === owner) stopPreview();
  }
}

reducedQuery.addEventListener('change', () => {
  renderMotionState();
  void evaluatePreview();
});
connection?.addEventListener('change', evaluatePreview);
document.addEventListener('visibilitychange', evaluatePreview);
video?.addEventListener('ended', stopPreview);

if (teaser && video && 'IntersectionObserver' in window) {
  const observer = new IntersectionObserver(([entry]) => {
    inView = entry.isIntersecting;
    void evaluatePreview();
  });
  observer.observe(video.closest('[data-teaser-surface]') ?? teaser);
}

renderMotionState();
document.documentElement.classList.add('motion-ready');
