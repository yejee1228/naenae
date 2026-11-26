// 내내 관리자 페이지 (admin.html) — ADM-00~07 (06 화면정의서 · 08 API 명세 admin.*)
// PC(768px 이상)는 왼쪽 메뉴, 모바일은 햄버거 메뉴 (R-108). 저장은 모두 api.admin.* → 작성자·시각 기록(R-104), 삭제는 숨김(R-105)
import '../shared/style.css';
import './admin.css';
import api from '../shared/api/index.js';
import { L } from '../shared/lib.js';
import { REPORT_STATUS, REJECT_REASONS, eventStatus, kstToday, nameKey, extractArtists, REGIONS } from '../shared/domain.js';
import { initArtists, renderArtists, artistAction, artistInput, artistChange, submitArtist, submitMerge, submitLink, initLinkBoxes, drawLinkBoxes, saveLinks, artistState } from './artists.js';

const root = document.getElementById('admin');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const today = () => kstToday();
const errMsg = e => (e && e.message) || '저장하지 못했어요. 다시 시도해 주세요.';
const KST = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const kst = iso => { if (!iso) return { date: '', time: '' }; const d = new Date(iso); if (isNaN(d)) return { date: '', time: '' }; const [date, time] = KST.format(d).split(' '); return { date, time }; };
const fmtDT = iso => { const { date, time } = kst(iso); if (!date) return '-'; const [, m, d] = date.split('-'); return `${Number(m)}월 ${Number(d)}일 ${time}`; };
const fmtD = ymd => (ymd ? L.fmtDayKo(ymd) : '-');
const splitList = s => String(s || '').split(/[,·]/).map(x => x.trim()).filter(Boolean);
const isHttps = u => !u || /^https:\/\/[^\s]+$/.test(u);

/* ---------- 공통 UI ---------- */
function toast(msg) {
  $$('.toast').forEach(t => t.remove());
  const d = document.createElement('div'); d.className = 'toast'; d.setAttribute('role', 'status'); d.textContent = msg;
  document.body.appendChild(d); setTimeout(() => d.remove(), 2600);
}
function sheet(html) {
  closeSheet();
  const m = document.createElement('div'); m.className = 'modal'; m.id = 'sheet'; m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true');
  m.innerHTML = `<div class="modal-body">${html}<button class="btn ghost block" type="button" data-act="close-sheet">닫기</button></div>`;
  m.addEventListener('click', e => { if (e.target === m) closeSheet(); });
  document.body.appendChild(m); return m;
}
function closeSheet() { $('#sheet')?.remove(); }
const tsw = (id, on, kind, label) => `<label class="tsw cell-sw" title="${label}"><input type="checkbox" data-pub="${kind}" data-id="${esc(id)}" ${on ? 'checked' : ''} aria-label="${label}"><span></span></label>`;
const fieldErr = (form, name, msg) => { const el = form.querySelector(`[data-err="${name}"]`); if (el) el.textContent = msg || ''; return !msg; };

/* ---------- 메뉴 · 틀 ---------- */
const MENU = [['dashboard', '대시보드'], ['openings', '오픈 공지'], ['reports', '제보'], ['promotions', '이벤트'], ['performances', '공연'], ['artists', '아티스트'], ['venues', '라이브클럽'], ['members', '회원']];
const TITLES = { dashboard: '대시보드', openings: '오픈 공지 관리', reports: '제보 관리', promotions: '이벤트 관리', performances: '공연 관리', artists: '아티스트', venues: '라이브클럽 공연장', members: '회원' };
let pending = 0; let menuPushed = false; let section = '';

function shell(sec, html) {
  section = sec; const u = api.auth.current();
  root.innerHTML = `<div class="adm" id="adm">
    <header class="adm-top"><button class="hb" type="button" data-act="menu" aria-label="메뉴 열기" aria-expanded="false">☰</button><span class="ttl">${TITLES[sec]}</span>${pending ? `<a class="pend" href="#/reports/submitted" aria-label="검수 대기 제보 ${pending}건">${pending}</a>` : '<span></span>'}</header>
    <div class="adm-dim" data-act="menu-close"></div>
    <nav class="adm-nav" id="admNav" aria-label="관리자 메뉴"><button class="nav-close" type="button" data-act="menu-close" aria-label="메뉴 닫기">✕</button>
      <div class="brand"><img src="assets/logo.png" alt="내내" width="56" height="40"><div><b>관리자</b><small>${esc(u?.nickname || '')}</small></div></div>
      ${MENU.map(([k, n]) => `<a href="#/${k}" class="${k === sec ? 'on' : ''}"${k === sec ? ' aria-current="page"' : ''}>${n}${k === 'reports' && pending ? `<span class="nav-count" aria-label="검수 대기 ${pending}건">${pending}</span>` : ''}</a>`).join('')}
      <div class="nav-foot"><a href="./index.html">사이트로 가기 ↗</a><button class="nav-link" type="button" data-act="logout">로그아웃</button></div>
    </nav>
    <main class="adm-main" id="main">${html}</main></div>`;
  document.title = `${TITLES[sec]} · 내내 관리자`;
}
const main = () => $('#main');
const head = (title, sub = '', right = '') => `<div class="adm-head"><div><h1>${title}</h1>${sub ? `<p class="muted small">${sub}</p>` : ''}</div>${right}</div>`;
function openMenu() { $('#adm')?.classList.add('menu-open'); $('[data-act=menu]')?.setAttribute('aria-expanded', 'true'); history.pushState({ admMenu: 1 }, ''); menuPushed = true; $('#admNav a.on, #admNav a')?.focus(); }
function closeMenu(fromPop) {
  if (!$('#adm')?.classList.contains('menu-open')) return;
  $('#adm').classList.remove('menu-open'); $('[data-act=menu]')?.setAttribute('aria-expanded', 'false');
  if (menuPushed && !fromPop) { menuPushed = false; history.back(); } menuPushed = false;
}
window.addEventListener('popstate', () => closeMenu(true));   // 뒤로 가기로 메뉴 닫힘
document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeSheet(); closeMenu(); } });

/* ---------- ADM-00 로그인 ---------- */
function renderLogin() {
  document.title = '내내 관리자';
  root.innerHTML = `<div class="adm-login"><section class="auth-head"><img src="assets/logo.png" alt="내내 nae nae" width="120" height="85"><h1>관리자</h1></section>
    <form class="adm-form" id="loginForm" novalidate><label>이메일<input type="email" name="email" required autocomplete="username" value="${esc(api.isDemo ? api.adminEmailHint || '' : '')}"></label>
      <label>비밀번호<input type="password" name="password" required autocomplete="current-password" minlength="8"></label>
      ${api.isDemo ? `<p class="demo-note">시연 모드: 관리자 계정은 ${esc(api.adminEmailHint || '')} 이고 비밀번호는 확인하지 않아요.</p>` : ''}
      <p class="ferr" id="loginErr" role="alert"></p><button class="btn primary block" type="submit">로그인</button></form>
    <p class="auth-links" style="text-align:center"><a class="link" href="./index.html">사이트로 가기</a></p></div>`;
}
function renderNoAuth() {
  document.title = '내내 관리자';
  root.innerHTML = `<div class="adm-login"><section class="auth-head"><img src="assets/logo.png" alt="내내 nae nae" width="120" height="85"><h1>관리자 권한이 없어요.</h1></section>
    <p class="muted small" style="text-align:center">운영자 계정으로 로그인해 주세요.</p>
    <div style="display:grid;gap:8px"><a class="btn primary block" href="./index.html">사이트로 가기</a><button class="btn ghost block" type="button" data-act="logout">다른 계정으로 로그인</button></div></div>`;
}
async function submitLogin(f) {
  const email = f.email.value.trim(); const password = f.password.value;
  const err = $('#loginErr'); err.textContent = '';
  if (!email || !password) { err.textContent = '이메일과 비밀번호를 입력해 주세요.'; return; }
  try { await api.auth.signInEmail({ email, password }); route(); } catch (e) { err.textContent = errMsg(e); }
}

