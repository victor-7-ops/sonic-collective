import { mediaCoordinator } from '../src/lib/media-coordinator';

const carousel = document.querySelector<HTMLElement>('[data-spotlights]');
const slides = Array.from(carousel?.querySelectorAll<HTMLElement>('[data-spotlight]') ?? []);
const controls = carousel?.querySelector<HTMLElement>('[data-spotlight-controls]');
const pause = carousel?.querySelector<HTMLButtonElement>('[data-spotlight-pause]');
const position = carousel?.querySelector('[data-spotlight-position]');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');

if (carousel && controls && pause && position && slides.length > 1) {
  let index = 0;
  let paused = reduced.matches;
  let timer: number | undefined;

  function schedule(): void {
    window.clearTimeout(timer);
    if (paused || reduced.matches || document.hidden) return;
    timer = window.setTimeout(() => {
      if (!carousel?.contains(document.activeElement) && !mediaCoordinator.getActiveOwner()) show(index + 1);
      else schedule();
    }, 7000);
  }

  function show(next: number): void {
    if (mediaCoordinator.getActiveOwner()) return;
    slides[index].hidden = true;
    index = (next + slides.length) % slides.length;
    slides[index].hidden = false;
    position!.textContent = `${index + 1} / ${slides.length}`;
    schedule();
  }

  carousel.querySelector('[data-spotlight-next]')?.addEventListener('click', () => show(index + 1));
  carousel.querySelector('[data-spotlight-previous]')?.addEventListener('click', () => show(index - 1));
  pause.addEventListener('click', () => {
    paused = !paused;
    pause.textContent = paused ? 'Resume spotlights' : 'Pause spotlights';
    schedule();
  });
  reduced.addEventListener('change', () => {
    paused = reduced.matches;
    pause.textContent = paused ? 'Resume spotlights' : 'Pause spotlights';
    schedule();
  });
  document.addEventListener('visibilitychange', schedule);
  pause.textContent = paused ? 'Resume spotlights' : 'Pause spotlights';
  controls.hidden = false;
  schedule();
}
