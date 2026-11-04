import { mediaCoordinator } from '../src/lib/media-coordinator';

type ClipCard = {
  card: HTMLElement;
  video: HTMLVideoElement;
  poster: HTMLImageElement;
  button: HTMLButtonElement;
  status: HTMLElement;
  ownerId: string;
  active: boolean;
  internalPause: boolean;
};

const cards: ClipCard[] = [...document.querySelectorAll<HTMLElement>('[data-clip-card]')].flatMap((card) => {
  const video = card.querySelector<HTMLVideoElement>('[data-short-video]');
  const poster = card.querySelector<HTMLImageElement>('.moment-card__poster');
  const button = card.querySelector<HTMLButtonElement>('[data-short-play]');
  const status = card.querySelector<HTMLElement>('[data-short-status]');
  const clipId = card.dataset.clipId;
  if (!video || !poster || !button || !status || !clipId || !video.dataset.src) return [];
  return [{ card, video, poster, button, status, ownerId: `short:${clipId}`, active: false, internalPause: false }];
});

function setStatus(card: ClipCard, message: string): void { card.status.textContent = message; }

function resetCard(card: ClipCard, message: string, release = true): void {
  const wasActive = card.active;
  card.active = false;
  card.internalPause = true;
  card.video.pause();
  card.internalPause = false;
  card.video.removeAttribute('src');
  card.video.load();
  card.video.controls = false;
  card.video.hidden = true;
  card.poster.hidden = false;
  card.button.hidden = false;
  card.button.textContent = '▶ Play short';
  setStatus(card, message);
  if (wasActive && release) mediaCoordinator.release(card.ownerId);
}

function begin(card: ClipCard): void {
  const source = card.video.dataset.src;
  if (!source) return;
  if (card.active && !card.video.paused) return;
  mediaCoordinator.claim(card.ownerId, () => resetCard(card, 'Paused because another video started.', false));
  if (mediaCoordinator.getActiveOwner() !== card.ownerId) return;
  card.active = true;
  card.button.hidden = true;
  card.poster.hidden = true;
  card.video.hidden = false;
  card.video.controls = true;
  card.video.muted = false;
  card.video.playsInline = true;
  if (!card.video.hasAttribute('src')) { card.video.src = source; card.video.load(); }
  setStatus(card, 'Loading short video…');
  void card.video.play().then(() => {
    if (card.active) setStatus(card, 'Playing short video.');
  }).catch(() => {
    if (card.active) {
      card.active = false;
      mediaCoordinator.release(card.ownerId);
      setStatus(card, 'Playback was blocked. Use the video controls to try again.');
    }
  });
}

for (const card of cards) {
  card.button.hidden = false;
  card.button.addEventListener('click', () => begin(card));
  card.video.addEventListener('play', () => {
    mediaCoordinator.claim(card.ownerId, () => resetCard(card, 'Paused because another video started.', false));
    if (mediaCoordinator.getActiveOwner() !== card.ownerId) {
      card.internalPause = true; card.video.pause(); card.internalPause = false; return;
    }
    card.active = true; card.button.hidden = true; card.poster.hidden = true; setStatus(card, 'Playing short video.');
  });
  card.video.addEventListener('pause', () => {
    if (card.active && !card.internalPause) {
      setStatus(card, 'Paused. Use the video controls to resume.');
    }
  });
  card.video.addEventListener('ended', () => resetCard(card, 'Short finished. Select Play short to watch again.'));
  card.video.addEventListener('error', () => {
    if (card.video.hasAttribute('src')) resetCard(card, 'This short could not load. Watch the full performance below.');
  });
}

window.addEventListener('pagehide', () => {
  for (const card of cards) resetCard(card, '', false);
});

if (cards.length && 'IntersectionObserver' in window) {
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const card = cards.find((item) => item.card === entry.target);
      if (card?.active && !entry.isIntersecting) resetCard(card, 'Paused outside the viewport. Select Play short to resume.');
    }
  }, { threshold: 0.01 });
  cards.forEach((card) => observer.observe(card.card));
}
