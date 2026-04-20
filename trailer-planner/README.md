# Trailer Load Planner

AI-powered semi trailer packing tool for live audio/touring equipment.

## Features
- Build a persistent equipment library (saved to Neon Postgres)
- AI-optimized layouts via Claude (rotation, weight distribution, overlap-free packing)
- Drag-and-drop manual placement
- Weight tracking with payload bar
- Save & load named layouts
- Printable load manifest

---

## Setup

### 1. Clone & install
```bash
git clone https://github.com/YOUR_USERNAME/trailer-planner.git
cd trailer-planner
npm install
```

### 2. Set up Neon database
1. Go to https://neon.tech and create a free project
2. Open the **SQL Editor** in the Neon dashboard
3. Paste and run the contents of `sql/schema.sql`
4. Copy your **Connection string** (looks like `postgresql://...`)

### 3. Get your Anthropic API key
1. Go to https://console.anthropic.com/settings/keys
2. Create a new key

### 4. Configure environment variables
```bash
cp .env.example .env.local
```
Edit `.env.local` and fill in:
```
DATABASE_URL=postgresql://your-neon-connection-string
ANTHROPIC_API_KEY=sk-ant-your-key-here
```

### 5. Run locally
```bash
npm run dev
```
Open http://localhost:3000

---

## Deploy to Vercel

### Option A: GitHub + Vercel (recommended)
1. Push this repo to GitHub
2. Go to https://vercel.com → New Project → Import your repo
3. In Vercel project settings → **Environment Variables**, add:
   - `DATABASE_URL` — your Neon connection string
   - `ANTHROPIC_API_KEY` — your Anthropic key
4. Deploy — Vercel auto-deploys on every push to `main`

### Option B: Vercel CLI
```bash
npm i -g vercel
vercel --prod
```
When prompted, add the environment variables.

---

## Project structure
```
pages/
  index.tsx          — main app UI
  api/
    optimize.ts      — AI layout endpoint (calls Anthropic)
    gear.ts          — gear library CRUD (reads/writes Neon)
    layouts.ts       — save/load layouts (reads/writes Neon)
lib/
  db.ts              — Neon connection
  types.ts           — shared TypeScript types
sql/
  schema.sql         — run once in Neon SQL editor
styles/
  globals.css        — global styles
```

---

## Notes
- The `ANTHROPIC_API_KEY` and `DATABASE_URL` are only used server-side (in `pages/api/`). They are never exposed to the browser.
- Gear added to the library is persisted to Neon so it survives page refreshes.
- Saved layouts store placements as JSONB in Postgres.
