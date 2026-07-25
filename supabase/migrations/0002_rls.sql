-- Row-Level Security: an account can only ever touch its own rows.
-- Accounts physically cannot read each other's CVs, scans, or jobs.

alter table public.cvs   enable row level security;
alter table public.scans enable row level security;
alter table public.jobs  enable row level security;

-- cvs
create policy "cvs owner read"   on public.cvs for select using (auth.uid() = user_id);
create policy "cvs owner insert" on public.cvs for insert with check (auth.uid() = user_id);
create policy "cvs owner update" on public.cvs for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "cvs owner delete" on public.cvs for delete using (auth.uid() = user_id);

-- scans
create policy "scans owner read"   on public.scans for select using (auth.uid() = user_id);
create policy "scans owner insert" on public.scans for insert with check (auth.uid() = user_id);
create policy "scans owner update" on public.scans for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "scans owner delete" on public.scans for delete using (auth.uid() = user_id);

-- jobs
create policy "jobs owner read"   on public.jobs for select using (auth.uid() = user_id);
create policy "jobs owner insert" on public.jobs for insert with check (auth.uid() = user_id);
create policy "jobs owner update" on public.jobs for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "jobs owner delete" on public.jobs for delete using (auth.uid() = user_id);
