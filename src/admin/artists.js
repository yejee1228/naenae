// 관리자 페이지 — 아티스트 (ADM-08, 12_아티스트_기획 §5-6 · R-120~139)
// 등록된 아티스트 · 후보 검수(승인·합치기·제외) · 공연 연결 확인 · 공연/공지 수정의 아티스트 박스
import api from '../shared/api/index.js';
import { nameKey, kstToday } from '../shared/domain.js';
import { artistBox, photo, emptyPhoto, perfLine, subLine, kindLabel, igLink, escA as esc } from '../shared/artist-ui.js';
import { renderImport, importFile, importAction } from './artist-import.js';

let ui = null;   // main.js가 넘겨줌: { main, head, sheet, closeSheet, toast, errMsg, fieldErr }
export const initArtists = u => { ui = u; };
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const splitList = s => String(s || '').split(/[,·]/).map(x => x.trim()).filter(Boolean);
const fmtD = ymd => (ymd ? String(ymd).slice(2).replaceAll('-', '.') : '-');
const A = { all: null, perfs: null, openings: null, q: '', cq: '', ignored: false, cands: [], prefill: null, returnTo: '', fromReport: null, form: null, link: null };
export const artistState = A;

async function loadAll(force) { if (!A.all || force) A.all = await api.admin.artists.list('', 'all'); return A.all; }
async function loadPerfs(force) {
  if (!A.perfs || force) [A.perfs, A.openings] = await Promise.all([api.admin.performances.list(), api.admin.openings.list()]);
}
export const resetArtistCache = () => { A.all = null; A.perfs = null; A.openings = null; };
const byId = id => (A.all || []).find(a => a.id === id);
const keysOf = a => [a.name, ...(a.aliases || [])].map(nameKey);
const sameName = n => (A.all || []).filter(a => a.status === 'active' && keysOf(a).includes(nameKey(n)));
const unlinked = row => (row.artists || []).filter(n => !(row.links || []).some(l => nameKey(l.name) === nameKey(n)));
const tabs = (on, nLinks) => `<div class="adm-tools"><div class="adm-chips" role="tablist" aria-label="아티스트 화면">${[['', '등록된 아티스트'], ['candidates', '후보 검수'], ['links', `공연 연결 확인${nLinks != null ? ' ' + nLinks : ''}`], ['import', '한 번에 등록 (베타)']]
  .map(([k, n]) => `<a role="tab" class="chip${on === k ? ' on' : ''}" aria-selected="${on === k}" href="#/artists${k ? '/' + k : ''}">${n}</a>`).join('')}</div></div>`;
const upcoming = () => { const t = kstToday(); return (A.perfs || []).filter(p => !p.hidden && p.endDate >= t); };

/* ---------- 라우트 ---------- */
export async function renderArtists(sub, id) {
  if (sub === 'edit') return renderArtistForm(id);
  A.returnTo = ''; A.fromReport = null;
  await Promise.all([loadAll(true), loadPerfs(true)]);
  if (sub === 'candidates') return renderCandidates();
  if (sub === 'import') return renderImport({ ui, tabsHtml: tabs('import', upcoming().filter(p => unlinked(p).length).length), all: () => A.all, reload: () => loadAll(true) });
  if (sub === 'links') return renderLinkCheck();
  return renderArtistList();
}

/* 등록된 아티스트 */
function renderArtistList() {
  const nLinks = upcoming().filter(p => unlinked(p).length).length;
  ui.main().innerHTML = ui.head('아티스트', '운영자가 확인한 아티스트만 사용자 검색에 나와요. 지우지 않고 숨겨요.', '<a class="btn primary small" href="#/artists/edit/new">+ 아티스트 등록</a>')
    + tabs('', nLinks) + `<div class="adm-tools"><input type="search" data-asearch="list" placeholder="이름·별칭 검색" value="${esc(A.q)}" aria-label="아티스트 검색"></div><div id="arList"></div>`;
  drawArtistList();
}
export function drawArtistList() {
  const k = nameKey(A.q); const list = (A.all || []).filter(a => !k || keysOf(a).some(x => x.includes(k)));
  $('#arList').innerHTML = `<p class="small muted" style="margin:0 0 8px">${list.length}팀</p>${list.length ? `<div class="adm-ar-grid">${list.map(a => artistBox(a, { tag: 'a', attrs: `href="#/artists/edit/${encodeURIComponent(a.id)}"`, note: [a.status === 'hidden' ? '숨김' : '', a.aliases?.length ? '별칭 ' + esc(a.aliases.join(', ')) : '', `연결된 공연 ${a.perfCount || 0}`].filter(Boolean).join(' · ') })).join('')}</div>`
    : `<p class="adm-empty">${A.all?.length ? '맞는 아티스트가 없어요.' : '아직 등록된 아티스트가 없어요. 후보 검수에서 확인한 아티스트부터 등록해 주세요.'}</p>`}`;
}

