-- 내내(nae nae) 베타 — 이벤트 썸네일 저장소 (R-83, ADM-04). Supabase에서 한 번 실행.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('promotions', 'promotions', true, 2097152, array['image/jpeg', 'image/png'])
on conflict (id) do nothing;
create policy "promotions_read" on storage.objects for select to anon, authenticated using (bucket_id = 'promotions');
create policy "promotions_admin_write" on storage.objects for insert to authenticated with check (bucket_id = 'promotions' and public.is_admin());
create policy "promotions_admin_update" on storage.objects for update to authenticated using (bucket_id = 'promotions' and public.is_admin());
