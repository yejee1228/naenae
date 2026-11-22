-- 내내(nae nae) 베타 — 권한(RLS) · 서버 함수 (07 ERD §3, 08 API 명세)
-- 오류는 'code|화면 문구' 형식으로 던짐 → 어댑터가 code와 문구로 나눔 (08 §1 오류 코드)

-- 운영자인지 ---------------------------------------------------------------
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false)
$$;

create or replace function public.fail(code text, msg text) returns void
language plpgsql as $$ begin raise exception '%|%', code, msg; end $$;

-- 기본 권한 (행 단위는 RLS가 막음) ------------------------------------------
grant usage on schema public to anon, authenticated;
grant select on public.performances, public.openings, public.promotions, public.club_venues to anon, authenticated;
grant select, insert, update, delete on public.records, public.interests, public.badge_seen to authenticated;
grant select on public.profiles, public.consents, public.reports, public.report_status_logs to authenticated;
grant update (nickname, marketing_opt_in, report_unseen) on public.profiles to authenticated;   -- is_admin은 못 바꿈
grant insert, update on public.performances, public.openings, public.promotions, public.club_venues to authenticated; -- 운영자만 (RLS)
grant select on public.admin_audit_logs, public.kopis_sync_runs, public.metrics_daily, public.activity_logs to authenticated; -- 운영자만 (RLS)

alter table public.profiles enable row level security;
alter table public.consents enable row level security;
alter table public.performances enable row level security;
alter table public.openings enable row level security;
alter table public.promotions enable row level security;
alter table public.club_venues enable row level security;
alter table public.reports enable row level security;
alter table public.report_status_logs enable row level security;
alter table public.records enable row level security;
alter table public.interests enable row level security;
alter table public.badge_seen enable row level security;
alter table public.admin_audit_logs enable row level security;
alter table public.kopis_sync_runs enable row level security;
alter table public.activity_logs enable row level security;
alter table public.metrics_daily enable row level security;

-- 회원
create policy profiles_self on public.profiles for select to authenticated using (id = auth.uid() or public.is_admin());
create policy profiles_update_self on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy consents_self on public.consents for select to authenticated using (user_id = auth.uid() or public.is_admin());

-- 콘텐츠: 누구나 게시된 것만, 운영자는 전부 + 쓰기
create policy perf_read on public.performances for select to anon, authenticated using (not is_hidden or public.is_admin());
create policy open_read on public.openings for select to anon, authenticated using ((is_published and not is_hidden) or public.is_admin());
create policy promo_read on public.promotions for select to anon, authenticated using ((is_published and not is_hidden) or public.is_admin());
create policy club_read on public.club_venues for select to anon, authenticated using (not is_hidden or public.is_admin());
create policy perf_admin_ins on public.performances for insert to authenticated with check (public.is_admin());
create policy perf_admin_upd on public.performances for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy open_admin_ins on public.openings for insert to authenticated with check (public.is_admin());
create policy open_admin_upd on public.openings for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy promo_admin_ins on public.promotions for insert to authenticated with check (public.is_admin());
create policy promo_admin_upd on public.promotions for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy club_admin_ins on public.club_venues for insert to authenticated with check (public.is_admin());
create policy club_admin_upd on public.club_venues for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- 기록: 본인 것만
create policy records_self on public.records for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy interests_self on public.interests for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy badge_seen_self on public.badge_seen for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 제보: 읽기는 본인·운영자, 쓰기는 함수로만
create policy reports_read on public.reports for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy report_logs_read on public.report_status_logs for select to authenticated
  using (public.is_admin() or exists (select 1 from public.reports r where r.id = report_id and r.user_id = auth.uid()));

-- 운영 기록·지표: 운영자만 읽기
create policy audit_admin on public.admin_audit_logs for select to authenticated using (public.is_admin());
create policy runs_admin on public.kopis_sync_runs for select to authenticated using (public.is_admin());
create policy logs_admin on public.activity_logs for select to authenticated using (public.is_admin());
create policy metrics_admin on public.metrics_daily for select to authenticated using (public.is_admin());

