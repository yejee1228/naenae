/*
 * 내내(nae nae) MVP 0.5 설정 — 배포 전에 이 파일만 채우면 됩니다.
 * 공개 URL만 넣습니다. KOPIS 인증키는 절대 여기에 넣지 마세요 (Apps Script에만 보관).
 */
window.MYLIVE_CONFIG = {
  version: '0.5.0',

  // [필수] 행동 기록 + KOPIS 공연 일정을 제공하는 Apps Script 웹 앱 URL (…/exec)
  // 비워 두면 기록은 저장되지 않고, 공연 일정은 data/performances.json(엑셀 스냅샷)을 씁니다.
  appsScriptUrl: '',

  // [선택] 티켓 오픈 공지를 구글 시트에서 불러오려면 '웹에 게시 → CSV' 링크. 비우면 data/openings.json
  openingsCsvUrl: '',

  // '라이브클럽만 보기' 필터에 쓰는 공연장 이름 목록 (일부만 맞아도 포함). 팔레트 기준으로 고쳐 주세요.
  clubVenues: [
    '우무지', '롤링홀', '벨르', '클럽 FF', '후케즈', '상상마당 라이브홀', '무신사 개러지', '웨스트브릿지',
    '공상온도', '살롱 문보우', '생기 스튜디오', '프리즘홀', '언더스테이지', 'A.O.R', '수상한창고', 'H-스테이지'
  ],

  // 로그인·회원가입: 인증 서버 연결 전에는 'none' (가입 시도만 익명 기록, 정보 저장 안 함)
  // 연결 후 'supabase' 등으로 바꾸고 window.NaeAuth 어댑터를 붙입니다 (README '로그인 연결')
  auth: { provider: 'none' },

  instagramHandle: 'with_palette_',

  // 브랜드
  serviceName: '내내',
  serviceNameEn: 'nae nae',
  sloganKo: '좋은 기억을 내내',
  sloganEn: 'With Music, With You, Always',
  stampBrand: 'nae nae',   // 로고 이미지를 못 불러올 때 인증샷에 쓰는 글자
  myName: '나의 내내',       // 기록 탭 이름 (후보: 내내 모먼트, 내내 기록, 내내 아카이브)
  myNameEn: 'MY NAE NAE',

  // true면 화면 아래에 기록 전송 내역 표시 (주소 끝 ?debug=1 도 가능)
  debug: false
};
