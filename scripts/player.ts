import { initializeMediaCoordinator, mediaCoordinator } from '../src/lib/media-coordinator';
import { loadYouTubeApi } from '../src/lib/youtube';

type PlaybackRecord = { id: string; title: string; youtubeId: string; embeddable?:boolean };
type Session = {
  surface: HTMLElement;
  status: HTMLElement;
  record: PlaybackRecord;
  ownerId: string;
  canonical: boolean;
  request: number;
  loading: boolean;
  player?: YT.Player;
  iframe?: HTMLIFrameElement;
  timer?: number;
};

initializeMediaCoordinator();
const dataNode = document.querySelector<HTMLScriptElement>('#playback-records');
const records = new Map<string, PlaybackRecord>();
if (dataNode) {
  try {
    const values = JSON.parse(dataNode.textContent ?? '[]') as PlaybackRecord[];
    values.forEach((value) => {
      if (/^[A-Za-z0-9_-]{11}$/.test(value.youtubeId) && value.id && value.title) records.set(value.id, {...value,embeddable:value.embeddable!==false});
    });
  } catch { console.error('Playback could not read the approved performance list.'); }
}

const sessions = new WeakMap<HTMLElement, Session>();
let uniqueFrameId = 0;

function createStatusControl(session: Session, message: string, retry: boolean, playWithSound = false): void {
  session.status.replaceChildren(document.createTextNode(message));
  if (playWithSound) {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'player-retry'; button.textContent = 'Play with sound';
    button.addEventListener('click', () => {
      try { session.player?.unMute(); session.player?.playVideo(); } catch { /* Native player controls remain available. */ }
    });
    session.status.append(button);
  }
  if (retry) {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'player-retry'; button.textContent = 'Retry playback';
    button.addEventListener('click', () => { session.status.replaceChildren(); void startPlayback(session); }, { once: true });
    session.status.append(button);
  }
}

function stopSession(session: Session, statusMessage = ''): void {
  session.request++;
  session.loading = false;
  if (session.timer !== undefined) window.clearTimeout(session.timer);
  session.timer = undefined;
  const player = session.player; session.player = undefined;
  try { player?.pauseVideo(); } catch { /* Player may already be disconnected. */ }
  try { player?.destroy(); } catch { /* Cleanup continues if the API has already torn down its iframe. */ }
  session.iframe?.remove(); session.iframe = undefined;
  session.surface.querySelector('picture')?.classList.remove('performance-player__poster--fading');
  session.surface.querySelector('picture')?.removeAttribute('hidden');
  session.surface.removeAttribute('data-player-ready');
  session.surface.querySelector<HTMLElement>('[data-play-performance]')?.removeAttribute('hidden');
  if (statusMessage) createStatusControl(session, statusMessage, false);
}

function failSession(session: Session, request: number, message: string, retry = true, errorCode?: number): void {
  if (session.request !== request) return;
  if (errorCode === 153) {
    console.warn('YouTube error 153: check the published page origin and default referrer policy.', {
      origin: location.origin,
      referrerPolicy: document.querySelector<HTMLMetaElement>('meta[name="referrer"]')?.content ?? 'browser default',
    });
  } else if (errorCode !== undefined) {
    console.warn(`YouTube playback error ${errorCode} for performance ${session.record.id}.`);
  }
  stopSession(session);
  createStatusControl(session, message, retry);
}

function errorMessage(code: number): string {
  if (code === 2) return 'YouTube rejected this video request. Retry or use the external watch link.';
  if (code === 5) return 'This video could not play in the embedded player. Retry or use the external watch link.';
  if (code === 100) return 'This video is unavailable on YouTube. Open the external watch link to check it.';
  if (code === 101 || code === 150) return 'The video owner has disabled embedded playback. Watch it on YouTube instead.';
  if (code === 153) return 'YouTube could not verify this page for playback. Retry or watch on YouTube.';
  return 'The YouTube player reported an error. Retry or use the external watch link.';
}