/* 후보 검수 (R-124): KOPIS 공연명에서 자동으로 뽑은 이름(사용자 제보 아님)을 운영자가 확인
   검수 = 등록 화면으로 · 합치기 = 다른 표기로 · 제외 = 누른 상태로 목록 맨 아래 (다시 누르면 되살림) · 줄을 누르면 확인·수정 창 */
async function renderCandidates() {
  ui.main().innerHTML = ui.head('아티스트', 'KOPIS 공연명에서 자동으로 뽑은 이름 중 아직 등록되지 않은 이름이에요. 확인한 아티스트만 검수해 주세요.', '<a class="btn primary small" href="#/artists/edit/new">+ 아티스트 등록</a>')
    + tabs('candidates', upcoming().filter(p => unlinked(p).length).length)
    + `<div class="adm-tools"><input type="search" data-asearch="cand" placeholder="이름 검색" value="${esc(A.cq)}" aria-label="후보 검색"></div><div id="candList"><p class="loading">불러오는 중…</p></div>`;
  const [pending, ignored] = await Promise.all([api.admin.artists.candidates('', 'pending'), api.admin.artists.candidates('', 'ignored')]);
  A.cands = [...pending, ...ignored.map(c => ({ ...c, ignored: true }))];   // 제외한 이름은 맨 아래
  drawCandidates();
}
export function drawCandidates() {
  const k = nameKey(A.cq); const rows = A.cands.filter(c => !k || c.nameKey.includes(k));
  const show = [...rows.filter(c => !c.ignored).slice(0, 200), ...rows.filter(c => c.ignored)];
  const cols = '--cols: minmax(0,1.3fr) 64px minmax(0,2fr) minmax(0,1.4fr) 200px';
  $('#candList').innerHTML = `<p class="small muted" style="margin:0 0 8px">${rows.filter(c => !c.ignored).length}개${rows.some(c => c.ignored) ? ` · 제외 ${rows.filter(c => c.ignored).length}개 (맨 아래)` : ''}</p><div class="adm-list"><div class="adm-row head" style="${cols}"><span>공연명에서 뽑은 이름</span><span>공연</span><span>예시 공연</span><span>비슷한 등록 아티스트</span><span>처리</span></div>
    ${show.map(c => `<div class="adm-row click${c.ignored ? ' muted-row' : ''}" style="${cols}" data-act="ar-cand-open" data-name="${esc(c.name)}" tabindex="0" role="button" aria-label="${esc(c.name)} 확인·수정"><span class="t">${esc(c.name)}</span><span class="sub">${c.perfCount}</span><span class="sub">${esc(c.sample || '')}</span>
      <span class="sub">${c.similar?.length ? c.similar.map(s => esc(s.name + (s.disambig ? ` (${s.disambig})` : ''))).join(', ') : '없음'}</span>
      <span class="cell-actions">${c.ignored ? '' : `<button class="btn small primary" type="button" data-act="ar-approve" data-name="${esc(c.name)}" title="등록 화면에서 확인한 뒤 저장">검수</button><button class="btn small" type="button" data-act="ar-merge" data-name="${esc(c.name)}">합치기</button>`}<button class="btn small ghost${c.ignored ? ' on' : ''}" type="button" data-act="${c.ignored ? 'ar-unignore' : 'ar-ignore'}" data-name="${esc(c.name)}" aria-pressed="${!!c.ignored}" title="${c.ignored ? '다시 누르면 되살려요' : '아티스트 이름이 아니에요'}">제외</button></span></div>`).join('') || '<p class="adm-empty">후보가 없어요.</p>'}</div>
    <p class="small muted">검수 = 등록 화면에서 유형·구분 문구·연결할 공연을 확인하고 저장 · 합치기 = 이미 있는 아티스트의 다른 표기(별칭)로 · 제외 = 아티스트 이름이 아님 (맨 아래로, 다시 누르면 되살림 · 다음 수집 때도 다시 안 올림)<br>줄을 누르면 유형·구분 문구·별칭·연결할 공연을 확인하고 고친 뒤 저장할 수 있어요.</p>`;
}

