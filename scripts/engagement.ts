import { track } from '@vercel/analytics';
import { engagementFor } from '../src/lib/engagement';

if (import.meta.env.PROD && import.meta.env.PUBLIC_ANALYTICS_EVENTS_ENABLED === 'true') {
  document.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    const target=event.target.closest<HTMLElement>('a,button');
    if (!target) return;
    const engagement=engagementFor(target.getAttribute('href'),target.dataset.playPerformance??target.dataset.watchId);
    if (engagement) track(engagement.name,engagement.data);
  });
}