async function startPlayback(session: Session): Promise<void> {
  if (session.loading) return;
  if (session.player) { session.player.playVideo(); return; }
  session.loading = true;
  mediaCoordinator.claim(session.ownerId, () => stopSession(session, 'Playback stopped.'));
  if (mediaCoordinator.getActiveOwner() !== session.ownerId) return;
  const request = ++session.request;
  createStatusControl(session, 'Loading YouTube player…', false);
  session.surface.removeAttribute('data-player-ready');
  session.surface.querySelector<HTMLElement>('[data-play-performance]')?.setAttribute('hidden', '');

  const frame = document.createElement('iframe');
  frame.id = `sc-youtube-player-${++uniqueFrameId}`;
  frame.className = 'yt-player-frame';
  frame.title = `${session.record.title} — YouTube player`;
  frame.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
  frame.allowFullscreen = true;
  frame.referrerPolicy = 'strict-origin-when-cross-origin';
  const embed = new URL(`https://www.youtube-nocookie.com/embed/${encodeURIComponent(session.record.youtubeId)}`);
  embed.searchParams.set('enablejsapi', '1');
  embed.searchParams.set('origin', location.origin);
  embed.searchParams.set('playsinline', '1');
  embed.searchParams.set('controls', '1');
  embed.searchParams.set('fs', '1');
  embed.searchParams.set('cc_load_policy', '1');
  embed.searchParams.set('autoplay', '1');
  frame.src = embed.toString();
  session.iframe = frame;
  session.surface.append(frame);

  try {
    const api = await loadYouTubeApi();
    if (session.request !== request || !frame.isConnected) return;
    session.timer = window.setTimeout(() => failSession(session, request, 'The YouTube player took too long to become ready. Retry or watch on YouTube.'), 12_000);
    const options: YT.PlayerOptions = {
      events: {
        onReady: () => {
          if (session.request !== request) return;
          if (session.timer !== undefined) window.clearTimeout(session.timer);
          session.timer = undefined; session.loading = false;
          session.surface.setAttribute('data-player-ready', 'true');
          const poster = session.surface.querySelector('picture');
          poster?.classList.add('performance-player__poster--fading');
          window.setTimeout(() => { if (session.request === request) poster?.setAttribute('hidden', ''); }, 160);
          createStatusControl(session, 'Player ready. Use the YouTube controls to play.', false);
        },
        onStateChange: (event) => {
          if (session.request !== request) return;
          if (event.data === YT.PlayerState.PLAYING) { session.loading = false; createStatusControl(session, 'Playing.', false); }
          else if (event.data === YT.PlayerState.PAUSED) createStatusControl(session, 'Paused.', false);
          else if (event.data === YT.PlayerState.ENDED) {
            createStatusControl(session, 'Playback ended.', false);
            const hero = session.surface.closest('.hero');
            if (hero) {
              hero.querySelector('[data-playback-teaser]')?.removeAttribute('hidden');
              mediaCoordinator.release(session.ownerId);
              stopSession(session);
              hero.dispatchEvent(new Event('spotlight-ended'));
            }
          }
          else if (event.data === YT.PlayerState.BUFFERING) createStatusControl(session, 'Buffering…', false);
          else if (event.data === YT.PlayerState.UNSTARTED) createStatusControl(session, 'Player ready. Use the YouTube controls to play.', false);
        },
        onAutoplayBlocked: () => {
          if (session.request === request) { session.loading = false; createStatusControl(session, 'Automatic playback was blocked. Use the YouTube player controls, or play with sound.', false, true); }
        },
        onError: (event) => failSession(session, request, errorMessage(event.data ?? 0), true, event.data),
      },
    };
    session.player = new api.Player(frame, options);
  } catch {
    failSession(session, request, 'The YouTube player could not load. Check your connection, then retry or watch on YouTube.');
  }
}

document.querySelectorAll<HTMLAnchorElement>('[data-play-performance]').forEach((link) => {
  const record = records.get(link.dataset.playPerformance ?? '');
  const scope = link.closest<HTMLElement>('.hero') ?? link.closest<HTMLElement>('.performance-player');
  const surface = scope?.querySelector<HTMLElement>('[data-player-id]');
  const status = scope?.querySelector<HTMLElement>('[data-player-status]');
  if (!record || !surface || !status) return;
  const session: Session = { surface, status, record, ownerId: `canonical:${record.id}`, canonical: true, request: 0, loading: false };
  sessions.set(surface, session);
  link.addEventListener('click', (event) => { event.preventDefault(); void startPlayback(session); });
});

const dialog = document.querySelector<HTMLDialogElement>('[data-quick-watch-dialog]');
if (dialog) {
  const title = dialog.querySelector<HTMLElement>('[data-quick-watch-title]')!;
  const surface = dialog.querySelector<HTMLElement>('[data-quick-watch-surface]')!;
  const status = dialog.querySelector<HTMLElement>('[data-quick-watch-status]')!;
  const external = dialog.querySelector<HTMLAnchorElement>('[data-quick-watch-external]')!;
  const close = dialog.querySelector<HTMLButtonElement>('[data-quick-watch-close]')!;
  const dialogSession: Session = { surface, status, record: { id: '', title: '', youtubeId: '' }, ownerId: 'quick-watch', canonical: false, request: 0, loading: false };
  let opener: HTMLElement | null = null;
  let priorOverflow = '';
  sessions.set(surface, dialogSession);

  document.querySelectorAll<HTMLButtonElement>('[data-watch-id]').forEach((button) => {
    const record = records.get(button.dataset.watchId ?? '');
    if (!record?.embeddable) return;
    button.hidden = false;
    button.addEventListener('click', () => {
      opener = button; dialogSession.record = record;
      title.textContent = record.title;
      external.href = `https://www.youtube.com/watch?v=${encodeURIComponent(record.youtubeId)}`;
      external.hidden = false;
      priorOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      dialog.showModal();
      void startPlayback(dialogSession);
    });
  });

  const closeDialog = () => dialog.close();
  close.addEventListener('click', closeDialog);
  dialog.addEventListener('close', () => {
    mediaCoordinator.release(dialogSession.ownerId);
    stopSession(dialogSession);
    dialogSession.status.replaceChildren();
    document.body.style.overflow = priorOverflow;
    if (opener?.isConnected) window.requestAnimationFrame(() => opener?.focus());
  });
}

window.addEventListener('pagehide', () => {
  for (const surface of document.querySelectorAll<HTMLElement>('[data-player-id], [data-quick-watch-surface]')) {
    const session = sessions.get(surface);
    if (session) stopSession(session);
  }
});
