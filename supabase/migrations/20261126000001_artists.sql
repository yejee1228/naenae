-- 내내(nae nae) 베타 — 아티스트 DB (12_아티스트_기획 · R-120~R-140)
-- 관심 아티스트를 이름 글자 대신 아티스트 ID로. 운영자가 검증한 아티스트만 등록하고 후보 검수·제보로 쌓아 감.

-- 1. 표 ------------------------------------------------------------------
create table public.artists (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 40),
  name_key text generated always as (public.name_key(name)) stored,
  kind text not null default 'group' check (kind in ('group', 'solo')),
  disambig text not null default '' check (char_length(disambig) <= 40),           -- 구분 문구 (R-122·136)
  photo_url text not null default '' check (photo_url = '' or photo_url ~ '^https://'),
  photo_credit text not null default '' check (char_length(photo_credit) <= 100),  -- 사진 출처·허락 (R-133)
  instagram text not null default '' check (instagram = '' or instagram ~ '^[A-Za-z0-9._]{1,30}$'),   -- 아이디만 (R-132)
  status text not null default 'active' check (status in ('active', 'hidden')),   -- 지우지 않고 숨김 (R-134)
  source text not null default 'manual' check (source in ('kopis', 'report', 'manual')),
  report_id uuid references public.reports(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (name_key, disambig)
);
create index artists_name_key on public.artists (name_key);
create trigger t_artists before update on public.artists for each row execute function public.touch_updated_at();

create table public.artist_aliases (                                               -- 다른 표기 (R-123·138)
  id bigint generated always as identity primary key,
  artist_id uuid not null references public.artists(id) on delete cascade,
  alias text not null check (char_length(trim(alias)) between 1 and 40),
  alias_key text generated always as (public.name_key(alias)) stored,
  unique (artist_id, alias_key)
);
create index artist_aliases_key on public.artist_aliases (alias_key);

create table public.artist_members (                                               -- 그룹 ↔ 멤버 (R-121)
  group_id uuid not null references public.artists(id) on delete cascade,
  member_id uuid not null references public.artists(id) on delete cascade,
  primary key (group_id, member_id),
  check (group_id <> member_id)
);
create index artist_members_member on public.artist_members (member_id);

create table public.performance_artists (                                          -- 공연 ↔ 아티스트 (R-125·137·139)
  performance_id uuid not null references public.performances(id) on delete cascade,
  artist_id uuid not null references public.artists(id) on delete cascade,
  name text not null default '',                                                   -- 공연에 적힌 표기
  source text not null default 'auto' check (source in ('auto', 'admin')),
  created_at timestamptz not null default now(),
  primary key (performance_id, artist_id)
);
create index performance_artists_artist on public.performance_artists (artist_id);

create table public.opening_artists (
  opening_id uuid not null references public.openings(id) on delete cascade,
  artist_id uuid not null references public.artists(id) on delete cascade,
  name text not null default '',
  source text not null default 'auto' check (source in ('auto', 'admin')),
  created_at timestamptz not null default now(),
  primary key (opening_id, artist_id)
);
create index opening_artists_artist on public.opening_artists (artist_id);

