# JobScan — Project Context

JobScan is a job-hunting web app. A user uploads a CV/résumé, optionally adds wild-card keywords, hits **Scan**, and the app scrapes Philippine job sources, scores every listing against the résumé, and streams ranked matches back. Users keep a **library of CVs** and choose which one to scan with; a scan can be re-run ("Rescan") or the CV left saved and selectable for later.

This is a ground-up rewrite of a previous Python/CLI pipeline. Same core idea, entirely new stack.

## Stack
- **Next.js (App Router) + TypeScript (.ts / .tsx)** — one app, both UI and backend (Route Handlers / Server Actions).
- **Supabase (Pro)** — Postgres, Auth, Storage, Realtime. Single source of truth for CVs, scans, and jobs.
- **Vercel** — hosts the whole app (not just a static dashboard).
- **Firecrawl** — scraping the job sources.
- **Anthropic Claude API** — CV parsing, search-query generation, job scoring, cover letters. (The old project used the free local `claude` CLI; on Vercel this must be the paid API.) Default to the latest capable Claude model.

## The core architectural decision: client-orchestrated, multi-step scan
Vercel serverless functions cannot hold one request open for a full multi-site scrape (minutes). Instead of a queue vendor, the **browser drives the pipeline** and **Supabase holds all state**, mirroring the old 4-step pipeline:

1. **Scan** creates a `scans` row (`status: running`).
2. The browser calls **one short API route per stage** — parse CV → build queries → scrape *each source* → score in batches → cover letters. Each call finishes well under the function timeout.
3. Every stage **writes partial results to Supabase**, so jobs appear in the UI **live** (Supabase Realtime) and a progress bar advances.
4. If the tab closes mid-scan, state persists — the scan shows as resumable.

**Why not a single long function:** even Vercel Fluid `maxDuration` is fragile for multi-minute scrapes; short per-stage calls are resilient and stream partial results for free.

## Auth & data isolation (hard requirement)
- **Supabase Auth** (email + Google). Every account is fully isolated.
- **Row-Level Security on every table**: `user_id = auth.uid()`. Accounts physically cannot read each other's CVs, scans, or jobs.
- Storage bucket for CVs is **private**, foldered per user (`cvs/<user_id>/...`).
- Never use the Supabase service-role key in any browser-reachable code. Server routes use the user's session; the service role is only for trusted server-only work.

## Data model (Supabase Postgres, all RLS-protected)
- **cvs** — `id, user_id, label, storage_path, parsed_text, target_role, seniority, summary, skills text[], profile jsonb, created_at`
- **scans** — `id, user_id, cv_id, status (running|done|failed), keywords text[] (legacy, unused), intent text, sources text[], queries text[], progress int, step, stats jsonb, created_at, finished_at`
- **jobs** — `id, scan_id, user_id, source, title, company, location, url, description, score int, reasoning, cover_letter, saved bool, created_at`

Migrations run in order: `0001_init` → `0002_rls` → `0003_storage` → `0004_saved` (jobs.saved) → `0005_intent` (scans.intent). The user runs each in the Supabase SQL editor by hand; **new columns need their migration applied before the feature works** (a missing column surfaces as a scan/save error, not a build error).

## Key flows
- **CV library:** every uploaded CV is a saved, selectable card. The user picks which CV a scan runs against. Unscanned CVs just sit in the library, ready.
- **Natural-language brief (`intent`):** the scan setup has a free-text box, not keyword chips — the user *describes* what they want in plain English or **Taglish** ("gusto ko remote night shift, open din ako sa VA work"). Claude reads it for intent and folds it into **both** query-building (`buildQueries`) and scoring (`scoreJobs`); a job matching the stated preferences scores higher. It's additive to the CV, never overrides it. The old keyword-chips UI and the `scans.keywords` column are retired (column kept for back-compat). Prompts explicitly handle Taglish.
- **Rescan vs keep:** after a scan the user either rescans the same CV or keeps it saved and closes. Nothing is deleted unless the user deletes it.

## Design system (locked)
- **Style:** Swiss / minimalist — right register for a data tool.
- **Color:** navy `#1E3A5F` primary, live-blue `#2563EB`, background `#F5F7FA` / dark `#0D1117`, ink `#0F1826`. **Match scores are semantic and separate from the accent:** green `#059669` (strong 80+), blue (good fit 70–79), amber `#B45309` (stretch). Full light + dark.
- **Type:** system sans for UI; a monospace utility face for scores/counts/source names (tabular, "scanner" feel).
- **Signature moment:** the live scan view (radar + per-source progress + streaming scored cards) is the hero; everything else stays quiet.
- Reference mockup lives in the design artifact (single-file clickable HTML). Match its layout and tokens when building real components.

