// 08 API 명세 §1 오류 코드
export class ApiError extends Error {
  constructor(code, message) { super(message || '잠시 후 다시 시도해 주세요.'); this.code = code || 'server'; }
}
export const fail = (code, message) => { throw new ApiError(code, message); };
// Supabase(PostgREST) 오류 → ApiError. DB 함수는 'code|문구' 형식으로 던짐
export function fromSupabase(error) {
  if (!error) return null;
  const msg = String(error.message || '');
  const m = msg.match(/^(unauthorized|forbidden|not_found|validation|conflict|rate_limited|server)\|(.+)$/);
  if (m) return new ApiError(m[1], m[2]);
  if (error.code === '23505') return new ApiError('conflict', '이미 담겨 있어요.');
  if (error.code === '42501' || /row-level security|permission denied/i.test(msg)) return new ApiError('forbidden', '권한이 없어요.');
  if (/JWT|not authenticated/i.test(msg)) return new ApiError('unauthorized', '로그인이 필요해요.');
  return new ApiError('server', '잠시 후 다시 시도해 주세요.');
}
