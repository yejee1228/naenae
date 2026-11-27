// MY-01 나의 내내 (회원) · MY-02 (비회원) · MY-03 배지 가이드 · MY-04 인증샷 · SHT-05 기록 수정 (R-30~49, R-60~62)
import api from '../../shared/api/index.js';
import { L } from '../../shared/lib.js';
import { CONFIG } from '../../shared/config.js';
import { REGIONS, nameKey } from '../../shared/domain.js';
import { artistCard, pendingCard, searchArtists, reportArtistCta } from './artists.js';
import { esc, page, $, $$, sheet, closeSheet, toast, track, medal, inApp } from '../ui.js';
import { S, today, badgeRecords } from '../state.js';

const SLOTS = [['primary', '대표'], ['venue', '단골'], ['fan', '찐팬'], ['travel', '원정러'], ['lives', '관람완료']];
function badgeCard() {
  const t = today(); const scope = S.badgeScope; const ym = S.badgeMonth; const year = ym.slice(0, 4);
  const locked = scope === 'year' && !L.yearRevealed(year, t);
  const b = L.computeBadges(badgeRecords(), S.interests, scope, scope === 'year' ? year : ym);
  const got = { primary: b.primary }; b.extras.forEach(x => { got[x.id] = x; });
  const slots = SLOTS.map(([id, label]) => {
    const x = locked ? null : got[id]; const c = L.BADGE_CONCEPTS.find(k => k.slot === id);
    return x ? `<a class="slot ${id === 'primary' ? 'main' : ''} on" href="#/badges" title="${esc(x.desc)}"><span class="slot-ico">${medal(x)}</span><span class="slot-name">${esc(x.name)}</span></a>`
      : `<a class="slot ${id === 'primary' ? 'main' : ''}" href="#/badges" aria-label="${label} 배지 빈 자리 — 가이드 보기"><span class="slot-ico empty" aria-hidden="true"><i>${c.emoji}</i></span><span class="slot-name">${label}</span></a>`;
  }).join('');
  const [yy, mm] = ym.split('-').map(Number);
  const canNext = scope === 'month' ? ym < t.slice(0, 7) : year < t.slice(0, 4);
  const step = scope === 'month' ? 1 : 12;
  return `<section class="badge-card${locked ? ' locked-year' : ''}">
    <div class="badge-head"><p class="eyebrow">TASTE BADGE <a class="guide-link" href="#/badges" data-track="badge_guide_open" data-value="card">가이드 ⓘ</a></p>
      <div class="seg mini" role="group" aria-label="배지 기간"><button type="button" data-act="badge-scope" data-v="month" aria-pressed="${scope === 'month'}">이달</button><button type="button" data-act="badge-scope" data-v="year" aria-pressed="${scope === 'year'}">연말 결산</button></div></div>
    <div class="badge-period"><button type="button" class="icon sm" data-act="badge-move" data-v="-${step}" aria-label="이전">‹</button><b>${scope === 'month' ? `${yy}년 ${mm}월` : `${year} 결산`}</b><button type="button" class="icon sm" data-act="badge-move" data-v="${step}" aria-label="다음"${canNext ? '' : ' disabled'}>›</button></div>
    <div class="badge-shelf">${slots}</div>${locked ? '<p class="reveal">12월 1일, 올해의 배지 5개가 공개됩니다</p>' : ''}
    <div class="counts"><a href="#/my/planned"><b>${b.counts.planned}</b><span>보고 싶은 공연</span></a><a href="#/my/attended"><b>${b.counts.attended}</b><span>관람 완료</span></a><a href="#/my/artists"><b>${b.counts.artists}</b><span>관심 아티스트</span></a></div></section>`;
}
function recordRow(r) {
  const sub = [r.date ? L.fmtDayKo(r.date) : '날짜 미정', r.venue].filter(Boolean).join(' · ');
  const links = r.type === 'planned' ? (r.date && r.date <= today() ? `<button class="link" type="button" data-act="to-attended" data-id="${esc(r.id)}">관람 완료로</button>` : '')
    : `<a class="link" href="#/stamp/${encodeURIComponent(r.id)}">인증샷 만들기</a>`;
  const manual = !r.performanceId && !r.openingId;   // '목록에 없는 공연 직접 기록'으로 만든 기록
  return `<div class="rec"><div><b>${esc(r.title)}${manual ? '<span class="tag manual">직접 기록</span>' : ''}</b><small>${esc(sub)}</small>${r.artists?.length ? `<small>${esc(r.artists.join(' · '))}</small>` : ''}</div>
    <div class="rec-act">${links}<button class="link" type="button" data-act="edit-rec" data-id="${esc(r.id)}">수정</button><button class="link danger" type="button" data-act="remove-rec" data-id="${esc(r.id)}">삭제</button></div></div>`;
}
function renderGuest() {
  track('auth_gate', { value: 'my' });
  const slots = SLOTS.map(([id, label]) => { const c = L.BADGE_CONCEPTS.find(k => k.slot === id); return `<span class="slot ${id === 'primary' ? 'main' : ''}"><span class="slot-ico empty" aria-hidden="true"><i>${c.emoji}</i></span><span class="slot-name">${label}</span></span>`; }).join('');
  page('my', `<section class="intro compact"><p class="eyebrow">${esc(CONFIG.myNameEn)}</p><p class="slogan-sub">${esc(CONFIG.sloganKo)}</p></section>
    <section class="guest-card"><img src="assets/logo.png" alt="" width="96" height="68"><h2>로그인하고 ${esc(CONFIG.myName)}를 시작합니다</h2>
      <ul class="guest-points"><li><span class="emo sm" style="--c:#efe7f5">👀</span><span>보고 싶은 공연 · 관람 완료 · 관심 아티스트를 한곳에</span></li>
        <li><span class="emo sm" style="--c:#efe7f5">🌈</span><span>기록이 쌓이면 매달 취향 배지가 채워집니다</span></li>
        <li><span class="emo sm" style="--c:#efe7f5">📸</span><span>다녀온 공연은 인증샷으로 스토리에 자랑</span></li></ul>
      <button class="btn primary block" type="button" data-act="login-sheet" data-ctx="my">로그인 · 회원가입</button></section>
    <section class="badge-card guest-preview" aria-hidden="true"><p class="eyebrow">TASTE BADGE</p><div class="badge-shelf">${slots}</div></section>`);
}
export function renderMy(tab) {
  if (!api.auth.current()) { renderGuest(); return; }
  if (tab) S.myTab = tab;
  const t = S.myTab; let list;
  if (t === 'artists') {   // R-126·129: 검색해서 담기 (이름 직접 추가 없앰)
    list = `<label class="ar-searchbox"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
      <input id="artistQ" type="search" placeholder="아티스트 이름으로 찾기" value="${esc(MA.q)}" aria-label="아티스트 검색" autocomplete="off">
      <button type="button" class="ar-clear" data-act="my-artist-clear" aria-label="검색어 지우기"${MA.q ? '' : ' hidden'}>×</button></label>
      <div id="myArtistList"><p class="loading small">불러오는 중…</p></div>`;
  } else {
    const items = S.records.filter(r => r.type === t).sort((a, b) => (t === 'planned' ? (a.date || '9').localeCompare(b.date || '9') : (b.date || '').localeCompare(a.date || '')));
    list = items.length ? `<div class="rec-list">${items.map(recordRow).join('')}</div>` : `<div class="empty">${t === 'planned' ? '오픈 공지나 공연 일정에서 ♡를 눌러 담아 보세요.' : '공연 일정에서 ‘관람했어요’를 누르거나 직접 기록해 보세요.'}</div>`;
  }
  page('my', `<section class="intro compact"><p class="eyebrow">${esc(CONFIG.myNameEn)}</p><p class="slogan-sub">${esc(CONFIG.sloganKo)}</p></section>${badgeCard()}
    <div class="tabs" role="tablist">${[['planned', '보고 싶은 공연'], ['attended', '관람 완료'], ['artists', '관심 아티스트']].map(([k, n]) => `<a role="tab" href="#/my/${k}" aria-selected="${t === k}" class="${t === k ? 'on' : ''}">${n}</a>`).join('')}</div>
    ${list}
    ${t !== 'artists' ? `<details class="manual"><summary>목록에 없는 공연 직접 기록</summary><form class="form" id="manualForm" autocomplete="off">
      <label>공연명 *<input type="text" name="title" required maxlength="80"></label><label>날짜 *<input type="date" name="date" required value="${today()}"></label>
      <label>공연장<input type="text" name="venue" maxlength="40"></label><label>지역<select name="region"><option value="">선택 안 함</option>${REGIONS.map(r => `<option>${r}</option>`).join('')}</select></label>
      <label>아티스트 (쉼표로 구분)<input type="text" name="artists" maxlength="100"></label>
      <label>상태<select name="type"><option value="attended"${t === 'attended' ? ' selected' : ''}>관람 완료</option><option value="planned"${t === 'planned' ? ' selected' : ''}>보고 싶은 공연</option></select></label>
      <button class="btn primary block" type="submit">기록하기</button></form></details>` : ''}
    <p class="settings-link"><a class="link" href="#/settings">설정</a></p>`, { keepScroll: S.keepScroll });
  S.keepScroll = false;
  if (t === 'artists') {
    $('#artistQ').addEventListener('input', e => { MA.q = e.target.value; $('.ar-clear').hidden = !MA.q; drawMyArtists(); });
    drawMyArtists();
  }
}

