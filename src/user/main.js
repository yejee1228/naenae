// 내내(nae nae) 베타 — 사용자 화면 진입점 · 라우팅 · 버튼 동작 (03 IA, 05 유저 플로우)
import '../shared/style.css';
import api from '../shared/api/index.js';
import { L } from '../shared/lib.js';
import { $, sheet, closeSheet, toast, track, store, errMsg, app, esc } from './ui.js';
import { S, loadContent, loadMine, visibleOpenings, perfById, checkNewBadge, notifyError, today, interestByName } from './state.js';
import { renderOpen, renderOpeningDetail, calendarSheet, downloadICS, plannedForOpening } from './views/open.js';
import { renderSchedule, renderPerf } from './views/schedule.js';
import { renderReco, hexSheet } from './views/reco.js';
import { renderEvents, renderEventDetail } from './views/events.js';
import { renderMy, renderBadgeGuide, renderStamp, stampAction, editSheet } from './views/my.js';
import { renderLogin, renderSignup, renderSocialProfile, renderSettings, renderTerms, loginSheet, requireLogin, takePending, submitAuth, submitProfile, passwordResetSheet, nicknameSheet, withdrawSheet, fieldAction } from './views/account.js';
import { renderReport, renderMyReports, submitReport, reportAction, cancelReport, setArtistPrefill, reportFormAction } from './views/report.js';
import { drawScheduleArtists } from './views/artists.js';
import { myArtistsAction } from './views/my.js';

