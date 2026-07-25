-- Private bucket for CV files, foldered per user: cvs/<user_id>/<file>.
insert into storage.buckets (id, name, public)
values ('cvs', 'cvs', false)
on conflict (id) do nothing;

-- Users may only touch files under their own user_id folder.
create policy "cv files owner read"
  on storage.objects for select
  using (bucket_id = 'cvs' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "cv files owner insert"
  on storage.objects for insert
  with check (bucket_id = 'cvs' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "cv files owner delete"
  on storage.objects for delete
  using (bucket_id = 'cvs' and (storage.foldername(name))[1] = auth.uid()::text);
