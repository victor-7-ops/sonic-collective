import { initializeMediaCoordinator, mediaCoordinator } from '../src/lib/media-coordinator';
import { shouldAutoPlayDecorativeMedia } from '../src/lib/motion-policy';

type PreviewCard = { root: HTMLElement; video: HTMLVideoElement; button: HTMLButtonElement; image?: HTMLImageElement; timer: number; delay: number; auto: boolean; owner: string; attempt: number };
type ConnectionInfo = EventTarget & { saveData?: boolean };
const connection = (navigator as Navigator & { connection?: ConnectionInfo }).connection;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const cards: PreviewCard[] = [...document.querySelectorAll<HTMLElement>('[data-card-preview]')].flatMap((root, index) => {
  const surface = root.parentElement;
  const video = root.querySelector<HTMLVideoElement>('[data-preview-video]');
  const button = root.querySelector<HTMLButtonElement>('[data-preview-button]');
  const image = surface?.querySelector<HTMLImageElement>('.performance-card__image img') ?? undefined;
  return surface && video && button ? [{ root: surface, video, button, image, timer: 0, delay: 0, auto: false, owner: `card-preview:${index}`, attempt: 0 }] : [];
});

function stop(card: PreviewCard): void {
  window.clearTimeout(card.timer);
  window.clearTimeout(card.delay);
  if (!card.video.hasAttribute('src')) return;
  card.attempt++;
  card.video.pause();
  card.video.removeAttribute('src');
  card.video.load();
  card.video.hidden = true;
  if (card.image) card.image.hidden = false;
  card.button.textContent = 'Preview';
  card.button.setAttribute('aria-pressed', 'false');
  card.auto = false;
  mediaCoordinator.release(card.owner);
}

async function start(card: PreviewCard, automatic: boolean): Promise<void> {
  const source = card.video.dataset.src;
  if (!source || card.video.hasAttribute('src')) return;
  const activeOwner = mediaCoordinator.getActiveOwner();
  if (activeOwner && !activeOwner.startsWith('card-preview:')) return;
  window.clearTimeout(card.delay);
  mediaCoordinator.claim(card.owner, () => stop(card));
  if (mediaCoordinator.getActiveOwner() !== card.owner) return;
  const attempt = ++card.attempt;
  card.auto = automatic;
  card.video.src = source;
  card.video.hidden = false;
  card.video.muted = true;
  card.button.textContent = 'Stop preview';
  card.button.setAttribute('aria-pressed', 'true');
  try {
    await card.video.play();
    if (attempt !== card.attempt || card.video.paused) return;
    if (card.image) card.image.hidden = true;
    card.timer = window.setTimeout(() => { if (attempt === card.attempt) stop(card); }, 7000);
  } catch { if (attempt === card.attempt) stop(card); }
}

function autoAllowed(): boolean {
  return shouldAutoPlayDecorativeMedia({ reducedMotion: reducedMotion.matches, saveData: connection?.saveData === true, userPaused: document.documentElement.classList.contains('motion-paused'), inViewport: true, documentVisible: document.visibilityState === 'visible' });
}

initializeMediaCoordinator();
for (const card of cards) {
  card.button.hidden = false;
  card.root.addEventListener('pointerenter', (event) => {
    if (event.pointerType === 'touch' || !autoAllowed() || card.video.hasAttribute('src')) return;
    card.delay = window.setTimeout(() => { if (card.root.matches(':hover') && autoAllowed()) void start(card, true); }, 250);
  });
  card.root.addEventListener('pointerleave', () => { window.clearTimeout(card.delay); if (card.auto) stop(card); });
  card.button.addEventListener('click', () => card.video.hasAttribute('src') ? stop(card) : void start(card, false));
  card.video.addEventListener('ended', () => stop(card));
  card.video.addEventListener('error', () => stop(card));
}

const stopAll = () => cards.forEach(stop);
reducedMotion.addEventListener('change', stopAll);
connection?.addEventListener('change', stopAll);
document.addEventListener('visibilitychange', () => { if (document.visibilityState !== 'visible') stopAll(); });
new MutationObserver(() => { if (document.documentElement.classList.contains('motion-paused')) stopAll(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
