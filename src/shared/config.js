// 내내(nae nae) 베타 — 설정. 배포 환경 값은 Vite 환경변수(VITE_*)로 넣음 (.env.example 참고)
const env = (typeof import.meta !== 'undefined' && import.meta.env) || {};

export const CONFIG = {
  version: '1.0.0',
  // 'local' = 서버 없이 이 브라우저에 저장하는 시연 모드 / 'supabase' = 실제 서버
  backend: env.VITE_BACKEND === 'supabase' && env.VITE_SUPABASE_URL ? 'supabase' : 'local',
  supabaseUrl: env.VITE_SUPABASE_URL || '',
  supabaseAnonKey: env.VITE_SUPABASE_ANON_KEY || '',
  serviceName: '내내',
  serviceNameEn: 'nae nae',
  sloganKo: '좋은 기억을 내내',
  sloganEn: 'With Music, With You, Always',
  myName: '나의 내내',
  myNameEn: 'MY NAE NAE',
  instagramHandle: 'with_palette_',
  operator: '기획 팔레트',   // 결정 17: 운영 주체 표기
  stampBrand: 'nae nae',
  termsVersion: '2026-12-01'
};
