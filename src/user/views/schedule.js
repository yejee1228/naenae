// SCH-01 공연 일정 · SCH-02 공연 상세 (R-20~25, R-30~33)
import api from '../../shared/api/index.js';
import { L } from '../../shared/lib.js';
import { CONFIG } from '../../shared/config.js';
import { nameKey } from '../../shared/domain.js';
import { esc, page, $, track } from '../ui.js';
import { S, today, perfById, openingByPerf, isInterested } from '../state.js';
import { openingCard, reportCta } from './open.js';

const WD = ['일', '월', '화', '수', '목', '금', '토'];
const matchClub = venue => { const v = nameKey(venue); return S.clubVenues.some(x => nameKey(x) && v.includes(nameKey(x))); };
export function perfRow(p, reason) {
  const op = openingByPerf(p.id);
  const range = p.endDate !== p.startDate ? ` ~ ${p.endDate.slice(5).replace('-', '.')}` : '';
  return `<a class="pf" href="#/perf/${encodeURIComponent(p.id)}"${reason ? ` data-track="reco_click" data-item="${esc(p.id)}"` : ''}>
    <span class="pf-date">${esc(p.startDate.slice(5).replace('-', '.'))}<small>${WD[L.weekday(p.startDate)]}</small></span>
    <span class="pf-body"><b>${esc(p.title)}</b><small>${esc([p.venue, p.region].filter(Boolean).join(' · '))}${esc(range)}</small>
    ${reason ? `<span class="reason">${esc(reason)}</span>` : ''}${op ? `<em class="badge ${op.status.key}">${esc(op.status.label)}</em>` : ''}</span></a>`;
}
function filtered() {
  const s = S.sched; const t = today(); const q = nameKey(s.q);
  return S.perfs.filter(p => (s.past || p.endDate >= t) && (!s.region || p.region === s.region) && (!s.club || matchClub(p.venue))
    && (!q || nameKey(p.title + p.venue + (p.artists || []).join('') + (p.castRaw || '')).includes(q)));
}
export function renderSchedule() {
  const s = S.sched;
  const regions = [...new Set(S.perfs.map(p => p.region).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ko'));
  const upd = S.meta.updatedAt ? new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(S.meta.updatedAt)) : '';
  page('schedule', `<section class="intro compact"><p class="eyebrow">LIVE SCHEDULE</p><h1>공연 일정</h1>
    <p class="muted small">출처 ${esc(S.meta.source || 'KOPIS')}${upd ? ' · ' + esc(upd) + ' 기준' : ''}</p></section>
    <div class="filters"><input id="q" type="search" placeholder="공연명 · 공연장 · 아티스트" value="${esc(s.q)}" aria-label="공연 검색">
      <div class="filter-row"><select id="region" aria-label="지역"><option value="">전체 지역</option>${regions.map(r => `<option ${s.region === r ? 'selected' : ''}>${esc(r)}</option>`).join('')}</select>
        <label class="switch"><input type="checkbox" id="club"${s.club ? ' checked' : ''}> 라이브클럽만</label>
        <label class="switch"><input type="checkbox" id="past"${s.past ? ' checked' : ''}> 지난 공연</label></div></div>
    <p class="caption" id="pfCount"></p><div id="pfList"></div>${reportCta('schedule')}`, { keepScroll: S.keepScroll });
  S.keepScroll = false;
  const draw = () => {
    s.q = $('#q').value; s.region = $('#region').value; s.club = $('#club').checked; s.past = $('#past').checked;
    const list = filtered().slice(0, 300);
    $('#pfCount').textContent = `${filtered().length}개 공연`;
    const groups = new Map(); list.forEach(p => (groups.get(p.startDate) || groups.set(p.startDate, []).get(p.startDate)).push(p));
    $('#pfList').innerHTML = list.length ? [...groups].map(([d, ps]) => `<section class="pf-group"><h3>${esc(L.fmtDayKo(d))}</h3>${ps.map(p => perfRow(p)).join('')}</section>`).join('')
      : `<div class="empty">${S.perfs.some(p => p.endDate >= today()) ? '조건에 맞는 공연이 없어요.' : '아직 앞으로의 공연 일정이 없어요.<br><button class="link" type="button" data-act="show-past">지난 공연 보기</button>'}</div>`;
  };
  $('#q').addEventListener('input', draw);
  ['#region', '#club', '#past'].forEach(sel => $(sel).addEventListener('change', () => { draw(); track('schedule_filter', { value: sel.slice(1) }); }));
  draw();
}
export function renderPerf(id) {
  const p = perfById(id);
  if (!p) { page('schedule', '<div class="empty">공연 정보를 찾지 못했어요.</div>', { back: '#/schedule' }); return; }
  track('perf_view', { item: p.id });
  const op = openingByPerf(p.id);
  const user = api.auth.current();
  const planned = S.records.find(r => r.type === 'planned' && r.performanceId === p.id);
  const attended = S.records.filter(r => r.type === 'attended' && r.performanceId === p.id);
  const t = today(); const canAttend = p.startDate <= t; const maxDay = p.endDate < t ? p.endDate : t;
  const artists = p.artists || [];
  page('schedule', `<section class="detail">
    <p class="eyebrow">${esc(p.region || '')} · ${p.source === 'kopis' ? 'KOPIS' : p.sample ? '예시' : '직접 등록'}</p>
    <h1>${esc(p.title)}</h1>
    <p class="muted">${esc(L.fmtDayKo(p.startDate))}${p.endDate !== p.startDate ? ' ~ ' + esc(L.fmtDayKo(p.endDate)) : ''}<br>${esc(p.venue)}</p>
    ${p.timeText || p.priceText ? `<p class="op-note">${esc([p.timeText, p.priceText].filter(Boolean).join(' · '))}</p>` : ''}
    ${op ? `<div class="op-list">${openingCard(op, 'perf')}</div>` : ''}
    ${p.ticketLinks.filter(l => L.safeURL(l.url)).length ? `<div class="links">${p.ticketLinks.filter(l => L.safeURL(l.url)).map(l => `<a class="btn small ghost" href="${esc(l.url)}" target="_blank" rel="noopener noreferrer" data-track="ticket_link_click" data-item="${esc(p.id)}" data-value="${esc(l.name)}">${esc(l.name)} ↗</a>`).join('')}</div>` : '<p class="op-note">예매처 정보 없음</p>'}
    <h2 class="sub">출연 아티스트</h2>
    ${artists.length ? `<div class="chips">${artists.map(a => { const on = user && isInterested(a); return `<button type="button" class="chip ${on ? 'on' : ''}" data-act="interest" data-name="${esc(a)}" data-from="perf" aria-pressed="${!!on}">${on ? '♥' : '♡'} ${esc(a)}</button>`; }).join('')}</div>` : '<p class="op-note">아티스트 정보가 없어요.</p>'}
    ${p.castRaw ? `<p class="op-note">KOPIS 출연진: ${esc(p.castRaw)}</p>` : ''}
    <h2 class="sub">${esc(CONFIG.myName)}에 기록</h2>
    <div class="rec-box">
      <button class="btn block ${planned ? 'on' : ''}" type="button" data-act="plan-perf" data-id="${esc(p.id)}" aria-pressed="${!!planned}">${planned ? '♥ 보고 싶은 공연에 있어요' : '♡ 보고 싶어요'}</button>
      ${canAttend ? `<div class="attend-row"><input type="date" id="attDate" value="${maxDay}" min="${p.startDate}" max="${maxDay}" aria-label="관람 날짜"><button class="btn primary" type="button" data-act="attend-perf" data-id="${esc(p.id)}">✓ 관람했어요</button></div>` : '<p class="op-note">공연이 시작되면 관람 기록을 남길 수 있어요.</p>'}
      ${attended.length ? `<p class="op-note">관람 기록 ${attended.length}회 · <a href="#/my/attended">${esc(CONFIG.myName)}에서 보기</a></p>` : ''}
    </div></section>`, { back: '#/schedule', keepScroll: S.keepScroll });
  S.keepScroll = false;
}
