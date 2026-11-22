// ACC-01 로그인 · ACC-02 회원가입 · ACC-03 소셜 첫 로그인 · ACC-04 설정 · ACC-05 약관 · SHT-02 로그인 유도 · SHT-06 탈퇴 (R-01~09b)
import api from '../../shared/api/index.js';
import { CONFIG } from '../../shared/config.js';
import { esc, page, $, $$, sheet, closeSheet, toast, track, store, errMsg } from '../ui.js';
import { S } from '../state.js';

const GATE_MSG = {
  'plan-opening': '보고 싶은 공연을 저장하려면 로그인해 주세요', 'plan-perf': '보고 싶은 공연을 저장하려면 로그인해 주세요',
  'attend-perf': '관람 기록을 남기려면 로그인해 주세요', interest: '관심 아티스트를 담으려면 로그인해 주세요',
  report: '제보하려면 로그인해 주세요', my: '로그인하고 이어서 기록해요', reco: '로그인하고 이어서 기록해요'
};
const PENDING = 'nae_pending';
const socialButtons = (ctx, withOr = true) => `<div class="social">
    <button type="button" class="btn block sns kakao" data-act="auth-social" data-v="kakao" data-ctx="${ctx}">카카오로 시작하기</button>
    <button type="button" class="btn block sns google" data-act="auth-social" data-v="google" data-ctx="${ctx}">Google로 시작하기</button>
  </div>${api.isDemo ? '<p class="demo-note">시연 모드: 소셜 버튼은 예시 기록이 담긴 데모 계정으로 들어가요.</p>' : ''}${withOr ? '<div class="or"><span>또는 이메일로</span></div>' : ''}`;
const authHead = title => `<section class="auth-head"><img src="assets/logo.png" alt="${esc(CONFIG.serviceNameEn)}" width="120" height="85"><p class="slogan-sub">${esc(CONFIG.sloganKo)}</p><h1>${title}</h1></section>`;
const TERMS = [['age14', '만 14세 이상입니다', true], ['terms', '이용약관 동의', true], ['privacy', '개인정보 수집·이용 동의', true], ['marketing', '공연 소식·이벤트 알림 수신 (선택)', false]];
const termsBox = () => `<fieldset class="terms"><legend class="vh">약관 동의</legend><label class="check all"><input type="checkbox" id="termsAll"> <b>전체 동의</b></label>
  ${TERMS.map(([k, t, req]) => `<label class="check"><input type="checkbox" name="${k}" data-term${req ? ' data-req' : ''}> ${req ? '<em>[필수]</em>' : '<em class="opt">[선택]</em>'} ${t}${k === 'terms' || k === 'privacy' ? ` <a class="link tiny" href="#/terms/${k === 'terms' ? 'tos' : 'privacy'}" target="_blank">보기</a>` : ''}</label>`).join('')}</fieldset>`;
function bindTerms(onChange) {
  const all = $('#termsAll'); const items = $$('[data-term]');
  all.addEventListener('change', () => { items.forEach(c => { c.checked = all.checked; }); onChange?.(); });
  items.forEach(c => c.addEventListener('change', () => { all.checked = items.every(x => x.checked); onChange?.(); }));
}
const readConsents = form => Object.fromEntries(TERMS.map(([k]) => [k, !!form.querySelector(`[name="${k}"]`)?.checked]));

/* SHT-02 로그인 유도 + 하던 행동 기억 (R-03) */
export function loginSheet(ctx) {
  track('auth_gate', { value: ctx });
  sheet(`<p class="eyebrow">LOGIN</p><h2>${esc(GATE_MSG[ctx] || '로그인하고 이어서 해 주세요')}</h2>${socialButtons('sheet', false)}
    <p class="auth-links"><a class="link" href="#/login">이메일로 로그인</a> · <a class="link" href="#/signup">회원가입</a></p>`);
}
export function requireLogin(act, data) {
  if (api.auth.current()) return true;
  store.set(PENDING, { act, data, hash: location.hash || '#/open', at: Date.now() });
  loginSheet(act === 'report-open' ? 'report' : act);
  return false;
}
export function takePending() { const p = store.get(PENDING, null); store.set(PENDING, null); return p && Date.now() - p.at < 10 * 60000 ? p : null; }