/* ---------- ADM-01 대시보드 ---------- */
async function renderDashboard() {
  const d = await api.admin.dashboard();
  const s = d.lastSync; const failed = s && s.status === 'failed';
  const m = d.metrics7d || {};
  const metric = (k, n) => `<div><small>${n}</small><b>${Number(m[k] || 0).toLocaleString('ko-KR')}</b></div>`;
  main().innerHTML = head('대시보드', `${fmtD(today())} 기준`) + `<div class="adm-cards">
    <a class="adm-card" href="#/reports/submitted"><p class="eyebrow">검수 대기 제보</p><b class="big">제보 완료 ${d.reportsSubmitted} · 확인 중 ${d.reportsReviewing}</b><span class="small muted">누르면 제보 관리로</span></a>
    <a class="adm-card" href="#/openings"><p class="eyebrow">다가오는 오픈</p><b class="big">오늘 ${d.openToday} · 이번 주 ${d.openWeek}</b>
      ${(d.upcoming || []).length ? `<ul>${d.upcoming.map(o => `<li>${esc(fmtDT(o.openAt))} · ${esc(o.title)}</li>`).join('')}</ul>` : '<span class="small muted">예정된 오픈이 없어요.</span>'}</a>
    <a class="adm-card" href="#/promotions"><p class="eyebrow">진행 중 이벤트</p><b class="big">진행 중 ${d.promotionsLive} · 예정 ${d.promotionsSoon}</b></a>
    <a class="adm-card" href="#/performances"><p class="eyebrow">KOPIS 수집</p>${!s ? '<b class="big">아직 수집 기록이 없어요</b>'
      : failed ? `<b class="big warn">갱신 실패 — ${d.lastSuccess ? esc(fmtDT(d.lastSuccess.finishedAt || d.lastSuccess.startedAt)) + '이 마지막' : '성공 기록 없음'}</b><span class="small muted">${esc(s.error || '')}</span>`
        : `<b class="big">마지막 갱신 ${esc(fmtDT(s.finishedAt || s.startedAt))} · ${Number(s.listCount || 0).toLocaleString('ko-KR')}건</b>`}</a>
    <a class="adm-card" href="#/members"><p class="eyebrow">회원</p><b class="big">전체 ${d.members}명 · 오늘 가입 ${d.membersToday}명</b></a>
    <section class="adm-card wide" aria-label="베타 지표"><p class="eyebrow">베타 지표 (최근 7일)</p>
      <div class="adm-metrics">${metric('visitors', '방문')}${metric('signups', '가입')}${metric('calendar_add', '캘린더 추가')}${metric('ticket_click', '예매처 이동')}${metric('attended', '관람 기록')}${metric('share_done', '인증샷 공유')}${metric('stamp_saved', '인증샷 저장')}${metric('auth_gate', '로그인 안내 본 사람')}</div>
      <p class="small muted" style="margin:6px 0 0">방문·캘린더·예매처·로그인 안내는 사람 수(브라우저 기준), 관람·공유·저장은 횟수예요. 지표 항목은 결정 21 확인 후 확정돼요.</p></section></div>`;
}