-- 운영자 작업 기록 (R-104): 콘텐츠 표를 운영자가 바꾸면 자동으로 남김 -------------
create or replace function public.audit_content() returns trigger
language plpgsql security definer set search_path = public as $$
declare act text;
begin
  if auth.uid() is null or not public.is_admin() then return new; end if;  -- 자동 수집(KOPIS) 등은 기록 안 함
  if tg_op = 'INSERT' then act := 'create';
  elsif (to_jsonb(new) ? 'is_hidden') and (to_jsonb(old)->>'is_hidden') is distinct from (to_jsonb(new)->>'is_hidden') then act := 'hide';
  elsif (to_jsonb(new) ? 'is_published') and (to_jsonb(old)->>'is_published') is distinct from (to_jsonb(new)->>'is_published') then act := 'publish';
  else act := 'update'; end if;
  insert into public.admin_audit_logs (actor_id, action, target_table, target_id, changes)
  values (auth.uid(), act, tg_table_name, (to_jsonb(new)->>'id'),
          case when tg_op = 'UPDATE' then jsonb_build_object('before', to_jsonb(old), 'after', to_jsonb(new)) else to_jsonb(new) end);
  return new;
end $$;
create trigger audit_performances after insert or update on public.performances for each row execute function public.audit_content();
create trigger audit_openings after insert or update on public.openings for each row execute function public.audit_content();
create trigger audit_promotions after insert or update on public.promotions for each row execute function public.audit_content();
create trigger audit_club_venues after insert or update on public.club_venues for each row execute function public.audit_content();

-- 출연진 보정 잠금 (R-106): 운영자가 아티스트를 바꾸면 잠금
create or replace function public.lock_artists() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' and new.artists is distinct from old.artists and public.is_admin() then new.artists_locked := true; end if;
  return new;
end $$;
create trigger t_lock_artists before update on public.performances for each row execute function public.lock_artists();

-- 계정 (08 §2-1) -----------------------------------------------------------
create or replace function public.complete_profile(p_nickname text, p_provider text, p_consents jsonb)
returns public.profiles language plpgsql security definer set search_path = public as $$
declare p public.profiles;
begin
  if auth.uid() is null then perform public.fail('unauthorized', '로그인이 필요해요.'); end if;
  if char_length(trim(coalesce(p_nickname, ''))) not between 2 and 12 then perform public.fail('validation', '닉네임은 2~12자로 입력해 주세요.'); end if;
  if not (coalesce((p_consents->>'age14')::boolean, false) and coalesce((p_consents->>'terms')::boolean, false) and coalesce((p_consents->>'privacy')::boolean, false)) then
    perform public.fail('validation', '필수 약관에 동의해 주세요.');
  end if;
  insert into public.profiles (id, nickname, provider, marketing_opt_in)
  values (auth.uid(), trim(p_nickname), p_provider, coalesce((p_consents->>'marketing')::boolean, false))
  on conflict (id) do update set nickname = excluded.nickname
  returning * into p;
  insert into public.consents (user_id, kind, agreed, doc_version)
  select auth.uid(), k, coalesce((p_consents->>k)::boolean, false), p_consents->>'version'
  from unnest(array['age14', 'terms', 'privacy', 'marketing']) k;
  return p;
end $$;

