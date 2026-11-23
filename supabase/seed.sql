-- 내내(nae nae) 베타 — 예시 데이터 (P0-6). 시연용 프로젝트에 한 번 실행.
-- 운영자 계정 지정은 supabase/admin.sql 로 (여러 명 가능)

-- 라이브클럽 공연장 16곳 (R-24: 예시, 운영자가 계속 추가)
insert into public.club_venues (name) values
  ('우무지'), ('롤링홀'), ('벨르'), ('클럽 FF'), ('후케즈'), ('상상마당 라이브홀'), ('무신사 개러지'), ('웨스트브릿지'),
  ('공상온도'), ('살롱 문보우'), ('생기 스튜디오'), ('프리즘홀'), ('언더스테이지'), ('A.O.R'), ('수상한창고'), ('H-스테이지')
on conflict (name) do nothing;

-- 예시 이벤트 1건 (운영자가 관리자 페이지에서 지우거나 숨김)
insert into public.promotions (title, tag, summary, body, notes, start_date, end_date, apply_label, apply_url)
values ('[예시] 내내 인증샷 챌린지', '챌린지', '내내로 만든 인증샷을 스토리에 올리고 태그하면 추첨으로 굿즈를 드려요.',
        '나의 내내 › 관람 완료에서 인증샷을 만들어 인스타그램 스토리에 올려 주세요.',
        array['비공개 계정은 확인이 어려워요.'], current_date, current_date + 30, '인스타그램 열기', 'https://www.instagram.com/with_palette_/');
