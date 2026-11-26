-- 내내(nae nae) 베타 — 이벤트 썸네일 저장소 (R-83, ADM-04). Supabase에서 실행 (여러 번 실행해도 됨).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('promotions', 'promotions', true, 2097152, array['image/jpeg', 'image/png'])
on conflict (id) do nothing;
drop policy if exists "promotions_read" on storage.objects;
create policy "promotions_read" on storage.objects for select to anon, authenticated using (bucket_id = 'promotions');
drop policy if exists "promotions_admin_write" on storage.objects;
create policy "promotions_admin_write" on storage.objects for insert to authenticated with check (bucket_id = 'promotions' and public.is_admin());
drop policy if exists "promotions_admin_update" on storage.objects;
create policy "promotions_admin_update" on storage.objects for update to authenticated using (bucket_id = 'promotions' and public.is_admin());

-- 아티스트 프로필 사진 (R-133, 12_아티스트_기획). 이 아래만 따로 실행해도 됨
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('artist-photos', 'artist-photos', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
drop policy if exists "artist_photos_read" on storage.objects;
create policy "artist_photos_read" on storage.objects for select to anon, authenticated using (bucket_id = 'artist-photos');
drop policy if exists "artist_photos_admin_write" on storage.objects;
create policy "artist_photos_admin_write" on storage.objects for insert to authenticated with check (bucket_id = 'artist-photos' and public.is_admin());
drop policy if exists "artist_photos_admin_update" on storage.objects;
create policy "artist_photos_admin_update" on storage.objects for update to authenticated using (bucket_id = 'artist-photos' and public.is_admin());
