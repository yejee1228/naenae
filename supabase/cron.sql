-- 내내(nae nae) 베타 — 자동 작업 예약 (R-109a, 결정 26). Supabase 대시보드 SQL 편집기에서 한 번 실행.
-- 필요: pg_cron, pg_net 확장 켜기 (Database → Extensions). 시각은 UTC 기준 → 한국 06:00 = UTC 21:00
create extension if not exists pg_cron;
select cron.schedule('naenae-metrics', '0 18 * * *', $$ select public.metrics_aggregate(); $$);        -- 한국 03:00
select cron.schedule('naenae-logs-cleanup', '5 18 * * *', $$ select public.logs_cleanup(); $$);       -- 한국 03:05
select cron.schedule('naenae-records-purge', '* * * * *', $$ select public.records_purge(); $$);      -- 1분마다
-- KOPIS 수집: Edge Function 'kopis-sync'를 매일 한국 06:00, 첫 수집 동안은 10분마다 (실행당 상세 100건)
-- 아래 <PROJECT_REF>, <SERVICE_ROLE_KEY>를 실제 값으로 바꿔 실행 (키는 이 파일에 저장하지 말 것)
-- select cron.schedule('naenae-kopis', '0 21 * * *', $$ select net.http_post(url := 'https://<PROJECT_REF>.supabase.co/functions/v1/kopis-sync', headers := '{"Authorization":"Bearer <SERVICE_ROLE_KEY>"}'::jsonb) $$);
