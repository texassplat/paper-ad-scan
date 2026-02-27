# CLAUDE.md

## Project Overview

Paper Ad Scan - Multi-newspaper ad tracker. Scrapes e-papers via PageSuite API, uses Claude Vision to detect ads, stores results in Supabase, displays via Next.js frontend.

## Commands

### Backend
```bash
cd backend
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt

# List available editions
python main.py --paper ajc --list-dates

# Process a single date
python main.py --paper ajc --date 2026-02-27

# Process and upload to Supabase
python main.py --paper ajc --date 2026-02-27 --upload

# Analyze already-downloaded pages
python main.py --paper ajc --analyze output/ajc/2026-02-27

# Process all configured papers
python main.py --paper all --date 2026-02-27 --upload
```

### Frontend
```bash
cd frontend
npm install
npm run dev        # http://localhost:3000
npm run build      # Production build
```

## Architecture

```
backend/
├── papers.json      # Paper configs (GUIDs, credential prefixes)
├── scraper.py       # PageSuiteScraper (generic, config-driven)
├── analyzer.py      # Claude Vision ad detection
├── matcher.py       # Client name matching
├── db.py            # Supabase: insert records, upload images
├── main.py          # CLI orchestrator (--paper, --upload)
├── clients.txt      # Client names to track
└── requirements.txt

frontend/            # Next.js 15 + Tailwind + Supabase
├── app/
│   ├── page.tsx           # Dashboard: paper cards
│   ├── [paper]/page.tsx   # Paper: edition list
│   └── [paper]/[date]/    # Edition: page viewer + ads
├── components/
│   ├── AdCard.tsx
│   ├── AdTable.tsx
│   └── PageViewer.tsx
└── lib/
    ├── supabase.ts
    └── types.ts

supabase/
└── schema.sql       # Database schema (papers, editions, pages, ads)
```

## Configuration

- `backend/.env.local` — AJC/DMN credentials, ANTHROPIC_API_KEY, SUPABASE_URL/KEY
- `frontend/.env.local` — NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
- `backend/clients.txt` — Client names to search for

## Database

Supabase tables: papers, editions, pages, ads
Storage bucket: page-images (public, JPEGs at `{slug}/{date}/page_NNN.jpg`)
