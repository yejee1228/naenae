-- 내내(nae nae) 베타 — 운영자 계정 지정 (R-103: 운영자 여러 명 가능, 권한은 한 종류)
-- 1) Supabase 대시보드 → Authentication → Users → Add user → Create new user
--    (이메일·비밀번호 입력, "Auto Confirm User" 체크) 로 계정을 먼저 만든다
-- 2) 아래 이메일 목록만 바꿔서 SQL 편집기에서 실행. 여러 명이면 쉼표로 이어 적는다
--    이미 사이트에서 가입한 회원이면 닉네임은 그대로 두고 권한만 켠다

insert into public.profiles (id, nickname, provider, is_admin)
select u.id, '운영자', 'email', true
from auth.users u
where u.email in ('admintest@naenae.com')
on conflict (id) do update set is_admin = true;

-- 확인: 운영자 목록
select u.email, p.nickname, p.is_admin
from public.profiles p join auth.users u on u.id = p.id
where p.is_admin;

-- 권한 해제할 때 (계정은 남기고 운영자 권한만 끔)
-- update public.profiles set is_admin = false where id = (select id from auth.users where email = '해제할 이메일');