create table public.artist_candidates (                                            -- 후보에서 '제외'한 이름 (R-124)
  name_key text primary key,
  name text not null,
  status text not null default 'ignored' check (status in ('ignored')),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

-- 2. 관심 아티스트 · 제보 변경 -------------------------------------------
alter table public.interests add column artist_id uuid references public.artists(id) on delete cascade;
alter table public.interests drop constraint if exists interests_user_id_name_key_key;
create unique index interests_name_once on public.interests (user_id, name_key) where artist_id is null;
create unique index interests_artist_once on public.interests (user_id, artist_id) where artist_id is not null;
alter table public.interests drop constraint if exists interests_source_check;
alter table public.interests add constraint interests_source_check check (source in ('perf', 'manual', 'opening', 'search', 'report'));

alter table public.reports drop constraint if exists reports_kind_check;
alter table public.reports add constraint reports_kind_check check (kind in ('opening', 'performance', 'artist'));
alter table public.reports add column artist_kind text check (artist_kind in ('group', 'solo'));
alter table public.reports add column artist_group jsonb;                          -- {"id": …} 또는 {"name": …}
alter table public.reports add column artist_members jsonb not null default '[]';  -- [{"id": …} | {"name": …}]
alter table public.reports add column registered_artist_id uuid references public.artists(id) on delete set null;
alter table public.reports add constraint reports_artist_link check (kind <> 'artist' or source_url <> '');   -- R-131

alter table public.admin_audit_logs drop constraint if exists admin_audit_logs_action_check;
alter table public.admin_audit_logs add constraint admin_audit_logs_action_check
  check (action in ('create', 'update', 'hide', 'publish', 'status_change', 'view_pii', 'kopis_resync', 'merge', 'link_artists'));

-- 3. 권한 (RLS) ------------------------------------------------------------
grant select on public.artists, public.artist_aliases, public.artist_members, public.performance_artists, public.opening_artists to anon, authenticated;
grant select, insert, update, delete on public.artists, public.artist_aliases, public.artist_members, public.performance_artists, public.opening_artists, public.artist_candidates to service_role;
alter table public.artists enable row level security;
alter table public.artist_aliases enable row level security;
alter table public.artist_members enable row level security;
alter table public.performance_artists enable row level security;
alter table public.opening_artists enable row level security;
alter table public.artist_candidates enable row level security;
create policy artists_read on public.artists for select to anon, authenticated using (status = 'active' or public.is_admin());
create policy artist_aliases_read on public.artist_aliases for select to anon, authenticated using (true);
create policy artist_members_read on public.artist_members for select to anon, authenticated using (true);
create policy performance_artists_read on public.performance_artists for select to anon, authenticated using (true);
create policy opening_artists_read on public.opening_artists for select to anon, authenticated using (true);
-- 쓰기는 아래 운영자 함수로만 (표에 직접 쓰는 권한 없음)

-- 4. 이름 → 아티스트 (이름·별칭이 활성 아티스트 1명과만 맞을 때) ----------------
create or replace function public.artist_match(p_name text) returns uuid
language sql stable security definer set search_path = public as $$
  select case when count(*) = 1 then min(id::text)::uuid end from (
    select a.id from public.artists a where a.status = 'active' and a.name_key = public.name_key(p_name) and public.name_key(p_name) <> ''
    union
    select a.id from public.artist_aliases x join public.artists a on a.id = x.artist_id where a.status = 'active' and x.alias_key = public.name_key(p_name) and public.name_key(p_name) <> ''
  ) t
$$;

-- 새 공연·공지의 아티스트 이름을 자동 연결 (R-125). 운영자 연결(admin)은 건드리지 않음
create or replace function public.auto_link_artists() returns trigger
language plpgsql security definer set search_path = public as $$
declare n text; aid uuid;
begin
  if tg_table_name = 'performances' then
    delete from public.performance_artists where performance_id = new.id and source = 'auto';
    foreach n in array coalesce(new.artists, '{}') loop
      aid := public.artist_match(n);
      if aid is not null then insert into public.performance_artists (performance_id, artist_id, name, source) values (new.id, aid, n, 'auto') on conflict do nothing; end if;
    end loop;
  else
    delete from public.opening_artists where opening_id = new.id and source = 'auto';
    foreach n in array coalesce(new.artists, '{}') loop
      aid := public.artist_match(n);
      if aid is not null then insert into public.opening_artists (opening_id, artist_id, name, source) values (new.id, aid, n, 'auto') on conflict do nothing; end if;
    end loop;
  end if;
  return new;
end $$;
create trigger t_perf_links_ins after insert on public.performances for each row execute function public.auto_link_artists();
create trigger t_perf_links_upd after update of artists on public.performances for each row when (old.artists is distinct from new.artists) execute function public.auto_link_artists();
create trigger t_open_links_ins after insert on public.openings for each row execute function public.auto_link_artists();
create trigger t_open_links_upd after update of artists on public.openings for each row when (old.artists is distinct from new.artists) execute function public.auto_link_artists();

-- 이름으로 담아 둔 관심 아티스트를 등록된 아티스트에 연결 (R-135)
create or replace function public.link_interests(p_artist uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  with c as (
    select distinct on (i.user_id) i.id from public.interests i
    where i.artist_id is null and public.artist_match(i.name) = p_artist
      and not exists (select 1 from public.interests j where j.user_id = i.user_id and j.artist_id = p_artist)
    order by i.user_id, i.created_at
  )
  update public.interests i set artist_id = p_artist, name = a.name from public.artists a where a.id = p_artist and i.id in (select id from c);
  delete from public.interests i where i.artist_id is null and public.artist_match(i.name) = p_artist
    and exists (select 1 from public.interests j where j.user_id = i.user_id and j.artist_id = p_artist);
end $$;

-- 5. 아티스트 카드 (R-128): 소속 그룹·멤버·다음/최근 공연까지 한 번에 ---------------
create or replace function public.artist_card(p_id uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', a.id, 'name', a.name, 'kind', a.kind, 'disambig', a.disambig, 'photoUrl', a.photo_url, 'photoCredit', a.photo_credit,
    'instagram', a.instagram, 'status', a.status, 'source', a.source, 'updatedAt', a.updated_at,
    'aliases', coalesce((select jsonb_agg(x.alias order by x.alias) from public.artist_aliases x where x.artist_id = a.id), '[]'),
    'groups', coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name) order by g.name) from public.artist_members m join public.artists g on g.id = m.group_id where m.member_id = a.id and g.status = 'active'), '[]'),
    'members', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name) order by s.name) from public.artist_members m join public.artists s on s.id = m.member_id where m.group_id = a.id and s.status = 'active'), '[]'),
    'next', (select jsonb_build_object('id', p.id, 'title', p.title, 'date', p.start_date, 'endDate', p.end_date, 'venue', p.venue)
             from public.performance_artists l join public.performances p on p.id = l.performance_id
             where l.artist_id = a.id and not p.is_hidden and p.end_date >= (now() at time zone 'Asia/Seoul')::date order by p.start_date limit 1),
    'last', (select jsonb_build_object('id', p.id, 'title', p.title, 'date', p.start_date, 'endDate', p.end_date, 'venue', p.venue)
             from public.performance_artists l join public.performances p on p.id = l.performance_id
             where l.artist_id = a.id and not p.is_hidden and p.end_date < (now() at time zone 'Asia/Seoul')::date order by p.end_date desc limit 1),
    'perfCount', (select count(*) from public.performance_artists l where l.artist_id = a.id))
  from public.artists a where a.id = p_id and (a.status = 'active' or public.is_admin())
