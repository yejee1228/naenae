// 내내 사용자 화면 — 공통 UI (06 화면 정의서 §0)
import { L } from '../shared/lib.js';
import { CONFIG } from '../shared/config.js';
import api from '../shared/api/index.js';

export const esc = L.esc;
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const app = () => document.getElementById('app');

/* ---------- 환경·익명 ID ---------- */
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 무시 */ } }
};
export { store };
const rid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
const visitorId = store.get('ml_vid', null) || (() => { const v = rid(); store.set('ml_vid', v); return v; })();
const sessionId = rid();
const params = new URLSearchParams(location.search);
const src = (params.get('src') || 'direct').replace(/[^\w-]/g, '').slice(0, 20) || 'direct';
const UA = navigator.userAgent || '';
export const inApp = /Instagram/i.test(UA) ? 'instagram' : /KAKAOTALK/i.test(UA) ? 'kakao' : /FBAN|FBAV/i.test(UA) ? 'facebook' : (/NAVER/i.test(UA) && /inapp/i.test(UA)) ? 'naver' : /Line\//i.test(UA) ? 'line' : '';
export const isAndroid = /Android/i.test(UA);

/* ---------- 이용 기록 (L 표 2): 모아서 2초마다 보냄, 실패해도 화면에 영향 없음 ---------- */
const queue = [];
let timer = 0;
export const debugLog = [];
export function track(event, data = {}) {
  const e = { event, item: String(data.item ?? '').slice(0, 200), value: String(data.value ?? '').slice(0, 200), src, inapp: inApp, visitorId, sessionId, appVersion: CONFIG.version, at: new Date().toISOString() };
  queue.push(e); debugLog.push(e);
  clearTimeout(timer); timer = setTimeout(flush, 2000);
}
function flush() { if (!queue.length) return; const batch = queue.splice(0, 20); api.logs.track(batch).catch(() => {}); if (queue.length) timer = setTimeout(flush, 300); }
addEventListener('pagehide', flush);

/* ---------- 토스트 (되돌리기 버튼 가능, R-39) ---------- */
export function toast(msg, action) {
  $$('.toast').forEach(t => t.remove());
  const d = document.createElement('div');
  d.className = 'toast'; d.setAttribute('role', 'status');
  d.innerHTML = esc(msg) + (action ? ` <button type="button" class="toast-act">${esc(action.label)}</button>` : '');
  if (action) d.querySelector('button').addEventListener('click', () => { d.remove(); action.onClick(); });
  document.body.appendChild(d);
  setTimeout(() => d.remove(), action ? 5000 : 2600);
}

/* ---------- 시트 ---------- */
let sheetCleanup = null;
export function sheet(html, onClose) {
  closeSheet();
  const m = document.createElement('div');
  m.className = 'modal'; m.id = 'sheet'; m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true');
  m.innerHTML = `<div class="modal-body">${html}<button class="btn ghost block" type="button" data-act="close-sheet">닫기</button></div>`;
  m.addEventListener('click', e => { if (e.target === m) closeSheet(); });
  document.body.appendChild(m); sheetCleanup = onClose || null;
  return m;
}
export function closeSheet() { const m = $('#sheet'); if (m) m.remove(); if (sheetCleanup) { const f = sheetCleanup; sheetCleanup = null; f(); } }

