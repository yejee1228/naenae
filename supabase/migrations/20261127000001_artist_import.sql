-- 내내(nae nae) 베타 — 아티스트 한 번에 등록 (엑셀·CSV 업로드, 베타 전용 · R-141)
-- 줄마다 admin_artist_save와 같은 검사로 등록하고, 실패한 줄만 이유와 함께 돌려줌. 그룹을 먼저 넣어 개인의 '소속 그룹'을 이름으로 찾음
-- p_link = true: 등록한 아티스트의 이름·별칭이 공연명에서 뽑은 이름과 정확히 같고 동명이인이 없으면 공연·공지에 자동 연결 (R-125와 같은 규칙)
create or replace function public.admin_artists_import(p_rows jsonb, p_link boolean default true) returns jsonb
language plpgsql security definer set search_path = public as $$
declare rec record; k text; res jsonb := '[]'; card jsonb; created uuid[] := '{}'; gid uuid; note text; nm text; dis text; linked int := 0; cnt int;
begin
  if not public.is_admin() then perform public.fail('forbidden', '관리자 권한이 없어요.'); end if;
  if jsonb_typeof(p_rows) <> 'array' then perform public.fail('validation', '올린 내용을 읽지 못했어요.'); end if;
  if jsonb_array_length(p_rows) > 500 then perform public.fail('validation', '한 번에 500줄까지 올릴 수 있어요. 나눠서 올려 주세요.'); end if;
  foreach k in array array['group', 'solo'] loop
    for rec in select value v, ordinality o from jsonb_array_elements(p_rows) with ordinality loop
      continue when coalesce(nullif(rec.v->>'kind', ''), 'group') <> k;
      nm := trim(coalesce(rec.v->>'name', '')); dis := trim(coalesce(rec.v->>'disambig', '')); note := ''; gid := null;
      if exists (select 1 from public.artists a where a.name_key = public.name_key(nm) and a.disambig = dis) then
        res := res || jsonb_build_object('row', rec.o, 'name', nm, 'status', 'skipped', 'message', '이미 등록된 아티스트예요.');
        continue;
      end if;
      if k = 'solo' and coalesce(trim(rec.v->>'groupName'), '') <> '' then
        select a.id into gid from public.artists a
        where a.kind = 'group' and a.status = 'active' and (a.name_key = public.name_key(rec.v->>'groupName')
          or exists (select 1 from public.artist_aliases x where x.artist_id = a.id and x.alias_key = public.name_key(rec.v->>'groupName')))
        limit 1;
        if gid is null then note := '소속 그룹을 찾지 못해 연결하지 않았어요.'; end if;
      end if;
      begin
        card := public.admin_artist_save(jsonb_build_object('name', nm, 'kind', k, 'disambig', dis, 'instagram', coalesce(rec.v->>'instagram', ''),
          'aliases', coalesce(rec.v->'aliases', '[]'), 'groupIds', case when gid is null then '[]'::jsonb else jsonb_build_array(gid) end));
        created := created || (card->>'id')::uuid;
        res := res || jsonb_build_object('row', rec.o, 'name', nm, 'status', 'created', 'id', card->>'id', 'message', note);
      exception when others then
        res := res || jsonb_build_object('row', rec.o, 'name', nm, 'status', 'error', 'message', coalesce(nullif(split_part(sqlerrm, '|', 2), ''), sqlerrm));
      end;
    end loop;
  end loop;
  if p_link and cardinality(created) > 0 then
    insert into public.performance_artists (performance_id, artist_id, name, source)
    select p.id, m.aid, m.n, 'auto' from public.performances p, lateral (select n, public.artist_match(n) aid from unnest(p.artists) n) m
    where m.aid = any(created) on conflict do nothing;
    get diagnostics cnt = row_count; linked := linked + cnt;
    insert into public.opening_artists (opening_id, artist_id, name, source)
    select o.id, m.aid, m.n, 'auto' from public.openings o, lateral (select n, public.artist_match(n) aid from unnest(o.artists) n) m
    where m.aid = any(created) on conflict do nothing;
    get diagnostics cnt = row_count; linked := linked + cnt;
  end if;
  return jsonb_build_object('results', res, 'created', cardinality(created), 'linked', linked);
end $$;
grant execute on function public.admin_artists_import(jsonb, boolean) to authenticated;
