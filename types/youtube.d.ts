declare global {
  namespace YT {
    const PlayerState: { UNSTARTED: -1; ENDED: 0; PLAYING: 1; PAUSED: 2; BUFFERING: 3; CUED: 5 };
    type PlayerEvent = { target: Player; data?: number };
    type PlayerOptions = {
      videoId?: string;
      playerVars?: { autoplay?: 0 | 1; controls?: 0 | 1; enablejsapi?: 0 | 1; fs?: 0 | 1; origin?: string; playsinline?: 0 | 1; rel?: 0 | 1; cc_load_policy?: 0 | 1 };
      events?: {
        onReady?: (event: PlayerEvent) => void;
        onStateChange?: (event: PlayerEvent) => void;
        onError?: (event: PlayerEvent) => void;
        onAutoplayBlocked?: (event: PlayerEvent) => void;
      };
    };
    class Player {
      constructor(element: string | HTMLElement, options: PlayerOptions);
      destroy(): void;
      pauseVideo(): void;
      playVideo(): void;
      getIframe(): HTMLIFrameElement;
    }
  }
  interface Window {
    YT?: typeof YT;
    onYouTubeIframeAPIReady?: (() => void) | null;
  }
}

export {};
