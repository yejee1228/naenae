// RPT-01 공연 제보 · RPT-02 내 제보 · SHT-07 제보 완료 · SHT-09 등록 실패 이유 · SHT-10 내 제보 내용 (R-70~77)
import api from '../../shared/api/index.js';
import { L } from '../../shared/lib.js';
import { REPORT_STATUS, validateReport, kstToday } from '../../shared/domain.js';
const kstStamp = iso => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));
import { esc, page, $, sheet, track, toast, errMsg } from '../ui.js';
import { S } from '../state.js';

let mine = [];
let prefill = null;
export function renderReport() {
  if (!api.auth.current()) { location.replace('#/my'); return; }
  track('report_view');
  const p = prefill || {}; prefill = null;
  page('open', `<section class="intro compact report-head"><div><p class="eyebrow">REPORT</p><h1>공연 제보하기</h1></div>${mine.length ? `<a class="link" href="#/report/mine">내 제보 ${mine.length}</a>` : ''}
    <p class="muted small">티켓 오픈 소식이나 아직 없는 공연을 알려 주세요. 운영자가 확인한 뒤 올려 드려요.</p></section>
    <form class="form report-form" id="reportForm" autocomplete="off" novalidate>
      <label>제보 종류 *<select name="kind"><option value="opening"${p.kind !== 'performance' ? ' selected' : ''}>티켓 오픈 소식</option><option value="performance"${p.kind === 'performance' ? ' selected' : ''}>공연 일정</option></select></label>
      <label>공연명 *<input type="text" name="title" required maxlength="80" value="${esc(p.title || '')}"></label>
      <label>아티스트 <small>쉼표로 구분</small><input type="text" name="artists" maxlength="100" value="${esc((p.artists || []).join(', '))}"></label>
      <label>공연장<input type="text" name="venue" maxlength="40" value="${esc(p.venue || '')}"></label>
      <label>공연 날짜<input type="date" name="showDate" value="${esc(p.showDate || '')}"></label>
      <label>티켓 오픈 일시<input type="datetime-local" name="openAt" value="${esc((p.openAtText || '').replace(' ', 'T'))}"></label>
      <label>예매 링크<input type="url" name="ticketUrl" inputmode="url" placeholder="https://" value="${esc(p.ticketUrl || '')}"></label>
      <label>출처 링크 <small>공지 게시물 · 인스타그램 등</small><input type="url" name="sourceUrl" inputmode="url" placeholder="https://" value="${esc(p.sourceUrl || '')}"></label>
      <label>메모<textarea name="note" maxlength="300" rows="3">${esc(p.note || '')}</textarea></label>
      <p class="ferr" id="reportErr" role="alert"></p><button class="btn primary block" type="submit">제보하기</button>
      <p class="hint">제보한 내용은 확인 과정에서 다듬어져 올라갈 수 있어요.</p></form>`, { back: '#/open' });
  api.reports.listMine().then(r => { mine = r; }).catch(() => {});
}
export async function submitReport(form) {
  const f = new FormData(form); const v = k => String(f.get(k) || '').trim();
  const input = { kind: v('kind'), title: v('title'), artists: v('artists').split(/[,·/]/).map(s => s.trim()).filter(Boolean), venue: v('venue'), showDate: v('showDate'), openAtText: v('openAt').replace('T', ' '), ticketUrl: v('ticketUrl'), sourceUrl: v('sourceUrl'), note: v('note') };
  const msg = validateReport(input); $('#reportErr').textContent = msg; if (msg) return;
  try {
    await api.reports.create(input); track('report_submit', { value: input.kind }); form.reset();
    sheet(`<p class="eyebrow">THANK YOU</p><h2>제보 고마워요!</h2><p class="small muted">운영자가 확인한 뒤 올려 드릴게요. 처리 상황은 내 제보에서 볼 수 있어요.</p><a class="btn primary block" href="#/report/mine" data-act="close-sheet">내 제보 보기</a>`);
  } catch (e) { $('#reportErr').textContent = errMsg(e); }
}
const card = r => {
  const st = REPORT_STATUS[r.status] || REPORT_STATUS.submitted;
  const line = r.status === 'registered' ? `${r.registeredOpeningId ? '오픈 공지에' : '공연 일정에'} 올라갔어요. <a class="link" href="${r.registeredOpeningId ? '#/open' : '#/perf/' + encodeURIComponent(r.registeredPerformanceId || '')}">보러 가기 ›</a>`
    : r.status === 'rejected' ? `${esc(st.line)} <button class="link" type="button" data-act="report-reason" data-id="${esc(r.id)}">이유 보기</button>`
      : r.status === 'submitted' ? `${esc(st.line)} <button class="link" type="button" data-act="report-cancel" data-id="${esc(r.id)}">제보 취소</button>` : esc(st.line);
  return `<article class="rp${r.userSeen === false ? ' unseen' : ''}"><button type="button" class="rp-main" data-act="report-detail" data-id="${esc(r.id)}">
    <span class="op-top"><span class="badge ${st.badge}">${esc(st.label)}</span><span class="ev-tag">${r.kind === 'performance' ? '공연 일정' : '티켓 오픈 소식'}</span>${r.userSeen === false ? '<i class="dot" aria-label="새 소식"></i>' : ''}</span>
    <b>${esc(r.title)}</b><small>${esc(L.fmtDayKo(kstToday(new Date(r.createdAt))))} 제보</small></button><p class="rp-line">${line}</p></article>`;
};
export async function renderMyReports() {
  if (!api.auth.current()) { location.replace('#/my'); return; }
  track('report_mine_view');
  try { mine = (await api.reports.listMine()).filter(r => r.status !== 'canceled'); } catch (e) { toast(errMsg(e)); mine = []; }
  page('my', `<section class="intro compact"><p class="eyebrow">MY REPORT</p><h1>내 제보</h1></section>
    ${mine.length ? `<div class="rp-list">${mine.map(card).join('')}</div>` : '<div class="empty">아직 제보한 공연이 없어요.<br><a class="btn small" href="#/report">제보하러 가기</a></div>'}
    ${mine.length ? '<a class="btn ghost block" href="#/report">새로 제보하기</a>' : ''}`, { back: '#/settings' });
  if (mine.some(r => r.userSeen === false) || api.auth.current()?.reportUnseen) api.reports.markSeen().catch(() => {});   // R-76: 한 번 보면 사라짐
}
export function reportAction(act, id) {
  const r = mine.find(x => x.id === id); if (!r) return;
  if (act === 'report-reason') {
    track('report_reason_open');
    sheet(`<h2>등록하지 못했어요</h2><p class="small muted">${esc(r.title)}</p><p>${esc(r.rejectReason || '')}</p><p class="small muted">다른 정보로 다시 제보할 수 있어요.</p><button class="btn primary block" type="button" data-act="report-retry" data-id="${esc(r.id)}">다시 제보하기</button>`);
  } else if (act === 'report-detail') {
    const st = REPORT_STATUS[r.status];
    sheet(`<h2>내 제보 내용</h2><p class="small muted">${esc(st.label)} · ${esc(kstStamp(r.createdAt))} 제보</p><dl class="kv">
      ${[['종류', r.kind === 'performance' ? '공연 일정' : '티켓 오픈 소식'], ['공연명', r.title], ['아티스트', (r.artists || []).join(', ')], ['공연장', r.venue], ['공연 날짜', r.showDate], ['티켓 오픈', r.openAtText], ['예매 링크', r.ticketUrl], ['출처 링크', r.sourceUrl], ['메모', r.note]].filter(([, v]) => v).map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`);
  } else if (act === 'report-retry') { prefill = r; location.hash = '#/report'; }
}
export async function cancelReport(id) {
  try { await api.reports.cancel(id); track('report_cancel'); toast('제보를 취소했어요.'); await renderMyReports(); } catch (e) { toast(errMsg(e)); }
}
export { S };
