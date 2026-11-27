// EVT-01 이벤트 목록 · EVT-02 상세 (R-80~84)
import { L } from '../../shared/lib.js';
import { sortEvents, eventStatus } from '../../shared/domain.js';
import { esc, page, track } from '../ui.js';
import { S, today } from '../state.js';

const period = p => [p.startDate && L.fmtDayKo(p.startDate), p.endDate && L.fmtDayKo(p.endDate)].filter(Boolean).join(' ~ ');
const head = (p, st) => `<span class="op-top"><span class="badge ${st.key}">${esc(st.label)}</span>${p.tag ? `<span class="ev-tag">${esc(p.tag)}</span>` : ''}${p.sample ? '<span class="tag">예시</span>' : ''}</span>`;
const thumb = (p, cls) => (p.thumbnail ? `<span class="${cls} img" style="background-image:url('${esc(p.thumbnail)}')" aria-hidden="true"></span>` : `<span class="${cls}" style="--c:${esc(p.color || '#d9cce6')}" aria-hidden="true">${esc(p.emoji || '🎁')}</span>`);

export function renderEvents() {
  track('event_view');
  const list = sortEvents(S.promotions, today());
  page('event', `<section class="intro compact"><p class="eyebrow">EVENT</p><h1>이벤트</h1><p class="muted small">공연 초대, 굿즈 같은 소식을 모았습니다.</p></section>
    ${list.length ? `<div class="ev-list">${list.map(({ p, st }) => `<a class="ev${st.past ? ' past' : ''}" href="#/event/${encodeURIComponent(p.id)}">${thumb(p, 'ev-thumb')}<span class="ev-body">${head(p, st)}<b>${esc(p.title)}</b><small>${esc(period(p))}</small></span></a>`).join('')}</div>`
      : `<div class="coming"><img src="assets/logo.png" alt="" width="120" height="85"><h2>준비 중입니다</h2><p class="muted small">공연 초대, 굿즈 같은 소식을 곧 이곳에서 전해 드리겠습니다.</p></div>`}`);
}
export function renderEventDetail(id) {
  const p = S.promotions.find(x => x.id === id);
  if (!p) { page('event', '<div class="empty">이벤트를 찾지 못했습니다.</div>', { back: '#/event' }); return; }
  const st = eventStatus(p, today());
  track('event_detail_view', { item: p.id });
  page('event', `<section class="ev-detail">${thumb(p, 'ev-hero')}${head(p, st)}<h1>${esc(p.title)}</h1><p class="muted small">${esc(period(p))}</p>
    <p class="ev-summary">${esc(p.summary || '')}</p>${String(p.body || '').split(/\n{2,}/).filter(Boolean).map(t => `<p class="ev-text">${esc(t)}</p>`).join('')}
    ${(p.notes || []).length ? `<h2 class="sub">유의사항</h2><ul class="ev-notes">${p.notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
    <div class="ev-apply">${st.key === 'open' && L.safeURL(p.applyUrl)
      ? `<a class="btn primary block" href="${esc(L.safeURL(p.applyUrl))}" target="_blank" rel="noopener noreferrer" data-track="event_apply_click" data-item="${esc(p.id)}">${esc(p.applyLabel || '응모하기')} ↗</a><p class="hint">응모는 외부 페이지에서 진행됩니다.</p>`
      : `<button class="btn block" type="button" disabled>${st.key === 'soon' ? esc(L.fmtDayKo(p.startDate)) + '에 시작합니다' : '종료된 이벤트입니다'}</button>`}</div></section>`, { back: '#/event' });
}