$$;

-- 아티스트 검색 (R-126): 이름·별칭 부분 일치. 정확히 같음 → 앞부분 → 부분, 같으면 다음 공연이 있는 쪽 먼저
create or replace function public.search_artists(p_q text, p_lim int default 20) returns jsonb
language sql stable security definer set search_path = public as $$
  with k as (select public.name_key(p_q) k),
  hit as (
    select a.id, a.name, min(case when a.name_key = k.k or x.alias_key = k.k then 0
                                  when strpos(a.name_key, k.k) = 1 or strpos(coalesce(x.alias_key, ''), k.k) = 1 then 1 else 2 end) r
    from public.artists a left join public.artist_aliases x on x.artist_id = a.id, k
    where a.status = 'active' and k.k <> '' and (strpos(a.name_key, k.k) > 0 or strpos(coalesce(x.alias_key, ''), k.k) > 0)
    group by a.id, a.name
  ),
  ranked as (
    select h.id, h.r, h.name, exists (select 1 from public.performance_artists l join public.performances p on p.id = l.performance_id
                                       where l.artist_id = h.id and not p.is_hidden and p.end_date >= (now() at time zone 'Asia/Seoul')::date) has_next
    from hit h order by h.r, has_next desc, h.name limit least(greatest(coalesce(p_lim, 20), 1), 50)
  )
  select coalesce(jsonb_agg(public.artist_card(id) order by r, has_next desc, name), '[]') from ranked
