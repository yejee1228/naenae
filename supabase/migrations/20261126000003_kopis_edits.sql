-- 내내(nae nae) 베타 — KOPIS 공연을 운영자가 고치거나 지웠을 때 (11/26, R-105·R-106 확장)
-- 1) 운영자가 고친 칸은 기억해 두고 다음 수집 때 덮어쓰지 않음 (locked_fields). '되돌리기'로 비우면 다음 수집에서 KOPIS 값으로 돌아감
-- 2) KOPIS 공연을 지우면 실제로는 숨김으로 바뀜 → 다음 수집 때 새 공연으로 다시 생기지 않음
-- 3) 전체 수집 때 KOPIS 목록에서 빠진 앞으로의 공연은 kopis_missing 표시 → 운영자가 확인 후 숨김

alter table public.performances add column if not exists locked_fields text[] not null default '{}';
alter table public.performances add column if not exists kopis_missing boolean not null default false;
update public.performances set locked_fields = array['artists'] where artists_locked and not ('artists' = any(locked_fields));

-- 운영자 수정 감지 (기존 lock_artists를 넓힘): 운영자가 바꾼 칸을 locked_fields에 더함
create or replace function public.lock_artists() returns trigger
language plpgsql as $$
declare changed text[] := '{}';
begin
  if tg_op <> 'UPDATE' or not public.is_admin() then return new; end if;   -- 자동 수집(서비스 키)은 잠그지 않음
  if new.locked_fields is distinct from old.locked_fields then              -- 운영자가 직접 잠금을 바꿈 (되돌리기)
    if cardinality(new.locked_fields) = 0 then new.artists_locked := false; end if;
    return new;
  end if;
  if new.title is distinct from old.title then changed := changed || 'title'::text; end if;
  if new.start_date is distinct from old.start_date then changed := changed || 'start_date'::text; end if;
  if new.end_date is distinct from old.end_date then changed := changed || 'end_date'::text; end if;
  if new.venue is distinct from old.venue then changed := changed || 'venue'::text; end if;
  if new.region is distinct from old.region then changed := changed || 'region'::text; end if;
  if new.ticket_links is distinct from old.ticket_links then changed := changed || 'ticket_links'::text; end if;
  if new.artists is distinct from old.artists then changed := changed || 'artists'::text; new.artists_locked := true; end if;
  if cardinality(changed) > 0 then
    new.locked_fields := array(select distinct x from unnest(coalesce(old.locked_fields, '{}') || changed) x order by x);
  end if;
  return new;
end $$;

-- KOPIS 공연 지우기 → 숨김으로 (지운 공연이 다음 수집에서 다시 생기지 않게)
create or replace function public.keep_kopis_perf() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.source = 'kopis' then
    update public.performances set is_hidden = true where id = old.id;
    return null;   -- 실제 삭제는 하지 않음
  end if;
  return old;
end $$;
drop trigger if exists t_keep_kopis on public.performances;
create trigger t_keep_kopis before delete on public.performances for each row execute function public.keep_kopis_perf();
revoke execute on function public.keep_kopis_perf() from public, anon, authenticated;
