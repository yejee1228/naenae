// 아티스트 카드·박스 공통 조각 (ART-01 사용자 카드 · ART-02 관리자·제보용 박스, 12_아티스트_기획 §5)
// DOM 없이 HTML 문자열만 만듦 → 사용자 화면(src/user)과 관리자 페이지(src/admin)가 함께 씀
import { kstToday } from './domain.js';

export const escA = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const TONES = ['#d9cce6', '#cfe0ea', '#f0d9c8', '#d5e6cf', '#eadcc9', '#e3d3ea'];
const tone = id => TONES[[...String(id)].reduce((n, c) => n + c.charCodeAt(0), 0) % TONES.length];
const WD = ['일', '월', '화', '수', '목', '금', '토'];
const wd = ymd => { const [y, m, d] = String(ymd).split('-').map(Number); return WD[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]; };
const dayLine = p => `${String(p.date || '').slice(5).replace('-', '.')} (${wd(p.date)}) · ${p.venue || ''}`;
export const IG_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r=".6"/></svg>';
export const SEARCH_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>';

/* 사진 (없으면 이름 첫 글자, R-133) */
export const photo = (c, size = '') => (c.photoUrl
  ? `<span class="ar-photo ${size}" style="background-image:url('${escA(c.photoUrl)}')" role="img" aria-label="${escA(c.name)} 사진"></span>`
  : `<span class="ar-photo ${size}" style="--c:${tone(c.id || c.name)}" aria-hidden="true">${escA(String(c.name || '?').slice(0, 1))}</span>`);
export const emptyPhoto = (size = '') => `<span class="ar-photo empty ${size}" aria-hidden="true"></span>`;
/* 다음 공연 → 최근 공연 → 없음 (R-128) */
export function perfLine(c, t = kstToday()) {
  if (c.next) return `<b>${c.next.date < t ? '진행 중' : '다음 공연'}</b> ${escA(dayLine(c.next))}`;
  if (c.last) return `<b>최근 공연</b> ${escA(dayLine(c.last))}`;
  return '등록된 공연 없음';
}
/* 둘째 줄: 개인이면 소속 그룹 + 구분 문구, 그룹이면 구분 문구 */
export const subLine = c => [c.kind === 'solo' && (c.groups || []).length ? '소속 ' + c.groups.map(g => g.name).join(' · ') : '', c.disambig].filter(Boolean).join(' · ');
export const kindLabel = c => (c.kind === 'solo' ? '개인' : '그룹');
export const igLink = c => (c.instagram ? `<a class="ar-ic" href="https://www.instagram.com/${encodeURIComponent(c.instagram)}/" target="_blank" rel="noopener noreferrer" aria-label="${escA(c.name)} 인스타그램">${IG_SVG}</a>` : '');

/* ART-02 박스: 사진 44 · 이름 · 그룹/개인 · 구분 문구 · 공연 · 인스타그램. control = 체크박스·라디오 등 앞에 붙는 것 */
export function artistBox(c, { control = '', selected = false, note = '', tag = 'label', attrs = '' } = {}) {
  const sub = [kindLabel(c), subLine(c)].filter(Boolean).join(' · ');
  return `<${tag} class="ar-box${selected ? ' sel' : ''}" ${attrs}>${control}${photo(c, 'sm')}
    <span class="ar-body"><b>${escA(c.name)}</b><small>${escA(sub)}</small><small class="ar-perf">${perfLine(c)}</small>${note ? `<small class="ar-note">${note}</small>` : ''}</span>${tag === 'button' || tag === 'a' ? '' : igLink(c)}</${tag}>`;
}
