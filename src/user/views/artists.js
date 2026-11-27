// ART-01 아티스트 카드 · 아티스트 검색 (12_아티스트_기획 · R-126~130, R-140)
import api from '../../shared/api/index.js';
import { photo, perfLine, subLine, IG_SVG as IG, SEARCH_SVG as SEARCH } from '../../shared/artist-ui.js';
import { nameKey } from '../../shared/domain.js';
import { esc, $, track } from '../ui.js';
import { S } from '../state.js';

export const isArtistOn = id => S.interests.some(i => i.artistId === id);
export { photo, perfLine, subLine };
/* 아티스트 카드: mine = 나의 내내 › 관심 아티스트 목록용 (아이콘 아래 '공연 검색' 버튼, R-140) */
export function artistCard(c, { mine = false, from = 'search' } = {}) {
  const on = isArtistOn(c.id); const sub = subLine(c);
  return `<article class="ar-card">
    <button type="button" class="ar-main" data-act="artist-schedule" data-name="${esc(c.name)}" aria-label="${esc(c.name)} 공연 일정 보기">${photo(c)}
      <span class="ar-body"><span class="ar-name"><b>${esc(c.name)}</b><em>${c.kind === 'solo' ? '개인' : '그룹'}</em></span>${sub ? `<small>${esc(sub)}</small>` : ''}<small class="ar-perf">${perfLine(c)}</small></span></button>
    <span class="ar-side"><span class="ar-icons">${c.instagram ? `<a class="ar-ic" href="https://www.instagram.com/${encodeURIComponent(c.instagram)}/" target="_blank" rel="noopener noreferrer" aria-label="${esc(c.name)} 인스타그램" data-track="artist_instagram" data-item="${esc(c.id)}">${IG}</a>` : ''}
      <button type="button" class="ar-ic heart${on ? ' on' : ''}" data-act="interest-artist" data-id="${esc(c.id)}" data-name="${esc(c.name)}" data-from="${from}" aria-pressed="${on}" aria-label="${on ? '관심 아티스트에서 빼기' : '관심 아티스트로 담기'}">${on ? '♥' : '♡'}</button></span>
      ${mine ? `<button type="button" class="ar-search" data-act="artist-schedule" data-name="${esc(c.name)}">${SEARCH}공연 검색</button>` : ''}</span></article>`;
}
/* 이름으로만 담아 둔 관심 아티스트 (이전 데이터, R-135) */
export const pendingCard = i => `<article class="ar-card muted"><span class="ar-main">${photo({ id: i.name, name: '?' })}
  <span class="ar-body"><span class="ar-name"><b>${esc(i.name)}</b><em>등록 요청 중</em></span><small>운영자가 확인하면 자동으로 연결됩니다</small></span></span>
  <span class="ar-side"><span class="ar-icons"><button type="button" class="ar-ic heart on" data-act="interest" data-name="${esc(i.name)}" data-from="my" aria-pressed="true" aria-label="관심 아티스트에서 빼기">♥</button></span></span></article>`;

export const reportArtistCta = q => `<a class="report-cta" href="#/report/artist" data-act="report-artist" data-name="${esc(q || '')}"><span><b>찾는 아티스트가 없습니까?</b><small>아티스트를 제보해 주세요. 확인 후 등록해 드립니다.</small></span><i aria-hidden="true">›</i></a>`;

/* 검색: 입력이 멈추고 0.25초 뒤, 같은 검색어는 다시 부르지 않음 */
const cache = new Map(); let timer = null; let seq = 0;
export function searchArtists(q, cb, delay = 250) {
  clearTimeout(timer); const k = nameKey(q);
  if (!k) { cb([], ''); return; }
  if (cache.has(k)) { cb(cache.get(k), q); return; }
  const my = ++seq;
  timer = setTimeout(async () => {
    let list = [];
    try { list = await api.artists.search(q, 20); cache.set(k, list); track('artist_search', { value: String(k.length) }); } catch { list = []; }
    if (my === seq) cb(list, q);
  }, delay);
}
export const clearArtistCache = () => cache.clear();

/* 공연 일정 아래 아티스트 결과 (R-127: 최대 5명 + 더 보기) */
export function drawScheduleArtists(q) {
  const box = $('#artistSec'); const jump = $('#artistJump'); if (!box) return;
  if (!nameKey(q)) { box.innerHTML = ''; if (jump) jump.hidden = true; return; }
  searchArtists(q, (list, asked) => {
    if (!$('#artistSec') || nameKey(asked) !== nameKey($('#q')?.value || '')) return;
    const more = box.dataset.more === '1';
    box.innerHTML = `<h2 class="res-head">아티스트 <span class="count">${list.length}</span></h2>
      ${list.length ? `<div class="ar-list">${list.slice(0, more ? 20 : 5).map(c => artistCard(c, { from: 'schedule' })).join('')}</div>
        ${list.length > 5 && !more ? `<button class="btn ghost block" type="button" data-act="artist-more">아티스트 더 보기 (${list.length - 5})</button>` : ''}` : ''}
      ${reportArtistCta(q)}`;
    if (jump) { jump.hidden = !list.length; jump.textContent = `아티스트 ${list.length}명 ↓`; }
  });
}
