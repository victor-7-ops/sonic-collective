import { defineConfig } from 'astro/config';

const site = process.env.SITE_URL || (process.env.VERCEL_ENV === 'production' ? 'https://sonic-collective.vercel.app' : undefined);
if (site) process.env.SITE_URL = site;

export default defineConfig({
  ...(site ? { site } : {}),
  devToolbar: { enabled: false },
  output: 'static',
  trailingSlash: 'always',
  build: { format: 'directory' },
});