export function renderLogin() {
  if (api.auth.current()) { location.replace('#/settings'); return; }
  track('auth_view', { value: 'login' });
  page('my', `${authHead('로그인')}${socialButtons('login')}
    <form class="form" id="loginForm" novalidate autocomplete="on"><label>이메일<input type="email" name="email" required autocomplete="email" inputmode="email" placeholder="you@example.com"></label>
      <label>비밀번호<input type="password" name="password" required autocomplete="current-password" minlength="8"></label>
      ${api.isDemo ? '<p class="demo-note">시연 모드: 비밀번호는 확인·저장하지 않아요. 실제로 쓰는 비밀번호는 넣지 마세요.</p>' : ''}
      <p class="ferr" id="loginErr" role="alert"></p><button class="btn primary block" type="submit">로그인</button></form>
    <p class="auth-links"><button type="button" class="link" data-act="auth-find">비밀번호 찾기</button> · <a class="link" href="#/signup">회원가입</a></p>`, { back: '#/my' });
}
export function renderSignup() {
  if (api.auth.current()) { location.replace('#/settings'); return; }
  track('auth_view', { value: 'signup' });
  page('my', `${authHead('회원가입')}${socialButtons('signup')}
    <form class="form" id="signupForm" novalidate autocomplete="on"><label>이메일<input type="email" name="email" required autocomplete="email" inputmode="email" placeholder="you@example.com"></label>
      <label>비밀번호 <small>영문·숫자 포함 8자 이상</small><input type="password" name="password" required autocomplete="new-password" minlength="8"></label>
      <label>비밀번호 확인<input type="password" name="password2" required autocomplete="new-password"></label>
      ${api.isDemo ? '<p class="demo-note">시연 모드: 비밀번호는 확인·저장하지 않아요. 실제로 쓰는 비밀번호는 넣지 마세요.</p>' : ''}
      <label>닉네임 <small>2~12자</small><input type="text" name="nickname" required maxlength="12" autocomplete="nickname"></label>${termsBox()}
      <p class="ferr" id="signupErr" role="alert"></p><button class="btn primary block" type="submit">가입하기</button></form>
    <p class="auth-links">이미 회원인가요? <a class="link" href="#/login">로그인</a></p>`, { back: '#/login' });
  bindTerms();
}
/* ACC-03 소셜 첫 로그인 추가 정보 (R-03a·05·06) */
export function renderSocialProfile() {
  const p = api.auth.pendingProfile();
  if (!p) { location.replace(api.auth.current() ? '#/my' : '#/login'); return; }
  page('my', `${authHead('거의 다 됐어요')}<form class="form" id="profileForm" novalidate>
      <label>닉네임 <small>2~12자</small><input type="text" name="nickname" required maxlength="12" value="${esc(p.suggestedNickname || '')}"></label>${termsBox()}
      <p class="ferr" id="profileErr" role="alert"></p><button class="btn primary block" type="submit" id="profileSubmit" disabled>시작하기</button></form>
    <p class="auth-links"><button type="button" class="link" data-act="profile-cancel">다음에 할게요</button></p>`, { back: '' });
  bindTerms(() => { $('#profileSubmit').disabled = !$$('[data-req]').every(c => c.checked); });
}
export async function submitAuth(kind, form) {
  const f = new FormData(form); const err = $(kind === 'signup' ? '#signupErr' : '#loginErr');
  const email = String(f.get('email') || '').trim(); const pw = String(f.get('password') || ''); const nickname = String(f.get('nickname') || '').trim();
  let msg = '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) msg = '이메일 형식을 확인해 주세요.';
  else if (pw.length < 8 || (kind === 'signup' && !(/[A-Za-z]/.test(pw) && /\d/.test(pw)))) msg = kind === 'signup' ? '비밀번호는 영문과 숫자를 포함해 8자 이상이어야 해요.' : '비밀번호를 확인해 주세요.';
  else if (kind === 'signup' && pw !== f.get('password2')) msg = '비밀번호가 서로 달라요.';
  else if (kind === 'signup' && (nickname.length < 2 || nickname.length > 12)) msg = '닉네임은 2~12자로 입력해 주세요.';
  else if (kind === 'signup' && $$('[data-req]').some(c => !c.checked)) msg = '필수 약관에 동의해 주세요.';
  err.textContent = msg; if (msg) return null;
  track(kind === 'signup' ? 'signup_attempt' : 'login_attempt', { value: 'email' });
  try {
    if (kind === 'signup') {
      const r = await api.auth.signUpEmail({ email, password: pw, nickname, consents: readConsents(form) });
      if (r.verificationRequired) { sheet(`<p class="eyebrow">CHECK YOUR MAIL</p><h2>인증 메일을 보냈어요</h2><p class="small muted">${esc(email)}로 보낸 메일의 링크를 누르면 가입이 끝나요.</p>`); return null; }
      track('signup_complete', { value: 'email' }); toast(`가입했어요. 환영해요, ${nickname}님!`);
    } else { await api.auth.signInEmail({ email, password: pw }); toast('로그인했어요.'); }
    return 'email';
  } catch (e) { err.textContent = errMsg(e); return null; }
}
export async function submitProfile(form) {
  const err = $('#profileErr');
  try { await api.auth.completeProfile({ nickname: String(new FormData(form).get('nickname') || '').trim(), consents: readConsents(form) }); track('signup_complete', { value: api.auth.current()?.provider }); toast('가입했어요. 환영해요!'); return true; }
  catch (e) { err.textContent = errMsg(e); return false; }
}
export function passwordResetSheet() {
  sheet(`<h2>비밀번호 찾기</h2><form class="form" id="resetForm"><label>가입한 이메일<input type="email" name="email" required></label><button class="btn primary block" type="submit">재설정 메일 보내기</button></form>`);
}

