# The Homestead Plan

Urban Root's flagship soil-growing calculator and AI-driven planning tool for homesteaders. **Live at https://thehomesteadplan.com — $39.99 one-time.**

## Spec

- **Living spec:** `../CLAUDE.md` (auto-loaded; product behaviour, calc logic, design system)
- **Status / dashboard TODOs:** `../STATUS.md`
- **Design system:** `.claude/skills/premium-ui/`

## Development

```
npm install
npm run dev      # vite dev server at http://localhost:5173/
npm run build    # production build
```

## Deploy

Auto-deployed by Vercel on push to `main`. Commit author must be `urbanroot.contact@gmail.com` (Vercel Hobby restriction).

## Required Vercel env vars

- `ANTHROPIC_API_KEY` — Claude Sonnet 4.6 (mark as Sensitive)
- `LEMONSQUEEZY_STORE_ID=348457`
- `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` (or `KV_REST_API_URL` + `KV_REST_API_TOKEN` — Vercel Marketplace integration injects either)

## Repo layout

- `src/App.jsx` — single ~7.4 KLOC file, all components inline
- `src/data/{crops,companions}.js` — 82 crops, 230 pairings
- `api/{generate,validate-key}.js` — serverless functions (Anthropic proxy + LS licence)
- `public/` — favicon, og-image, sitemap, robots, 4 legal HTML pages
- `docs/` — current audit references (round-6 convergence cert, Phase-2 security audit, 2025-2026 threat research)
