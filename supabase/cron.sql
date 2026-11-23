-- 내내(nae nae) 베타 — 자동 작업 예약 (R-109a, 결정 26). Supabase 대시보드 SQL 편집기에서 한 번 실행.
-- 필요: pg_cron, pg_net 확장 켜기 (Database → Extensions). 시각은 UTC 기준 → 한국 06:00 = UTC 21:00
-- 주기는 결정 26(클라이언트 확인) 전 임시값
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.schedule('naenae-metrics', '0 18 * * *', $$ select public.metrics_aggregate(); $$);        -- 한국 03:00
select cron.schedule('naenae-logs-cleanup', '5 18 * * *', $$ select public.logs_cleanup(); $$);       -- 한국 03:05
select cron.schedule('naenae-records-purge', '* * * * *', $$ select public.records_purge(); $$);      -- 1분마다

-- KOPIS 수집: Edge Function 'kopis-sync'를 매일 한국 06:00 (실행당 상세 50건, KOPIS_MAX_DETAIL)
-- 함수는 x-cron-secret 헤더가 함수 비밀값 CRON_SECRET과 같아야 실행됨
-- 1) 비밀값을 Vault에 한 번 저장 (값은 .env.local 의 CRON_SECRET, 이 파일에 적지 말 것)
--    select vault.create_secret('<CRON_SECRET 값>', 'naenae_cron_secret');
-- 2) 예약 (<PROJECT_REF>만 바꿈). 새 공연 상세가 하루 50건을 넘으면 06:10, 06:20 에도 추가 예약
-- select cron.schedule('naenae-kopis', '0 21 * * *', $$
--   select net.http_post(
--     url := 'https://<PROJECT_REF>.supabase.co/functions/v1/kopis-sync',
--     headers := jsonb_build_object('content-type', 'application/json',
--       'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'naenae_cron_secret')),
--     body := '{}'::jsonb,
--     timeout_milliseconds := 150000)
-- $$);
