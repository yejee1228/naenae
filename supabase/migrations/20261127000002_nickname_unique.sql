-- 닉네임 중복 불가 (결정 2 회신: 불가, R-07)
-- · 대소문자·띄어쓰기를 구분해 정확히 같은 닉네임만 겹친다고 봄 ('Nae Nae' ≠ 'naenae'). 앞뒤 공백만 정리
-- · 가입하기를 먼저 누른 사람이 선점: 이메일 가입은 인증 메일을 누르기 전(최대 24시간)에도 닉네임을 맡아 둠
-- 다시 실행해도 됨 (처음 버전은 대소문자·띄어쓰기를 무시하는 인덱스였음)

-- 이미 겹치는 닉네임이 있으면 인덱스를 만들 수 없으니 먼저 알려 줌
do $$
begin
  if exists (select 1 from public.profiles group by nickname having count(*) > 1) then
    raise exception '겹치는 닉네임이 있어요. 먼저 정리해 주세요: %',
      (select string_agg(nickname, ', ') from (select nickname from public.profiles group by nickname having count(*) > 1) t);
  end if;
end $$;

drop index if exists public.profiles_nickname_key;
create unique index profiles_nickname_key on public.profiles (nickname);

-- 이메일 가입 후 인증을 기다리는 사람이 맡아 둔 닉네임 (가입하기를 누른 시각 = auth.users.created_at)
-- p_before 보다 먼저 누른 사람만 찾음. p_except = 나 자신
create or replace function public.nickname_holder(p_nickname text, p_except uuid, p_before timestamptz default now())
returns uuid language sql stable security definer set search_path = public, auth as $$
  select u.id from auth.users u
  where u.raw_user_meta_data->>'nickname' = trim(p_nickname)
    and u.id is distinct from p_except
    and coalesce(u.raw_app_meta_data->>'provider', 'email') = 'email'
    and u.created_at > now() - interval '24 hours'
    and u.created_at < p_before
    and not exists (select 1 from public.profiles p where p.id = u.id)
  order by u.created_at limit 1
$$;
revoke execute on function public.nickname_holder(text, uuid, timestamptz) from public, anon, authenticated;

-- 가입(complete_profile)과 설정의 닉네임 변경 모두 여기서 막고, 알아보기 쉬운 문구로 알려 줌
create or replace function public.check_nickname() returns trigger
language plpgsql security definer set search_path = public, auth as $$
declare clicked timestamptz;
begin
  new.nickname := trim(new.nickname);
  if tg_op = 'UPDATE' and new.nickname = old.nickname then return new; end if;
  if exists (select 1 from public.profiles where id <> new.id and nickname = new.nickname) then
    perform public.fail('conflict', '이미 사용 중인 닉네임입니다. 다른 닉네임을 입력해 주세요.');
  end if;
  -- 내가 이메일 가입 때 이 닉네임으로 가입하기를 눌렀다면 그 시각, 아니면 지금
  clicked := case when tg_op = 'INSERT' then
      (select created_at from auth.users where id = new.id and raw_user_meta_data->>'nickname' = new.nickname) end;
  if public.nickname_holder(new.nickname, new.id, coalesce(clicked, now())) is not null then
    perform public.fail('conflict', '이미 사용 중인 닉네임입니다. 다른 닉네임을 입력해 주세요.');
  end if;
  return new;
end $$;
drop trigger if exists t_check_nickname on public.profiles;
create trigger t_check_nickname before insert or update of nickname on public.profiles for each row execute function public.check_nickname();

-- 가입 화면의 닉네임 중복확인 (가입하기를 누르기 전 확인용, 최종 판단은 위 트리거)
create or replace function public.nickname_available(p_nickname text) returns boolean
language sql stable security definer set search_path = public, auth as $$
  select case when exists (select 1 from public.profiles where nickname = trim(p_nickname))
    then exists (select 1 from public.profiles where nickname = trim(p_nickname) and id = auth.uid())   -- 이미 누가 씀: 나만 OK
    else public.nickname_holder(p_nickname, auth.uid()) is null end                                      -- 아무도 안 씀: 먼저 누른 대기 가입이 없어야 OK
$$;
revoke execute on function public.nickname_available(text) from public;
grant execute on function public.nickname_available(text) to anon, authenticated;

-- 가입 화면의 이메일 중복확인: available · taken(가입됨, provider 포함) · pending(인증 대기)
-- 가입 여부가 드러나는 기능이라 화면에서만 쓰고, 정식(AWS)에서는 요청 수 제한을 둠 (R-06e)
create or replace function public.email_status(p_email text) returns jsonb
language sql stable security definer set search_path = public, auth as $$
  select coalesce((
    select jsonb_build_object(
      'status', case when u.email_confirmed_at is null and not exists (select 1 from public.profiles p where p.id = u.id) then 'pending' else 'taken' end,
      'provider', coalesce(u.raw_app_meta_data->>'provider', 'email'))
    from auth.users u where lower(u.email) = lower(trim(p_email)) order by u.created_at limit 1
  ), jsonb_build_object('status', 'available'))
$$;
revoke execute on function public.email_status(text) from public;
grant execute on function public.email_status(text) to anon, authenticated;
