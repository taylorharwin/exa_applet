# Exa Event Finder (web)

Next.js app that finds upcoming events (book fairs, comic cons, conventions, library events, etc.) for a US state.

## Local development

```bash
cp .env.local.example .env.local
npm install
npm run dev
```

## Environment variables

- **EXA_API_KEY**: Exa API key.
- **DATABASE_URL**: Postgres connection string (Neon/Vercel Postgres, etc.).
  - Optional/preferred when available: **DATABASE_URL_UNPOOLED**

The app uses Postgres as **persistent storage** so it can display saved results on first load, and uses Exa Search to refresh and persist new results.

## Deploy (Vercel)

- Set Production env vars:
  - `EXA_API_KEY`
  - `DATABASE_URL` (or `DATABASE_URL_UNPOOLED` if you have it)
- Root directory: `web`