/* ---------- ADM-02 오픈 공지 ---------- */
const toLibO = o => ({ ...o, openAt: o.openAt ? new Date(o.openAt) : null, openHasTime: o.openAt ? o.openHasTime !== false : false, showDate: o.showDate || '', artists: o.artists || [] });
const oStatus = o => L.openingStatus(toLibO(o));
const O = { list: [], filter: 'all', q: '', perfs: null, draft: null, fromReport: null };
const O_FILTERS = [['all', '전체'], ['soon', '오픈 예정'], ['open', '예매 중'], ['tba', '오픈일 미정'], ['past', '지난 공지'], ['hidden', '숨김']];
async function renderOpenings() {
  O.list = await api.admin.openings.list();
  main().innerHTML = head('오픈 공지 관리', '사용자 화면 \'오픈\' 탭에 보이는 티켓 오픈 공지예요.', '<a class="btn primary small" href="#/openings/new">새 공지</a>')
    + `<div class="adm-tools"><input type="search" data-search="O" placeholder="공연명·아티스트 검색" value="${esc(O.q)}" aria-label="공지 검색"><div class="adm-chips" role="group" aria-label="공지 필터">${O_FILTERS.map(([k, n]) => `<button type="button" class="chip${O.filter === k ? ' on' : ''}" data-filter="O" data-v="${k}" aria-pressed="${O.filter === k}">${n}</button>`).join('')}</div></div><div id="listWrap"></div>`;
  drawOpenings();
}
function drawOpenings() {
  const k = nameKey(O.q);
  const rows = O.list.map(o => ({ o, st: oStatus(o) })).filter(({ o, st }) => {
    if (O.filter === 'hidden') return o.hidden; if (o.hidden) return false;
    if (O.filter !== 'all' && st.key !== O.filter) return false;
    return !k || nameKey(o.title).includes(k) || (o.artists || []).some(a => nameKey(a).includes(k));
  }).sort((a, b) => a.st.rank - b.st.rank || String(a.o.openAt || '9').localeCompare(String(b.o.openAt || '9')));
  const cols = '--cols: 104px minmax(0,2.2fr) 1.3fr 1fr 1fr 64px 112px 48px';
  $('#listWrap').innerHTML = `<div class="adm-list" role="table" aria-label="오픈 공지 목록"><div class="adm-row head" style="${cols}" role="row"><span>상태</span><span>공연명 · 아티스트</span><span>티켓 오픈</span><span>공연일</span><span>예매처</span><span>출처</span><span>수정</span><span>게시</span></div>
    ${rows.length ? rows.map(({ o, st }) => `<div class="adm-row click has-sw${o.hidden || !o.isPublished ? ' muted-row' : ''}" style="${cols}" role="row" data-href="#/openings/${encodeURIComponent(o.id)}" tabindex="0">
      <span><span class="badge ${st.key === 'past' ? 'tba' : st.key}">${esc(st.label)}</span>${o.hidden ? ' <span class="src-chip">숨김</span>' : ''}</span>
      <span><span class="t">${esc(o.title)}</span>${(o.artists || []).length ? `<br><span class="sub">${esc(o.artists.join(' · '))}</span>` : ''}</span>
      <span>${esc(L.fmtOpen(toLibO(o)))}</span><span data-m="hide">${esc(fmtD(o.showDate))}${o.venue ? `<br><span class="sub">${esc(o.venue)}</span>` : ''}</span><span data-m="hide">${esc(o.vendor || '-')}</span>
      <span data-m="hide"><span class="src-chip${o.source === 'report' ? ' report' : ''}">${o.source === 'report' ? '제보' : '운영자'}</span></span><span class="sub" data-m="hide">${esc(fmtDT(o.updatedAt))}</span>
      <span>${tsw(o.id, o.isPublished, 'opening', '게시')}</span><span class="go" aria-hidden="true">›</span></div>`).join('') : '<p class="adm-empty">조건에 맞는 공지가 없어요.</p>'}</div>`;
}
async function renderOpeningForm(id) {
  if (!O.list.length) O.list = await api.admin.openings.list();
  if (!O.perfs) O.perfs = await api.admin.performances.list();
  const fr = id === 'new' ? O.fromReport : null; if (id !== 'new') O.fromReport = null;
  const o = id === 'new' ? (fr ? fromReportToOpening(fr) : { isPublished: true, artists: [] }) : O.list.find(x => x.id === id);
  if (!o) { main().innerHTML = '<p class="adm-empty">공지를 찾지 못했어요. <a class="link" href="#/openings">목록으로</a></p>'; return; }
  const at = kst(o.openAt); const linked = o.performanceId && O.perfs.find(p => p.id === o.performanceId);
  main().innerHTML = head(id === 'new' ? '새 오픈 공지' : '오픈 공지 수정', '', '<a class="link" href="#/openings">← 목록</a>')
    + (fr ? `<p class="adm-note">제보 「${esc(fr.title)}」(${esc(fr.nickname || '')})에서 가져온 내용이에요. 저장하면 제보가 '등록 완료'로 바뀌어요.</p>` : '')
    + `<form class="adm-form" id="openingForm" novalidate data-id="${esc(o.id || '')}">
    <label class="full">공연명 *<input type="text" name="title" maxlength="120" value="${esc(o.title || '')}" required><span class="fld-err" data-err="title"></span></label>
    <div class="full"><label>아티스트 <small>쉼표로 구분 — 이름마다 아래에 아티스트 박스가 생겨요. 눌러서 연결을 고를 수 있어요</small><input type="text" name="artists" maxlength="200" value="${esc((o.artists || []).join(', '))}" data-chips="linkBoxes"></label><div class="adm-artist-boxes" id="linkBoxes"></div></div>
    <label>공연장<input type="text" name="venue" maxlength="60" value="${esc(o.venue || '')}"></label>
    <label>공연일 <small>지나면 사용자 화면에서 자동으로 숨겨요</small><input type="date" name="showDate" value="${esc(o.showDate || '')}"></label>
    <label>티켓 오픈 날짜 <small>비우면 '오픈일 미정'</small><input type="date" name="openDate" value="${esc(at.date)}"></label>
    <label>티켓 오픈 시간<span class="row2"><input type="time" name="openTime" value="${esc(o.openAt && o.openHasTime !== false ? at.time : '')}"${o.openAt && o.openHasTime === false ? ' disabled' : ''}><span class="check"><input type="checkbox" name="noTime" id="noTime"${o.openAt && o.openHasTime === false ? ' checked' : ''}><label for="noTime">시간 미정</label></span></span></label>
    <label>예매처 이름<input type="text" name="vendor" maxlength="40" value="${esc(o.vendor || '')}" placeholder="예: NOL 티켓"></label>
    <label>예매 링크 <small>https만</small><input type="url" name="ticketUrl" inputmode="url" placeholder="https://" value="${esc(o.ticketUrl || '')}"><span class="fld-err" data-err="ticketUrl"></span></label>
    <div class="full"><label>연결 공연 <small>고르면 공연명·공연장·공연일을 채워요</small><input type="search" id="perfQ" placeholder="공연명으로 검색" autocomplete="off"></label>
      <input type="hidden" name="performanceId" value="${esc(o.performanceId || '')}"><p class="small" id="perfLinked" style="margin:6px 0 0">${linked ? linkedLine(linked) : '<span class="muted">연결된 공연 없음</span>'}</p><div class="pick-list" id="perfPick"></div></div>
    <label class="full">메모 <small>200자, 카드에 그대로 보여요</small><textarea name="note" maxlength="200" rows="2">${esc(o.note || '')}</textarea></label>
    <label class="check full"><input type="checkbox" name="isPublished"${o.isPublished !== false ? ' checked' : ''}> 게시 (끄면 사용자 화면에서 숨겨요)</label>
    <p class="ferr full" id="formErr" role="alert"></p>
    <div class="bar">${o.id ? `<button class="btn ghost small left" type="button" data-act="hide" data-kind="opening" data-id="${esc(o.id)}" data-on="${o.hidden ? '0' : '1'}">${o.hidden ? '숨김 해제' : '숨기기'}</button>` : ''}<button class="btn ghost" type="button" data-act="preview-opening">미리보기</button><button class="btn primary" type="submit">저장</button></div></form>`;
  await afterOpeningForm(o);
}
const afterOpeningForm = o => initLinkBoxes('opening', o);
const linkedLine = p => `연결됨: <b>${esc(p.title)}</b> · ${esc(fmtD(p.startDate))} · ${esc(p.venue || '')} <button class="link" type="button" data-act="perf-unlink">해제</button>`;
function fromReportToOpening(r) {
  const [d, t] = String(r.openAtText || '').split(' ');
  return { title: r.title, artists: r.artists || [], venue: r.venue, showDate: r.showDate || '', openAt: d ? `${d}T${t || '00:00'}:00+09:00` : null, openHasTime: !!t, ticketUrl: r.ticketUrl || '', note: '', isPublished: true };
}
function readOpening(f) {
  const v = k => String(f.elements[k]?.value || '').trim();
  const noTime = f.elements.noTime.checked; const date = v('openDate'); const time = noTime ? '' : v('openTime');
  return { title: v('title'), artists: splitList(v('artists')), venue: v('venue'), showDate: v('showDate') || null, openAt: date ? `${date}T${time || '00:00'}:00+09:00` : null, openHasTime: !!(date && time),
    vendor: v('vendor'), ticketUrl: v('ticketUrl'), performanceId: v('performanceId') || null, note: v('note'), isPublished: f.elements.isPublished.checked };
}
async function submitOpening(f) {
  const data = readOpening(f); let ok = true;
  ok = fieldErr(f, 'title', data.title ? '' : '필수 항목이에요.') && ok;
  ok = fieldErr(f, 'ticketUrl', isHttps(data.ticketUrl) ? '' : 'https:// 로 시작하는 주소만 넣을 수 있어요.') && ok;
  if (!ok) { $('#formErr').textContent = ''; return; }
  const id = f.dataset.id; if (id) data.id = id;
  try {
    if (!id && O.fromReport) { const r = await api.admin.reports.register(O.fromReport.id, 'opening', data); await saveLinks('opening', r.createdId, data.artists); O.fromReport = null; toast('저장했어요. 제보를 등록 완료로 바꿨어요.'); }
    else { const saved = await api.admin.openings.save(data); await saveLinks('opening', saved.id || id, data.artists); toast('저장했어요.'); }
    O.list = []; location.hash = '#/openings';
  } catch (e) { $('#formErr').textContent = errMsg(e); }
}
function previewOpening() {
  const f = $('#openingForm'); const o = toLibO({ ...readOpening(f), id: 'preview' }); const st = L.openingStatus(o);
  const meta = [];
  if (o.artists.length) meta.push(`<p class="op-meta">${o.artists.map(esc).join(' · ')}</p>`);
  const showLine = [o.showDate ? '공연 ' + L.fmtDayKo(o.showDate) : '', o.venue].filter(Boolean).join(' · ');
  if (showLine) meta.push(`<p class="op-meta">${esc(showLine)}</p>`);
  meta.push(`<p class="op-meta">티켓 오픈 <b>${esc(L.fmtOpen(o))}</b>${o.vendor ? ' · ' + esc(o.vendor) : ''}</p>`);
  sheet(`<h2>미리보기</h2><p class="small muted">사용자 화면 '오픈' 탭의 카드 모양이에요.</p><div class="adm-preview"><article class="op"><div class="op-top"><span class="badge ${st.key === 'past' ? 'tba' : st.key}">${esc(st.label)}</span></div>
    <h3>${esc(o.title || '(공연명)')}</h3>${meta.join('')}${o.note ? `<p class="op-note">${esc(o.note)}</p>` : ''}<div class="op-actions">${st.key === 'soon' && o.openAt ? '<span class="btn small primary">캘린더에 추가</span>' : ''}<span class="btn small">♡ 보고 싶어요</span>${o.ticketUrl ? `<span class="btn small ghost">${st.key === 'open' ? '예매하기' : '예매처'} ↗</span>` : ''}</div></article></div>
    ${st.key === 'past' ? '<p class="small warn">공연일이 지나 사용자 화면에는 보이지 않아요.</p>' : ''}${!f.elements.isPublished.checked ? '<p class="small warn">게시가 꺼져 있어 사용자 화면에는 보이지 않아요.</p>' : ''}`);
}
function drawPerfPick(q) {
  const k = nameKey(q); const box = $('#perfPick'); if (!box) return;
  if (k.length < 2) { box.innerHTML = ''; return; }
  const hits = (O.perfs || []).filter(p => !p.hidden && nameKey(p.title).includes(k)).sort((a, b) => b.startDate.localeCompare(a.startDate)).slice(0, 8);
  box.innerHTML = hits.length ? hits.map(p => `<button type="button" data-act="perf-pick" data-id="${esc(p.id)}"><b>${esc(p.title)}</b><br><span class="sub">${esc(fmtD(p.startDate))} · ${esc(p.venue || '')} · ${p.source === 'kopis' ? 'KOPIS' : '직접 등록'}</span></button>`).join('') : '<p class="small muted">맞는 공연이 없어요.</p>';
}
function pickPerf(id) {
  const p = O.perfs.find(x => x.id === id); const f = $('#openingForm'); if (!p || !f) return;
  f.elements.performanceId.value = p.id;
  if (!f.elements.title.value.trim()) f.elements.title.value = p.title;
  f.elements.venue.value = p.venue || f.elements.venue.value; f.elements.showDate.value = p.startDate || f.elements.showDate.value;   // R-17
  if (!f.elements.artists.value.trim() && (p.artists || []).length) { f.elements.artists.value = p.artists.join(', '); drawChips(f.elements.artists); }
  $('#perfLinked').innerHTML = linkedLine(p); $('#perfPick').innerHTML = ''; $('#perfQ').value = '';
}
function drawChips(input) { if (input.dataset.chips === 'linkBoxes') { drawLinkBoxes(); return; } const box = $('#' + input.dataset.chips); if (box) box.innerHTML = splitList(input.value).map(a => `<span class="chip static">${esc(a)}</span>`).join(''); }

