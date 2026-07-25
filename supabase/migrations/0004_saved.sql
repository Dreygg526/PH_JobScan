-- Bookmarking: let a user flag any scored job as "saved" so it shows up
-- under the Saved jobs view, independent of which scan produced it.
-- RLS already covers updates (jobs owner update in 0002_rls.sql).

alter table public.jobs
  add column if not exists saved boolean not null default false;

create index if not exists jobs_saved_idx
  on public.jobs (user_id, saved) where saved;
