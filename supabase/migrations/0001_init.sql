-- JobScan schema: cvs, scans, jobs
-- Every table carries user_id so Row-Level Security can isolate accounts.

create extension if not exists "pgcrypto";

-- A user's uploaded résumé. parsed_text + derived skills come from Claude.
create table if not exists public.cvs (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  label         text not null,
  storage_path  text not null,           -- path in the private `cvs` bucket
  parsed_text   text,                     -- extracted résumé text
  target_role   text,                     -- derived headline, e.g. "Full-Stack Developer"
  seniority     text,                     -- junior | mid | senior | lead
  summary       text,                     -- 2-sentence profile
  skills        text[] default '{}',      -- derived skills used to build searches
  profile       jsonb not null default '{}'::jsonb, -- full ParsedCv (minus text)
  created_at    timestamptz not null default now()
);

-- One scan run against one CV.
create table if not exists public.scans (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  cv_id        uuid not null references public.cvs (id) on delete cascade,
  status       text not null default 'running'
                 check (status in ('running', 'done', 'failed')),
  keywords     text[] default '{}',       -- optional user wild-card keywords
  sources      text[] default '{}',       -- which boards were searched
  queries      text[] default '{}',       -- search queries Claude built
  progress     int not null default 0,    -- 0..100 for the UI
  step         text,                       -- human-readable current step
  stats        jsonb default '{}'::jsonb, -- {total, strong, good, bySource}
  created_at   timestamptz not null default now(),
  finished_at  timestamptz
);

-- One scored job listing belonging to a scan.
create table if not exists public.jobs (
  id           uuid primary key default gen_random_uuid(),
  scan_id      uuid not null references public.scans (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  source       text not null,
  title        text not null,
  company      text,
  location     text,
  url          text,
  description  text,
  score        int,                        -- 0..100 match vs the CV
  reasoning    text,                        -- why it matched
  cover_letter text,
  created_at   timestamptz not null default now()
);

create index if not exists cvs_user_idx     on public.cvs (user_id, created_at desc);
create index if not exists scans_user_idx   on public.scans (user_id, created_at desc);
create index if not exists scans_cv_idx     on public.scans (cv_id);
create index if not exists jobs_scan_idx    on public.jobs (scan_id, score desc);
create index if not exists jobs_user_idx    on public.jobs (user_id);

-- Stream job inserts / scan updates to the browser via Supabase Realtime.
alter publication supabase_realtime add table public.jobs;
alter publication supabase_realtime add table public.scans;