create or replace function public.set_marketing(p_agreed boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then perform public.fail('unauthorized', '로그인이 필요해요.'); end if;
  update public.profiles set marketing_opt_in = p_agreed where id = auth.uid();
  insert into public.consents (user_id, kind, agreed) values (auth.uid(), 'marketing', p_agreed);
end $$;

-- 탈퇴 (R-08, R-09b, R-117): 계정 삭제 → 연쇄 삭제, 제보는 user_id만 비움
create or replace function public.withdraw() returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if auth.uid() is null then perform public.fail('unauthorized', '로그인이 필요해요.'); end if;
  if public.is_admin() then perform public.fail('forbidden', '운영자 계정은 탈퇴할 수 없어요.'); end if;
  delete from auth.users where id = auth.uid();
end $$;

-- 기록 (08 §2-3) -----------------------------------------------------------
-- 관람했어요 / 관람 완료로: 기간 확인 → 중복 확인 → 공연 정보 복사 저장 → 보고 싶은 공연 정리 (R-32·33·39a)
create or replace function public.attend(p_performance_id uuid, p_date date, p_record_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare pf public.performances; src public.records; rec public.records; removed uuid; today date := (now() at time zone 'Asia/Seoul')::date;
begin
  if auth.uid() is null then perform public.fail('unauthorized', '로그인이 필요해요.'); end if;
  if p_record_id is not null then                                  -- 보고 싶은 공연 → 관람 완료로
    select * into src from public.records where id = p_record_id and user_id = auth.uid() and deleted_at is null;
    if not found then perform public.fail('not_found', '기록을 찾지 못했어요.'); end if;
    if src.date is null or src.date > today then perform public.fail('validation', '공연이 끝난 뒤에 관람 완료로 옮길 수 있어요.'); end if;
    update public.records set type = 'attended', created_at = now() where id = src.id returning * into rec;
    return jsonb_build_object('record', to_jsonb(rec), 'removedPlannedId', null);
  end if;
  select * into pf from public.performances where id = p_performance_id and not is_hidden;
  if not found then perform public.fail('not_found', '공연 정보를 찾지 못했어요.'); end if;
  if p_date is null or p_date < pf.start_date or p_date > pf.end_date or p_date > today then
    perform public.fail('validation', '공연 기간 안의 지난 날짜를 골라 주세요.');
  end if;
  if exists (select 1 from public.records where user_id = auth.uid() and type = 'attended' and performance_id = pf.id and date = p_date and deleted_at is null) then
    perform public.fail('conflict', '이미 관람 기록이 있어요.');
  end if;
  insert into public.records (user_id, type, performance_id, title, date, venue, region, artists)
  values (auth.uid(), 'attended', pf.id, pf.title, p_date, pf.venue, pf.region, pf.artists) returning * into rec;
  delete from public.records where user_id = auth.uid() and type = 'planned' and performance_id = pf.id returning id into removed;
  return jsonb_build_object('record', to_jsonb(rec), 'removedPlannedId', removed);
end $$;

-- 5초 되돌리기 만료 정리 (R-39)
create or replace function public.records_purge() returns integer
language sql security definer set search_path = public as $$
  with d as (delete from public.records where deleted_at is not null and deleted_at < now() - interval '10 seconds' returning 1) select count(*)::int from d
$$;

-- 제보 (08 §2-4) -----------------------------------------------------------
create or replace function public.create_report(p jsonb) returns public.reports
language plpgsql security definer set search_path = public as $$
declare r public.reports;
begin
  if auth.uid() is null then perform public.fail('unauthorized', '제보하려면 로그인해 주세요.'); end if;
  if (select count(*) from public.reports where user_id = auth.uid() and created_at > now() - interval '1 hour') >= 10 then
    perform public.fail('rate_limited', '잠시 후 다시 시도해 주세요.');                                   -- R-77
  end if;
  if coalesce(trim(p->>'title'), '') = '' then perform public.fail('validation', '공연명을 입력해 주세요.'); end if;
  insert into public.reports (user_id, kind, title, artists, venue, show_date, open_at_text, ticket_url, source_url, note)
  values (auth.uid(), coalesce(p->>'kind', 'opening'), trim(p->>'title'),
          coalesce(array(select jsonb_array_elements_text(p->'artists')), '{}'), coalesce(p->>'venue', ''),
          nullif(p->>'showDate', '')::date, coalesce(p->>'openAtText', ''), coalesce(p->>'ticketUrl', ''),
          coalesce(p->>'sourceUrl', ''), coalesce(p->>'note', ''))
  returning * into r;
  insert into public.report_status_logs (report_id, from_status, to_status, actor_id) values (r.id, null, 'submitted', auth.uid());
  return r;
exception when check_violation then
  perform public.fail('validation', '공연 날짜, 오픈 일시, 링크 중 하나는 알려 주세요. 링크는 https:// 로 시작해야 해요.');
end $$;

create or replace function public.cancel_report(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.reports set status = 'canceled' where id = p_id and user_id = auth.uid() and status = 'submitted';
  if not found then perform public.fail('conflict', '이미 확인 중인 제보는 취소할 수 없어요.'); end if;   -- R-75
  insert into public.report_status_logs (report_id, from_status, to_status, actor_id) values (p_id, 'submitted', 'canceled', auth.uid());
end $$;

create or replace function public.mark_reports_seen() returns void
language sql security definer set search_path = public as $$
  update public.reports set user_seen = true where user_id = auth.uid() and not user_seen;
  update public.profiles set report_unseen = false where id = auth.uid();
$$;

-- 제보 상태 변경 공통: 이력 + 보라 점 + 작업 기록 (R-72·76·104)
create or replace function public.report_transition(p_id uuid, p_to text, p_reason text default null) returns public.reports
language plpgsql security definer set search_path = public as $$
declare r public.reports; prev text;
begin
  select status into prev from public.reports where id = p_id for update;
  update public.reports set status = p_to, reject_reason = coalesce(p_reason, reject_reason), user_seen = (p_to = 'reviewing')
  where id = p_id returning * into r;
  insert into public.report_status_logs (report_id, from_status, to_status, actor_id, reason) values (p_id, prev, p_to, auth.uid(), p_reason);
  if p_to in ('registered', 'rejected') then update public.profiles set report_unseen = true where id = r.user_id; end if;
  insert into public.admin_audit_logs (actor_id, action, target_table, target_id, changes)
  values (auth.uid(), 'status_change', 'reports', p_id::text, jsonb_build_object('from', prev, 'to', p_to, 'reason', p_reason));
  return r;
end $$;

-- 운영자: 제보 열기 → 자동 '확인 중' (R-72)
create or replace function public.admin_open_report(p_id uuid) returns public.reports
language plpgsql security definer set search_path = public as $$
declare r public.reports;
begin
  if not public.is_admin() then perform public.fail('forbidden', '관리자 권한이 없어요.'); end if;
  select * into r from public.reports where id = p_id;
  if not found then perform public.fail('not_found', '제보를 찾지 못했어요.'); end if;
  if r.status = 'submitted' then r := public.report_transition(p_id, 'reviewing'); end if;
  return r;
end $$;

-- 운영자: 공지 또는 공연으로 등록 → 제보 '등록 완료' + 연결
create or replace function public.admin_register_report(p_id uuid, p_as text, p_data jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r public.reports; new_id uuid;
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
  else perform public.fail('validation', '등록 종류가 올바르지 않아요.'); end if;
  r := public.report_transition(p_id, 'registered');
  return jsonb_build_object('report', to_jsonb(r), 'createdId', new_id);
end $$;

create or replace function public.admin_reject_report(p_id uuid, p_reason text) returns public.reports
language plpgsql security definer set search_path = public as $$
declare st text;
begin
  if not public.is_admin() then perform public.fail('forbidden', '관리자 권한이 없어요.'); end if;
  if coalesce(trim(p_reason), '') = '' then perform public.fail('validation', '등록하지 못한 이유를 적어 주세요.'); end if;   -- R-74
  select status into st from public.reports where id = p_id;
  if st is null or st not in ('submitted', 'reviewing') then perform public.fail('conflict', '이미 처리된 제보예요.'); end if;
  return public.report_transition(p_id, 'rejected', trim(p_reason));
end $$;

-- 운영자: 대시보드 (ADM-01, R-109)
create or replace function public.admin_dashboard() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare today date := (now() at time zone 'Asia/Seoul')::date; res jsonb;
begin
  if not public.is_admin() then perform public.fail('forbidden', '관리자 권한이 없어요.'); end if;
  select jsonb_build_object(
    'reportsSubmitted', (select count(*) from public.reports where status = 'submitted'),
    'reportsReviewing', (select count(*) from public.reports where status = 'reviewing'),
    'openToday', (select count(*) from public.openings where is_published and not is_hidden and (open_at at time zone 'Asia/Seoul')::date = today),
    'openWeek', (select count(*) from public.openings where is_published and not is_hidden and (open_at at time zone 'Asia/Seoul')::date between today and today + 6),
    'promotionsLive', (select count(*) from public.promotions where is_published and not is_hidden and today between start_date and end_date),
    'promotionsSoon', (select count(*) from public.promotions where is_published and not is_hidden and start_date > today),
    'lastSync', (select to_jsonb(k) from public.kopis_sync_runs k order by started_at desc limit 1),
    'lastSuccess', (select to_jsonb(k) from public.kopis_sync_runs k where status = 'success' order by started_at desc limit 1),
    'members', (select count(*) from public.profiles),
    'membersToday', (select count(*) from public.profiles where (created_at at time zone 'Asia/Seoul')::date = today),
    'metrics7d', (select coalesce(jsonb_object_agg(metric, v), '{}') from (select metric, sum(value) v from public.metrics_daily where key = '' and day > today - 7 group by metric) m)
  ) into res;
  return res;
end $$;

-- 운영자: 회원 목록 (이메일 가림, R-107)
create or replace function public.admin_members(p_q text default '') returns table (id uuid, nickname text, provider text, created_at timestamptz, marketing_opt_in boolean, is_admin boolean, email_masked text, planned int, attended int, artists int, reports int)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.is_admin() then perform public.fail('forbidden', '관리자 권한이 없어요.'); end if;
  return query
  select p.id, p.nickname, p.provider, p.created_at, p.marketing_opt_in, p.is_admin,
         case when u.email is null then '' else regexp_replace(u.email, '^(.).*(@.*)$', '\1***\2') end,
         (select count(*)::int from public.records r where r.user_id = p.id and r.type = 'planned' and r.deleted_at is null),
         (select count(*)::int from public.records r where r.user_id = p.id and r.type = 'attended' and r.deleted_at is null),
         (select count(*)::int from public.interests i where i.user_id = p.id),
         (select count(*)::int from public.reports x where x.user_id = p.id)
  from public.profiles p left join auth.users u on u.id = p.id
  where coalesce(p_q, '') = '' or public.name_key(p.nickname) like '%' || public.name_key(p_q) || '%'
  order by p.created_at desc limit 500;
end $$;

create or replace function public.admin_reveal_email(p_user uuid) returns text
language plpgsql security definer set search_path = public, auth as $$
declare e text;
begin
  if not public.is_admin() then perform public.fail('forbidden', '관리자 권한이 없어요.'); end if;
  select email into e from auth.users where id = p_user;
  insert into public.admin_audit_logs (actor_id, action, target_table, target_id) values (auth.uid(), 'view_pii', 'profiles', p_user::text);
  return coalesce(e, '');
end $$;

-- 이용 기록 (08 logs.track, L 표 2, R-112·116): 허용된 이벤트만, IP 없음, 한 번에 20건 -------------
create or replace function public.track_events(p_events jsonb) returns integer
language plpgsql security definer set search_path = public as $$
declare allowed text[] := array[
  'visit','open_mode','schedule_filter','perf_view','reco_view','reco_click','hexagon_open','event_view','event_detail_view','badge_guide_view','badge_guide_open',
  'calendar_open','calendar_add','opening_click','ticket_link_click',
  'planned_add','attended_add','record_edit','record_remove','record_restore','artist_interest','artist_uninterest','badge_earned','badge_scope',
  'stamp_open','photo_select','photo_error','stamp_ready','share_click','share_done','share_cancel','share_error','share_unsupported','save_click',
  'auth_gate','auth_view','login_attempt','login_success','signup_attempt','signup_complete','settings_view','marketing_toggle','logout',
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

-- 자동 작업 (R-109a·113·114) -------------------------------------------------
create or replace function public.metrics_aggregate(p_day date default ((now() at time zone 'Asia/Seoul')::date - 1)) returns void
language plpgsql security definer set search_path = public as $$
declare d0 timestamptz := (p_day::timestamp at time zone 'Asia/Seoul'); d1 timestamptz := ((p_day + 1)::timestamp at time zone 'Asia/Seoul');
begin
  delete from public.metrics_daily where day = p_day;
  insert into public.metrics_daily (day, metric, key, value)
  select p_day, m, '', v from (
    select 'visitors' m, count(distinct visitor_id)::int v from public.activity_logs where occurred_at >= d0 and occurred_at < d1 and event = 'visit'
    union all select 'calendar_add', count(distinct visitor_id)::int from public.activity_logs where occurred_at >= d0 and occurred_at < d1 and event = 'calendar_add'
    union all select 'ticket_click', count(distinct visitor_id)::int from public.activity_logs where occurred_at >= d0 and occurred_at < d1 and event in ('opening_click', 'ticket_link_click')
    union all select 'attended', count(*)::int from public.activity_logs where occurred_at >= d0 and occurred_at < d1 and event = 'attended_add'
    union all select 'share_done', count(*)::int from public.activity_logs where occurred_at >= d0 and occurred_at < d1 and event = 'share_done'
    union all select 'stamp_saved', count(*)::int from public.activity_logs where occurred_at >= d0 and occurred_at < d1 and event = 'save_click'
    union all select 'auth_gate', count(distinct visitor_id)::int from public.activity_logs where occurred_at >= d0 and occurred_at < d1 and event = 'auth_gate'
    union all select 'signups', count(*)::int from public.profiles where created_at >= d0 and created_at < d1
  ) t;
  -- 공지별 캘린더 추가 (고유 방문자)
  insert into public.metrics_daily (day, metric, key, value)
  select p_day, 'calendar_add', item, count(distinct visitor_id)::int from public.activity_logs
  where occurred_at >= d0 and occurred_at < d1 and event = 'calendar_add' and item <> '' group by item;
end $$;

create or replace function public.logs_cleanup() returns integer
language sql security definer set search_path = public as $$
  with d as (delete from public.activity_logs where occurred_at < now() - interval '1 year' returning 1) select count(*)::int from d
$$;

grant execute on function public.track_events(jsonb) to anon, authenticated;
grant execute on function public.complete_profile(text, text, jsonb), public.set_marketing(boolean), public.withdraw(),
  public.attend(uuid, date, uuid), public.create_report(jsonb), public.cancel_report(uuid), public.mark_reports_seen(),
  public.admin_open_report(uuid), public.admin_register_report(uuid, text, jsonb), public.admin_reject_report(uuid, text),
  public.admin_dashboard(), public.admin_members(text), public.admin_reveal_email(uuid), public.is_admin() to authenticated;
revoke execute on function public.records_purge(), public.metrics_aggregate(date), public.logs_cleanup(), public.report_transition(uuid, text, text) from public, anon, authenticated;
