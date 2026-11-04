export type StopMedia = () => void;
export interface MediaCoordinator {
  claim(ownerId: string, stopFn: StopMedia): void;
  release(ownerId: string): void;
  pauseAll(): void;
  getActiveOwner(): string | null;
}

export function createMediaCoordinator(): MediaCoordinator {
  let active: { id: string; stop: StopMedia } | null = null;
  let generation = 0;
  return {
    claim(ownerId, stopFn) {
      if (active?.id === ownerId) { active.stop = stopFn; return; }
      const claimGeneration = ++generation;
      const previous = active;
      active = null;
      previous?.stop();
      if (generation !== claimGeneration) return;
      active = { id: ownerId, stop: stopFn };
    },
    release(ownerId) {
      if (active?.id !== ownerId) return;
      active = null;
      generation++;
    },
    pauseAll() {
      const previous = active;
      active = null;
      generation++;
      previous?.stop();
    },
    getActiveOwner: () => active?.id ?? null,
  };
}

const singleton = createMediaCoordinator();
let listenersInitialized = false;
export const mediaCoordinator = singleton;
export const claim = singleton.claim;
export const release = singleton.release;
export const pauseAll = singleton.pauseAll;

export function initializeMediaCoordinator(): void {
  if (listenersInitialized || typeof document === 'undefined') return;
  listenersInitialized = true;
  window.addEventListener('pagehide', () => singleton.pauseAll());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') singleton.pauseAll();
  });
}
