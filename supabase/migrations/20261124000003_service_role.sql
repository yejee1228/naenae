-- 내내(nae nae) 베타 — 서버 전용 역할(service_role) 권한
-- 새 Supabase 프로젝트는 테이블 권한을 자동으로 주지 않음 → KOPIS 수집 함수(서버)가 쓰는 표에 권한을 직접 줌
-- service_role 키는 서버(Edge Function)에만 있고 사이트 코드에는 없음
grant usage on schema public to service_role;
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;
alter default privileges in schema public grant select, insert, update, delete on tables to service_role;
alter default privileges in schema public grant usage, select on sequences to service_role;
