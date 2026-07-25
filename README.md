# JobScan

Upload a CV → add optional keywords → **Scan** → JobScan scrapes Philippine job
boards (Indeed, Jobs.ph, OnlineJobs.ph), scores every listing against your résumé
with Claude, and streams ranked matches back. Keep a library of CVs and scan with
whichever one fits; rescan anytime.

Built with **Next.js (App Router) + TypeScript**, **Supabase** (auth / Postgres /
storage), **Firecrawl** (scraping) and the **Claude API** (parsing, scoring, cover
letters). Deploys to **Vercel + Supabase**.

## How it works
The scan is **client-orchestrated**: the browser calls one short API route per
stage (build queries → scrape each source → score in batches → finish), and each
stage writes to Supabase so jobs appear live and no single serverless request runs
long. Every table is **Row-Level-Security protected** (`user_id = auth.uid()`), so
accounts physically cannot read each other's data.

```
app/
  login/                sign in / sign up (email + Google)
  auth/callback         OAuth exchange   ·  auth/signout
  dashboard/            server page → <DashboardApp/>
  api/cv/upload         store file in private bucket + parse with Claude
  api/scan/start        build search queries, create the scan
  api/scan/scrape       scrape ONE source → insert raw jobs
  api/scan/score        score the next batch (loop until done)
  api/scan/finish       compute stats, mark done
components/             DashboardApp, JobCard, icons
lib/                    supabase clients, claude, firecrawl, sources, types
supabase/migrations/    schema + RLS + storage bucket
```

## Setup

### 1. Supabase
1. Create a project (Pro is fine) at supabase.com.
2. In the SQL editor, run every file in `supabase/migrations/` **in order**
   (`0001_init.sql`, `0002_rls.sql`, `0003_storage.sql`, `0004_saved.sql`,
   `0005_intent.sql`).
3. (Optional) **Auth → Providers → Google**: enable it and add the callback
   `https://YOUR-DOMAIN/auth/callback` (and `http://localhost:3000/auth/callback`
   for local dev). Email/password works without this.
4. **Project Settings → API**: copy the URL, the `anon` key, and the
   `service_role` key.

### 2. Environment
Copy `.env.example` to `.env.local` and fill in:
```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...      # server-only, never exposed to the browser
FIRECRAWL_API_KEY=fc-...
ANTHROPIC_API_KEY=sk-ant-...
```

### 3. Run
```
npm install
npm run dev        # http://localhost:3000
```
Sign up, upload a PDF/txt résumé, hit **Scan the internet**.

## Deploy (Vercel)
1. Push this folder to a Git repo and import it in Vercel.
2. Add the five env vars above in **Project → Settings → Environment Variables**.
3. Deploy. Add your Vercel domain's `/auth/callback` to Supabase's Google provider
   and to **Auth → URL Configuration → Redirect URLs**.

Scan API routes set a high `maxDuration`; on Vercel Pro (Fluid compute) this gives
each stage ample headroom.

## Notes / known limits
- **Firecrawl can't scrape LinkedIn/Reddit**, and Indeed/Jobs.ph/OnlineJobs.ph have
  their own defenses — some sources may return only search snippets. A failed
  source is skipped, never sinks the scan.
- Scoring costs Claude tokens; scraping costs Firecrawl credits. Raw jobs are cached
  per scan, so re-scoring wouldn't need a re-scrape.
- CV parsing accepts **PDF and plain text** today (PDF is sent to Claude directly).
  DOCX support can be added with `mammoth`.
