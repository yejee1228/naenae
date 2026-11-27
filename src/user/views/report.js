// RPT-01 공연·아티스트 제보 · RPT-02 내 제보 · SHT-07 제보 완료 · SHT-09 등록 실패 이유 · SHT-10 내 제보 내용 (R-70~77, R-131·140)
import api from '../../shared/api/index.js';
import { L } from '../../shared/lib.js';
import { REPORT_STATUS, validateReport, kstToday, nameKey } from '../../shared/domain.js';
import { artistBox, SEARCH_SVG } from '../../shared/artist-ui.js';
import { esc, page, $, sheet, track, toast, errMsg } from '../ui.js';
import { S } from '../state.js';
import { searchArtists } from './artists.js';
const kstStamp = iso => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));
const KIND_LABEL = { opening: '티켓 오픈 소식', performance: '공연 일정', artist: '아티스트' };

let mine = [];
let prefill = null;
// 아티스트 제보 상태: 그룹이면 소속 아티스트(멤버), 개인이면 소속 그룹 (둘 다 선택, R-131)
const AR = { kind: 'opening', artistKind: 'group', members: [], group: null, title: '', sourceUrl: '', note: '' };
const resetAR = () => Object.assign(AR, { artistKind: 'group', members: [], group: null, title: '', sourceUrl: '', note: '' });
export function setArtistPrefill(name) { resetAR(); AR.kind = 'artist'; AR.title = String(name || '').trim().slice(0, 40); }

