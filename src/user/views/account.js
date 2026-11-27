// ACC-01 로그인 · ACC-02 회원가입 · ACC-03 소셜 첫 로그인 · ACC-04 설정 · ACC-05 약관 · SHT-02 로그인 유도 · SHT-06 탈퇴 (R-01~09b)
import api from '../../shared/api/index.js';
import { CONFIG } from '../../shared/config.js';
import { esc, page, $, $$, sheet, closeSheet, toast, track, store, errMsg } from '../ui.js';
import { S } from '../state.js';

const GATE_MSG = {
  'plan-opening': '보고 싶은 공연을 저장하려면 로그인해 주세요', 'plan-perf': '보고 싶은 공연을 저장하려면 로그인해 주세요',
  'attend-perf': '관람 기록을 남기려면 로그인해 주세요', interest: '관심 아티스트를 담으려면 로그인해 주세요',
  report: '제보하려면 로그인해 주세요', my: '로그인하고 이어서 기록합니다', reco: '로그인하고 이어서 기록합니다'
};
const PENDING = 'nae_pending';
const socialButtons = (ctx, withOr = true) => `<div class="social">
    <button type="button" class="btn block sns kakao" data-act="auth-social" data-v="kakao" data-ctx="${ctx}">카카오로 시작하기</button>
    <button type="button" class="btn block sns google" data-act="auth-social" data-v="google" data-ctx="${ctx}">Google로 시작하기</button>
  </div>${api.isDemo ? '<p class="demo-note">시연 모드: 소셜 버튼은 예시 기록이 담긴 데모 계정으로 들어갑니다.</p>' : ''}${withOr ? '<div class="or"><span>또는 이메일로</span></div>' : ''}`;
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
      <label>비밀번호${pwInput('password', 'current-password')}</label>
      ${api.isDemo ? '<p class="demo-note">시연 모드: 비밀번호는 확인·저장하지 않습니다. 실제로 쓰는 비밀번호는 넣지 마세요.</p>' : ''}
      <p class="ferr" id="loginErr" role="alert"></p><button class="btn primary block" type="submit">로그인</button></form>
    <p class="auth-links"><button type="button" class="link" data-act="auth-find">비밀번호 찾기</button> · <a class="link" href="#/signup">회원가입</a></p>`, { back: '#/my' });
}
export function renderSignup() {
  if (api.auth.current()) { location.replace('#/settings'); return; }
  track('auth_view', { value: 'signup' });
  page('my', `${authHead('회원가입')}${socialButtons('signup')}
    <form class="form" id="signupForm" novalidate autocomplete="on"><label>이메일${checkInput('<input type="email" name="email" required autocomplete="email" inputmode="email" placeholder="you@example.com">', 'check-email')}</label>${fmsg('email')}
      <label>비밀번호 <small>영문·숫자 포함 8자 이상</small>${pwInput('password', 'new-password')}</label>
      <label>비밀번호 확인${pwInput('password2', 'new-password')}</label>${fmsg('password2')}
      ${api.isDemo ? '<p class="demo-note">시연 모드: 비밀번호는 확인·저장하지 않습니다. 실제로 쓰는 비밀번호는 넣지 마세요.</p>' : ''}
      <label>닉네임 <small>2~12자</small>${checkInput('<input type="text" name="nickname" required maxlength="12" autocomplete="nickname">', 'check-nick')}</label>${fmsg('nickname')}${termsBox()}
      <p class="ferr" id="signupErr" role="alert"></p><button class="btn primary block" type="submit">가입하기</button></form>
    <p class="auth-links">이미 회원이십니까? <a class="link" href="#/login">로그인</a></p>`, { back: '#/login' });
  bindTerms(); bindFields($('#signupForm'));
}
/* 가입 화면 도우미 (R-06d·06e·07): 비밀번호 보기 눈 버튼 · 중복확인 버튼 · 칸 아래 안내 */
const EYE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/><path class="slash" d="M4 4l16 16"/></svg>';
const pwInput = (name, ac) => `<span class="field-row pw"><input type="password" name="${name}" required autocomplete="${ac}"><button type="button" class="pw-eye" data-act="pw-eye" aria-label="비밀번호 보기" aria-pressed="false">${EYE}</button></span>`;
const checkInput = (input, act) => `<span class="field-row">${input}<button type="button" class="btn check-btn" data-act="${act}">중복확인</button></span>`;
const fmsg = name => `<p class="fmsg" data-msg="${name}" aria-live="polite"></p>`;
function setMsg(form, name, text, ok) { const m = form?.querySelector(`[data-msg="${name}"]`); if (m) { m.textContent = text; m.className = 'fmsg' + (text ? (ok ? ' ok' : ' bad') : ''); } }
// 이메일 형식: 아이디@도메인.최상위(2자 이상), 점이 맨 앞·맨 뒤·연달아 오면 안 됨
const EMAIL_RE = /^(?!\.)(?!.*\.\.)[A-Za-z0-9._%+-]*[A-Za-z0-9_%+-]@(?:[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\.)+[A-Za-z]{2,}$/;
const EMAIL_BAD = '올바른 이메일 형식이 아닙니다. 예: you@example.com';
const PROVIDER = { kakao: '카카오', google: 'Google' };
const emailText = r => (r.status === 'available' ? '사용할 수 있는 이메일입니다.'
  : r.status === 'pending' ? '인증을 기다리는 이메일입니다. 메일함에서 인증 링크를 눌러 주세요.'
  : PROVIDER[r.provider] ? `${PROVIDER[r.provider]}로 가입된 이메일입니다. ${PROVIDER[r.provider]}로 로그인해 주세요.` : '이미 가입된 이메일입니다. 로그인해 주세요.');
const NICK_TAKEN = '이미 사용 중인 닉네임입니다. 다른 닉네임을 입력해 주세요.';
// 비밀번호 확인은 입력하는 즉시 같은지 보여 주고, 이메일·닉네임을 고치면 중복확인 결과를 지움
export function bindFields(form) {
  if (!form) return;
  const pw = form.elements.password; const pw2 = form.elements.password2;
  const same = () => { if (!pw2) return; if (!pw2.value) setMsg(form, 'password2', ''); else if (pw.value === pw2.value) setMsg(form, 'password2', '비밀번호가 일치합니다.', true); else setMsg(form, 'password2', '비밀번호가 서로 다릅니다.', false); };
  pw?.addEventListener('input', same); pw2?.addEventListener('input', same);
  form.elements.email?.addEventListener('input', () => setMsg(form, 'email', ''));
  form.elements.email?.addEventListener('blur', e => { const v = e.target.value.trim(); if (v && !EMAIL_RE.test(v)) setMsg(form, 'email', EMAIL_BAD, false); });
  form.elements.nickname?.addEventListener('input', () => setMsg(form, 'nickname', ''));
}
export async function fieldAction(act, btn) {
  const form = btn.closest('form');
  if (act === 'pw-eye') {
    const input = btn.previousElementSibling; const show = input.type === 'password';
    input.type = show ? 'text' : 'password'; btn.classList.toggle('on', show);
    btn.setAttribute('aria-pressed', String(show)); btn.setAttribute('aria-label', show ? '비밀번호 숨기기' : '비밀번호 보기');
    return;
  }
  btn.disabled = true;
  try {
    if (act === 'check-email') {
      const email = String(form.elements.email.value || '').trim();
      if (!EMAIL_RE.test(email)) return setMsg(form, 'email', email ? EMAIL_BAD : '이메일을 입력해 주세요.', false);
      const r = await api.auth.emailStatus(email); setMsg(form, 'email', emailText(r), r.status === 'available');
    }
    if (act === 'check-nick') {
      const nickname = String(form.elements.nickname.value || '').trim();
      if (nickname.length < 2 || nickname.length > 12) return setMsg(form, 'nickname', '닉네임은 2~12자로 입력해 주세요.', false);
      const ok = await api.auth.nicknameAvailable(nickname);
      setMsg(form, 'nickname', ok ? '사용할 수 있는 닉네임입니다.' : NICK_TAKEN, ok);
    }
  } catch (e) { toast(errMsg(e)); } finally { btn.disabled = false; }
}
/* ACC-03 소셜 첫 로그인 추가 정보 (R-03a·05·06) */
export function renderSocialProfile() {
  const p = api.auth.pendingProfile();
  if (!p) { location.replace(api.auth.current() ? '#/my' : '#/login'); return; }
  page('my', `${authHead('거의 다 되었습니다')}<form class="form" id="profileForm" novalidate>
      <label>닉네임 <small>2~12자</small>${checkInput(`<input type="text" name="nickname" required maxlength="12" value="${esc(p.suggestedNickname || '')}">`, 'check-nick')}</label>${fmsg('nickname')}${termsBox()}
      <p class="ferr" id="profileErr" role="alert">${p.nicknameTaken ? '그사이 다른 회원이 이 닉네임을 사용하게 되었습니다. 다른 닉네임을 입력해 주세요.' : ''}</p><button class="btn primary block" type="submit" id="profileSubmit" disabled>시작하기</button></form>
    <p class="auth-links"><button type="button" class="link" data-act="profile-cancel">다음에 할게요</button></p>`, { back: '' });
  bindTerms(() => { $('#profileSubmit').disabled = !$$('[data-req]').every(c => c.checked); }); bindFields($('#profileForm'));
}
export async function submitAuth(kind, form) {
  const f = new FormData(form); const err = $(kind === 'signup' ? '#signupErr' : '#loginErr');
  const email = String(f.get('email') || '').trim(); const pw = String(f.get('password') || ''); const nickname = String(f.get('nickname') || '').trim();
  let msg = '';
  if (!EMAIL_RE.test(email)) msg = email ? EMAIL_BAD : '이메일을 입력해 주세요.';
  else if (pw.length < 8 || (kind === 'signup' && !(/[A-Za-z]/.test(pw) && /\d/.test(pw)))) msg = kind === 'signup' ? '비밀번호는 영문과 숫자를 포함해 8자 이상이어야 합니다.' : '비밀번호를 확인해 주세요.';
  else if (kind === 'signup' && pw !== f.get('password2')) msg = '비밀번호가 서로 다릅니다.';
  else if (kind === 'signup' && (nickname.length < 2 || nickname.length > 12)) msg = '닉네임은 2~12자로 입력해 주세요.';
  else if (kind === 'signup' && $$('[data-req]').some(c => !c.checked)) msg = '필수 약관에 동의해 주세요.';
  err.textContent = msg; if (msg) return null;
  track(kind === 'signup' ? 'signup_attempt' : 'login_attempt', { value: 'email' });
  try {
    if (kind === 'signup') {
      // 중복확인 버튼을 누르지 않았어도 가입하기 때 한 번 더 확인 (R-06e·07)
      const es = await api.auth.emailStatus(email);
      if (es.status !== 'available') { setMsg(form, 'email', emailText(es), false); err.textContent = emailText(es); return null; }
      if (!(await api.auth.nicknameAvailable(nickname))) { setMsg(form, 'nickname', NICK_TAKEN, false); err.textContent = NICK_TAKEN; return null; }
      const r = await api.auth.signUpEmail({ email, password: pw, nickname, consents: readConsents(form) });
      if (r.verificationRequired) { sheet(`<p class="eyebrow">CHECK YOUR MAIL</p><h2>인증 메일을 보냈습니다</h2><p class="small muted">${esc(email)}로 보낸 메일의 링크를 누르면 가입이 끝납니다.</p>`); return null; }
      track('signup_complete', { value: 'email' }); toast(`가입했습니다. 환영합니다, ${nickname}님!`);
    } else { await api.auth.signInEmail({ email, password: pw }); if (api.auth.current()) toast('로그인했습니다.'); }
    return 'email';
  } catch (e) { err.textContent = errMsg(e); return null; }
}
export async function submitProfile(form) {
  const err = $('#profileErr');
  try { await api.auth.completeProfile({ nickname: String(new FormData(form).get('nickname') || '').trim(), consents: readConsents(form) }); track('signup_complete', { value: api.auth.current()?.provider }); toast('가입했습니다. 환영합니다!'); return true; }
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
      ${u.isAdmin ? '<a class="set-row" href="admin"><b>관리자 페이지</b><i aria-hidden="true">›</i></a>' : ''}
    </section>
    <button class="btn ghost block" type="button" data-act="logout">로그아웃</button>
    ${u.isAdmin ? '' : '<p class="auth-links"><button type="button" class="link danger" data-act="withdraw">회원 탈퇴</button></p>'}
    ${api.isDemo ? '<p class="auth-links"><button type="button" class="link" data-act="demo-reset">시연 데이터 처음으로</button></p>' : ''}`, { back: '#/my' });
  $('#mkt').addEventListener('change', async e => {
    try { await api.auth.setMarketing(e.target.checked); track('marketing_toggle', { value: e.target.checked ? 'Y' : 'N' }); toast(e.target.checked ? '알림 수신에 동의했습니다.' : '알림 수신 동의를 철회했습니다.'); }
    catch (er) { e.target.checked = !e.target.checked; toast(errMsg(er)); }
  });
}
export function nicknameSheet() {
  const u = api.auth.current();
  sheet(`<h2>닉네임 수정</h2><form class="form" id="nickForm"><label>닉네임 <small>2~12자</small>${checkInput(`<input type="text" name="nickname" maxlength="12" value="${esc(u?.nickname || '')}" required>`, 'check-nick')}</label>${fmsg('nickname')}<p class="ferr" id="nickErr" role="alert"></p><button class="btn primary block" type="submit">저장</button></form>`);
  bindFields($('#nickForm'));
}
export function withdrawSheet() {
  sheet(`<p class="eyebrow">WITHDRAW</p><h2>정말 탈퇴하시겠습니까?</h2><p class="small muted">${esc(CONFIG.myName)} 기록, 관심 아티스트, 배지가 모두 지워지고 되돌릴 수 없습니다.</p>
    <button class="btn block danger-btn" type="button" data-act="withdraw-confirm">탈퇴하기</button>`);
}
/* ACC-05 약관 (문서는 운영 주체가 작성, 결정 1) */
export function renderTerms(type) {
  const tos = type !== 'privacy';
  page('my', `<section class="intro compact"><p class="eyebrow">${tos ? 'TERMS' : 'PRIVACY'}</p><h1>${tos ? '이용약관' : '개인정보 처리방침'}</h1><p class="muted small">시행일 ${esc(CONFIG.termsVersion)}</p></section>
    <div class="seg wide" role="group"><a class="seg-a" href="#/terms/tos" aria-pressed="${tos}">이용약관</a><a class="seg-a" href="#/terms/privacy" aria-pressed="${!tos}">개인정보 처리방침</a></div>
    <div class="empty">정식 문서는 운영 주체가 작성해 이곳에 넣습니다. (공유 규칙 문서 결정 1)<br>${tos ? '' : '수집 항목은 서비스 규칙 L. 수집하는 데이터 기준입니다.'}</div>`, { back: '#/settings' });
}
export { S, closeSheet };