/* ACC-04 설정 */
export function renderSettings() {
  const u = api.auth.current(); if (!u) { location.replace('#/login'); return; }
  track('settings_view');
  const prov = { kakao: '카카오', google: 'Google', email: '이메일' }[u.provider] || u.provider;
  page('my', `<section class="intro compact"><p class="eyebrow">MY ACCOUNT</p><h1>설정</h1></section>
    <section class="set-card"><div class="profile"><span class="emo sm" style="--c:#c4a7e7">🎧</span><div><b>${esc(u.nickname)}</b><small>${esc(prov)} 로그인${u.email ? ' · ' + esc(u.email) : ''}</small></div><button class="link" type="button" data-act="nick-edit">수정</button></div></section>
    <section class="set-card">
      <label class="set-row"><span><b>공연 소식·이벤트 알림 수신</b><small>마케팅 정보 수신 동의 (선택)</small></span><input type="checkbox" id="mkt"${u.marketing ? ' checked' : ''}></label>
      <a class="set-row" href="#/report/mine"><b>내 제보${u.reportUnseen ? ' <i class="dot" aria-label="새 소식"></i>' : ''}</b><i aria-hidden="true">›</i></a>
      <a class="set-row" href="#/terms/tos"><b>이용약관</b><i aria-hidden="true">›</i></a>
      <a class="set-row" href="#/terms/privacy"><b>개인정보 처리방침</b><i aria-hidden="true">›</i></a>
      <a class="set-row" href="#/badges"><b>배지 가이드</b><i aria-hidden="true">›</i></a>
      ${u.isAdmin ? '<a class="set-row" href="admin.html"><b>관리자 페이지</b><i aria-hidden="true">›</i></a>' : ''}
    </section>
    <button class="btn ghost block" type="button" data-act="logout">로그아웃</button>
    ${u.isAdmin ? '' : '<p class="auth-links"><button type="button" class="link danger" data-act="withdraw">회원 탈퇴</button></p>'}
    ${api.isDemo ? '<p class="auth-links"><button type="button" class="link" data-act="demo-reset">시연 데이터 처음으로</button></p>' : ''}`, { back: '#/my' });
  $('#mkt').addEventListener('change', async e => {
    try { await api.auth.setMarketing(e.target.checked); track('marketing_toggle', { value: e.target.checked ? 'Y' : 'N' }); toast(e.target.checked ? '알림 수신에 동의했어요.' : '알림 수신 동의를 철회했어요.'); }
    catch (er) { e.target.checked = !e.target.checked; toast(errMsg(er)); }
  });
}
export function nicknameSheet() {
  const u = api.auth.current();
  sheet(`<h2>닉네임 수정</h2><form class="form" id="nickForm"><label>닉네임 <small>2~12자</small><input type="text" name="nickname" maxlength="12" value="${esc(u?.nickname || '')}" required></label><p class="ferr" id="nickErr" role="alert"></p><button class="btn primary block" type="submit">저장</button></form>`);
}
export function withdrawSheet() {
  sheet(`<p class="eyebrow">WITHDRAW</p><h2>정말 탈퇴할까요?</h2><p class="small muted">${esc(CONFIG.myName)} 기록, 관심 아티스트, 배지가 모두 지워지고 되돌릴 수 없어요.</p>
    <button class="btn block danger-btn" type="button" data-act="withdraw-confirm">탈퇴하기</button>`);
}
/* ACC-05 약관 (문서는 운영 주체가 작성, 결정 1) */
export function renderTerms(type) {
  const tos = type !== 'privacy';
  page('my', `<section class="intro compact"><p class="eyebrow">${tos ? 'TERMS' : 'PRIVACY'}</p><h1>${tos ? '이용약관' : '개인정보 처리방침'}</h1><p class="muted small">시행일 ${esc(CONFIG.termsVersion)}</p></section>
    <div class="seg wide" role="group"><a class="seg-a" href="#/terms/tos" aria-pressed="${tos}">이용약관</a><a class="seg-a" href="#/terms/privacy" aria-pressed="${!tos}">개인정보 처리방침</a></div>
    <div class="empty">정식 문서는 운영 주체가 작성해 이곳에 넣어요. (공유 규칙 문서 결정 1)<br>${tos ? '' : '수집 항목은 서비스 규칙 L. 수집하는 데이터 기준입니다.'}</div>`, { back: '#/settings' });
}
export { S, closeSheet };
