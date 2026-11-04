import { defineConfig } from 'astro/config';

const site = process.env.SITE_URL;

export default defineConfig({
  ...(site ? { site } : {}),
  devToolbar: { enabled: false },
  output: 'static',
  trailingSlash: 'always',
  build: { format: 'directory' },
});