/* 공연 연결 확인 (R-125): 앞으로의 공연 중 아티스트와 연결 안 된 이름이 있는 공연 */
function renderLinkCheck() {
  const rows = upcoming().filter(p => unlinked(p).length).sort((a, b) => a.startDate.localeCompare(b.startDate));
  const cols = '--cols: 90px minmax(0,2fr) minmax(0,2fr)';
  ui.main().innerHTML = ui.head('아티스트', '앞으로의 공연 중 아티스트가 연결되지 않은 이름이 있는 공연이에요. 누르면 공연 수정에서 연결할 수 있어요.')
    + tabs('links', rows.length) + `<div class="adm-list"><div class="adm-row head" style="${cols}"><span>공연일</span><span>공연명</span><span>연결 안 된 이름</span></div>
    ${rows.slice(0, 300).map(p => `<div class="adm-row click" style="${cols}" data-href="#/performances/${encodeURIComponent(p.id)}" tabindex="0"><span class="sub">${esc(fmtD(p.startDate))}</span><span class="t">${esc(p.title)}</span>
      <span class="sub">${unlinked(p).map(n => { const s = sameName(n).length; return `${esc(n)}${s > 1 ? ` <span class="warn">(같은 이름 ${s}명)</span>` : s === 1 ? ' <span class="muted">(등록됨 · 연결 필요)</span>' : ''}`; }).join(', ')}</span><span class="go" aria-hidden="true">›</span></div>`).join('') || '<p class="adm-empty">연결이 필요한 공연이 없어요.</p>'}</div>`;
}

/* ---------- 등록·수정 (R-120~123·133·137) ---------- */
async function renderArtistForm(id) {
  await Promise.all([loadAll(), loadPerfs()]);
  const isNew = id === 'new'; const src = isNew ? (A.prefill || {}) : byId(id);
  if (!src) { ui.main().innerHTML = '<p class="adm-empty">아티스트를 찾지 못했어요. <a class="link" href="#/artists">목록으로</a></p>'; return; }
  A.prefill = null; A.modal = null;
  startForm(src, isNew);
  const fr = A.fromReport;
  ui.main().innerHTML = ui.head(isNew ? '새 아티스트 등록' : '아티스트 수정', '', `<a class="link" href="${esc(A.returnTo || '#/artists')}">← ${A.returnTo ? '돌아가기' : '목록'}</a>`)
    + (fr ? `<p class="adm-note">제보 「${esc(fr.title)}」(${esc(fr.nickname || '')})에서 가져온 내용이에요. 등록하면 제보가 '등록 완료'로 바뀌어요.${fr.sourceUrl ? ` 참고 링크: <a class="link" href="${esc(fr.sourceUrl)}" target="_blank" rel="noopener noreferrer">${esc(fr.sourceUrl)} ↗</a>` : ''}${fr.note ? `<br>메모: ${esc(fr.note)}` : ''}</p>` : '')
    + formHtml(src, isNew, `${!isNew ? `<button class="btn ghost small left" type="button" data-act="ar-hide" data-id="${esc(src.id)}" data-on="${src.status === 'hidden' ? '0' : '1'}">${src.status === 'hidden' ? '숨김 해제' : '숨기기'}</button>` : ''}<button class="btn primary" type="submit">${fr ? '등록하고 제보 완료' : '저장'}</button>`);
  if (src.relIds) src.relIds.forEach(x => A.form.rel.set(x.id, x.name));
  drawRel(); drawLinkList(); drawSameName();
}
const startForm = (src, isNew) => { A.form = { id: isNew ? null : src.id, kind: src.kind || 'group', photoUrl: src.photoUrl || '', rel: new Map(((src.kind === 'solo' ? src.groups : src.members) || []).map(x => [x.id, x.name])), checked: null }; };

