# Sonic Collective

Astro site with static public pages and server-rendered editorial routes through the Vercel adapter.

## Local development

Requires Node.js 22.23.4 or newer. From this directory:

```sh
npm ci
npm run content:validate
npm test
npm run check
npm run build
npm run dev
```

On Windows, `scripts/use-runtime.ps1` can select the optional ignored `.local` Node 22.23.4 runtime; a clean checkout does not include it. See [CMS operations](docs/CMS-OPERATIONS.md) for environment setup, database safety, and recovery notes.

GitHub Actions runs the content validator, tests, Astro check, and production build sequentially on pull requests and pushes to `main`. It needs no secrets or database access.
