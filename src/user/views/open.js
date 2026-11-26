// HOM-01·02 오픈 공지 (R-10~17), SHT-01 캘린더에 추가
import api from '../../shared/api/index.js';
import { L } from '../../shared/lib.js';
import { CONFIG } from '../../shared/config.js';
import { esc, page, sheet, closeSheet, toast, track } from '../ui.js';
import { S, today, visibleOpenings, myArtistsIn } from '../state.js';

export const plannedForOpening = o => S.records.find(r => r.type === 'planned' && ((o.performanceId && r.performanceId === o.performanceId) || r.openingId === o.id));

export function openingCard(o, ctx) {
  const st = o.status; const mine = myArtistsIn(o); const mk = new Set(mine.map(m => m.toLowerCase()));
  const meta = [];
  if (o.artists.length) meta.push(`<p class="op-meta">${o.artists.map(a => mk.has(a.toLowerCase()) ? `<b class="mine-name">${esc(a)}</b>` : esc(a)).join(' · ')}</p>`);
  const showLine = [o.showDate ? '공연 ' + L.fmtDayKo(o.showDate) : '', o.venue].filter(Boolean).join(' · ');
  if (showLine) meta.push(`<p class="op-meta">${esc(showLine)}</p>`);
  meta.push(`<p class="op-meta">티켓 오픈 <b>${esc(L.fmtOpen(o))}</b>${o.vendor ? ' · ' + esc(o.vendor) : ''}</p>`);
  const planned = !!plannedForOpening(o);
  return `<article class="op${mine.length ? ' mine' : ''}">
    <div class="op-top"><span class="badge ${st.key}">${esc(st.label)}</span>${mine.length ? '<span class="mine-tag">♥ 내 아티스트</span>' : ''}${o.sample ? '<span class="tag">예시</span>' : ''}</div>
    <h3>${esc(o.title)}</h3>${meta.join('')}${o.note ? `<p class="op-note">${esc(o.note)}</p>` : ''}
    <div class="op-actions">
      ${st.key === 'soon' && o.openAt ? `<button class="btn small primary" type="button" data-act="cal" data-id="${esc(o.id)}" data-ctx="${ctx}">캘린더에 추가</button>` : ''}
      <button class="btn small ${planned ? 'on' : ''}" type="button" data-act="plan-opening" data-id="${esc(o.id)}" aria-pressed="${planned}">${planned ? '♥' : '♡'} 보고 싶어요</button>
      ${L.safeURL(o.ticketUrl) ? `<a class="btn small ghost" href="${esc(L.safeURL(o.ticketUrl))}" target="_blank" rel="noopener noreferrer" data-track="opening_click" data-item="${esc(o.id)}" data-value="${ctx}">${st.key === 'open' ? '예매하기' : '예매처'} ↗</a>` : ''}
    </div></article>`;
}
export const reportCta = from => `<a class="report-cta" href="#/report" data-act="report-open" data-v="${from}"><span><b>찾는 공연이 없나요?</b><small>티켓 오픈 소식이나 공연을 제보해 주세요. 확인 후 올려 드려요.</small></span><i aria-hidden="true">›</i></a>`;

