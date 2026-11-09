import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';

const site = process.env.SITE_URL || (process.env.VERCEL_ENV === 'production' ? 'https://sonic-collective.vercel.app' : undefined);
if (site) process.env.SITE_URL = site;

export default defineConfig({
  ...(site ? { site } : {}),
  devToolbar: { enabled: false },
  output: 'static',
  adapter: vercel(),
  trailingSlash: 'always',
  build: { format: 'directory' },
});