## Constraints carried over (don't regress)
- **Inline the résumé and job data into Claude prompts** rather than telling the model to read files. Told to read a file, the old pipeline summarized the résumé and stalled asking for listings — 4 runs out of 4.
- **Score in batches**, and let one failed batch skip rather than sink the whole scan.
- **Scraping costs Firecrawl credits; scoring doesn't.** Cache raw scraped jobs; allow re-scoring without re-scraping.
- **Firecrawl cannot scrape LinkedIn or Reddit** ("Website Not Supported"). Indeed actively blocks scrapers and Jobs.ph / OnlineJobs.ph have their own defenses — expect some sources to degrade to bare search snippets. Handle partial/empty source results gracefully; never fail a whole scan because one source returned nothing.
- **Prompts must be tailored to THIS candidate's résumé** — derive target roles, skills, and scoring from the résumé; never assume a profession. Judge only what the résumé supports; don't invent experience.

## Environment variables
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — client + server
- `SUPABASE_SERVICE_ROLE_KEY` — server-only, never exposed to the browser
- `FIRECRAWL_API_KEY` — scraping
- `ANTHROPIC_API_KEY` — Claude API

## Planned structure
```
app/                 Next.js App Router — pages + route handlers
  (auth)/            sign-in, callback
  dashboard/         CV library, scan setup, live scan, results
  api/scan/*         per-stage scan routes (parse, queries, scrape, score)
components/          UI (built to the design system above)
lib/
  supabase/          server + browser clients
  firecrawl.ts       scraping wrapper
  claude.ts          Anthropic wrapper + prompt builders
  scoring.ts         batch scoring logic
supabase/
  migrations/        SQL: tables + RLS policies + storage bucket
```

## Testing
- Mock Claude and Firecrawl throughout — no test should hit the network or spend credits.
- Cover RLS isolation (a user cannot read another user's rows), the scan state machine, and batch scoring with a failing batch.

## Status
Full app scaffolded and building (`npm run build` passes, types clean). Auth
(email + **Google OAuth, now live**), CV upload+parse, the 4-stage scan pipeline,
live results, and rescan are all wired. The scan streams via **refetch after each
stage** (no Realtime config needed, though the tables are in the
`supabase_realtime` publication for later use). See `README.md` for setup. Before
the first end-to-end run the user must: create a Supabase project and run **all
migrations (0001–0005)**, then supply `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `FIRECRAWL_API_KEY`,
and `ANTHROPIC_API_KEY`.

**Google OAuth setup (done, for reference):** the Supabase project ref is
`iokspybvjcfsyljpagng`. Google Cloud OAuth client → Authorized redirect URI must
be Supabase's `https://<ref>.supabase.co/auth/v1/callback`; Supabase → Auth → URL
Configuration → Redirect URLs must include the app's own `.../auth/callback`
(`http://localhost:3000/auth/callback` for dev). Mixing up those two URLs is the
usual `redirect_uri_mismatch`.

**Recently shipped (built out from placeholders):**
- **Scan history** nav — lists past `scans` (CV, date, status, sources, brief
  snippet, match counts); click a row → `openScan` reloads its jobs + stats into
  the results view. No schema change.
- **Saved jobs** — bookmark toggle on every `JobCard` (`onToggleSave`, optimistic
  update + Supabase persist, RLS-scoped); Saved jobs nav lists `jobs where
  saved=true` across all scans. Needs `0004_saved`.
- **Natural-language brief** replacing keyword chips (see Key flows). Needs
  `0005_intent`.
- **Freshness filter** — scans only keep listings ≤ `MAX_AGE_DAYS` (5, in
  `lib/types.ts`). Two layers in `lib/sources.ts`: (1) the Firecrawl search is
  constrained to Google's past-week window (`tbs: "qdr:w"` — a week is the
  tightest standard `qdr`, so the search itself can't go below 7 days); (2)
  `parseAgeDays` reads relative-age phrases from the snippet/title ("3 days ago",
  "Posted today", "30+ days ago") and drops anything older than the cutoff.
  **Boards return no structured post date** — only these text hints — so
  *undated* results are KEPT (the week search already bounds them); only listings
  that state an age > 5 days are dropped. Change the one constant to retune; the
  scan-setup footer text follows it. No migration.

Deferred/simplifications to revisit: DOCX parsing (PDF+txt only for now); **CV
delete still not wired**; cover-letter generation not yet driven by the brief;
mobile rail hides the history/saved nav items (`.rail > .nav-item:not(:first-of-type)`).