function mySection(list) {
  if (!api.auth.current()) return '';
  const mine = list.filter(o => myArtistsIn(o).length);
  if (!mine.length) return `<section class="mine-sec empty-mine"><p class="eyebrow">MY ARTIST</p><p class="small muted">${S.interests.length ? '관심 아티스트의 새 오픈 공지가 올라오면 여기에 모아 드려요.' : '공연 일정에서 아티스트 이름의 ♡를 누르면, 그 아티스트의 티켓 오픈을 여기에 모아 드려요.'}</p></section>`;
  return `<section class="mine-sec"><div class="sec-head"><h2>내 아티스트 오픈 <span class="count">${mine.length}</span></h2></div>
    <p class="caption">관심 아티스트가 나오는 공연이에요. 캘린더에 넣어 두면 오픈 전에 알림이 와요.</p>
    <div class="op-list">${mine.map(o => openingCard(o, 'mine')).join('')}</div></section>`;
}
function calendarView(list) {
  const byDay = new Map();
  list.forEach(o => { if (o.openAt) { const d = L.kstDay(o.openAt); (byDay.get(d) || byDay.set(d, []).get(d)).push(o); } });
  const [y, m] = S.calMonth.split('-').map(Number); const t = today();
  const cells = L.monthGrid(S.calMonth).map(c => {
    const n = (byDay.get(c.ymd) || []).length;
    const cls = ['cell', c.inMonth ? '' : 'out', c.ymd === t ? 'today' : '', c.ymd === S.calDay ? 'sel' : '', n ? 'has' : ''].filter(Boolean).join(' ');
    return `<button type="button" class="${cls}" data-act="cal-day" data-v="${c.ymd}" aria-label="${c.ymd}${n ? ` 오픈 ${n}건` : ''}"${c.ymd === S.calDay ? ' aria-pressed="true"' : ''}><span>${Number(c.ymd.slice(8))}</span>${n ? `<i>${n > 1 ? n : ''}</i>` : ''}</button>`;
  }).join('');
  const dayList = byDay.get(S.calDay) || []; const tba = list.filter(o => !o.openAt);
  return `<div class="cal"><div class="cal-head"><button type="button" class="icon" data-act="cal-month" data-v="-1" aria-label="이전 달">‹</button><b>${y}년 ${m}월</b><button type="button" class="icon" data-act="cal-month" data-v="1" aria-label="다음 달">›</button></div>
    <div class="cal-week">${['일', '월', '화', '수', '목', '금', '토'].map(d => `<span>${d}</span>`).join('')}</div><div class="cal-grid">${cells}</div></div>
    <h3 class="cal-day-title">${esc(L.fmtDayKo(S.calDay))} 오픈 ${dayList.length}건</h3>
    <div class="op-list">${dayList.map(o => openingCard(o, 'calendar')).join('') || '<div class="empty small">이날 오픈하는 공연이 없어요.</div>'}</div>
    ${tba.length ? `<h3 class="cal-day-title">오픈일 미정 ${tba.length}건</h3><div class="op-list">${tba.map(o => openingCard(o, 'calendar')).join('')}</div>` : ''}`;
}
export function renderOpen() {
  const list = visibleOpenings();
  const mode = S.openMode;
  const body = !list.length ? '<div class="empty">등록된 티켓 오픈 공지가 아직 없어요.</div>'
    : mode === 'cal' ? calendarView(list) : `<div class="op-list">${list.map(o => openingCard(o, 'list')).join('')}</div>`;
  page('open', `<section class="hero-brand"><img class="hero-logo" src="assets/logo.png" alt="${esc(CONFIG.serviceName)} ${esc(CONFIG.serviceNameEn)}" width="240" height="169">
    <p class="slogan-ko">${esc(CONFIG.sloganKo)}</p><p class="slogan-en">${esc(CONFIG.sloganEn)}</p>
    <p class="lede">좋은 기억을 내내 간직하는 라이브 다이어리</p></section>
    ${mySection(list)}
    <div class="sec-head"><h2>티켓 오픈 공지 <span class="count">${list.length}</span></h2>
      <div class="seg wide" role="group" aria-label="보기 방식"><button type="button" data-act="open-mode" data-v="list" aria-pressed="${mode === 'list'}">리스트</button><button type="button" data-act="open-mode" data-v="cal" aria-pressed="${mode === 'cal'}">캘린더</button></div></div>
    ${body}${reportCta('open')}`, { keepScroll: S.keepScroll, noBrand: true });
  S.keepScroll = false;
}

/* SHT-01 캘린더에 추가 (R-15) */
export function calendarSheet(o, ctx) {
  const ev = L.openingEvent(o); if (!ev) return;
  track('calendar_open', { item: o.id, value: ctx });
  sheet(`<h2>캘린더에 추가</h2>
    <p class="muted small">${esc(ev.title)}<br>${esc(L.fmtOpen(o))} ${ev.allDay ? '(종일 · 당일 오전 9시 알림)' : '(30분 전 알림)'}</p>
    <a class="btn block" href="${esc(L.googleCalendarUrl(ev))}" target="_blank" rel="noopener noreferrer" data-track="calendar_add" data-item="${esc(o.id)}" data-value="google">구글 캘린더</a>
    <button class="btn block" type="button" data-act="ics" data-id="${esc(o.id)}">아이폰 · 기타 캘린더 (.ics)</button>
    <p class="hint">아이폰은 파일을 열면 ‘캘린더에 추가’ 화면이 나와요.</p>`);
}
export function downloadICS(o) {
  const ev = L.openingEvent(o); if (!ev) return;
  track('calendar_add', { item: o.id, value: 'ics' });
  const url = URL.createObjectURL(new Blob([L.icsText(ev)], { type: 'text/calendar;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = `ticket-open-${o.id}.ics`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  closeSheet(); toast('캘린더 파일을 열어 일정을 추가해 주세요.');
}