/* ---------- ADM-03 제보 ---------- */
const R = { list: [], status: 'submitted', current: null, dups: [] };
const KIND = { opening: '티켓 오픈', performance: '공연 일정', artist: '아티스트' };
const R_TABS = ['submitted', 'reviewing', 'registered', 'rejected', 'canceled'];
async function renderReports(status, id) {
  R.status = R_TABS.includes(status) ? status : 'submitted';
  R.current = null; R.dups = [];
  if (id) {
    try {
      R.current = await api.admin.reports.open(id);
      R.dups = R.current.kind === 'artist' ? (await api.admin.artists.list(R.current.title, 'all')).map(a => ({ type: '아티스트', title: a.name + (a.disambig ? ` (${a.disambig})` : ''), status: a.status })) : await api.admin.reports.duplicates(id);
    } catch (e) { toast(errMsg(e)); }
  }   // 열면 '확인 중'으로 (R-72)
  R.list = await api.admin.reports.list();
  if (id && R.current) { pending = R.list.filter(r => r.status === 'submitted').length; updatePendingUi(); }
  const count = s => R.list.filter(r => r.status === s).length;
  const rows = R.list.filter(r => r.status === R.status).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const cols = '--cols: 120px 100px minmax(0,2fr) 1fr 90px';
  main().innerHTML = head('제보 관리', '회원이 보낸 티켓 오픈·공연 제보예요. 열면 \'확인 중\'으로 바뀌어요.')
    + `<div class="adm-tools"><div class="adm-chips" role="tablist" aria-label="제보 상태">${R_TABS.map(s => `<a role="tab" class="chip${R.status === s ? ' on' : ''}" aria-selected="${R.status === s}" href="#/reports/${s}">${REPORT_STATUS[s].label} ${count(s)}</a>`).join('')}</div></div>
    <div class="adm-split${R.current ? ' detail-open' : ''}"><div class="adm-list-wrap"><div class="adm-list" role="table" aria-label="제보 목록"><div class="adm-row head" style="${cols}"><span>접수 시각</span><span>종류</span><span>공연명</span><span>제보자</span><span>상태</span></div>
      ${rows.length ? rows.map(r => `<div class="adm-row click${R.current?.id === r.id ? ' on' : ''}" style="${cols}" data-href="#/reports/${R.status}/${encodeURIComponent(r.id)}" tabindex="0">
        <span class="sub">${esc(fmtDT(r.createdAt))}</span><span data-m="hide">${KIND[r.kind] || '티켓 오픈'}</span><span class="t">${esc(r.title)}</span><span class="sub">${esc(r.nickname || '')}</span><span><span class="badge ${REPORT_STATUS[r.status].badge}">${REPORT_STATUS[r.status].label}</span></span><span class="go" aria-hidden="true">›</span></div>`).join('') : '<p class="adm-empty">이 상태의 제보가 없어요.</p>'}</div></div>
      <aside class="adm-detail" aria-label="제보 상세">${R.current ? reportDetail(R.current) : '<p class="muted small">왼쪽 목록에서 제보를 고르면 여기에 내용이 보여요.</p>'}</aside></div>`;
}
function reportDetail(r) {
  const st = REPORT_STATUS[r.status]; const nick = R.list.find(x => x.id === r.id)?.nickname || r.nickname || '';
  const link = u => (u && /^https?:\/\//.test(u) ? `<a class="link" href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(u)} ↗</a>` : esc(u || ''));
  const members = (r.artistMembers || []).map(m => esc(m.name) + (m.id ? '' : ' <span class="muted">(이름만)</span>')).join(', ');
  const kv = r.kind === 'artist' ? [['종류', '아티스트'], ['아티스트 이름', esc(r.title)], ['그룹/개인', r.artistKind === 'solo' ? '개인' : '그룹'], ['소속 그룹', r.artistGroup ? esc(r.artistGroup.name) + (r.artistGroup.id ? '' : ' <span class="muted">(목록에 없는 그룹)</span>') : ''], ['소속 아티스트', members], ['참고 링크', link(r.sourceUrl)], ['메모', esc(r.note)], ['제보자', esc(nick)], ['접수', esc(fmtDT(r.createdAt))]]
      .filter(([, v]) => v).map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')
    : [['종류', r.kind === 'performance' ? '공연 일정' : '티켓 오픈 소식'], ['공연명', esc(r.title)], ['아티스트', esc((r.artists || []).join(', '))], ['공연장', esc(r.venue)], ['공연 날짜', esc(r.showDate)], ['티켓 오픈', esc(r.openAtText)], ['예매 링크', link(r.ticketUrl)], ['출처 링크', link(r.sourceUrl)], ['메모', esc(r.note)], ['제보자', esc(nick)], ['접수', esc(fmtDT(r.createdAt))]]
    .filter(([, v]) => v).map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
  const open = ['submitted', 'reviewing'].includes(r.status);
  return `<a class="link back-list" href="#/reports/${R.status}">← 목록</a><div class="op-top"><span class="badge ${st.badge}">${st.label}</span></div><h2>${esc(r.title)}</h2><dl class="kv">${kv}</dl>
    <div><p class="eyebrow" style="margin:0 0 6px">${r.kind === 'artist' ? '같은 이름의 등록 아티스트' : '같은 공연명 기존 공지·공연'}</p><div class="adm-dups">${R.dups.length ? R.dups.map(x => `<p><span class="src-chip">${esc(x.type)}</span> ${esc(x.title)}${x.type === '아티스트' ? (x.status === 'hidden' ? ' · 숨김' : '') : ' · ' + esc(fmtD(x.showDate || x.startDate))}</p>`).join('') : '<p class="muted">비슷한 항목이 없어요.</p>'}</div></div>
    ${open ? (r.kind === 'artist' ? `<div class="acts"><button class="btn primary" type="button" data-act="report-reg" data-as="artist">아티스트로 등록</button><button class="btn ghost" type="button" data-act="report-reject">등록 실패</button></div>`
      : `<div class="acts"><button class="btn primary" type="button" data-act="report-reg" data-as="opening">공지로 등록</button><button class="btn" type="button" data-act="report-reg" data-as="performance">공연으로 등록</button><button class="btn ghost full" type="button" data-act="report-reject">등록 실패</button></div>`)
      : r.status === 'registered' ? `<p class="small">${r.registeredArtistId ? `<a class="link" href="#/artists/edit/${encodeURIComponent(r.registeredArtistId)}">등록된 아티스트 보기 ›</a>` : r.registeredOpeningId ? `<a class="link" href="#/openings/${encodeURIComponent(r.registeredOpeningId)}">등록된 공지 보기 ›</a>` : `<a class="link" href="#/performances/${encodeURIComponent(r.registeredPerformanceId || '')}">등록된 공연 보기 ›</a>`}</p>`
        : r.status === 'rejected' ? `<p class="small">제보자에게 보이는 이유: <b>${esc(r.rejectReason || '')}</b></p>` : ''}`;
}
function rejectSheet() {
  sheet(`<h2>등록 실패 이유</h2><p class="small muted">고른 이유가 제보자 '내 제보'에 그대로 보여요.</p><form class="adm-form" id="rejectForm" style="grid-template-columns:1fr;border:0;padding:0">
    ${REJECT_REASONS.map((t, i) => `<label class="check"><input type="radio" name="reason" value="${esc(t)}"${i === 0 ? ' checked' : ''}> ${esc(t)}</label>`).join('')}
    <label class="check"><input type="radio" name="reason" value="__custom"> 직접 입력</label><textarea name="custom" maxlength="200" rows="2" placeholder="제보자에게 보일 문구" aria-label="직접 입력한 이유"></textarea>
    <p class="ferr" id="rejectErr" role="alert"></p><button class="btn primary block" type="submit">등록 실패로 처리</button></form>`);
}
async function submitReject(f) {
  const v = f.elements.reason.value; const reason = v === '__custom' ? f.elements.custom.value.trim() : v;
  if (!reason) { $('#rejectErr').textContent = '이유를 적어 주세요.'; return; }
  try { await api.admin.reports.reject(R.current.id, reason); closeSheet(); toast('등록 실패로 처리했어요.'); location.hash = `#/reports/rejected/${encodeURIComponent(R.current.id)}`; } catch (e) { $('#rejectErr').textContent = errMsg(e); }
}
function startRegister(as) {
  const r = { ...R.current, nickname: R.list.find(x => x.id === R.current.id)?.nickname };
  if (as === 'artist') {   // R-131: 제보 내용으로 등록 폼을 채움 → 저장하면 제보 '등록 완료'
    const ig = (String(r.sourceUrl || '').match(/instagram\.com\/([A-Za-z0-9._]{1,30})/) || [])[1] || '';
    const rel = r.artistKind === 'solo' ? (r.artistGroup?.id ? [r.artistGroup] : []) : (r.artistMembers || []).filter(m => m.id);
    artistState.prefill = { name: r.title, kind: r.artistKind === 'solo' ? 'solo' : 'group', instagram: ig, relIds: rel.map(m => ({ id: m.id, name: m.name })) };
    artistState.fromReport = r; artistState.returnTo = `#/reports/${R.status}`; location.hash = '#/artists/edit/new';
  } else if (as === 'opening') { O.fromReport = r; location.hash = '#/openings/new'; } else { P.fromReport = r; location.hash = '#/performances/new'; }
}

/* ---------- ADM-04 이벤트 ---------- */
const E = { list: [], thumb: null };
const TAGS = ['초대', '챌린지', '공유', '증정'];
async function renderPromotions() {
  E.list = await api.admin.promotions.list();
  const rows = E.list.map(p => ({ p, st: eventStatus(p, today()) })).sort((a, b) => (a.p.hidden - b.p.hidden) || a.st.rank - b.st.rank || String(b.p.startDate).localeCompare(String(a.p.startDate)));
  const cols = '--cols: 100px 56px minmax(0,2fr) 1.4fr 112px 48px';
  const thumb = p => (p.thumbnail ? `<span class="ev-thumb img" style="background-image:url('${esc(p.thumbnail)}');width:44px;height:44px" aria-hidden="true"></span>` : `<span class="ev-thumb" style="--c:${esc(p.color || '#d9cce6')};width:44px;height:44px;font-size:20px" aria-hidden="true">${esc(p.emoji || '🎁')}</span>`);
  main().innerHTML = head('이벤트 관리', '사용자 화면 \'이벤트\' 탭에 보이는 홍보·이벤트예요.', '<a class="btn primary small" href="#/promotions/new">새 이벤트</a>')
    + `<div class="adm-list"><div class="adm-row head" style="${cols}"><span>상태</span><span>썸네일</span><span>제목</span><span>기간</span><span>수정</span><span>게시</span></div>
    ${rows.length ? rows.map(({ p, st }) => `<div class="adm-row click has-sw${p.hidden || !p.isPublished ? ' muted-row' : ''}" style="${cols}" data-href="#/promotions/${encodeURIComponent(p.id)}" tabindex="0">
      <span><span class="badge ${st.key}">${esc(st.label)}</span>${p.hidden ? ' <span class="src-chip">숨김</span>' : ''}</span><span data-m="hide">${thumb(p)}</span><span><span class="t">${esc(p.title)}</span>${p.tag ? `<br><span class="sub">${esc(p.tag)}</span>` : ''}</span>
      <span class="sub">${esc(fmtD(p.startDate))} ~ ${esc(fmtD(p.endDate))}</span><span class="sub" data-m="hide">${esc(fmtDT(p.updatedAt))}</span><span>${tsw(p.id, p.isPublished, 'promotion', '게시')}</span><span class="go" aria-hidden="true">›</span></div>`).join('') : '<p class="adm-empty">아직 이벤트가 없어요.</p>'}</div>`;
}
async function renderPromotionForm(id) {
  if (!E.list.length) E.list = await api.admin.promotions.list();
  const p = id === 'new' ? { isPublished: true, applyLabel: '응모하기', notes: [] } : E.list.find(x => x.id === id);
  if (!p) { main().innerHTML = '<p class="adm-empty">이벤트를 찾지 못했어요. <a class="link" href="#/promotions">목록으로</a></p>'; return; }
  E.thumb = p.thumbnail || null; const custom = p.tag && !TAGS.includes(p.tag);
  main().innerHTML = head(id === 'new' ? '새 이벤트' : '이벤트 수정', '', '<a class="link" href="#/promotions">← 목록</a>') + `<form class="adm-form" id="promoForm" novalidate data-id="${esc(p.id || '')}">
    <label class="full">제목 *<input type="text" name="title" maxlength="60" value="${esc(p.title || '')}"><span class="fld-err" data-err="title"></span></label>
    <label>유형<select name="tag">${TAGS.map(t => `<option${p.tag === t ? ' selected' : ''}>${t}</option>`).join('')}<option value="__custom"${custom ? ' selected' : ''}>직접 입력</option></select></label>
    <label>유형 직접 입력<input type="text" name="tagCustom" maxlength="12" value="${esc(custom ? p.tag : '')}"${custom ? '' : ' disabled'}></label>
    <label>시작일 *<input type="date" name="startDate" value="${esc(p.startDate || '')}"><span class="fld-err" data-err="startDate"></span></label>
    <label>종료일 *<input type="date" name="endDate" value="${esc(p.endDate || '')}"><span class="fld-err" data-err="endDate"></span></label>
    <label class="full">요약 <small>목록·상세 위쪽에 보여요</small><input type="text" name="summary" maxlength="100" value="${esc(p.summary || '')}"></label>
    <label class="full">본문 <small>빈 줄로 문단을 나눠요</small><textarea name="body" rows="5" maxlength="2000">${esc(p.body || '')}</textarea></label>
    <label class="full">유의사항 <small>한 줄에 하나</small><textarea name="notes" rows="3" maxlength="1000">${esc((p.notes || []).join('\n'))}</textarea></label>
    <label>응모 버튼 문구<input type="text" name="applyLabel" maxlength="20" value="${esc(p.applyLabel || '응모하기')}"></label>
    <label>응모 링크 * <small>https만</small><input type="url" name="applyUrl" inputmode="url" placeholder="https://" value="${esc(p.applyUrl || '')}"><span class="fld-err" data-err="applyUrl"></span></label>
    <div class="full"><label>썸네일 이미지 <small>JPG·PNG, 2MB 이하 · 없으면 기본 그림</small><input type="file" name="thumbFile" accept="image/jpeg,image/png"></label>
      <div id="thumbBox" style="display:flex;gap:10px;align-items:center;margin-top:8px">${thumbBox()}</div><span class="fld-err" data-err="thumb"></span></div>
    <label class="check full"><input type="checkbox" name="isPublished"${p.isPublished !== false ? ' checked' : ''}> 게시 (끄면 사용자 화면에서 숨겨요)</label>
    <p class="ferr full" id="formErr" role="alert"></p>
    <div class="bar">${p.id ? `<button class="btn ghost small left" type="button" data-act="hide" data-kind="promotion" data-id="${esc(p.id)}" data-on="${p.hidden ? '0' : '1'}">${p.hidden ? '숨김 해제' : '숨기기'}</button>` : ''}<button class="btn ghost" type="button" data-act="preview-promo">미리보기</button><button class="btn primary" type="submit">저장</button></div></form>`;
}
const thumbBox = () => (E.thumb ? `<img class="thumb-prev" src="${esc(E.thumb)}" alt="썸네일 미리보기"><button class="link" type="button" data-act="thumb-clear">이미지 빼기</button>` : '<span class="small muted">이미지 없음 (기본 그림)</span>');
function readPromo(f) {
  const v = k => String(f.elements[k]?.value || '').trim();
  const tag = v('tag') === '__custom' ? v('tagCustom') : v('tag');
  return { title: v('title'), tag, startDate: v('startDate'), endDate: v('endDate'), summary: v('summary'), body: String(f.elements.body.value || '').trim(), notes: String(f.elements.notes.value || '').split('\n').map(s => s.trim()).filter(Boolean),
    applyLabel: v('applyLabel') || '응모하기', applyUrl: v('applyUrl'), thumbnail: E.thumb, isPublished: f.elements.isPublished.checked };
}
async function submitPromo(f) {
  const d = readPromo(f); let ok = true;
  ok = fieldErr(f, 'title', d.title ? '' : '필수 항목이에요.') && ok;
  ok = fieldErr(f, 'startDate', d.startDate ? '' : '필수 항목이에요.') && ok;
  ok = fieldErr(f, 'endDate', !d.endDate ? '필수 항목이에요.' : d.startDate && d.endDate < d.startDate ? '종료일이 시작일보다 빨라요.' : '') && ok;
  ok = fieldErr(f, 'applyUrl', !d.applyUrl ? '필수 항목이에요.' : !isHttps(d.applyUrl) ? 'https:// 로 시작하는 주소만 넣을 수 있어요.' : '') && ok;
  if (!ok) return;
  if (f.dataset.id) d.id = f.dataset.id;
  try { await api.admin.promotions.save(d); toast('저장했어요.'); E.list = []; location.hash = '#/promotions'; } catch (e) { $('#formErr').textContent = errMsg(e); }
}
async function pickThumb(input) {
  const file = input.files?.[0]; const f = input.form; fieldErr(f, 'thumb', '');
  if (!file) return;
  try { E.thumb = await api.admin.promotions.uploadThumbnail(file); $('#thumbBox').innerHTML = thumbBox(); } catch (e) { fieldErr(f, 'thumb', errMsg(e)); input.value = ''; }
}
function previewPromo() {
  const p = readPromo($('#promoForm')); const st = eventStatus(p, today());
  const hero = p.thumbnail ? `<span class="ev-hero img" style="background-image:url('${esc(p.thumbnail)}')" aria-hidden="true"></span>` : '<span class="ev-hero" style="--c:#d9cce6" aria-hidden="true">🎁</span>';
  sheet(`<h2>미리보기</h2><p class="small muted">사용자 화면 이벤트 상세 모양이에요.</p><div class="adm-preview"><section class="ev-detail">${hero}<span class="op-top"><span class="badge ${st.key}">${esc(st.label)}</span>${p.tag ? `<span class="ev-tag">${esc(p.tag)}</span>` : ''}</span>
    <h1 style="font-size:20px">${esc(p.title || '(제목)')}</h1><p class="muted small">${esc([p.startDate && L.fmtDayKo(p.startDate), p.endDate && L.fmtDayKo(p.endDate)].filter(Boolean).join(' ~ '))}</p>
    <p class="ev-summary">${esc(p.summary)}</p>${p.body.split(/\n{2,}/).filter(Boolean).map(t => `<p class="ev-text">${esc(t)}</p>`).join('')}
    ${p.notes.length ? `<h2 class="sub">유의사항</h2><ul class="ev-notes">${p.notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}<span class="btn primary block">${esc(p.applyLabel)} ↗</span></section></div>`);
}

/* ---------- ADM-05 공연 ---------- */
const P = { list: [], filter: 'upcoming', q: '', page: 0, fromReport: null, runs: [] };
const P_FILTERS = [['upcoming', '앞으로'], ['past', '지난 공연'], ['kopis', 'KOPIS'], ['manual', '직접 등록'], ['noArtist', '아티스트 비어 있음'], ['hidden', '숨김']];
const PAGE = 50;
async function renderPerformances() {
  [P.list, P.runs, O.list] = await Promise.all([api.admin.performances.list(), api.admin.kopis.runs(), api.admin.openings.list()]);
  O.perfs = P.list;
  const last = P.runs[0]; const lastOk = P.runs.find(r => r.status === 'success');
  main().innerHTML = head('공연 관리', 'KOPIS에서 자동으로 가져온 공연과 직접 등록한 공연이에요.', '<a class="btn primary small" href="#/performances/new">공연 직접 등록</a>')
    + `<section class="adm-card adm-sync" style="margin-bottom:14px" aria-label="KOPIS 수집 상태"><div class="adm-head" style="margin:0"><div><p class="eyebrow" style="margin:0">KOPIS 수집</p>
      ${last ? (last.status === 'failed' ? `<b class="warn">갱신 실패 — ${lastOk ? esc(fmtDT(lastOk.finishedAt || lastOk.startedAt)) + '이 마지막' : '성공 기록 없음'}</b>` : `<b>마지막 갱신 ${esc(fmtDT(last.finishedAt || last.startedAt))} · ${Number(last.listCount || 0).toLocaleString('ko-KR')}건</b>`) : '<b>아직 수집 기록이 없어요</b>'}</div>
      <button class="btn small" type="button" data-act="kopis-resync">지금 다시 수집</button></div>
      ${P.runs.length ? `<ol>${P.runs.map(r => `<li>${esc(fmtDT(r.startedAt))} · ${r.status === 'success' ? '성공' : r.status === 'running' ? '진행 중' : '<span class="warn">실패</span>'} · 목록 ${r.listCount || 0}건 · 상세 ${r.detailCount || 0}건${r.remainingDetails ? ` (남은 상세 ${r.remainingDetails})` : ''}${r.trigger === 'admin' ? ' · 운영자 실행' : ''}${r.error ? ` — ${esc(r.error)}` : ''}</li>`).join('')}</ol>` : ''}</section>
    <div class="adm-tools"><input type="search" data-search="P" placeholder="공연명·공연장·아티스트 검색" value="${esc(P.q)}" aria-label="공연 검색"><div class="adm-chips" role="group" aria-label="공연 필터">${P_FILTERS.map(([k, n]) => `<button type="button" class="chip${P.filter === k ? ' on' : ''}" data-filter="P" data-v="${k}" aria-pressed="${P.filter === k}">${n}</button>`).join('')}</div></div><div id="listWrap"></div>`;
  drawPerformances();
}
function drawPerformances() {
  const t = today(); const k = nameKey(P.q);
  const linked = new Map(O.list.filter(o => o.performanceId && !o.hidden).map(o => [o.performanceId, o]));
  let rows = P.list.filter(p => {
    if (P.filter === 'hidden') return p.hidden; if (p.hidden) return false;
    if (P.filter === 'upcoming' && p.endDate < t) return false;
    if (P.filter === 'past' && p.endDate >= t) return false;
    if (P.filter === 'kopis' && p.source !== 'kopis') return false;
    if (P.filter === 'manual' && p.source === 'kopis') return false;
    if (P.filter === 'noArtist' && (p.artists || []).length) return false;
    return !k || nameKey(p.title).includes(k) || nameKey(p.venue).includes(k) || (p.artists || []).some(a => nameKey(a).includes(k));
  });
  rows.sort((a, b) => (P.filter === 'past' ? b.startDate.localeCompare(a.startDate) : a.startDate.localeCompare(b.startDate)) || a.title.localeCompare(b.title, 'ko'));
  const total = rows.length; const pages = Math.max(1, Math.ceil(total / PAGE)); P.page = Math.min(P.page, pages - 1);
  rows = rows.slice(P.page * PAGE, P.page * PAGE + PAGE);
  const cols = '--cols: 80px minmax(0,2.4fr) 1fr 1.2fr 70px minmax(0,1fr)';
  $('#listWrap').innerHTML = `<p class="small muted" style="margin:0 0 8px">${total.toLocaleString('ko-KR')}건</p><div class="adm-list"><div class="adm-row head" style="${cols}"><span>출처</span><span>공연명 · 아티스트</span><span>공연일</span><span>공연장</span><span>지역</span><span>연결된 오픈 공지</span></div>
    ${rows.length ? rows.map(p => { const o = linked.get(p.id); return `<div class="adm-row click${p.hidden ? ' muted-row' : ''}" style="${cols}" data-href="#/performances/${encodeURIComponent(p.id)}" tabindex="0">
      <span><span class="src-chip${p.source === 'kopis' ? ' kopis' : ''}">${p.source === 'kopis' ? 'KOPIS' : '직접 등록'}</span></span>
      <span><span class="t">${esc(p.title)}</span><br><span class="sub">${(p.artists || []).length ? esc(p.artists.join(' · ')) : '<span class="warn">아티스트 비어 있음</span>'}</span></span>
      <span class="sub">${esc(fmtD(p.startDate))}${p.endDate && p.endDate !== p.startDate ? ' ~ ' + esc(fmtD(p.endDate)) : ''}</span><span class="sub">${esc(p.venue || '')}</span><span class="sub" data-m="hide">${esc(p.region || '')}</span>
      <span class="sub" data-m="hide">${o ? esc(o.title) : '-'}</span><span class="go" aria-hidden="true">›</span></div>`; }).join('') : '<p class="adm-empty">조건에 맞는 공연이 없어요.</p>'}</div>
    ${pages > 1 ? `<div class="adm-pager"><button class="btn small ghost" type="button" data-act="page" data-d="-1"${P.page === 0 ? ' disabled' : ''}>이전</button><span>${P.page + 1} / ${pages}</span><button class="btn small ghost" type="button" data-act="page" data-d="1"${P.page >= pages - 1 ? ' disabled' : ''}>다음</button></div>` : ''}`;
}
async function renderPerformanceForm(id) {
  if (!P.list.length) P.list = await api.admin.performances.list();
  const fr = id === 'new' ? P.fromReport : null; if (id !== 'new') P.fromReport = null;
  const p = id === 'new' ? (fr ? { title: fr.title, artists: fr.artists || [], venue: fr.venue, startDate: fr.showDate || '', endDate: fr.showDate || '', region: '', ticketLinks: fr.ticketUrl ? [{ name: '예매처', url: fr.ticketUrl }] : [] } : { artists: [], ticketLinks: [] }) : P.list.find(x => x.id === id);
  if (!p) { main().innerHTML = '<p class="adm-empty">공연을 찾지 못했어요. <a class="link" href="#/performances">목록으로</a></p>'; return; }
  const kopis = p.source === 'kopis'; const ro = kopis ? ' readonly' : ''; const link = (p.ticketLinks || [])[0] || {};
  const suggest = kopis && !(p.artists || []).length ? extractArtists(p.title) : [];
  main().innerHTML = head(id === 'new' ? '공연 직접 등록' : kopis ? 'KOPIS 공연 · 출연진 보정' : '공연 수정', '', '<a class="link" href="#/performances">← 목록</a>')
    + (fr ? `<p class="adm-note">제보 「${esc(fr.title)}」(${esc(fr.nickname || '')})에서 가져온 내용이에요. 저장하면 제보가 '등록 완료'로 바뀌어요.</p>` : '')
    + (kopis ? `<p class="adm-note">KOPIS에서 가져온 공연이라 출연진(아티스트)만 고칠 수 있어요. 고친 출연진은 다음 수집 때 덮어쓰지 않아요${p.artistsLocked ? ' (지금 고정됨)' : ''}.</p>` : '')
    + `<form class="adm-form" id="perfForm" novalidate data-id="${esc(p.id || '')}" data-kopis="${kopis ? 1 : 0}">
    <label class="full">공연명 *<input type="text" name="title" maxlength="120" value="${esc(p.title || '')}"${ro}><span class="fld-err" data-err="title"></span></label>
    <label>공연일 *<input type="date" name="startDate" value="${esc(p.startDate || '')}"${ro}><span class="fld-err" data-err="startDate"></span></label>
    <label>끝나는 날 <small>하루 공연이면 비워 두세요</small><input type="date" name="endDate" value="${esc(p.endDate && p.endDate !== p.startDate ? p.endDate : '')}"${ro}><span class="fld-err" data-err="endDate"></span></label>
    <label>공연장 *<input type="text" name="venue" maxlength="80" value="${esc(p.venue || '')}"${ro}><span class="fld-err" data-err="venue"></span></label>
    <label>지역 *${kopis ? `<input type="text" name="region" value="${esc(p.region || '')}" readonly>` : `<select name="region"><option value="">고르기</option>${REGIONS.map(r => `<option${p.region === r ? ' selected' : ''}>${r}</option>`).join('')}</select>`}<span class="fld-err" data-err="region"></span></label>
    <label class="full">출연진(아티스트) <small>쉼표로 구분 — 이름마다 아래에 아티스트 박스가 생겨요. 눌러서 연결을 고를 수 있어요 (한 공연에 여러 명)</small><input type="text" name="artists" maxlength="200" value="${esc((p.artists || []).join(', '))}" data-chips="linkBoxes"><span class="adm-artist-boxes" id="linkBoxes"></span>
      ${suggest.length ? `<span class="small">공연명에서 찾은 후보: ${suggest.map(s => `<button class="link" type="button" data-act="artist-add" data-v="${esc(s)}">${esc(s)} +</button>`).join(' ')}</span>` : ''}</label>
    ${kopis && p.castRaw ? `<p class="full small muted" style="margin:0">KOPIS 출연진(참고): ${esc(p.castRaw)}</p>` : ''}
    ${kopis ? (p.ticketLinks || []).length ? `<p class="full small muted" style="margin:0">예매처: ${p.ticketLinks.map(l => esc(l.name)).join(' · ')}</p>` : ''
      : `<label>예매처 이름<input type="text" name="linkName" maxlength="40" value="${esc(link.name || '')}" placeholder="예: NOL 티켓"></label><label>예매처 링크 <small>https만</small><input type="url" name="linkUrl" inputmode="url" placeholder="https://" value="${esc(link.url || '')}"><span class="fld-err" data-err="linkUrl"></span></label>`}
    <p class="ferr full" id="formErr" role="alert"></p>
    <div class="bar">${p.id ? `<button class="btn ghost small left" type="button" data-act="hide" data-kind="performance" data-id="${esc(p.id)}" data-on="${p.hidden ? '0' : '1'}">${p.hidden ? '숨김 해제' : '숨기기'}</button>` : ''}<button class="btn primary" type="submit">저장</button></div></form>`;
  await initLinkBoxes('performance', p);
}
async function submitPerf(f) {
  const v = k => String(f.elements[k]?.value || '').trim(); const kopis = f.dataset.kopis === '1'; const id = f.dataset.id;
  const artists = splitList(v('artists'));
  let data;
  if (kopis) data = { ...P.list.find(x => x.id === id), artists };
  else {
    data = { title: v('title'), startDate: v('startDate'), endDate: v('endDate') || v('startDate'), venue: v('venue'), region: v('region'), artists, ticketLinks: v('linkUrl') ? [{ name: v('linkName') || '예매처', url: v('linkUrl') }] : [] };
    let ok = true;
    for (const k of ['title', 'startDate', 'venue', 'region']) ok = fieldErr(f, k, data[k] ? '' : '필수 항목이에요.') && ok;
    ok = fieldErr(f, 'endDate', data.endDate < data.startDate ? '공연일보다 빠를 수 없어요.' : '') && ok;
    ok = fieldErr(f, 'linkUrl', isHttps(v('linkUrl')) ? '' : 'https:// 로 시작하는 주소만 넣을 수 있어요.') && ok;
    if (!ok) return;
    if (id) data.id = id;
  }
  try {
    if (!id && P.fromReport) { const r = await api.admin.reports.register(P.fromReport.id, 'performance', data); await saveLinks('performance', r.createdId, artists); P.fromReport = null; toast('저장했어요. 제보를 등록 완료로 바꿨어요.'); }
    else { const saved = await api.admin.performances.save(data); await saveLinks('performance', saved.id || id, artists); toast('저장했어요.'); }
    P.list = []; location.hash = '#/performances';
  } catch (e) { $('#formErr').textContent = errMsg(e); }
}
async function resync(btn) {
  btn.disabled = true; btn.textContent = '수집 중…';
  try { const run = await api.admin.kopis.resync(); toast(run && run.status === 'failed' ? `수집하지 못했어요: ${run.error || ''}` : '수집을 마쳤어요.'); } catch (e) { toast(errMsg(e)); }
  await renderPerformances();
}

/* ---------- ADM-06 라이브클럽 공연장 ---------- */
async function renderVenues() {
  const [list, perfs] = await Promise.all([api.admin.clubVenues.list(), P.list.length ? P.list : api.admin.performances.list()]);
  P.list = perfs; const t = today();
  const upcoming = perfs.filter(p => !p.hidden && p.endDate >= t);
  const count = n => { const k = nameKey(n); return upcoming.filter(p => nameKey(p.venue).includes(k)).length; };
  const live = list.filter(v => !v.hidden).sort((a, b) => a.name.localeCompare(b.name, 'ko')); const gone = list.filter(v => v.hidden);
  const cols = '--cols: minmax(0,2fr) 1fr 100px';
  main().innerHTML = head('라이브클럽 공연장', '이름 일부만 맞아도 라이브클럽 공연으로 봐요. 추천 \'이번 주 라이브클럽 공연\'에 쓰여요.')
    + `<form class="adm-inline" id="venueForm"><input type="text" name="name" maxlength="40" placeholder="공연장 이름 (예: 롤링홀)" aria-label="추가할 공연장 이름"><button class="btn primary small" type="submit">추가</button></form><p class="ferr" id="venueErr" role="alert"></p>
    <div class="adm-list"><div class="adm-row head" style="${cols}"><span>이름</span><span>앞으로 공연</span><span></span></div>
    ${live.map(v => `<div class="adm-row" style="${cols}"><span class="t">${esc(v.name)}</span><span class="sub">${count(v.name)}건</span><span class="cell-actions"><button class="btn small ghost" type="button" data-act="venue-hide" data-id="${esc(v.id)}" data-on="1">삭제</button></span></div>`).join('') || '<p class="adm-empty">등록된 공연장이 없어요.</p>'}</div>
    ${gone.length ? `<h2 class="sub" style="margin-top:20px">삭제한 공연장</h2><div class="adm-list">${gone.map(v => `<div class="adm-row muted-row" style="${cols}"><span class="t">${esc(v.name)}</span><span></span><span class="cell-actions"><button class="btn small ghost" type="button" data-act="venue-hide" data-id="${esc(v.id)}" data-on="0">되살리기</button></span></div>`).join('')}</div>` : ''}`;
}
async function submitVenue(f) {
  const name = f.elements.name.value.trim(); $('#venueErr').textContent = '';
  if (!name) { $('#venueErr').textContent = '공연장 이름을 입력해 주세요.'; return; }
  try { await api.admin.clubVenues.add(name); toast('추가했어요.'); await renderVenues(); } catch (e) { $('#venueErr').textContent = errMsg(e); }
}

/* ---------- ADM-07 회원 ---------- */
const M = { q: '', list: [] };
const PROVIDER = { kakao: '카카오', google: 'Google', email: '이메일' };
async function renderMembers() {
  main().innerHTML = head('회원', '읽기 전용이에요. 탈퇴·정지 처리는 베타에서 하지 않아요 (결정 20).')
    + `<div class="adm-tools"><input type="search" data-search="M" placeholder="닉네임 검색" value="${esc(M.q)}" aria-label="회원 검색"></div><div id="listWrap"></div>`;
  await drawMembers();
}
let memberTimer = null;
async function drawMembers() {
  M.list = await api.admin.members.list(M.q);
  const cols = '--cols: minmax(0,1.4fr) 80px 110px 1.4fr 60px 70px minmax(0,1.6fr)';
  $('#listWrap').innerHTML = `<p class="small muted" style="margin:0 0 8px">${M.list.length}명</p><div class="adm-list"><div class="adm-row head" style="${cols}"><span>닉네임</span><span>가입 수단</span><span>가입일</span><span>보고 싶은 · 관람 · 관심</span><span>제보</span><span>알림 동의</span><span>이메일</span></div>
    ${M.list.map(m => `<div class="adm-row" style="${cols}"><span class="t">${esc(m.nickname)}${m.isAdmin ? ' <span class="src-chip report">운영자</span>' : ''}</span><span class="sub">${esc(PROVIDER[m.provider] || m.provider || '')}</span><span class="sub">${esc(fmtD(kst(m.createdAt).date))}</span>
      <span class="sub">보고 싶은 ${m.planned} · 관람 ${m.attended} · 관심 ${m.artists}</span><span class="sub">제보 ${m.reports}</span><span class="sub">${m.marketing ? '동의' : '-'}</span>
      <span class="sub" id="em-${esc(m.id)}">${m.emailMasked ? `${esc(m.emailMasked)} <button class="link" type="button" data-act="reveal" data-id="${esc(m.id)}">보기</button>` : '-'}</span></div>`).join('') || '<p class="adm-empty">맞는 회원이 없어요.</p>'}</div>
    <p class="small muted">이메일 [보기]를 누르면 열람 기록이 남아요 (R-107).</p>`;
}
async function reveal(id) {
  try { const email = await api.admin.members.revealEmail(id); const el = document.getElementById('em-' + id); if (el) el.textContent = email || '(없음)'; } catch (e) { toast(errMsg(e)); }
}

/* ---------- 라우터 ---------- */
function updatePendingUi() {
  const nav = $$('#admNav a').find(a => a.getAttribute('href') === '#/reports');
  if (nav) { nav.querySelector('.nav-count')?.remove(); if (pending) nav.insertAdjacentHTML('beforeend', `<span class="nav-count" aria-label="검수 대기 ${pending}건">${pending}</span>`); }
  const top = $('.adm-top'); if (top) { top.lastElementChild.outerHTML = pending ? `<a class="pend" href="#/reports/submitted" aria-label="검수 대기 제보 ${pending}건">${pending}</a>` : '<span></span>'; }
}
async function route() {
  closeSheet();
  const parts = (location.hash.replace(/^#\/?/, '') || 'dashboard').split('/').map(s => decodeURIComponent(s));
  const u = api.auth.current();
  if (!u) { renderLogin(); return; }
  if (!u.isAdmin) { renderNoAuth(); return; }
  const [sec, a, b] = parts;
  if (!TITLES[sec]) { location.replace('#/dashboard'); return; }
  try { pending = (await api.admin.dashboard()).reportsSubmitted || 0; } catch { /* 표시만 */ }
  shell(sec, '<p class="loading">불러오는 중…</p>');
  try {
    switch (sec) {
      case 'dashboard': await renderDashboard(); break;
      case 'openings': await (a ? renderOpeningForm(a) : renderOpenings()); break;
      case 'reports': await renderReports(a, b); break;
      case 'promotions': await (a ? renderPromotionForm(a) : renderPromotions()); break;
      case 'performances': await (a ? renderPerformanceForm(a) : renderPerformances()); break;
      case 'artists': await renderArtists(a, b); break;
      case 'venues': await renderVenues(); break;
      case 'members': await renderMembers(); break;
    }
  } catch (e) { main().innerHTML = `<p class="adm-empty">불러오지 못했어요. ${esc(errMsg(e))} <button class="link" type="button" data-act="reload">다시 시도</button></p>`; }
  window.scrollTo(0, 0);
}

/* ---------- 이벤트 위임 ---------- */
document.addEventListener('click', async e => {
  const a = e.target.closest('[data-act]');
  if (!a) {
    const row = e.target.closest('[data-href]');
    if (row && !e.target.closest('a, button, input, label')) location.hash = row.dataset.href;
    return;
  }
  const act = a.dataset.act;
  if (act.startsWith('ar-')) { artistAction(act, a); return; }
  switch (act) {
    case 'menu': openMenu(); break;
    case 'menu-close': closeMenu(); break;
    case 'close-sheet': closeSheet(); break;
    case 'reload': route(); break;
    case 'logout': await api.auth.signOut(); toast('로그아웃했어요.'); location.hash = '#/dashboard'; route(); break;
    case 'preview-opening': previewOpening(); break;
    case 'preview-promo': previewPromo(); break;
    case 'perf-pick': pickPerf(a.dataset.id); break;
    case 'perf-unlink': $('#openingForm').elements.performanceId.value = ''; $('#perfLinked').innerHTML = '<span class="muted">연결된 공연 없음</span>'; break;
    case 'report-reg': startRegister(a.dataset.as); break;
    case 'report-reject': rejectSheet(); break;
    case 'thumb-clear': E.thumb = null; $('#thumbBox').innerHTML = thumbBox(); break;
    case 'kopis-resync': resync(a); break;
    case 'page': P.page += Number(a.dataset.d); drawPerformances(); window.scrollTo(0, 0); break;
    case 'reveal': reveal(a.dataset.id); break;
    case 'artist-add': { const inp = $('#perfForm').elements.artists; inp.value = [...splitList(inp.value), a.dataset.v].join(', '); drawChips(inp); a.remove(); break; }
    case 'venue-hide': try { await api.admin.clubVenues.hide(a.dataset.id, a.dataset.on === '1'); toast(a.dataset.on === '1' ? '삭제했어요. 아래에서 되살릴 수 있어요.' : '되살렸어요.'); await renderVenues(); } catch (err) { toast(errMsg(err)); } break;
    case 'hide': {
      const on = a.dataset.on === '1'; const kind = a.dataset.kind;
      const fn = { opening: api.admin.openings, promotion: api.admin.promotions, performance: api.admin.performances }[kind];
      try { await fn.hide(a.dataset.id, on); toast(on ? '숨겼어요. 목록의 \'숨김\'에서 되돌릴 수 있어요.' : '숨김을 풀었어요.'); if (kind === 'opening') O.list = []; if (kind === 'promotion') E.list = []; if (kind === 'performance') P.list = []; location.hash = { opening: '#/openings', promotion: '#/promotions', performance: '#/performances' }[kind]; } catch (err) { toast(errMsg(err)); }
      break;
    }
  }
});
document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches?.('[data-href]')) location.hash = e.target.dataset.href; });
document.addEventListener('click', e => {
  const c = e.target.closest('[data-filter]'); if (!c) return;
  if (c.dataset.filter === 'O') { O.filter = c.dataset.v; drawOpenings(); }
  if (c.dataset.filter === 'P') { P.filter = c.dataset.v; P.page = 0; drawPerformances(); }
  $$(`[data-filter="${c.dataset.filter}"]`).forEach(x => { x.classList.toggle('on', x === c); x.setAttribute('aria-pressed', String(x === c)); });
});
document.addEventListener('submit', e => {
  const f = e.target; const fns = { loginForm: submitLogin, openingForm: submitOpening, rejectForm: submitReject, promoForm: submitPromo, perfForm: submitPerf, venueForm: submitVenue, artistForm: submitArtist, mergeForm: submitMerge, linkForm: submitLink };
  if (fns[f.id]) { e.preventDefault(); fns[f.id](f); }
});
document.addEventListener('input', e => {
  const t = e.target;
  if (t.dataset.search === 'O') { O.q = t.value; drawOpenings(); }
  if (t.dataset.search === 'P') { P.q = t.value; P.page = 0; drawPerformances(); }
  if (t.dataset.search === 'M') { M.q = t.value; clearTimeout(memberTimer); memberTimer = setTimeout(drawMembers, 250); }
  if (t.id === 'perfQ') drawPerfPick(t.value);
  artistInput(t);
  if (t.dataset.chips) drawChips(t);
  if (t.name && t.form) fieldErr(t.form, t.name, '');
});
document.addEventListener('change', async e => {
  const t = e.target;
  if (t.dataset.pub) {
    const fn = t.dataset.pub === 'opening' ? api.admin.openings : api.admin.promotions;
    try { await fn.setPublished(t.dataset.id, t.checked); toast(t.checked ? '게시했어요.' : '게시를 껐어요. 사용자 화면에서 숨겨요.'); t.closest('.adm-row')?.classList.toggle('muted-row', !t.checked); }
    catch (err) { t.checked = !t.checked; toast(errMsg(err)); }
  }
  if (t.name === 'noTime') { const time = t.form.elements.openTime; time.disabled = t.checked; if (t.checked) time.value = ''; }
  if (t.name === 'tag' && t.form?.id === 'promoForm') { const c = t.form.elements.tagCustom; c.disabled = t.value !== '__custom'; if (!c.disabled) c.focus(); }
  if (t.name === 'thumbFile') pickThumb(t);
  artistChange(t);
});
window.addEventListener('hashchange', () => { menuPushed = false; route(); });

initArtists({ main, head, sheet, closeSheet, toast, errMsg, fieldErr });
(async () => {
  try { await api.init(); } catch (e) { root.innerHTML = `<p class="adm-empty">연결하지 못했어요. ${esc(errMsg(e))}</p>`; return; }
  api.auth.onChange(() => { if (!api.auth.current() || !api.auth.current().isAdmin) route(); });
  route();
})();