/* ---------- 상단 바 · 하단 탭 5개 · 푸터 ---------- */
export function topBar({ back, noBrand, title } = {}) {
  const u = api.auth.current();
  const onAuth = /^#\/(login|signup)/.test(location.hash);
  const right = u ? `<a class="login-btn user" href="#/settings" aria-label="설정">${esc(u.nickname.length > 8 ? u.nickname.slice(0, 8) + '…' : u.nickname)}${u.reportUnseen ? '<i class="dot" aria-label="새 소식"></i>' : ''}</a>`
    : onAuth ? '' : '<a class="login-btn" href="#/login">로그인</a>';
  const left = back ? `<a class="back" href="${back}">← 뒤로</a>` : noBrand ? '<span></span>' : `<a class="brand" href="#/open" aria-label="${esc(CONFIG.serviceName)} 홈"><img src="assets/logo.png" alt="${esc(CONFIG.serviceNameEn)}" width="64" height="45"></a>`;
  return `<header class="top">${left}${title ? `<span class="top-title">${esc(title)}</span>` : ''}<span class="top-right"><span class="beta">BETA</span>${right}</span></header>`;
}
const TABS = [
  ['open', '오픈 공지', 'M7 3v3M17 3v3M4 9h16M5 6h14v14H5z'],
  ['schedule', '공연 일정', 'M4 6h16M4 12h16M4 18h10'],
  ['reco', '추천', 'M12 3l2.2 5.3L20 9l-4.4 3.8L17 19l-5-3-5 3 1.4-6.2L4 9l5.8-.7z'],
  ['event', '이벤트', 'M4 10h16v10H4zM3 7h18v3H3zM12 7v13M12 7c-2-4-6-4-6-1.5S9 7 12 7c3 0 6-1 6-1.5S14 3 12 7'],
  ['my', CONFIG.myName, 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-7 9a7 7 0 0 1 14 0']
];
export function tabBar(active) {
  return `<nav class="tabbar" aria-label="주요 메뉴">${TABS.map(([k, t, d]) => `<a href="#/${k}" class="${active === k ? 'on' : ''}"${active === k ? ' aria-current="page"' : ''}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg><span>${t}</span></a>`).join('')}</nav>`;
}
export function inAppBanner() {
  if (!inApp) return '';
  let action = '';
  if (inApp === 'kakao') action = `<a class="btn small" data-track="inapp_escape_click" href="kakaotalk://web/openExternal?url=${encodeURIComponent(location.href)}">기본 브라우저로 열기</a>`;
  else if (isAndroid) action = `<a class="btn small" data-track="inapp_escape_click" href="intent://${esc(location.host + location.pathname + location.search)}#Intent;scheme=https;package=com.android.chrome;end">Chrome으로 열기</a>`;
  const how = (inApp === 'instagram' && !isAndroid) ? '오른쪽 위 ⋯ → “외부 브라우저에서 열기”를 눌러 주세요.' : '아래 버튼으로 기본 브라우저에서 열어 주세요.';
  return `<div class="inapp" role="note"><b>앱 안 브라우저에서는 캘린더 추가·사진 저장이 막힐 수 있습니다.</b><span>${how}</span>${action}</div>`;
}
export function footer() {
  return `<footer class="foot">
    <p>서비스 개선을 위해 버튼 클릭 같은 익명 이용 기록을 수집합니다. 사진은 서버로 보내지 않습니다.</p>
    <p>공연 일정 출처: 공연예술통합전산망(KOPIS)</p>
    <p class="foot-brand">${esc(CONFIG.serviceName)} ${esc(CONFIG.serviceNameEn)} · ${esc(CONFIG.sloganEn)} · beta ${CONFIG.version === '1.0.0' ? '1.0' : esc(CONFIG.version)}</p>
    <p class="foot-links"><a href="#/terms/tos">이용약관</a> · <a href="#/terms/privacy">개인정보 처리방침</a> · ${esc(CONFIG.operator)}</p>
    ${api.isDemo ? '<p class="foot-demo">시연 모드 — 계정과 기록은 이 브라우저에만 저장됩니다.</p>' : ''}
  </footer>`;
}
export function page(active, inner, opts = {}) {
  app().innerHTML = `${topBar(opts)}${inAppBanner()}${inner}${footer()}${tabBar(active)}`;
  if (!opts.keepScroll) window.scrollTo(0, 0);
}
export const emptyBox = (msg, extra = '') => `<div class="empty">${msg}${extra}</div>`;
export const medal = (x, size) => `<span class="emo${size ? ' ' + size : ''}" style="--c:${esc(x.color || '#d9cce6')}" aria-hidden="true">${esc(x.emoji || '⭐')}</span>`;
export const errMsg = e => (e && e.message) || '잠시 후 다시 시도해 주세요.';
