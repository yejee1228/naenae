-- 내내(nae nae) 베타 — 표 (07_데이터설계_ERD.md §2)
-- 표준 PostgreSQL만 사용. Supabase 전용은 auth.users 참조뿐 (AWS 이전 시 회원 표로 교체)

-- 이름 비교용: 유니코드 정규화 + 소문자 + 공백 제거 (관심 아티스트·공연명 매칭, R-37)
create or replace function public.name_key(v text) returns text
language sql immutable as $$ select lower(regexp_replace(normalize(coalesce(v, ''), NFKC), '\s+', '', 'g')) $$;

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at := now(); return new; end $$;

-- 2-1 회원 ---------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nickname text not null check (char_length(nickname) between 2 and 12),          -- R-06
  provider text not null check (provider in ('kakao', 'google', 'email')),         -- R-04
  is_admin boolean not null default false,                                         -- R-103
  marketing_opt_in boolean not null default false,                                 -- R-09
  report_unseen boolean not null default false,                                    -- R-76
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.consents (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('age14', 'terms', 'privacy', 'marketing')),
  agreed boolean not null,
  doc_version text,
  created_at timestamptz not null default now()
);
create index consents_user on public.consents (user_id, kind, created_at desc);

-- 2-3 콘텐츠 -------------------------------------------------------------
create table public.performances (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('kopis', 'manual')),
  kopis_id text unique,
  title text not null,
  start_date date not null,
  end_date date not null,
  venue text not null default '',
  region text not null default '',
  artists text[] not null default '{}',          -- 화면 표시·매칭용 (공연명에서 뽑음 → 운영자 보정)
  artists_locked boolean not null default false, -- R-106
  cast_raw text,                                 -- KOPIS 출연진 원문 (10_KOPIS_확인결과)
  ticket_links jsonb not null default '[]',
  poster_url text, time_text text, price_text text, age_text text, runtime_text text,
  organizer text, facility_id text, kopis_state text,
  kopis_updated_at timestamptz,
  detail_fetched_at timestamptz,
  is_hidden boolean not null default false,      -- R-105
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date)
);
create index performances_dates on public.performances (start_date, end_date);
create index performances_region on public.performances (region);
create index performances_artists on public.performances using gin (artists);

create table public.club_venues (
  id bigint generated always as identity primary key,
  name text not null unique,
  is_hidden boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.promotions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  tag text not null default '',
  summary text not null default '',
  body text not null default '',
  notes text[] not null default '{}',
  start_date date not null,
  end_date date not null,
  apply_label text not null default '응모하기',
  apply_url text not null check (apply_url ~ '^https://'),
  thumbnail_path text,
  is_published boolean not null default true,
  is_hidden boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date)
);

-- 2-4 제보 (openings와 서로 참조 → 먼저 만들고 외래키는 뒤에) -------------
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,   -- 탈퇴해도 제보는 남음 (R-117)
  kind text not null check (kind in ('opening', 'performance')),
  title text not null check (char_length(title) between 1 and 80),
  artists text[] not null default '{}',
  venue text not null default '',
  show_date date,
  open_at_text text not null default '',
  ticket_url text not null default '',
  source_url text not null default '',
  note text not null default '' check (char_length(note) <= 300),
  status text not null default 'submitted'
    check (status in ('submitted', 'reviewing', 'registered', 'rejected', 'canceled')),   -- R-72·75
  reject_reason text,
  registered_opening_id uuid,
  registered_performance_id uuid references public.performances(id) on delete set null,
  user_seen boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'rejected' or coalesce(reject_reason, '') <> ''),                     -- R-74
  check (show_date is not null or open_at_text <> '' or ticket_url <> '' or source_url <> ''), -- R-71
  check (ticket_url = '' or ticket_url ~ '^https?://'),
  check (source_url = '' or source_url ~ '^https?://')
);
create index reports_user on public.reports (user_id, created_at desc);
create index reports_status on public.reports (status, created_at);