const kindSelect = k => `<label>제보 종류 *<select name="kind">${Object.entries(KIND_LABEL).map(([v, n]) => `<option value="${v}"${k === v ? ' selected' : ''}>${n}</option>`).join('')}</select></label>`;
const MEMO_HINT = '다른 이름표기나 최근 공연(일시, 장소 등 자세할수록 좋습니다) 등 아티스트를 설명할 수 있는 내용을 적어주세요';
function artistForm() {
  const group = AR.artistKind === 'group';
  const chips = group
    ? AR.members.map((m, i) => `<span class="pick-chip${m.id ? '' : ' name-only'}">${esc(m.name)}${m.id ? (m.sub ? ` · ${esc(m.sub)}` : '') : ' (이름만)'}<button type="button" data-act="report-chip-remove" data-i="${i}" aria-label="${esc(m.name)} 빼기">×</button></span>`).join('')
    : AR.group ? `<span class="pick-chip${AR.group.id ? '' : ' name-only'}">${esc(AR.group.name)}${AR.group.id ? '' : ' (목록에 없는 그룹)'}<button type="button" data-act="report-chip-remove" data-i="0" aria-label="소속 그룹 빼기">×</button></span>` : '';
  return `${kindSelect('artist')}
    <label>아티스트 이름 * <small>${group ? '활동명이나 그룹명' : '활동명'}</small><input type="text" name="title" required maxlength="40" value="${esc(AR.title)}"></label>
    <div class="seg2" role="group" aria-label="그룹입니까, 개인입니까?"><span class="lbl">그룹입니까, 개인입니까?</span>
      <button type="button" data-act="report-artist-kind" data-v="group" aria-pressed="${group}">그룹 (밴드 · 듀오 등)</button><button type="button" data-act="report-artist-kind" data-v="solo" aria-pressed="${!group}">개인</button></div>
    <div class="pick-sec"><span class="lbl">${group ? '소속 아티스트' : '소속 그룹'} <small>${group ? '선택 · 멤버를 찾아 체크하거나 이름으로 추가' : '선택 · 입력하면 등록된 그룹을 찾아 드립니다'}</small></span>
      ${chips ? `<div class="pick-chips">${chips}</div>` : ''}
      ${group || !AR.group ? `<div class="pick-box"><label class="pick-search">${SEARCH_SVG}<input id="pickQ" type="search" placeholder="${group ? '멤버 이름으로 찾기' : '예: 그룹 이름'}" autocomplete="off" aria-label="${group ? '소속 아티스트 찾기' : '소속 그룹 찾기'}"></label><div id="pickResults"></div></div>` : ''}
      <small class="muted">${group ? '체크한 멤버는 등록된 아티스트로, 이름으로 추가한 멤버는 운영자가 확인합니다.' : '고르면 등록된 그룹과 연결되고, 그대로 쓰면 운영자가 확인합니다.'}</small></div>
    <label>인스타그램 또는 참고 링크 * <small>운영자가 아티스트를 확인할 때 씁니다</small><input type="url" name="sourceUrl" inputmode="url" placeholder="https://" value="${esc(AR.sourceUrl)}"></label>
    <label>메모 <small>선택 · 300자</small><textarea name="note" maxlength="300" rows="4" placeholder="${esc(MEMO_HINT)}">${esc(AR.note)}</textarea></label>
    <p class="ferr" id="reportErr" role="alert"></p><button class="btn primary block" type="submit">제보 보내기</button>`;
}
function eventForm(p) {
  const opening = p.kind !== 'performance'; const [od = '', ot = ''] = String(p.openAtText || '').split(/[ T]/);
  return `${kindSelect(opening ? 'opening' : 'performance')}
      <label>공연명 *<input type="text" name="title" required maxlength="80" value="${esc(p.title || '')}"></label>
      <label>아티스트 <small>쉼표로 구분</small><input type="text" name="artists" maxlength="100" value="${esc((p.artists || []).join(', '))}"></label>
      <label>공연장<input type="text" name="venue" maxlength="40" value="${esc(p.venue || '')}"></label>
      <label>공연 날짜 *<input type="date" name="showDate" required min="2000-01-01" max="2099-12-31" value="${esc(p.showDate || '')}"></label>
      <div class="open-row"><label><span>티켓 오픈 날짜<span class="req-open">${opening ? ' *' : ''}</span></span><input type="date" name="openDate" min="2000-01-01" max="2099-12-31" value="${esc(od)}"></label>
        <label>오픈 시간 <small>선택</small><input type="time" name="openTime" value="${esc(ot.slice(0, 5))}"></label></div>
      <label>예매 링크<input type="url" name="ticketUrl" inputmode="url" placeholder="https://" value="${esc(p.ticketUrl || '')}"></label>
      <label>출처 링크 <small>공지 게시물 · 인스타그램 등</small><input type="url" name="sourceUrl" inputmode="url" placeholder="https://" value="${esc(p.sourceUrl || '')}"></label>
      <label>메모<textarea name="note" maxlength="300" rows="3">${esc(p.note || '')}</textarea></label>
      <p class="ferr" id="reportErr" role="alert"></p><button class="btn primary block" type="submit">제보하기</button>`;
}
export function renderReport(id) {
  if (!api.auth.current()) { location.replace('#/my'); return; }
  track('report_view');
  if (id === 'artist') AR.kind = 'artist'; else if (AR.kind === 'artist' && !id) AR.kind = 'opening';
  const p = prefill || {}; prefill = null;
  if (p.kind === 'artist') { setArtistPrefill(p.title); AR.sourceUrl = p.sourceUrl || ''; AR.note = p.note || ''; AR.artistKind = p.artistKind === 'solo' ? 'solo' : 'group'; }
  else if (p.kind) AR.kind = p.kind;
  const artist = AR.kind === 'artist';
  page('open', `<section class="intro compact report-head"><div><p class="eyebrow">REPORT</p><h1>${artist ? '아티스트 제보하기' : '공연 제보하기'}</h1></div>${mine.length ? `<a class="link" href="#/report/mine">내 제보 ${mine.length}</a>` : ''}
    <p class="muted small">${artist ? '찾는 아티스트가 없으면 알려 주세요. 운영자가 확인한 뒤 등록해 드립니다.' : '티켓 오픈 소식이나 아직 없는 공연을 알려 주세요. 운영자가 확인한 뒤 올려 드립니다.'}</p></section>
    <form class="form report-form" id="reportForm" autocomplete="off" novalidate data-kind="${artist ? 'artist' : 'event'}">${artist ? artistForm() : eventForm({ ...p, kind: AR.kind })}
      <p class="hint">제보한 내용은 확인 과정에서 다듬어져 올라갈 수 있습니다.</p></form>`, { back: artist ? '#/my/artists' : '#/open' });
  const f = $('#reportForm');
  f.elements.kind.addEventListener('change', e => {
    const k = e.target.value; const was = AR.kind; captureAR(); AR.kind = k;
    if (k !== 'artist' && was !== 'artist') { const r = $('.req-open'); if (r) r.textContent = k === 'opening' ? ' *' : ''; return; }
    renderReport(k === 'artist' ? 'artist' : '');
  });
  if (artist && $('#pickQ')) { $('#pickQ').addEventListener('input', e => drawPicks(e.target.value)); }
  if (artist) f.addEventListener('change', e => { if (e.target.dataset.memberId) toggleMember(e.target); });
  api.reports.listMine().then(r => { mine = r; }).catch(() => {});
}
function captureAR() {
  const f = $('#reportForm'); if (!f || f.dataset.kind !== 'artist') return;
  AR.title = String(f.elements.title.value || '').trim(); AR.sourceUrl = String(f.elements.sourceUrl.value || '').trim(); AR.note = String(f.elements.note.value || '');
}
let lastPick = [];
function drawPicks(q) {
  const box = $('#pickResults'); if (!box) return;
  const group = AR.artistKind === 'group'; const name = String(q || '').trim();
  if (!nameKey(name)) { box.innerHTML = ''; return; }
  searchArtists(name, (list, asked) => {
    if (!$('#pickResults') || asked !== ($('#pickQ')?.value || '').trim()) return;
    lastPick = list.filter(c => c.kind === (group ? 'solo' : 'group'));
    box.innerHTML = lastPick.map(c => group
      ? artistBox(c, { control: `<input type="checkbox" data-member-id="${esc(c.id)}"${AR.members.some(m => m.id === c.id) ? ' checked' : ''} aria-label="${esc(c.name)} 선택">`, selected: AR.members.some(m => m.id === c.id) })
      : artistBox(c, { tag: 'button', attrs: `type="button" data-act="report-group-pick" data-id="${esc(c.id)}"` })).join('')
      + `<button type="button" class="pick-add" data-act="${group ? 'report-member-add' : 'report-group-pick'}" data-name="${esc(name)}">${group ? `+ ‘${esc(name)}’ 이름으로 추가 (목록에 없을 때)` : `‘${esc(name)}’ 그대로 쓰기 (목록에 없는 그룹)`}</button>`;
  });
}
function toggleMember(input) {
  const c = lastPick.find(x => x.id === input.dataset.memberId); if (!c) return;
  AR.members = input.checked ? [...AR.members.filter(m => m.id !== c.id), { id: c.id, name: c.name, sub: c.disambig || '' }] : AR.members.filter(m => m.id !== c.id);
  rerenderArtistForm(true);
}
function rerenderArtistForm(keepPick) {
  const q = $('#pickQ')?.value || ''; captureAR(); renderReport('artist');
  if (keepPick && q && $('#pickQ')) { $('#pickQ').value = q; $('#pickQ').focus(); drawPicks(q); }
}
export function reportFormAction(act, a) {
  if (act === 'report-artist-kind') { AR.artistKind = a.dataset.v === 'solo' ? 'solo' : 'group'; AR.members = []; AR.group = null; rerenderArtistForm(false); }
  else if (act === 'report-member-add') { const n = String(a.dataset.name || '').trim(); if (n && !AR.members.some(m => !m.id && nameKey(m.name) === nameKey(n)) && AR.members.length < 20) AR.members.push({ name: n.slice(0, 40) }); if ($('#pickQ')) $('#pickQ').value = ''; rerenderArtistForm(false); }
  else if (act === 'report-group-pick') {
    const c = a.dataset.id && lastPick.find(x => x.id === a.dataset.id);
    AR.group = c ? { id: c.id, name: c.name } : { name: String(a.dataset.name || '').trim().slice(0, 40) }; rerenderArtistForm(false);
  } else if (act === 'report-chip-remove') { if (AR.artistKind === 'group') AR.members.splice(Number(a.dataset.i), 1); else AR.group = null; rerenderArtistForm(false); }
}
export async function submitReport(form) {
  const f = new FormData(form); const v = k => String(f.get(k) || '').trim();
  let input;
  if (form.dataset.kind === 'artist') {
    captureAR();
    input = { kind: 'artist', title: AR.title, artistKind: AR.artistKind, sourceUrl: AR.sourceUrl, note: AR.note.trim(),
      artistGroup: AR.artistKind === 'solo' && AR.group ? (AR.group.id ? { id: AR.group.id, name: AR.group.name } : { name: AR.group.name }) : null,
      artistMembers: AR.artistKind === 'group' ? AR.members.map(m => (m.id ? { id: m.id, name: m.name } : { name: m.name })) : [] };
    const msg = !input.title ? '아티스트 이름을 입력해 주세요.' : !/^https?:\/\/\S+$/.test(input.sourceUrl) ? '인스타그램 또는 참고 링크를 https:// 주소로 알려 주세요.' : '';
    $('#reportErr').textContent = msg; if (msg) return;
  } else {
    input = { kind: v('kind'), title: v('title'), artists: v('artists').split(/[,·/]/).map(s => s.trim()).filter(Boolean), venue: v('venue'), showDate: v('showDate'), openAtText: v('openDate') ? (v('openDate') + (v('openTime') ? ' ' + v('openTime') : '')) : '', ticketUrl: v('ticketUrl'), sourceUrl: v('sourceUrl'), note: v('note') };
    const msg = validateReport(input); $('#reportErr').textContent = msg; if (msg) return;
  }
  try {
    await api.reports.create(input); track('report_submit', { value: input.kind }); form.reset(); if (input.kind === 'artist') { resetAR(); renderReport('artist'); }
    sheet(`<p class="eyebrow">THANK YOU</p><h2>제보 감사합니다!</h2><p class="small muted">운영자가 확인한 뒤 ${input.kind === 'artist' ? '등록해' : '올려'} 드리겠습니다. 처리 상황은 내 제보에서 볼 수 있습니다.</p><a class="btn primary block" href="#/report/mine" data-act="close-sheet">내 제보 보기</a>`);
  } catch (e) { $('#reportErr').textContent = errMsg(e); }
}
const registeredLine = r => {
  if (r.registeredArtistId) {   // R-140: 담기 버튼은 등록된 뒤에만
    const on = S.interests.some(i => i.artistId === r.registeredArtistId);
    return `아티스트로 등록되었습니다. ${on ? '<span class="muted">관심 아티스트에 있습니다</span>' : `<button class="btn small" type="button" data-act="interest-artist" data-id="${esc(r.registeredArtistId)}" data-name="${esc(r.title)}" data-from="report">♡ 관심 아티스트로 담기</button>`}`;
  }
  return `${r.registeredOpeningId ? '오픈 공지에' : '공연 일정에'} 올라갔습니다. <a class="link" href="${r.registeredOpeningId ? '#/open' : '#/perf/' + encodeURIComponent(r.registeredPerformanceId || '')}">보러 가기 ›</a>`;
};
const card = r => {
  const st = REPORT_STATUS[r.status] || REPORT_STATUS.submitted;
  const line = r.status === 'registered' ? registeredLine(r)
    : r.status === 'rejected' ? `${esc(st.line)} <button class="link" type="button" data-act="report-reason" data-id="${esc(r.id)}">이유 보기</button>`
      : r.status === 'submitted' ? `${esc(st.line)} <button class="link" type="button" data-act="report-cancel" data-id="${esc(r.id)}">제보 취소</button>` : esc(st.line);
  return `<article class="rp${r.userSeen === false ? ' unseen' : ''}"><button type="button" class="rp-main" data-act="report-detail" data-id="${esc(r.id)}">
    <span class="op-top"><span class="badge ${st.badge}">${esc(st.label)}</span><span class="ev-tag">${KIND_LABEL[r.kind] || KIND_LABEL.opening}</span>${r.userSeen === false ? '<i class="dot" aria-label="새 소식"></i>' : ''}</span>
    <b>${esc(r.title)}</b><small>${esc(L.fmtDayKo(kstToday(new Date(r.createdAt))))} 제보</small></button><p class="rp-line">${line}</p></article>`;
};
export async function renderMyReports() {
  if (!api.auth.current()) { location.replace('#/my'); return; }
  track('report_mine_view');
  try { mine = (await api.reports.listMine()).filter(r => r.status !== 'canceled'); } catch (e) { toast(errMsg(e)); mine = []; }
  page('my', `<section class="intro compact"><p class="eyebrow">MY REPORT</p><h1>내 제보</h1></section>
    ${mine.length ? `<div class="rp-list">${mine.map(card).join('')}</div>` : '<div class="empty">아직 제보한 내용이 없습니다.<br><a class="btn small" href="#/report">제보하러 가기</a></div>'}
    ${mine.length ? '<a class="btn ghost block" href="#/report">새로 제보하기</a>' : ''}`, { back: '#/settings' });
  if (mine.some(r => r.userSeen === false) || api.auth.current()?.reportUnseen) api.reports.markSeen().catch(() => {});   // R-76: 한 번 보면 사라짐
}
export function reportAction(act, id) {
  const r = mine.find(x => x.id === id); if (!r) return;
  if (act === 'report-reason') {
    track('report_reason_open');
    sheet(`<h2>등록하지 못했습니다</h2><p class="small muted">${esc(r.title)}</p><p>${esc(r.rejectReason || '')}</p><p class="small muted">다른 정보로 다시 제보할 수 있습니다.</p><button class="btn primary block" type="button" data-act="report-retry" data-id="${esc(r.id)}">다시 제보하기</button>`);
  } else if (act === 'report-detail') {
    const st = REPORT_STATUS[r.status];
    const rows = r.kind === 'artist'
      ? [['종류', '아티스트'], ['아티스트 이름', r.title], ['그룹/개인', r.artistKind === 'solo' ? '개인' : '그룹'], ['소속 그룹', r.artistGroup?.name || ''], ['소속 아티스트', (r.artistMembers || []).map(m => m.name).filter(Boolean).join(', ')], ['링크', r.sourceUrl], ['메모', r.note]]
      : [['종류', KIND_LABEL[r.kind] || KIND_LABEL.opening], ['공연명', r.title], ['아티스트', (r.artists || []).join(', ')], ['공연장', r.venue], ['공연 날짜', r.showDate], ['티켓 오픈', r.openAtText], ['예매 링크', r.ticketUrl], ['출처 링크', r.sourceUrl], ['메모', r.note]];
    sheet(`<h2>내 제보 내용</h2><p class="small muted">${esc(st.label)} · ${esc(kstStamp(r.createdAt))} 제보</p><dl class="kv">
      ${rows.filter(([, v]) => v).map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`);
  } else if (act === 'report-retry') { prefill = r; location.hash = r.kind === 'artist' ? '#/report/artist' : '#/report'; }
}
export async function cancelReport(id) {
  try { await api.reports.cancel(id); track('report_cancel'); toast('제보를 취소했습니다.'); await renderMyReports(); } catch (e) { toast(errMsg(e)); }
}
export { S };
