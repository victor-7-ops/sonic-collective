export interface DecorativeMediaEligibility {
  reducedMotion: boolean;
  saveData: boolean;
  userPaused: boolean;
  inViewport: boolean;
  documentVisible: boolean;
}

export function shouldAutoPlayDecorativeMedia(policy: DecorativeMediaEligibility): boolean {
  return !policy.reducedMotion && !policy.saveData && !policy.userPaused && policy.inViewport && policy.documentVisible;
}

interface StorageLike { getItem(key: string): string | null; setItem(key: string, value: string): void; }
const KEY = 'sonic-collective-motion-paused';
export function readMotionPause(getStorage: () => StorageLike): boolean {
  try { return getStorage().getItem(KEY) === 'true'; } catch { return false; }
}
export function writeMotionPause(getStorage: () => StorageLike, paused: boolean): boolean {
  try { getStorage().setItem(KEY, String(paused)); return true; } catch { return false; }
}