create table public.openings (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) <= 120),
  artists text[] not null default '{}',
  venue text not null default '',
  show_date date,
  open_at timestamptz,
  open_has_time boolean not null default true,
  vendor text not null default '',
  ticket_url text not null default '' check (ticket_url = '' or ticket_url ~ '^https?://'),
  note text not null default '' check (char_length(note) <= 200),
  performance_id uuid references public.performances(id) on delete set null,
  is_published boolean not null default true,
  is_hidden boolean not null default false,
  source text not null default 'admin' check (source in ('admin', 'report')),
  report_id uuid references public.reports(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index openings_open_at on public.openings (open_at);
alter table public.reports add constraint reports_registered_opening_fk
  foreign key (registered_opening_id) references public.openings(id) on delete set null;

create table public.report_status_logs (
  id bigint generated always as identity primary key,
  report_id uuid not null references public.reports(id) on delete cascade,
  from_status text,
  to_status text not null,
  actor_id uuid references public.profiles(id) on delete set null,
  reason text,
  created_at timestamptz not null default now()
);

-- 2-2 기록 ---------------------------------------------------------------
create table public.records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null check (type in ('planned', 'attended')),
  performance_id uuid references public.performances(id) on delete set null,
  opening_id uuid references public.openings(id) on delete set null,
  title text not null check (char_length(title) between 1 and 120),   -- 공연 정보 복사본 (R-39a)
  date date,
  venue text not null default '',
  region text not null default '',
  artists text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,                                              -- 5초 되돌리기 (R-39)
  check (type = 'planned' or date is not null),
  check (performance_id is null or opening_id is null)
);
create index records_user on public.records (user_id, type);
-- 중복 막기 (R-31, R-32)
create unique index records_planned_perf on public.records (user_id, performance_id) where type = 'planned' and performance_id is not null;
create unique index records_planned_open on public.records (user_id, opening_id) where type = 'planned' and opening_id is not null;
create unique index records_attended_perf on public.records (user_id, performance_id, date) where type = 'attended' and performance_id is not null;

create table public.interests (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  name_key text generated always as (public.name_key(name)) stored,
  source text not null default 'manual' check (source in ('perf', 'manual', 'opening')),
  created_at timestamptz not null default now(),
  unique (user_id, name_key)
);

create table public.badge_seen (
  user_id uuid not null references public.profiles(id) on delete cascade,
  period text not null,
  badge_key text not null,
  seen_at timestamptz not null default now(),
  primary key (user_id, period, badge_key)
);

-- 2-5 운영 ---------------------------------------------------------------
create table public.admin_audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null check (action in ('create', 'update', 'hide', 'publish', 'status_change', 'view_pii', 'kopis_resync')),
  target_table text not null,
  target_id text not null,
  changes jsonb,
  created_at timestamptz not null default now()
);
create index admin_audit_logs_time on public.admin_audit_logs (created_at desc);

create table public.kopis_sync_runs (
  id bigint generated always as identity primary key,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running' check (status in ('running', 'success', 'failed')),
  list_count integer not null default 0,
  detail_count integer not null default 0,
  remaining_details integer not null default 0,
  error text,
  trigger text not null default 'schedule' check (trigger in ('schedule', 'admin')),
  triggered_by uuid references public.profiles(id) on delete set null
);

-- 2-6 지표 ---------------------------------------------------------------
create table public.activity_logs (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  event text not null,
  item text not null default '',
  value text not null default '',
  src text not null default '',
  inapp text not null default '',
  visitor_id text not null,
  session_id text not null default '',
  app_version text not null default ''
);
create index activity_logs_time on public.activity_logs (occurred_at);

create table public.metrics_daily (
  day date not null,
  metric text not null,
  key text not null default '',
  value integer not null,
  primary key (day, metric, key)
);

-- updated_at 자동
create trigger t_profiles before update on public.profiles for each row execute function public.touch_updated_at();
create trigger t_performances before update on public.performances for each row execute function public.touch_updated_at();
create trigger t_promotions before update on public.promotions for each row execute function public.touch_updated_at();
create trigger t_reports before update on public.reports for each row execute function public.touch_updated_at();
create trigger t_openings before update on public.openings for each row execute function public.touch_updated_at();
create trigger t_records before update on public.records for each row execute function public.touch_updated_at();
