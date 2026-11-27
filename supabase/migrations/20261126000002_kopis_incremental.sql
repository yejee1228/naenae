-- 내내(nae nae) 베타 — KOPIS 수집: 바뀐 공연만 받기 (11/26)
-- 평소에는 마지막 성공 수집 이후 등록·수정된 공연만(afterdate) 받고, 7일에 한 번은 전체를 받음
alter table public.kopis_sync_runs add column if not exists mode text not null default 'full' check (mode in ('full', 'incremental'));
alter table public.kopis_sync_runs add column if not exists after_date date;   -- 바뀐 것만 받을 때 기준 날짜