$$;

create or replace function public.artist_cards(p_ids uuid[]) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(c), '[]') from (select public.artist_card(x) c from unnest(p_ids) x) t where c is not null
$$;

-- 6. 운영자 함수 -------------------------------------------------------------
create or replace function public.admin_artists(p_q text default '', p_status text default 'active') returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare k text := public.name_key(p_q); res jsonb;
begin
  if not public.is_admin() then perform public.fail('forbidden', '관리자 권한이 없어요.'); end if;
  select coalesce(jsonb_agg(public.artist_card(a.id) order by a.name), '[]') into res from public.artists a
  where (p_status = 'all' or a.status = p_status)
    and (k = '' or strpos(a.name_key, k) > 0 or exists (select 1 from public.artist_aliases x where x.artist_id = a.id and strpos(x.alias_key, k) > 0));
  return res;
end $$;

-- 등록·수정 (R-120~123·133·137): 별칭·멤버·소속 그룹·연결할 공연까지 한 번에
create or replace function public.admin_artist_save(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare a public.artists; v_id uuid := nullif(p->>'id', '')::uuid; nm text := trim(coalesce(p->>'name', ''));
        dis text := trim(coalesce(p->>'disambig', '')); knd text := coalesce(nullif(p->>'kind', ''), 'group');
        ig text := trim(coalesce(p->>'instagram', ''));
begin
  if not public.is_admin() then perform public.fail('forbidden', '관리자 권한이 없어요.'); end if;
  if char_length(nm) not between 1 and 40 then perform public.fail('validation', '아티스트 이름을 1~40자로 입력해 주세요.'); end if;
  if knd not in ('group', 'solo') then perform public.fail('validation', '그룹인지 개인인지 골라 주세요.'); end if;
  if ig <> '' and ig !~ '^[A-Za-z0-9._]{1,30}$' then perform public.fail('validation', '인스타그램은 계정 아이디만 넣어 주세요 (영문·숫자·.·_).'); end if;
  if coalesce(p->>'photoUrl', '') <> '' and p->>'photoUrl' !~ '^https://' then perform public.fail('validation', '사진 주소가 올바르지 않아요.'); end if;
  if exists (select 1 from public.artists x where x.name_key = public.name_key(nm) and x.disambig = dis and x.id is distinct from v_id) then
    perform public.fail('conflict', '같은 이름과 구분 문구의 아티스트가 이미 있어요.');
  end if;
  if dis = '' and exists (select 1 from public.artists x where x.name_key = public.name_key(nm) and x.id is distinct from v_id) then
    perform public.fail('validation', '같은 이름의 아티스트가 있어요. 구분 문구를 적어 주세요 (예: 밴드 · 부산).');   -- R-122
  end if;
  if v_id is null then
    insert into public.artists (name, kind, disambig, photo_url, photo_credit, instagram, status, source, report_id, created_by, updated_by)
    values (nm, knd, dis, coalesce(p->>'photoUrl', ''), left(coalesce(p->>'photoCredit', ''), 100), ig, coalesce(nullif(p->>'status', ''), 'active'),
            coalesce(nullif(p->>'source', ''), 'manual'), nullif(p->>'reportId', '')::uuid, auth.uid(), auth.uid())
    returning * into a;
  else
    update public.artists set name = nm, kind = knd, disambig = dis, photo_url = coalesce(p->>'photoUrl', photo_url), photo_credit = left(coalesce(p->>'photoCredit', photo_credit), 100),
           instagram = ig, status = coalesce(nullif(p->>'status', ''), status), updated_by = auth.uid()
    where id = v_id returning * into a;
    if not found then perform public.fail('not_found', '아티스트를 찾지 못했어요.'); end if;
  end if;
  if p ? 'aliases' then
    delete from public.artist_aliases where artist_id = a.id;
    insert into public.artist_aliases (artist_id, alias)
    select a.id, trim(x) from jsonb_array_elements_text(p->'aliases') x where trim(x) <> '' and public.name_key(x) <> a.name_key on conflict do nothing;
  end if;
  if a.kind = 'group' then
    delete from public.artist_members where member_id = a.id;
    if p ? 'memberIds' then
      delete from public.artist_members where group_id = a.id;
      insert into public.artist_members (group_id, member_id) select a.id, s.id from public.artists s
      where s.id::text in (select jsonb_array_elements_text(p->'memberIds')) and s.id <> a.id and s.kind = 'solo' on conflict do nothing;
    end if;
  else
    delete from public.artist_members where group_id = a.id;
    if p ? 'groupIds' then
      delete from public.artist_members where member_id = a.id;
      insert into public.artist_members (group_id, member_id) select g.id, a.id from public.artists g
      where g.id::text in (select jsonb_array_elements_text(p->'groupIds')) and g.id <> a.id and g.kind = 'group' on conflict do nothing;
    end if;
  end if;
  insert into public.performance_artists (performance_id, artist_id, name, source)
  select pf.id, a.id, a.name, 'admin' from public.performances pf where pf.id::text in (select jsonb_array_elements_text(coalesce(p->'linkPerfIds', '[]')))
  on conflict (performance_id, artist_id) do update set source = 'admin';
  insert into public.opening_artists (opening_id, artist_id, name, source)
  select o.id, a.id, a.name, 'admin' from public.openings o where o.id::text in (select jsonb_array_elements_text(coalesce(p->'linkOpeningIds', '[]')))
  on conflict (opening_id, artist_id) do update set source = 'admin';
  perform public.link_interests(a.id);
  insert into public.admin_audit_logs (actor_id, action, target_table, target_id, changes)
  values (auth.uid(), case when v_id is null then 'create' else 'update' end, 'artists', a.id::text, p);
  return public.artist_card(a.id);
end $$;

-- 합치기 (R-138): 후보 이름을 기존 아티스트의 다른 표기로 + 체크한 공연 연결
create or replace function public.admin_artist_merge(p_alias text, p_into uuid, p_perf_ids uuid[] default '{}', p_opening_ids uuid[] default '{}') returns jsonb
language plpgsql security definer set search_path = public as $$
declare a public.artists;
begin
  if not public.is_admin() then perform public.fail('forbidden', '관리자 권한이 없어요.'); end if;
  select * into a from public.artists where id = p_into;
  if not found then perform public.fail('not_found', '아티스트를 찾지 못했어요.'); end if;
  if char_length(trim(coalesce(p_alias, ''))) not between 1 and 40 then perform public.fail('validation', '합칠 이름을 확인해 주세요.'); end if;
  if public.name_key(p_alias) <> a.name_key then
    insert into public.artist_aliases (artist_id, alias) values (a.id, trim(p_alias)) on conflict do nothing;
  end if;
  insert into public.performance_artists (performance_id, artist_id, name, source)
  select pf.id, a.id, trim(p_alias), 'admin' from public.performances pf where pf.id = any(coalesce(p_perf_ids, '{}'))
  on conflict (performance_id, artist_id) do update set source = 'admin';
  insert into public.opening_artists (opening_id, artist_id, name, source)
  select o.id, a.id, trim(p_alias), 'admin' from public.openings o where o.id = any(coalesce(p_opening_ids, '{}'))
  on conflict (opening_id, artist_id) do update set source = 'admin';
  perform public.link_interests(a.id);
  insert into public.admin_audit_logs (actor_id, action, target_table, target_id, changes)
  values (auth.uid(), 'merge', 'artists', a.id::text, jsonb_build_object('alias', p_alias, 'perfs', p_perf_ids, 'openings', p_opening_ids));
  return public.artist_card(a.id);
end $$;

create or replace function public.admin_artist_hide(p_id uuid, p_hidden boolean default true) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then perform public.fail('forbidden', '관리자 권한이 없어요.'); end if;
  update public.artists set status = case when p_hidden then 'hidden' else 'active' end, updated_by = auth.uid() where id = p_id;
  if not found then perform public.fail('not_found', '아티스트를 찾지 못했어요.'); end if;
  insert into public.admin_audit_logs (actor_id, action, target_table, target_id) values (auth.uid(), 'hide', 'artists', p_id::text);
  return public.artist_card(p_id);
end $$;

-- 후보 (R-124): 공연명에서 뽑은 이름 중 아직 아티스트·별칭이 아닌 것
create or replace function public.admin_candidates(p_q text default '', p_status text default 'pending') returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare k text := public.name_key(p_q); res jsonb;
begin
  if not public.is_admin() then perform public.fail('forbidden', '관리자 권한이 없어요.'); end if;
  with names as (
    select public.name_key(n) nk, n, p.id, p.title, p.start_date from public.performances p, unnest(p.artists) n where not p.is_hidden
  ), agg as (
    select nk, (array_agg(n order by start_date desc))[1] nm, count(distinct id)::int cnt, (array_agg(title order by start_date desc))[1] sample, max(start_date) last_date
    from names where nk <> '' group by nk
  )
  select coalesce(jsonb_agg(jsonb_build_object('nameKey', g.nk, 'name', g.nm, 'perfCount', g.cnt, 'sample', g.sample, 'lastDate', g.last_date,
    'similar', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'name', a.name, 'disambig', a.disambig)) from public.artists a
                         where a.status = 'active' and char_length(g.nk) >= 2 and char_length(a.name_key) >= 2 and (strpos(a.name_key, g.nk) > 0 or strpos(g.nk, a.name_key) > 0)), '[]'))
    order by g.cnt desc, g.nm), '[]') into res
  from (select * from agg
        where not exists (select 1 from public.artists a where a.name_key = agg.nk)
          and not exists (select 1 from public.artist_aliases x where x.alias_key = agg.nk)
          and (exists (select 1 from public.artist_candidates c where c.name_key = agg.nk)) = (p_status = 'ignored')
          and (k = '' or strpos(agg.nk, k) > 0)
        order by cnt desc, nm limit 500) g;
  return res;