/* 나의 내내 › 관심 아티스트 (MY-03): 검색어 없음 = 내 관심 아티스트, 있음 = 검색 결과 */
const MA = { q: '' };
async function drawMyArtists() {
  const box = $('#myArtistList'); if (!box) return;
  if (nameKey(MA.q)) {
    searchArtists(MA.q, (list, asked) => {
      if (asked !== MA.q || !$('#myArtistList')) return;
      box.innerHTML = list.length ? `<h2 class="res-head">검색 결과 <span class="count">${list.length}</span></h2><div class="ar-list">${list.map(c => artistCard(c, { from: 'my' })).join('')}</div>${reportArtistCta(MA.q)}`
        : `<div class="empty ar-empty"><b>‘${esc(MA.q)}’와 맞는 아티스트가 없습니다</b><span>띄어쓰기나 영문 이름으로도 찾아보세요.<br>그래도 없으면 제보해 주세요.</span>
          <a class="btn primary small" href="#/report/artist" data-act="report-artist" data-name="${esc(MA.q)}">아티스트 제보하기</a></div>`;
    });
    return;
  }
  if (!S.interests.length) { box.innerHTML = '<div class="empty">관심 아티스트가 없습니다. 위에서 아티스트를 찾아 ♡를 눌러 담아 보세요.</div>'; return; }
  let cards = []; try { cards = await api.artists.cards(S.interests.filter(i => i.artistId).map(i => i.artistId)); } catch { cards = []; }
  if (!$('#myArtistList') || nameKey(MA.q)) return;
  const byId = new Map(cards.map(c => [c.id, c]));
  const rows = S.interests.map(i => (i.artistId ? (byId.has(i.artistId) ? artistCard(byId.get(i.artistId), { mine: true, from: 'my' }) : '') : pendingCard(i))).filter(Boolean);
  box.innerHTML = `<div class="res-row"><h2 class="res-head">내 관심 아티스트 <span class="count">${rows.length}</span></h2><small class="muted">최근 담은 순</small></div><div class="ar-list">${rows.join('')}</div>`;
}
export function myArtistsAction(act) {
  if (act === 'my-artist-clear') { MA.q = ''; const i = $('#artistQ'); if (i) { i.value = ''; i.focus(); } const c = $('.ar-clear'); if (c) c.hidden = true; drawMyArtists(); }
}
/* SHT-05 기록 수정 (R-36: KOPIS 공연은 날짜만) */
export function editSheet(r) {
  const kopis = !!r.performanceId;
  const p = kopis ? S.perfs.find(x => x.id === r.performanceId) : null;
  sheet(`<h2>기록 수정</h2><form class="form" id="editForm" data-id="${esc(r.id)}">
    <p class="small muted">${esc(r.title)}</p>
    <label>날짜<input type="date" name="date" value="${esc(r.date || '')}"${p ? ` min="${p.startDate}" max="${p.endDate < today() || r.type === 'planned' ? p.endDate : today()}"` : ''}></label>
    ${kopis ? '<p class="op-note">공연 일정에서 담은 기록은 날짜만 고칠 수 있습니다.</p>' : `<label>공연장<input type="text" name="venue" maxlength="40" value="${esc(r.venue || '')}"></label>
      <label>지역<select name="region"><option value="">선택 안 함</option>${REGIONS.map(x => `<option${r.region === x ? ' selected' : ''}>${x}</option>`).join('')}</select></label>
      <label>아티스트 (쉼표로 구분)<input type="text" name="artists" maxlength="100" value="${esc((r.artists || []).join(', '))}"></label>`}
    <button class="btn primary block" type="submit">저장</button></form>`);
}