/* ---------- 라우팅 ---------- */
let current = '';
export function rerender() { S.keepScroll = true; route(true); }
async function route(keep) {
  const [view, rawId, sub] = location.hash.replace(/^#\/?/, '').split('/');
  const id = rawId ? decodeURIComponent(rawId) : '';
  const key = `${view}/${id}`;
  if (!keep && key !== current) closeSheet();
  current = key;
  if (api.auth.pendingProfile() && view !== 'signup' && view !== 'terms') { location.replace('#/signup/social'); return; }   // ACC-03
  const y = window.scrollY;
  switch (view) {
    case 'schedule': renderSchedule(); break;
    case 'perf': renderPerf(id); break;
    case 'opening': renderOpeningDetail(id); break;
    case 'reco': renderReco(); break;
    case 'event': id ? renderEventDetail(id) : renderEvents(); break;
    case 'my': renderMy(['planned', 'attended', 'artists'].includes(id) ? id : null); break;
    case 'badges': renderBadgeGuide(); break;
    case 'stamp': api.auth.current() ? renderStamp(id) : renderMy(); break;
    case 'report': id === 'mine' ? await renderMyReports() : renderReport(id); break;
    case 'login': renderLogin(); break;
    case 'signup': id === 'social' ? renderSocialProfile() : renderSignup(); break;
    case 'settings': renderSettings(); break;
    case 'terms': renderTerms(id); break;
    default: renderOpen();
  }
  if (keep) window.scrollTo(0, y);
  if (S.afterRoute) { const f = S.afterRoute; S.afterRoute = null; f(); }
}
addEventListener('hashchange', () => route(false));

/* ---------- 로그인이 필요한 행동 (R-02·03) ---------- */
const GATED = ['plan-opening', 'plan-perf', 'attend-perf', 'interest', 'interest-artist', 'report-open', 'report-artist'];
async function doAction(act, d, resumed) {
  try {
    if (act === 'plan-opening' || act === 'plan-perf') {
      const o = act === 'plan-opening' ? visibleOpenings().find(x => x.id === d.id) : null;
      const p = act === 'plan-perf' ? perfById(d.id) : null;
      if (!o && !p) return;
      const ex = o ? plannedForOpening(o) : S.records.find(r => r.type === 'planned' && r.performanceId === p.id);
      if (ex) { if (resumed) { toast('이미 보고 싶은 공연에 있습니다.'); return; } await api.records.unplan(ex.id); S.records = S.records.filter(r => r.id !== ex.id); track('record_remove', { item: ex.performanceId || ex.openingId, value: 'planned' }); toast('보고 싶은 공연에서 뺐습니다.'); }
      else {
        const ref = o ? (o.performanceId && perfById(o.performanceId) ? { performanceId: o.performanceId } : { openingId: o.id }) : { performanceId: p.id };   // R-17
        const rec = await api.records.plan(ref); S.records.push(rec); track('planned_add', { item: ref.performanceId || ref.openingId, value: o ? 'opening' : 'perf' }); toast('보고 싶은 공연에 담았습니다.');
      }
    } else if (act === 'attend-perf') {
      const r = await api.records.attend({ performanceId: d.id, date: d.date });
      S.records = S.records.filter(x => x.id !== r.removedPlannedId); S.records.push(r.record);
      track('attended_add', { item: d.id, value: 'perf' }); toast('관람 기록을 남겼습니다. 인증샷도 만들어 보세요!');   // R-33: 따로 안내 안 함
    } else if (act === 'interest' || act === 'interest-artist') {   // R-129: 아티스트가 있으면 ID로, 없으면 이름으로
      const hit = act === 'interest-artist' ? S.interests.find(i => i.artistId === d.id) : interestByName(d.name);
      if (hit) {
        if (resumed) { toast('이미 관심 아티스트입니다.'); return; }
        await api.interests.remove(hit.artistId ? { artistId: hit.artistId } : { name: hit.name }); S.interests = await api.interests.list();
        track('artist_uninterest', { item: d.name, value: d.from }); toast(`${d.name} 관심 해제`);
      } else {
        const ref = act === 'interest-artist' ? { artistId: d.id, name: d.name } : { name: d.name };
        await api.interests.add(ref, ['perf', 'opening'].includes(d.from) ? d.from : act === 'interest-artist' ? 'search' : 'manual'); S.interests = await api.interests.list();
        track('artist_interest', { item: d.name, value: d.from }); toast(`${d.name}을(를) 관심 아티스트에 담았습니다.`);
      }
    } else if (act === 'report-open') { track('report_open', { value: d.from }); location.hash = '#/report'; return; }
    else if (act === 'report-artist') { track('report_open', { value: 'artist' }); setArtistPrefill(d.name || ''); if (location.hash === '#/report/artist') rerender(); else location.hash = '#/report/artist'; return; }
    await checkNewBadge();
  } catch (e) { notifyError(e); }
  rerender();
}
async function afterLogin(how) {
  track('login_success', { value: how });
  await loadMine();
  await checkNewBadge(true);   // 예시 기록으로 이미 채워진 배지는 축하 창 없이
  closeSheet();
  const p = takePending();
  const target = p ? p.hash : (/^#\/(login|signup)/.test(location.hash) ? '#/my' : location.hash);
  if (p) S.afterRoute = () => doAction(p.act, p.data, true);
  if (location.hash !== target) location.hash = target; else route(true);
}

/* ---------- 클릭 ---------- */
document.addEventListener('click', async e => {
  const t = e.target.closest('[data-track]');
  if (t) track(t.dataset.track, { item: t.dataset.item || '', value: t.dataset.value || '' });
  const card = e.target.closest('.op[data-href]');   // 오픈 공지 박스를 누르면 상세 (버튼·링크 제외)
  if (card && !e.target.closest('a, button, input, label, select')) { location.hash = card.dataset.href; return; }
  const a = e.target.closest('[data-act]'); if (!a) return;
  const act = a.dataset.act; const id = a.dataset.id;
  if (GATED.includes(act)) {
    e.preventDefault();
    const d = { id, name: a.dataset.name, from: a.dataset.from || a.dataset.v, date: act === 'attend-perf' && $('#attDate') ? $('#attDate').value : '' };
    if (requireLogin(act, d)) doAction(act, d);
    return;
  }
  const opening = () => visibleOpenings().find(o => o.id === id);
  try {
    switch (act) {
      case 'close-sheet': closeSheet(); break;
      case 'open-mode': S.openMode = a.dataset.v; store.set('ml05_open_mode', S.openMode); track('open_mode', { value: S.openMode }); rerender(); break;
      case 'cal-month': S.calMonth = L.shiftMonth(S.calMonth, Number(a.dataset.v)); S.calDay = S.calMonth === today().slice(0, 7) ? today() : S.calMonth + '-01'; rerender(); break;
      case 'cal-day': S.calDay = a.dataset.v; if (S.calDay.slice(0, 7) !== S.calMonth) S.calMonth = S.calDay.slice(0, 7); rerender(); break;
      case 'cal': { const o = opening(); if (o) calendarSheet(o, a.dataset.ctx); break; }
      case 'ics': { const o = opening(); if (o) downloadICS(o); break; }
      case 'show-past': $('#past').checked = true; $('#past').dispatchEvent(new Event('change')); break;
      case 'hex-open': hexSheet(); break;
      case 'login-sheet': loginSheet(a.dataset.ctx || 'my'); break;
      case 'badge-scope': S.badgeScope = a.dataset.v; track('badge_scope', { value: S.badgeScope }); rerender(); break;
      case 'badge-move': { const next = L.shiftMonth(S.badgeMonth, Number(a.dataset.v)); S.badgeMonth = next > today().slice(0, 7) ? today().slice(0, 7) : next; rerender(); break; }
      case 'to-attended': { const r = await api.records.toAttended(id); S.records = S.records.map(x => (x.id === id ? r.record : x)); track('attended_add', { item: r.record.performanceId || 'manual', value: 'from_planned' }); toast('관람 완료로 옮겼습니다.'); await checkNewBadge(); rerender(); break; }
      case 'remove-rec': {   // R-39: 삭제 전에 확인 창 (결정 15 회신)
        const r = S.records.find(x => x.id === id); if (!r) break;
        sheet(`<p class="eyebrow">DELETE</p><h2>이 기록을 삭제하시겠습니까?</h2><p class="small muted"><b>${esc(r.title || '')}</b>${r.date ? ' · ' + esc(L.fmtDayKo(r.date)) : ''}<br>삭제하면 되돌릴 수 없습니다.</p>
          <button class="btn block danger-btn" type="button" data-act="remove-rec-ok" data-id="${esc(id)}">삭제</button>`);
        break;
      }
      case 'remove-rec-ok': {
        const r = S.records.find(x => x.id === id); a.disabled = true;
        await api.records.remove(id); closeSheet(); S.records = S.records.filter(x => x.id !== id); track('record_remove', { item: r?.performanceId || 'manual', value: r?.type }); rerender(); toast('삭제했습니다.');
        break;
      }
      case 'edit-rec': { const r = S.records.find(x => x.id === id); if (r) editSheet(r); break; }
      case 'align': case 'stamp-reset': case 'share': case 'save': stampAction(act, a); break;
      case 'auth-social': {
        const v = a.dataset.v; track(a.dataset.ctx === 'signup' ? 'signup_attempt' : 'login_attempt', { value: v, item: a.dataset.ctx });
        const r = await api.auth.signInSocial(v);
        if (r.redirected) return;                         // 서버 모드: 소셜 로그인 창으로 이동 → 돌아오면 init에서 이어서
        if (r.needsProfile) { closeSheet(); location.hash = '#/signup/social'; } else { toast('로그인했습니다.'); afterLogin(v); }
        break;
      }
      case 'profile-cancel': api.auth.cancelProfile(); store.set('nae_pending', null); location.hash = '#/open'; break;   // R-03a
      case 'auth-find': passwordResetSheet(); break;
      case 'nick-edit': nicknameSheet(); break;
      case 'pw-eye': case 'check-email': case 'check-nick': await fieldAction(act, a); break;   // R-06d·06e·07
      case 'logout': await api.auth.signOut(); track('logout'); await loadMine(); toast('로그아웃했습니다.'); location.hash = '#/open'; break;
      case 'withdraw': withdrawSheet(); break;
      case 'withdraw-confirm': await api.auth.withdraw(); closeSheet(); await loadMine(); toast('탈퇴했습니다. 그동안 감사했습니다.'); location.hash = '#/open'; break;
      case 'demo-reset': if (api.resetDemo) { api.resetDemo(); await loadContent(); await loadMine(); toast('시연 데이터를 처음으로 돌렸습니다.'); location.hash = '#/open'; } break;
      case 'report-reason': case 'report-detail': case 'report-retry': closeSheet(); reportAction(act, id); break;
      case 'report-cancel': cancelReport(id); break;
      case 'artist-schedule': S.sched.q = a.dataset.name || ''; S.sched.past = false; track('artist_schedule', { item: S.sched.q }); if (location.hash.startsWith('#/schedule')) route(true); else location.hash = '#/schedule'; break;
      case 'artist-more': { const box = $('#artistSec'); if (box) { box.dataset.more = '1'; drawScheduleArtists(S.sched.q); } break; }
      case 'artist-jump': $('#artistSec')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); break;
      case 'my-artist-clear': case 'report-member-add': case 'report-kind': case 'report-artist-kind': case 'report-group-pick': case 'report-chip-remove': if (act === 'my-artist-clear') myArtistsAction(act, a); else reportFormAction(act, a); break;
    }
  } catch (er) { notifyError(er); }
});

/* ---------- 폼 ---------- */
document.addEventListener('submit', async e => {
  const f = e.target; const id = f.id;
  if (!['manualForm', 'loginForm', 'signupForm', 'profileForm', 'reportForm', 'editForm', 'nickForm', 'resetForm'].includes(id)) return;
  e.preventDefault();
  try {
    if (id === 'loginForm' || id === 'signupForm') { const how = await submitAuth(id === 'signupForm' ? 'signup' : 'login', f); if (how) afterLogin(how); }
    else if (id === 'profileForm') { if (await submitProfile(f)) afterLogin(api.auth.current()?.provider || 'social'); }
    else if (id === 'reportForm') await submitReport(f);
    else if (id === 'manualForm') {
      const d = new FormData(f);
      const rec = await api.records.createManual({ type: d.get('type'), title: String(d.get('title') || '').trim(), date: d.get('date'), venue: String(d.get('venue') || '').trim(), region: d.get('region') || '', artists: String(d.get('artists') || '').split(/[,·/]/).map(s => s.trim()).filter(Boolean) });
      S.records.push(rec); track('attended_add', { item: 'manual', value: 'manual' });
      // 기록하면서 공연 제보도 (체크했을 때). 제보가 안 돼도 기록은 남음
      let reported = false;
      if (d.get('report')) {
        try { await api.reports.create({ kind: 'performance', title: rec.title, artists: rec.artists || [], venue: rec.venue || '', showDate: rec.date || '', openAtText: '', ticketUrl: '', sourceUrl: '', note: '나의 내내 직접 기록에서 함께 보낸 제보' }); track('report_submit', { value: 'performance', item: 'manual' }); reported = true; }
        catch (er) { toast('기록했습니다. 제보는 보내지 못했습니다: ' + errMsg(er)); }
      }
      if (!d.get('report') || reported) toast(reported ? '기록하고 제보했습니다. 처리 상황은 내 제보에서 볼 수 있습니다.' : '기록했습니다.');
      S.myTab = rec.type; await checkNewBadge(); renderMy();
    } else if (id === 'editForm') {
      const d = new FormData(f); const patch = { date: d.get('date') };
      if (d.has('venue')) Object.assign(patch, { venue: String(d.get('venue') || '').trim(), region: d.get('region') || '', artists: String(d.get('artists') || '').split(/[,·/]/).map(s => s.trim()).filter(Boolean) });
      const r = await api.records.update(f.dataset.id, patch); S.records = S.records.map(x => (x.id === r.id ? r : x)); track('record_edit'); closeSheet(); toast('수정했습니다.'); rerender();
    } else if (id === 'nickForm') {
      try { await api.auth.updateNickname(String(new FormData(f).get('nickname') || '').trim()); closeSheet(); toast('닉네임을 바꿨습니다.'); rerender(); } catch (er) { $('#nickErr').textContent = errMsg(er); }
    } else if (id === 'resetForm') { await api.auth.sendPasswordReset(String(new FormData(f).get('email') || '').trim()); closeSheet(); toast('메일을 보냈습니다. 메일의 링크로 새 비밀번호를 정해 주세요.'); }
  } catch (er) { notifyError(er); }
});

/* ---------- 시작 ---------- */
(async function init() {
  app().innerHTML = '<p class="loading">불러오는 중…</p>';
  try { await api.init(); } catch { /* 비회원으로 계속 */ }
  await Promise.all([loadContent(), loadMine()]);
  api.auth.onChange(async () => { await loadMine(); rerender(); });
  track('visit', { value: (location.hash.replace(/^#\/?/, '').split('/')[0] || 'open').slice(0, 20), item: (document.referrer ? new URL(document.referrer).hostname : '').slice(0, 60) });
  const p = api.auth.current() ? takePending() : null;   // 서버 모드: 소셜 로그인에서 돌아온 경우 하던 행동 이어서
  if (p) { S.afterRoute = () => doAction(p.act, p.data, true); if (location.hash !== p.hash) { location.hash = p.hash; return; } }
  route(false);
  window.NaeNae = { S, api };   // 점검용
})();