/* 후보 검수: 줄을 누르면 모달에서 확인·수정 → 저장(등록) · 합치기 · 삭제(제외) */
async function openCandidate(name) {
  await Promise.all([loadAll(), loadPerfs()]);
  const c = A.cands.find(x => x.name === name) || { name };
  A.modal = { cand: name }; startForm({ name }, true);
  const bar = `${c.ignored ? `<button class="btn ghost small left" type="button" data-act="ar-unignore" data-name="${esc(name)}">제외 풀기</button>` : `<button class="btn ghost small left danger-btn" type="button" data-act="ar-cand-delete" data-name="${esc(name)}">삭제</button>`}<button class="btn small" type="button" data-act="ar-merge" data-name="${esc(name)}">합치기</button><button class="btn primary" type="submit">저장</button>`;
  const m = ui.sheet(`<p class="eyebrow" style="margin:0">후보 검수 › 확인·수정</p><h2 style="margin:0">‘${esc(name)}’${c.ignored ? ' <span class="muted small">(제외한 이름)</span>' : ''}</h2>
    <p class="small muted" style="margin:0">공연 ${c.perfCount ?? 0}건${c.sample ? ` · 예: ${esc(c.sample)}` : ''}${c.similar?.length ? ` · 비슷한 등록 아티스트: ${esc(c.similar.map(s => s.name).join(', '))}` : ''}</p>`
    + formHtml({ name }, true, bar));
  m.querySelector('.modal-body').classList.add('wide');
  drawRel(); drawLinkList(); drawSameName();
}
function formHtml(src, isNew, bar, extra = '') {
  return `<form class="adm-form" id="artistForm" novalidate>
    <div class="full adm-ar-photo"><span id="arPhoto">${photo({ id: src.id || src.name || 'new', name: src.name || '?', photoUrl: A.form.photoUrl })}</span>
      <div style="display:grid;gap:6px;flex:1"><label>사진 <small>JPG·PNG·WEBP, 2MB 이하 · 사용 허락을 받은 사진만 (R-133)</small><input type="file" name="photoFile" accept="image/jpeg,image/png,image/webp"></label>
        <span class="fld-err" data-err="photo"></span>${A.form.photoUrl ? '<button class="link" type="button" data-act="ar-photo-clear" style="justify-self:start">사진 빼기</button>' : ''}
        <label>사진 출처 · 허락 <input type="text" name="photoCredit" maxlength="100" value="${esc(src.photoCredit || '')}" placeholder="예: 소속사 제공 (2026-12)"></label></div></div>
    <label>이름 *<input type="text" name="name" maxlength="40" value="${esc(src.name || '')}"><span class="fld-err" data-err="name"></span></label>
    <fieldset class="adm-seg"><legend>유형 *</legend><label><input type="radio" name="kind" value="group"${A.form.kind === 'group' ? ' checked' : ''}> 그룹</label><label><input type="radio" name="kind" value="solo"${A.form.kind === 'solo' ? ' checked' : ''}> 개인</label></fieldset>
    <label>구분 문구 <small>같은 이름이 있으면 필수 · 활동 형태 · 활동 지역 (예: 밴드 · 부산)</small><input type="text" name="disambig" maxlength="40" value="${esc(src.disambig || '')}"><span class="fld-err" data-err="disambig"></span><span class="small" id="sameNameNote"></span></label>
    <label>인스타그램 아이디 <small>주소를 붙여 넣어도 아이디만 저장해요</small><span class="row2"><span class="muted">@</span><input type="text" name="instagram" maxlength="80" value="${esc(src.instagram || '')}"></span><span class="fld-err" data-err="instagram"></span></label>
    <label class="full">별칭 <small>다른 표기 · 영문 이름, 쉼표로 구분 — 검색과 공연 연결에 같이 써요</small><input type="text" name="aliases" maxlength="300" value="${esc((src.aliases || []).join(', '))}"></label>
    <div class="full" id="relSec"></div>
    <div class="full"><p class="lbl" style="margin:0 0 6px">연결할 공연 <small>이 이름이 나온 공연이에요. 체크한 공연에만 연결돼요 (R-137)</small></p>
      <input type="search" id="linkQ" value="${esc(src.name || '')}" placeholder="공연명·아티스트 이름으로 찾기" aria-label="연결할 공연 찾기"><div class="adm-linklist" id="linkList"></div></div>
    ${extra}<p class="ferr full" id="formErr" role="alert"></p>
    <div class="bar">${bar}</div></form>`;
}
export function drawSameName() {
  const f = $('#artistForm'); if (!f) return; const n = f.elements.name.value.trim();
  const same = n ? (A.all || []).filter(a => a.id !== A.form.id && nameKey(a.name) === nameKey(n)) : [];
  $('#sameNameNote').innerHTML = same.length ? `<span class="warn">같은 이름이 이미 ${same.length}팀 있어요: ${same.map(a => esc(a.name + (a.disambig ? ` (${a.disambig})` : ' (구분 문구 없음)'))).join(', ')}</span>` : '';
}
/* 그룹이면 멤버(개인), 개인이면 소속 그룹 */
export function drawRel(q = '') {
  const box = $('#relSec'); if (!box) return; const group = A.form.kind === 'group';
  const k = nameKey(q); const pool = (A.all || []).filter(a => a.status === 'active' && a.id !== A.form.id && a.kind === (group ? 'solo' : 'group'));
  const hits = k ? pool.filter(a => keysOf(a).some(x => x.includes(k))).slice(0, 8) : [];
  box.innerHTML = `<p class="lbl" style="margin:0 0 6px">${group ? '멤버' : '소속 그룹'} <small>선택 · ${group ? '등록된 개인 아티스트와 연결' : '등록된 그룹과 연결'}</small></p>
    <div class="pick-chips">${[...A.form.rel].map(([id, n]) => `<span class="pick-chip">${esc(n)}<button type="button" data-act="ar-rel-remove" data-id="${esc(id)}" aria-label="${esc(n)} 빼기">×</button></span>`).join('')}</div>
    <input type="search" id="relQ" value="${esc(q)}" placeholder="${group ? '개인 아티스트 찾기' : '그룹 찾기'}" aria-label="${group ? '멤버 찾기' : '소속 그룹 찾기'}" style="margin-top:6px">
    <div class="adm-pick">${hits.map(a => artistBox(a, { control: `<input type="checkbox" data-rel-id="${esc(a.id)}"${A.form.rel.has(a.id) ? ' checked' : ''} aria-label="${esc(a.name)} 선택">`, selected: A.form.rel.has(a.id) })).join('')}${k && !hits.length ? '<p class="small muted">맞는 아티스트가 없어요. 먼저 등록해 주세요.</p>' : ''}</div>`;
}
/* 연결할 공연: 아티스트 이름·별칭이 출연진에 있거나, 검색어가 공연명·출연진에 있는 공연 */
export function drawLinkList() {
  const f = $('#artistForm'); const box = $('#linkList'); if (!f || !box) return;
  const names = [f.elements.name.value, ...splitList(f.elements.aliases.value)].map(nameKey).filter(Boolean);
  const k = nameKey($('#linkQ').value);
  if (A.form.checked == null) A.form.checked = new Set();
  const rows = [...(A.perfs || []).map(p => ({ ...p, _k: 'perf', _d: p.startDate })), ...(A.openings || []).map(o => ({ ...o, _k: 'open', _d: o.showDate || '' }))]
    .filter(r => !r.hidden && (k ? (nameKey(r.title).includes(k) || (r.artists || []).some(n => nameKey(n).includes(k))) : (r.artists || []).some(n => names.includes(nameKey(n)))))
    .sort((a, b) => String(b._d).localeCompare(String(a._d))).slice(0, 40);
  rows.forEach(r => { const key = r._k + ':' + r.id; if (!A.form.seen?.has(key)) { (A.form.seen ||= new Set()).add(key); if ((r.artists || []).some(n => names.includes(nameKey(n))) && !(r.links || []).some(l => l.artistId === A.form.id)) A.form.checked.add(key); } });
  box.innerHTML = rows.length ? rows.map(r => {
    const key = r._k + ':' + r.id; const linked = A.form.id && (r.links || []).some(l => l.artistId === A.form.id);
    const other = (r.links || []).filter(l => l.artistId !== A.form.id).map(l => byId(l.artistId)?.name || l.name);
    return `<label class="adm-linkrow">${linked ? '<input type="checkbox" checked disabled>' : `<input type="checkbox" data-link-key="${esc(key)}"${A.form.checked.has(key) ? ' checked' : ''}>`}
      <span><b>${esc(r.title)}</b><small>${r._k === 'open' ? '오픈 공지 · ' : ''}${esc(fmtD(r._d))} · ${esc(r.venue || '')}${(r.artists || []).length ? ' · 출연 ' + esc(r.artists.join(', ')) : ''}${linked ? ' · <b class="ok">연결됨</b>' : ''}${other.length ? ' · 다른 연결: ' + esc(other.join(', ')) : ''}</small></span></label>`;
  }).join('') : '<p class="small muted">이 이름이 나온 공연이 없어요. 위에서 다른 이름으로 찾아보세요.</p>';
}
const igId = v => String(v || '').trim().replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/[/?#].*$/, '');
export async function submitArtist(f) {
  const v = k => String(f.elements[k]?.value || '').trim();
  const data = { name: v('name'), kind: f.elements.kind.value === 'solo' ? 'solo' : 'group', disambig: v('disambig'), instagram: igId(v('instagram')), aliases: splitList(v('aliases')),
    photoUrl: A.form.photoUrl, photoCredit: v('photoCredit'),
    linkPerfIds: [...A.form.checked].filter(k => k.startsWith('perf:')).map(k => k.slice(5)), linkOpeningIds: [...A.form.checked].filter(k => k.startsWith('open:')).map(k => k.slice(5)) };
  data[data.kind === 'group' ? 'memberIds' : 'groupIds'] = [...A.form.rel.keys()];
  if (A.form.id) data.id = A.form.id;
  let ok = ui.fieldErr(f, 'name', data.name ? '' : '필수 항목이에요.');
  ok = ui.fieldErr(f, 'instagram', !data.instagram || /^[A-Za-z0-9._]{1,30}$/.test(data.instagram) ? '' : '계정 아이디만 넣어 주세요 (영문·숫자·.·_).') && ok;
  const same = (A.all || []).some(a => a.id !== A.form.id && nameKey(a.name) === nameKey(data.name));
  ok = ui.fieldErr(f, 'disambig', same && !data.disambig ? '같은 이름의 아티스트가 있어요. 구분 문구를 적어 주세요.' : '') && ok;
  if (!ok) return;
  try {
    if (A.fromReport && !A.form.id) { await api.admin.reports.register(A.fromReport.id, 'artist', data); A.fromReport = null; ui.toast('등록했어요. 제보를 등록 완료로 바꿨어요.'); }
    else { await api.admin.artists.save(data); ui.toast('저장했어요.'); }
    if (A.modal) { A.modal = null; ui.closeSheet(); resetArtistCache(); await renderCandidates(); return; }
    const back = A.returnTo || '#/artists'; A.returnTo = ''; resetArtistCache(); location.hash = back;
  } catch (e) { $('#formErr').textContent = ui.errMsg(e); }
}
export async function pickArtistPhoto(input) {
  const file = input.files?.[0]; const f = input.form; ui.fieldErr(f, 'photo', ''); if (!file) return;
  try { A.form.photoUrl = await api.admin.artists.uploadPhoto(file); $('#arPhoto').innerHTML = photo({ name: f.elements.name.value || '?', photoUrl: A.form.photoUrl }); }
  catch (e) { ui.fieldErr(f, 'photo', ui.errMsg(e)); input.value = ''; }
}

/* ---------- 합치기 (R-138) ---------- */
function mergeSheet(alias) {
  const pool = (A.all || []).filter(a => a.status === 'active');
  const sim = pool.filter(a => { const k = nameKey(alias); return keysOf(a).some(x => x.length >= 2 && (x.includes(k) || k.includes(x))); });
  const perfs = [...(A.perfs || []).map(p => ({ ...p, _k: 'perf', _d: p.startDate })), ...(A.openings || []).map(o => ({ ...o, _k: 'open', _d: o.showDate || '' }))]
    .filter(r => !r.hidden && (r.artists || []).some(n => nameKey(n) === nameKey(alias))).sort((a, b) => String(b._d).localeCompare(String(a._d))).slice(0, 30);
  ui.sheet(`<form id="mergeForm" class="adm-merge" data-alias="${esc(alias)}"><p class="eyebrow" style="margin:0">후보 검수 › 합치기</p><h2>‘${esc(alias)}’를 기존 아티스트의 다른 표기로</h2>
    <p class="small muted">새 아티스트를 만들지 않고, 이미 등록된 아티스트의 별칭으로 붙여요. 앞으로 이 표기로 검색하거나 공연에 적어도 같은 아티스트로 연결돼요.</p>
    <p class="lbl">1. 어떤 아티스트의 다른 표기인가요?</p><input type="search" id="mergeQ" placeholder="등록된 아티스트 찾기" aria-label="등록된 아티스트 찾기">
    <div class="adm-pick" id="mergeTargets">${(sim.length ? sim : pool.slice(0, 6)).map(mergeBox).join('')}</div>
    <p class="lbl">2. 합친 뒤 이름과 별칭</p><div class="adm-merge-prev" id="mergePrev"><span class="muted small">위에서 아티스트를 고르면 보여요.</span></div>
    <p class="lbl">3. ‘${esc(alias)}’가 나온 공연에 연결 <small>${perfs.length}건</small></p>
    <div class="adm-linklist">${perfs.map(r => `<label class="adm-linkrow"><input type="checkbox" data-merge-key="${esc(r._k + ':' + r.id)}" checked><span><b>${esc(r.title)}</b><small>${r._k === 'open' ? '오픈 공지 · ' : ''}${esc(fmtD(r._d))} · ${esc(r.venue || '')}</small></span></label>`).join('') || '<p class="small muted">이 표기가 나온 공연이 없어요.</p>'}</div>
    <p class="ferr" id="mergeErr" role="alert"></p><button class="btn primary block" type="submit">다른 표기로 합치기</button></form>`);
}
const mergeBox = a => artistBox(a, { control: `<input type="radio" name="mergeTo" value="${esc(a.id)}" aria-label="${esc(a.name)} 고르기">` });
export function drawMergeTargets(q) {
  const k = nameKey(q); const pool = (A.all || []).filter(a => a.status === 'active' && (!k || keysOf(a).some(x => x.includes(k)))).slice(0, 8);
  $('#mergeTargets').innerHTML = pool.map(mergeBox).join('') || '<p class="small muted">맞는 아티스트가 없어요.</p>';
}
function drawMergePrev(id) {
  const a = byId(id); const alias = $('#mergeForm').dataset.alias; if (!a) return;
  $$('#mergeTargets .ar-box').forEach(b => b.classList.toggle('sel', b.querySelector('input')?.value === id));
  $('#mergePrev').innerHTML = `<b>${esc(a.name)}</b>${(a.aliases || []).map(x => `<span class="pick-chip name-only">${esc(x)}</span>`).join('')}<span class="pick-chip">+ ${esc(alias)} (추가)</span>`;
}
export async function submitMerge(f) {
  const to = f.querySelector('input[name=mergeTo]:checked')?.value; if (!to) { $('#mergeErr').textContent = '합칠 아티스트를 골라 주세요.'; return; }
  const keys = $$('[data-merge-key]', f).filter(x => x.checked).map(x => x.dataset.mergeKey);
  try {
    await api.admin.artists.merge(f.dataset.alias, to, keys.filter(k => k.startsWith('perf:')).map(k => k.slice(5)), keys.filter(k => k.startsWith('open:')).map(k => k.slice(5)));
    A.modal = null; ui.closeSheet(); ui.toast(`${byId(to)?.name || ''}의 다른 표기로 합쳤어요.`); resetArtistCache(); await renderArtists('candidates');
  } catch (e) { $('#mergeErr').textContent = ui.errMsg(e); }
}

/* ---------- 공연·공지 수정의 아티스트 박스 (R-139) ---------- */
// 쉼표로 적은 이름마다 박스: 연결됨 = 정보가 있는 박스, 연결 없음 = 빈 박스에 이름만. 누르면 고르기·변경·새로 등록
export async function initLinkBoxes(kind, row) {
  await loadAll();
  A.link = { kind, id: row?.id || null, map: new Map((row?.links || []).map(l => [nameKey(l.name), l.artistId])) };
  drawLinkBoxes();
}
const linkFor = n => {
  const k = nameKey(n);
  if (A.link.map.has(k)) return A.link.map.get(k);   // 운영자가 고른 것 (null = 연결 안 함)
  const s = sameName(n); return s.length === 1 ? s[0].id : undefined;   // 1명과만 맞으면 자동 연결 (R-125)
};
export function drawLinkBoxes() {
  const input = $('#perfForm')?.elements.artists || $('#openingForm')?.elements.artists;
  const box = $('#linkBoxes'); if (!input || !box || !A.link) return;
  const names = splitList(input.value);
  box.innerHTML = names.map((n, i) => {
    const id = linkFor(n); const a = id && byId(id);
    if (a) return artistBox(a, { tag: 'button', attrs: `type="button" data-act="ar-linkbox" data-i="${i}" aria-label="${esc(n)} 연결 바꾸기"`, note: nameKey(a.name) !== nameKey(n) ? `입력한 이름: ${esc(n)}` : '' });
    const s = sameName(n).length;
    return `<button type="button" class="ar-box empty" data-act="ar-linkbox" data-i="${i}">${emptyPhoto('sm')}<span class="ar-body"><b>${esc(n)}</b>${s > 1 ? `<small class="warn">같은 이름 ${s}명 · 눌러서 고르기</small>` : ''}</span></button>`;
  }).join('');
}
export function linkBoxSheet(i) {
  const input = $('#perfForm')?.elements.artists || $('#openingForm')?.elements.artists; const n = splitList(input.value)[Number(i)]; if (!n) return;
  const cur = linkFor(n); const same = sameName(n);
  ui.sheet(`<form id="linkForm" data-name="${esc(n)}"><h2>${same.length > 1 ? `‘${esc(n)}’과 이름이 같은 아티스트가 ${same.length}명이에요` : `‘${esc(n)}’ 연결`}</h2>
    <p class="small muted">${same.length > 1 ? '이 공연의 아티스트를 골라 주세요.' : '연결할 아티스트를 고르거나 찾아 주세요.'}</p>
    <div class="adm-pick" id="linkTargets">${same.map(a => linkRadio(a, cur)).join('')}</div>
    <input type="search" id="linkFind" placeholder="다른 아티스트 찾기" aria-label="다른 아티스트 찾기" style="margin-top:8px"><div class="adm-pick" id="linkFound"></div>
    <div class="acts" style="margin-top:12px"><button class="btn ghost" type="button" data-act="ar-link-new" data-name="${esc(n)}">${same.length ? '모두 아님 · ' : ''}새 아티스트로 등록</button>${cur ? '<button class="btn ghost" type="button" data-act="ar-link-none">연결 해제</button>' : ''}<button class="btn primary" type="submit">이 아티스트로 연결</button></div>
    <p class="small muted">새 아티스트로 등록하러 가면 저장하지 않은 공연 수정 내용은 사라져요. 먼저 저장해 주세요.</p></form>`);
}
const linkRadio = (a, cur) => artistBox(a, { control: `<input type="radio" name="linkTo" value="${esc(a.id)}"${cur === a.id ? ' checked' : ''} aria-label="${esc(a.name)} 고르기">`, selected: cur === a.id });
export function drawLinkFound(q) {
  const k = nameKey(q); const box = $('#linkFound'); if (!box) return;
  box.innerHTML = k ? (A.all || []).filter(a => a.status === 'active' && keysOf(a).some(x => x.includes(k))).slice(0, 6).map(a => linkRadio(a, null)).join('') || '<p class="small muted">맞는 아티스트가 없어요.</p>' : '';
}
export function submitLink(f) {
  const id = f.querySelector('input[name=linkTo]:checked')?.value; if (!id) { ui.toast('연결할 아티스트를 골라 주세요.'); return; }
  A.link.map.set(nameKey(f.dataset.name), id); ui.closeSheet(); drawLinkBoxes();
}
export function linkNone() { const f = $('#linkForm'); if (!f) return; A.link.map.set(nameKey(f.dataset.name), null); ui.closeSheet(); drawLinkBoxes(); }
/* 저장할 연결 목록 */
export const collectLinks = names => names.map(n => ({ name: n, artistId: linkFor(n) || null })).filter(l => l.artistId);
export async function saveLinks(kind, id, names) { if (id && A.link) await api.admin.saveLinks(kind, id, collectLinks(names)); }

/* ---------- 클릭·입력 ---------- */
export async function artistAction(act, a) {
  switch (act) {
    case 'ar-ignore': case 'ar-unignore': try { await api.admin.artists.ignore(a.dataset.name, act === 'ar-ignore'); A.modal = null; ui.closeSheet(); ui.toast(act === 'ar-ignore' ? '제외했어요. 맨 아래에서 다시 누르면 되살려요.' : '되살렸어요.'); await renderCandidates(); } catch (e) { ui.toast(ui.errMsg(e)); } break;
    case 'ar-approve': A.prefill = { name: a.dataset.name }; A.returnTo = '#/artists/candidates'; location.hash = '#/artists/edit/new'; break;   // 검수 = 등록·수정 화면으로
    case 'ar-cand-open': await openCandidate(a.dataset.name); break;
    case 'ar-cand-delete': try { await api.admin.artists.ignore(a.dataset.name, true); A.modal = null; ui.closeSheet(); ui.toast('후보에서 제외했어요. 목록 맨 아래에서 되살릴 수 있어요.'); await renderCandidates(); } catch (e) { ui.toast(ui.errMsg(e)); } break;
    case 'ar-merge': mergeSheet(a.dataset.name); break;
    case 'ar-rel-remove': A.form.rel.delete(a.dataset.id); drawRel($('#relQ')?.value || ''); break;
    case 'ar-photo-clear': A.form.photoUrl = ''; $('#arPhoto').innerHTML = photo({ name: $('#artistForm').elements.name.value || '?' }); a.remove(); break;
    case 'ar-hide': try { const on = a.dataset.on === '1'; await api.admin.artists.hide(a.dataset.id, on); ui.toast(on ? '숨겼어요. 사용자 검색에 나오지 않아요.' : '숨김을 풀었어요.'); resetArtistCache(); location.hash = '#/artists'; } catch (e) { ui.toast(ui.errMsg(e)); } break;
    case 'ar-linkbox': linkBoxSheet(a.dataset.i); break;
    case 'ar-link-none': linkNone(); break;
    case 'ar-template': case 'ar-import-paste': case 'ar-import-run': await importAction(act, a); break;
    case 'ar-link-new': A.prefill = { name: a.dataset.name }; A.returnTo = location.hash; ui.closeSheet(); location.hash = '#/artists/edit/new'; break;
  }
}
export function artistInput(t) {
  if (t.dataset.asearch === 'list') { A.q = t.value; drawArtistList(); }
  if (t.dataset.asearch === 'cand') { A.cq = t.value; drawCandidates(); }
  if (t.id === 'relQ') { const pos = t.selectionStart; drawRel(t.value); const n = $('#relQ'); n.focus(); n.setSelectionRange(pos, pos); }
  if (t.id === 'linkQ') drawLinkList();
  if (t.id === 'mergeQ') drawMergeTargets(t.value);
  if (t.id === 'linkFind') drawLinkFound(t.value);
  if (t.form?.id === 'artistForm' && (t.name === 'name' || t.name === 'aliases')) { if (t.name === 'name') drawSameName(); if (!nameKey($('#linkQ')?.value)) drawLinkList(); }
}
export function artistChange(t) {
  if (t.dataset.relId) { const a = byId(t.dataset.relId); if (t.checked && a) A.form.rel.set(a.id, a.name); else A.form.rel.delete(t.dataset.relId); drawRel($('#relQ')?.value || ''); }
  if (t.dataset.linkKey) { if (t.checked) A.form.checked.add(t.dataset.linkKey); else A.form.checked.delete(t.dataset.linkKey); }
  if (t.name === 'kind' && t.form?.id === 'artistForm') { A.form.kind = t.value; A.form.rel.clear(); drawRel(); }
  if (t.name === 'photoFile') pickArtistPhoto(t);
  if (t.dataset.importFile != null) importFile(t);
  if (t.name === 'mergeTo') drawMergePrev(t.value);
  if (t.name === 'linkTo') $$('#linkForm .ar-box').forEach(b => b.classList.toggle('sel', b.querySelector('input[name=linkTo]')?.checked));
}
export { kindLabel, subLine, perfLine, igLink };