/* MY-03 배지 가이드 (0.5 그대로, 문구만) */
export function renderBadgeGuide() {
  track('badge_guide_view');
  const M = L.BADGE_RULES.month, Y = L.BADGE_RULES.year;
  const crit = { primary: [`세 기록 합계 ${M.primary}개`, `세 기록 합계 ${Y.primary}개`], venue: [`같은 공연장 ${M.venue}회`, `같은 공연장 ${Y.venue}회`], fan: [`같은 아티스트 관람 ${M.fan}회`, `같은 아티스트 관람 ${Y.fan}회`], travel: [`원정러: 지방 ${M.local}회<br>장거리 원정러: 지방 ${M.proLocal}회`, `원정러: 지방 ${Y.local}회<br>장거리 원정러: 지방 ${Y.proLocal}회`], lives: [`관람 완료 ${M.lives}회`, `관람 완료 ${Y.lives}회`] };
  const cards = L.BADGE_CONCEPTS.map((c, i) => `<article class="gcard"><div class="gcard-top">${c.slot === 'travel' ? `${medal({ emoji: c.emoji, color: c.color })}<span class="arrow-r">→</span>${medal({ emoji: c.proEmoji, color: c.proColor })}` : medal({ emoji: c.emoji, color: c.color || '#d9cce6' })}
    <div><span class="axis">${i + 1} · ${esc(c.axis)}</span><h3>${esc(c.title)}</h3><p class="q">${esc(c.q)}</p></div></div><p class="src"><b>재료</b> ${esc(c.source)}</p>
    <div class="crit"><div><span>이달</span>${crit[c.slot][0]}</div><div><span>연말 결산</span>${crit[c.slot][1]}</div></div></article>`).join('');
  const types = Object.entries(L.BADGES).map(([id, x]) => `<li>${medal(x, 'sm')}<div><b>${esc(x.name)}</b><span>${esc(x.desc)}</span><em>${{ 'all-rounder': '세 기록이 고르게 (차이 1 이하)', 'live-goer': '관람 완료가 가장 많을 때', digger: '관심 아티스트가 가장 많을 때', radar: '보고 싶은 공연이 가장 많을 때' }[id]}</em></div></li>`).join('');
  page('my', `<section class="intro compact"><p class="eyebrow">TASTE BADGE GUIDE</p><h1>배지 가이드</h1><p class="slogan-sub">세 가지 기록으로, 다섯 가지 배지를</p></section>
    <section class="guide-sec"><h2 class="sub">기록 세 가지</h2><ul class="sources">
      <li><span class="emo sm" style="--c:#efe7f5">🎫</span><div><b>관람 완료</b><span>공연 일정에서 ‘관람했어요’ · 공연을 본 날 기준</span></div></li>
      <li><span class="emo sm" style="--c:#efe7f5">💜</span><div><b>관심 아티스트</b><span>아티스트 이름의 ♡ · 담은 날 기준</span></div></li>
      <li><span class="emo sm" style="--c:#efe7f5">👀</span><div><b>보고 싶은 공연</b><span>오픈 공지·공연 일정의 ♡ · 담은 날 기준</span></div></li></ul></section>
    <section class="guide-sec"><h2 class="sub">배지 다섯 가지</h2>${cards}</section>
    <section class="guide-sec"><h2 class="sub">대표 배지 4유형</h2><ul class="types">${types}</ul></section>
    <section class="guide-sec"><h2 class="sub">갱신 규칙</h2><ul class="rules">
      <li><b>매월 1일</b> 새로 시작합니다. 그 달 기록만으로 이달의 배지를 모읍니다. 지난달 배지는 ‹ 버튼으로 다시 볼 수 있습니다.</li>
      <li><b>12월 1일</b> 1월부터의 기록으로 <b>올해의 배지 5개</b>가 공개됩니다.</li>
      <li><b>지방 공연</b>은 서울·경기·인천 이외 지역의 공연입니다.</li></ul></section>`, { back: '#/my' });
}