end $$;

create or replace function public.admin_candidate_ignore(p_name text, p_ignore boolean default true) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then perform public.fail('forbidden', '관리자 권한이 없어요.'); end if;
  if p_ignore then
    insert into public.artist_candidates (name_key, name, updated_by) values (public.name_key(p_name), trim(p_name), auth.uid())
    on conflict (name_key) do update set updated_by = auth.uid(), updated_at = now();
  else delete from public.artist_candidates where name_key = public.name_key(p_name); end if;
end $$;

-- 공연·공지 수정의 아티스트 박스 저장 (R-139): [{name, artistId}] → 그대로 연결
create or replace function public.admin_links_save(p_kind text, p_id uuid, p_links jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then perform public.fail('forbidden', '관리자 권한이 없어요.'); end if;
  if p_kind = 'performance' then
    delete from public.performance_artists where performance_id = p_id;
    insert into public.performance_artists (performance_id, artist_id, name, source)
    select p_id, (l->>'artistId')::uuid, coalesce(l->>'name', ''), 'admin' from jsonb_array_elements(coalesce(p_links, '[]')) l
    where coalesce(l->>'artistId', '') <> '' and exists (select 1 from public.artists a where a.id = (l->>'artistId')::uuid) on conflict do nothing;
  elsif p_kind = 'opening' then
    delete from public.opening_artists where opening_id = p_id;
    insert into public.opening_artists (opening_id, artist_id, name, source)
    select p_id, (l->>'artistId')::uuid, coalesce(l->>'name', ''), 'admin' from jsonb_array_elements(coalesce(p_links, '[]')) l
    where coalesce(l->>'artistId', '') <> '' and exists (select 1 from public.artists a where a.id = (l->>'artistId')::uuid) on conflict do nothing;
  else perform public.fail('validation', '연결 종류가 올바르지 않아요.'); end if;
  insert into public.admin_audit_logs (actor_id, action, target_table, target_id, changes) values (auth.uid(), 'link_artists', p_kind, p_id::text, p_links);
end $$;

-- 7. 제보: 아티스트 제보 추가 (R-131) --------------------------------------
create or replace function public.create_report(p jsonb) returns public.reports
language plpgsql security definer set search_path = public as $$
declare r public.reports; k text := coalesce(nullif(p->>'kind', ''), 'opening');
begin
  if auth.uid() is null then perform public.fail('unauthorized', '제보하려면 로그인해 주세요.'); end if;
  if (select count(*) from public.reports where user_id = auth.uid() and created_at > now() - interval '1 hour') >= 10 then
    perform public.fail('rate_limited', '잠시 후 다시 시도해 주세요.');                                   -- R-77
  end if;
  if coalesce(trim(p->>'title'), '') = '' then perform public.fail('validation', case when k = 'artist' then '아티스트 이름을 입력해 주세요.' else '공연명을 입력해 주세요.' end); end if;
  if k = 'artist' and coalesce(trim(p->>'sourceUrl'), '') !~ '^https?://' then perform public.fail('validation', '인스타그램 또는 참고 링크를 https:// 주소로 알려 주세요.'); end if;
  insert into public.reports (user_id, kind, title, artists, venue, show_date, open_at_text, ticket_url, source_url, note, artist_kind, artist_group, artist_members)
  values (auth.uid(), k, trim(p->>'title'),
          coalesce(array(select jsonb_array_elements_text(p->'artists')), '{}'), coalesce(p->>'venue', ''),
          nullif(p->>'showDate', '')::date, coalesce(p->>'openAtText', ''), coalesce(p->>'ticketUrl', ''),
          coalesce(trim(p->>'sourceUrl'), ''), coalesce(p->>'note', ''),
          case when k = 'artist' then coalesce(nullif(p->>'artistKind', ''), 'group') end,
          case when k = 'artist' and jsonb_typeof(p->'artistGroup') = 'object' then p->'artistGroup' end,
          case when k = 'artist' and jsonb_typeof(p->'artistMembers') = 'array' then (select coalesce(jsonb_agg(m), '[]') from (select m from jsonb_array_elements(p->'artistMembers') m limit 20) t) else '[]' end)
  returning * into r;
  insert into public.report_status_logs (report_id, from_status, to_status, actor_id) values (r.id, null, 'submitted', auth.uid());
  return r;
exception when check_violation then
  perform public.fail('validation', '공연 날짜, 오픈 일시, 링크 중 하나는 알려 주세요. 링크는 https:// 로 시작해야 합니다.');
end $$;

create or replace function public.admin_register_report(p_id uuid, p_as text, p_data jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r public.reports; new_id uuid; card jsonb;
begin
  if not public.is_admin() then perform public.fail('forbidden', '관리자 권한이 없어요.'); end if;
  select * into r from public.reports where id = p_id for update;
  if not found or r.status not in ('submitted', 'reviewing') then perform public.fail('conflict', '이미 처리된 제보예요.'); end if;
  if p_as = 'opening' then
    insert into public.openings (title, artists, venue, show_date, open_at, open_has_time, vendor, ticket_url, note, performance_id, is_published, source, report_id, created_by, updated_by)
    values (p_data->>'title', coalesce(array(select jsonb_array_elements_text(p_data->'artists')), '{}'), coalesce(p_data->>'venue', ''),
            nullif(p_data->>'showDate', '')::date, nullif(p_data->>'openAt', '')::timestamptz, coalesce((p_data->>'openHasTime')::boolean, true),
            coalesce(p_data->>'vendor', ''), coalesce(p_data->>'ticketUrl', ''), coalesce(p_data->>'note', ''),
            nullif(p_data->>'performanceId', '')::uuid, coalesce((p_data->>'isPublished')::boolean, true), 'report', p_id, auth.uid(), auth.uid())
    returning id into new_id;
    update public.reports set registered_opening_id = new_id where id = p_id;
  elsif p_as = 'performance' then
    insert into public.performances (source, title, start_date, end_date, venue, region, artists, artists_locked, ticket_links, created_by, updated_by)
    values ('manual', p_data->>'title', (p_data->>'startDate')::date, coalesce(nullif(p_data->>'endDate', ''), p_data->>'startDate')::date,
            coalesce(p_data->>'venue', ''), coalesce(p_data->>'region', ''), coalesce(array(select jsonb_array_elements_text(p_data->'artists')), '{}'), true,
            coalesce(p_data->'ticketLinks', '[]'), auth.uid(), auth.uid())
    returning id into new_id;
    update public.reports set registered_performance_id = new_id where id = p_id;
  elsif p_as = 'artist' then
    card := public.admin_artist_save(p_data || jsonb_build_object('source', 'report', 'reportId', p_id));
    new_id := (card->>'id')::uuid;
    update public.reports set registered_artist_id = new_id where id = p_id;
  else perform public.fail('validation', '등록 종류가 올바르지 않아요.'); end if;
  r := public.report_transition(p_id, 'registered');
  return jsonb_build_object('report', to_jsonb(r), 'createdId', new_id);
end $$;

-- 8. 실행 권한 -----------------------------------------------------------------
revoke execute on function public.link_interests(uuid), public.auto_link_artists() from public, anon, authenticated;
grant execute on function public.search_artists(text, int), public.artist_cards(uuid[]), public.artist_card(uuid), public.artist_match(text) to anon, authenticated;
grant execute on function public.admin_artists(text, text), public.admin_artist_save(jsonb), public.admin_artist_merge(text, uuid, uuid[], uuid[]),
  public.admin_artist_hide(uuid, boolean), public.admin_candidates(text, text), public.admin_candidate_ignore(text, boolean),
  public.admin_links_save(text, uuid, jsonb) to authenticated;
grant execute on function public.link_interests(uuid) to service_role;

-- 9. 이용 기록: 아티스트 이벤트 추가 (L. 수집하는 데이터 — 검색어 원문은 남기지 않고 길이만)
create or replace function public.track_events(p_events jsonb) returns integer
language plpgsql security definer set search_path = public as $$
declare allowed text[] := array[
  'visit','open_mode','schedule_filter','perf_view','reco_view','reco_click','hexagon_open','event_view','event_detail_view','badge_guide_view','badge_guide_open',
  'calendar_open','calendar_add','opening_click','ticket_link_click',
  'planned_add','attended_add','record_edit','record_remove','record_restore','artist_interest','artist_uninterest','badge_earned','badge_scope',
  'stamp_open','photo_select','photo_error','stamp_ready','share_click','share_done','share_cancel','share_error','share_unsupported','save_click',
  'auth_gate','auth_view','login_attempt','login_success','signup_attempt','signup_complete','settings_view','marketing_toggle','logout',
  'artist_search','artist_schedule','artist_instagram',
  'report_open','report_view','report_submit','report_mine_view','report_reason_open','report_cancel','event_apply_click','inapp_escape_click'];
  n integer;
begin
  insert into public.activity_logs (occurred_at, event, item, value, src, inapp, visitor_id, session_id, app_version)
  select least(coalesce(nullif(e->>'at', '')::timestamptz, now()), now()), e->>'event',
         left(coalesce(e->>'item', ''), 200), left(coalesce(e->>'value', ''), 200), left(coalesce(e->>'src', ''), 40),
         left(coalesce(e->>'inapp', ''), 20), left(coalesce(e->>'visitorId', ''), 64), left(coalesce(e->>'sessionId', ''), 64), left(coalesce(e->>'appVersion', ''), 20)
  from (select value e from jsonb_array_elements(p_events) limit 20) x
  where e->>'event' = any(allowed) and coalesce(e->>'visitorId', '') <> '';
  get diagnostics n = row_count;
  return n;
end $$;
