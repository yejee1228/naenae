// 내내(nae nae) 베타 — 데이터·로그인 어댑터. 화면은 이 api만 씀 (개발 계획 T1·원칙 08 §0)
// AWS로 옮길 때는 aws.js(같은 함수 모양, REST 호출)를 추가하고 여기서 고르기만 하면 됨
import { CONFIG } from '../config.js';
import { createLocalBackend } from './local.js';

let api;
if (CONFIG.backend === 'supabase') {
  const { createSupabaseBackend } = await import('./supabase.js');
  api = createSupabaseBackend(CONFIG);
} else {
  api = createLocalBackend();
}
export default api;
export { ApiError } from './errors.js';