/* MY-04 인증샷 (0.5 엔진, R-60~62: 사진은 서버로 보내지 않음) */
const ed = { record: null, image: null, zoom: 1, dx: 0, dy: 0, align: 'left', showArtists: true, blob: null, timer: 0 };
const W = 1080, H = 1920;
const FONT = '"Apple SD Gothic Neo","Pretendard","Noto Sans KR","Malgun Gothic",system-ui,sans-serif';
const stampLogo = new Image(); stampLogo.src = 'assets/logo-white.png'; stampLogo.onload = () => draw();
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export function renderStamp(recId) {
  const r = S.records.find(x => x.id === recId && x.type === 'attended');
  if (!r) { page('my', '<div class="empty">기록을 찾지 못했습니다.</div>', { back: '#/my/attended' }); return; }
  if (!ed.record || ed.record.id !== r.id) Object.assign(ed, { record: r, image: null, zoom: 1, dx: 0, dy: 0, align: 'left', showArtists: true, blob: null });
  const has = !!ed.image;
  track('stamp_open', { item: r.performanceId || 'manual' });
  page('my', `<section class="intro compact"><p class="eyebrow">오늘의 LIVE 남기기</p><h1>${esc(r.title)}</h1><p class="muted small">${esc([L.fmtDayKo(r.date), r.venue].filter(Boolean).join(' · '))}</p></section>
    <label class="btn ${has ? 'ghost' : 'primary'} block" id="pickLabel"><input class="vh" type="file" accept="image/*" id="photo"><span id="pickText">${has ? '사진 다시 고르기' : '공연 사진 고르기'}</span></label>
    <div class="stage"><canvas id="stamp" width="1080" height="1920" role="img" aria-label="인증샷 미리보기"></canvas><span class="hint-drag" id="dragHint"${has ? '' : ' hidden'}>끌어서 위치 조정 · 두 손가락으로 확대</span></div>
    <div class="controls" id="controls"${has ? '' : ' hidden'}>
      <div class="ctl"><span>확대</span><input type="range" id="zoom" min="1" max="4" step="0.01" value="${ed.zoom}" aria-label="사진 확대"></div>
      <div class="ctl"><span>문구 위치</span><div class="seg" role="group">${[['left', '왼쪽'], ['center', '가운데'], ['right', '오른쪽']].map(([v, n]) => `<button type="button" data-act="align" data-v="${v}" aria-pressed="${ed.align === v}">${n}</button>`).join('')}</div></div>
      <div class="ctl"><label class="switch"><input type="checkbox" id="artistToggle"${ed.showArtists ? ' checked' : ''}${(r.artists || []).length ? '' : ' disabled'}> 아티스트명 표시</label><button class="link" type="button" data-act="stamp-reset">위치 초기화</button></div></div>
    <div class="actions" id="actions"${has ? '' : ' hidden'}><button class="btn primary block" type="button" data-act="share">인스타그램 스토리에 공유</button><button class="btn ghost block" type="button" data-act="save">이미지로 저장</button>
      <p class="hint">사진은 서버로 전송되지 않습니다. 공유 창에서 Instagram → 스토리를 선택하세요.</p></div>`, { back: '#/my/attended' });
  bindStamp(); draw();
}
function wrapLines(ctx, text, maxW, maxLines) {
  const words = String(text).split(/\s+/).filter(Boolean); const lines = []; let line = '';
  const pushChars = w => { for (const ch of w) { if (ctx.measureText(line + ch).width > maxW && line) { lines.push(line); line = ch; } else line += ch; } };
  for (const w of words) { const t = line ? line + ' ' + w : w; if (ctx.measureText(t).width <= maxW) line = t; else if (ctx.measureText(w).width > maxW) { if (line) line += ' '; pushChars(w); } else { lines.push(line); line = w; } }
  if (line) lines.push(line.trim());
  if (lines.length > maxLines) { const cut = lines.slice(0, maxLines); let last = cut[maxLines - 1]; while (last && ctx.measureText(last + '…').width > maxW) last = last.slice(0, -1); cut[maxLines - 1] = last + '…'; return cut; }
  return lines;
}
function fitOne(ctx, text, maxW, size, weight) { let s = size; ctx.font = `${weight} ${s}px ${FONT}`; while (ctx.measureText(text).width > maxW && s > 22) { s -= 2; ctx.font = `${weight} ${s}px ${FONT}`; } }
export function draw() {
  const c = $('#stamp'); if (!c || !ed.record) return;
  const x = c.getContext('2d'); const r = ed.record;
  x.save(); x.clearRect(0, 0, W, H); x.fillStyle = '#1b1b1b'; x.fillRect(0, 0, W, H);
  if (ed.image) { const i = ed.image; const s = Math.max(W / i.width, H / i.height) * ed.zoom; const w = i.width * s, h = i.height * s; ed.dx = clamp(ed.dx, -(w - W) / 2, (w - W) / 2); ed.dy = clamp(ed.dy, -(h - H) / 2, (h - H) / 2); x.drawImage(i, (W - w) / 2 + ed.dx, (H - h) / 2 + ed.dy, w, h); }
  else { x.fillStyle = '#8b8a83'; x.textAlign = 'center'; x.font = `600 46px ${FONT}`; x.fillText('사진을 고르면', W / 2, 860); x.fillText('여기에 인증샷이 만들어집니다', W / 2, 930); }
  const g = x.createLinearGradient(0, 1080, 0, H); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.55, 'rgba(0,0,0,.45)'); g.addColorStop(1, 'rgba(0,0,0,.82)'); x.fillStyle = g; x.fillRect(0, 1080, W, H - 1080);
  const maxW = 940; const px = ed.align === 'center' ? W / 2 : ed.align === 'right' ? W - 70 : 70;
  x.textAlign = ed.align; x.fillStyle = '#fff'; x.shadowColor = 'rgba(0,0,0,.35)'; x.shadowBlur = 12;
  let y = 1740; const artists = ed.showArtists && (r.artists || []).length ? r.artists.join(' · ') : '';
  if (artists) { fitOne(x, artists, maxW, 38, 500); x.fillText(artists, px, y); y -= 62; }
  if (r.venue) { const v = '@ ' + r.venue; fitOne(x, v, maxW, 38, 500); x.fillText(v, px, y); y -= 84; } else y -= 22;
  x.font = `800 70px ${FONT}`; const lines = wrapLines(x, r.title, maxW, 2); for (let i = lines.length - 1; i >= 0; i--) { x.fillText(lines[i], px, y); y -= 84; }
  x.font = `600 36px ${FONT}`; x.fillText(L.fmtStampDate(r.date), px, y + 14);
  x.shadowBlur = 0; x.globalAlpha = 0.95;
  if (stampLogo.complete && stampLogo.naturalWidth) { const lw = 150, lh = lw * stampLogo.naturalHeight / stampLogo.naturalWidth; x.drawImage(stampLogo, W - 70 - lw, 1880 - lh, lw, lh); }
  else { x.textAlign = 'right'; x.font = `800 36px ${FONT}`; x.fillText(CONFIG.stampBrand, W - 70, 1862); }
  x.restore(); clearTimeout(ed.timer); ed.blob = null;
  if (ed.image) ed.timer = setTimeout(() => makeBlob().then(b => { ed.blob = b; }).catch(() => {}), 300);
}
const makeBlob = () => new Promise((res, rej) => { const c = $('#stamp'); if (!c) return rej(new Error('no canvas')); c.toBlob(b => (b ? res(b) : rej(new Error('toBlob'))), 'image/jpeg', 0.92); });
const stampName = () => `naenae-${(ed.record && ed.record.date) || today()}.jpg`;
function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file); const img = new Image();
    img.onload = () => { try { const s = Math.min(1, 2400 / Math.max(img.naturalWidth, img.naturalHeight)); const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(img.naturalWidth * s)); c.height = Math.max(1, Math.round(img.naturalHeight * s)); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); resolve(c); } catch (e) { reject(e); } finally { URL.revokeObjectURL(url); } };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('decode')); }; img.src = url;
  });
}
async function onPhoto(file) {
  if (!file) return;
  if (file.size > 30 * 1024 * 1024) { toast('30MB 이하의 사진을 골라 주세요.'); return; }
  track('photo_select', { value: (file.type || 'unknown').slice(0, 30) });
  try {
    ed.image = await loadImage(file); ed.zoom = 1; ed.dx = 0; ed.dy = 0; $('#zoom').value = 1;
    ['#controls', '#actions', '#dragHint'].forEach(s => { const el = $(s); if (el) el.hidden = false; });
    $('#pickText').textContent = '사진 다시 고르기'; $('#pickLabel').classList.replace('primary', 'ghost'); draw(); track('stamp_ready');
  } catch { track('photo_error', { value: (file.type || 'unknown').slice(0, 30) }); toast('이 사진 형식은 열 수 없습니다. JPG·PNG 사진을 골라 주세요.'); }
}
function bindStamp() {
  $('#photo').addEventListener('change', e => { onPhoto(e.target.files[0]); e.target.value = ''; });
  $('#zoom').addEventListener('input', e => { ed.zoom = Number(e.target.value); draw(); });
  $('#artistToggle').addEventListener('change', e => { ed.showArtists = e.target.checked; draw(); });
  const c = $('#stamp'); const pts = new Map(); let pinch = null;
  c.addEventListener('pointerdown', e => { if (!ed.image) return; c.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: ed.zoom }; } });
  c.addEventListener('pointermove', e => {
    if (!pts.has(e.pointerId)) return; const prev = pts.get(e.pointerId); const cur = { x: e.clientX, y: e.clientY }; pts.set(e.pointerId, cur);
    if (pts.size === 2 && pinch) { const [a, b] = [...pts.values()]; ed.zoom = clamp(pinch.z * Math.hypot(a.x - b.x, a.y - b.y) / (pinch.d || 1), 1, 4); $('#zoom').value = ed.zoom; }
    else if (pts.size === 1) { const k = W / c.getBoundingClientRect().width; ed.dx += (cur.x - prev.x) * k; ed.dy += (cur.y - prev.y) * k; }
    draw();
  });
  const end = e => { pts.delete(e.pointerId); if (pts.size < 2) pinch = null; };
  c.addEventListener('pointerup', end); c.addEventListener('pointercancel', end);
}
export function stampAction(act, el) {
  if (act === 'align') { ed.align = el.dataset.v; $$('[data-act="align"]').forEach(b => b.setAttribute('aria-pressed', String(b === el))); draw(); }
  else if (act === 'stamp-reset') { ed.zoom = 1; ed.dx = 0; ed.dy = 0; $('#zoom').value = 1; draw(); }
  else if (act === 'share') shareStamp();
  else if (act === 'save') saveStamp('direct');
}
async function shareStamp() {
  if (!ed.image) { toast('사진을 먼저 골라 주세요.'); return; }
  track('share_click');
  let blob = ed.blob; if (!blob) { try { blob = await makeBlob(); } catch { toast('이미지를 만들지 못했습니다.'); return; } }
  const file = new File([blob], stampName(), { type: 'image/jpeg' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file] }); track('share_done'); toast('공유했습니다!'); }
    catch (e) { if (e && e.name === 'AbortError') { track('share_cancel'); return; } track('share_error', { value: (e && e.name) || 'unknown' }); saveStamp('fallback'); }
  } else { track('share_unsupported'); toast('이 브라우저는 바로 공유가 안 됩니다. 저장한 뒤 인스타그램에서 올려 주세요.'); saveStamp('fallback'); }
}
async function saveStamp(how) {
  if (!ed.image) { toast('사진을 먼저 골라 주세요.'); return; }
  track('save_click', { value: how });
  let blob = ed.blob; if (!blob) { try { blob = await makeBlob(); } catch { toast('이미지를 만들지 못했습니다.'); return; } }
  const url = URL.createObjectURL(blob);
  if (!inApp) { const a = document.createElement('a'); a.href = url; a.download = stampName(); document.body.appendChild(a); a.click(); a.remove(); }
  sheet(`<img src="${url}" alt="완성된 인증샷" class="result-img"><p class="small muted">${inApp ? '이미지를 <b>길게 눌러</b> 사진에 저장해 주세요.' : '저장되지 않았다면 이미지를 <b>길게 눌러</b> 저장할 수 있습니다.'}</p>`, () => setTimeout(() => URL.revokeObjectURL(url), 500));
}
export { closeSheet };
