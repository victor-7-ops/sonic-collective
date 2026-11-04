export type YouTubeApi = { Player: new (element: string | HTMLElement, options: YT.PlayerOptions) => YT.Player };
type ReadyCallback = (() => void) | null | undefined;
export interface YouTubeLoaderEnvironment {
  getApi(): YouTubeApi | undefined;
  getReadyCallback(): ReadyCallback;
  setReadyCallback(callback: ReadyCallback): void;
  createScript(onError: () => void): { remove(): void };
  setTimer(callback: () => void, delay: number): number;
  clearTimer(timer: number): void;
}

export function createYouTubeApiLoader(environment: YouTubeLoaderEnvironment, timeoutMs = 12_000) {
  let inFlight: Promise<YouTubeApi> | null = null;
  return function loadYouTubeApi(): Promise<YouTubeApi> {
    const readyApi = environment.getApi();
    if (readyApi?.Player) return Promise.resolve(readyApi);
    if (inFlight) return inFlight;

    inFlight = new Promise<YouTubeApi>((resolve, reject) => {
      let settled = false;
      let timer: number | undefined;
      let script: { remove(): void } | undefined;
      const previousReady = environment.getReadyCallback();
      const cleanup = (removeScript: boolean) => {
        if (timer !== undefined) environment.clearTimer(timer);
        if (environment.getReadyCallback() === onReady) environment.setReadyCallback(previousReady);
        if (removeScript) script?.remove();
      };
      const fail = (error: Error) => {
        if (settled) return;
        settled = true; cleanup(true); reject(error);
      };
      const onReady = () => {
        try { previousReady?.(); } catch { /* Keep the shared API ready even if another callback fails. */ }
        const api = environment.getApi();
        if (!api?.Player) { fail(new Error('YouTube iframe API became ready without YT.Player.')); return; }
        if (settled) return;
        settled = true; cleanup(false); resolve(api);
      };
      environment.setReadyCallback(onReady);
      timer = environment.setTimer(() => fail(new Error(`YouTube iframe API did not load within ${timeoutMs}ms.`)), timeoutMs);
      try { script = environment.createScript(() => fail(new Error('YouTube iframe API request failed.'))); }
      catch (error) { fail(error instanceof Error ? error : new Error('Could not load YouTube iframe API.')); }
    }).catch((error: unknown) => {
      inFlight = null;
      throw error;
    });
    return inFlight;
  };
}

const browserEnvironment: YouTubeLoaderEnvironment = {
  getApi: () => window.YT?.Player ? window.YT as unknown as YouTubeApi : undefined,
  getReadyCallback: () => window.onYouTubeIframeAPIReady,
  setReadyCallback: (callback) => { window.onYouTubeIframeAPIReady = callback; },
  createScript: (onError) => {
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.async = true;
    script.addEventListener('error', onError, { once: true });
    document.head.append(script);
    return { remove: () => { script.removeEventListener('error', onError); script.remove(); } };
  },
  setTimer: (callback, delay) => window.setTimeout(callback, delay),
  clearTimer: (timer) => window.clearTimeout(timer),
};

export const loadYouTubeApi = createYouTubeApiLoader(browserEnvironment);
