// 내내(nae nae) 베타 — 로컬 모드 백엔드 (서버 없이 이 브라우저에 저장, 시연·개발용)
// 08 API 명세와 같은 함수·입출력. 규칙은 SQL 함수(supabase/migrations)와 같게 맞춤.
// 주소에 ?reset=1 을 붙이면 예시 데이터로 다시 시작.
import { ApiError, fail } from './errors.js';
import { nameKey, extractArtists, kstToday, addDays, validateReport, shortRegion } from '../domain.js';
import demoPerfs from '../../../data/demo/performances.json';
import demoOpenings from '../../../data/demo/openings.json';
import demoEvents from '../../../data/demo/events.json';
import demoSeed from '../../../data/demo/seed.json';

// 로컬 전용 KOPIS 스냅샷(있으면 실제 공연으로 채움, git에 안 올라감 — tools/kopis-snapshot.mjs)
// 개발 서버(npm run dev)에서만 읽음 → 빌드 결과(공개 사이트)에는 절대 들어가지 않음 (KOPIS 이용 조건 확인 전, 결정 4)
let snapshot = null;
async function loadSnapshot() {
  if (!import.meta.env.DEV) return;
  const mods = import.meta.glob('../../../data/kopis-snapshot.json', { import: 'default' });
  const f = Object.values(mods)[0];
  if (f) { try { snapshot = await f(); } catch { snapshot = null; } }
}

const DB_KEY = 'nae_local_db_v1';
const SESSION_KEY = 'nae_local_session';
const CLUB = ['우무지', '롤링홀', '벨르', '클럽 FF', '후케즈', '상상마당 라이브홀', '무신사 개러지', '웨스트브릿지', '공상온도', '살롱 문보우', '생기 스튜디오', '프리즘홀', '언더스테이지', 'A.O.R', '수상한창고', 'H-스테이지'];
const ADMIN_EMAIL = 'admin@naenae.local';

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
const now = () => new Date().toISOString();
const copy = v => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
const rel = v => { const m = String(v || '').match(/^D([+-]\d+)(?:\s+(\d{1,2}:\d{2}))?$/); if (!m) return v; const d = addDays(kstToday(), Number(m[1])); return m[2] ? `${d}T${m[2].padStart(5, '0')}:00+09:00` : d; };

function seedDb() {
  const today = kstToday();
  const perfs = demoPerfs.performances.map(p => ({
    id: p.id, source: 'manual', kopisId: null, title: p.title, startDate: rel(p.date), endDate: rel(p.endDate), venue: p.venue, region: p.region,
    artists: p.artists, artistsLocked: true, castRaw: '', ticketLinks: p.ticketLinks || [], hidden: false, sample: true, updatedAt: now()
  }));
  if (snapshot && Array.isArray(snapshot.performances)) {
    snapshot.performances.forEach(p => perfs.push({ ...p, id: 'kopis-' + p.kopisId, source: 'kopis', artists: p.artists?.length ? p.artists : extractArtists(p.title), artistsLocked: false, hidden: false, sample: false, updatedAt: now() }));
  }
  const openings = demoOpenings.map(o => {
    const at = rel(o.openAt);
    return { id: o.id, title: o.title, artists: o.artists, venue: o.venue, showDate: rel(o.showDate) || null, openAt: at ? (at.includes('T') ? at : `${at}T00:00:00+09:00`) : null,
      openHasTime: !!(at && at.includes('T')), vendor: o.vendor, ticketUrl: o.ticketUrl, note: o.note, performanceId: o.kopisId || null, isPublished: true, hidden: false, source: 'admin', reportId: null, sample: true, updatedAt: now() };
  });
  const promotions = demoEvents.map(e => ({ id: e.id, title: e.title, tag: e.tag, summary: e.summary, body: (e.body || []).join('\n\n'), notes: e.notes || [], startDate: rel(e.start), endDate: rel(e.end),
    applyLabel: e.applyLabel, applyUrl: e.applyUrl, thumbnail: null, emoji: e.emoji, color: e.color, isPublished: true, hidden: false, sample: true, updatedAt: now() }));
  return {
    seededAt: now(), performances: perfs, openings, promotions,
    clubVenues: CLUB.map((name, i) => ({ id: i + 1, name, hidden: false })),
    users: { 'local-admin': { id: 'local-admin', email: ADMIN_EMAIL, nickname: '운영자', provider: 'email', isAdmin: true, marketing: false, reportUnseen: false, createdAt: now() } },
    data: {}, reports: [], reportLogs: [], audit: [], logs: [],
    kopisRuns: [{ id: 1, startedAt: snapshot ? snapshot.fetchedAt || now() : now(), finishedAt: now(), status: snapshot ? 'success' : 'success', listCount: perfs.length, detailCount: 0, remainingDetails: 0, error: null, trigger: 'schedule', note: snapshot ? 'KOPIS 스냅샷' : '로컬 예시 데이터' }]
  };
}

let db = null; let session = null; let pendingProfile = null;
const listeners = new Set();
function load() {
  try { if (new URLSearchParams(location.search).has('reset')) localStorage.removeItem(DB_KEY); } catch { /* 무시 */ }
  try { db = JSON.parse(localStorage.getItem(DB_KEY) || 'null'); } catch { db = null; }
  if (!db || !db.performances) { db = seedDb(); save(); }
  try { session = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch { session = null; }
  if (session?.pending) { pendingProfile = session.pending; session = null; }
  if (session && !db.users[session.id]) session = null;
}
function save() { try { localStorage.setItem(DB_KEY, JSON.stringify(db)); } catch { throw new ApiError('server', '이 브라우저에 저장할 수 없어요 (사생활 보호 모드 확인).'); } }
function saveSession() { try { localStorage.setItem(SESSION_KEY, JSON.stringify(session || (pendingProfile ? { pending: pendingProfile } : null))); } catch { /* 무시 */ } }
const emit = () => listeners.forEach(f => { try { f(current()); } catch { /* 무시 */ } });
const me = () => (session ? db.users[session.id] : null);
const mine = () => { const u = me(); if (!u) fail('unauthorized', '로그인이 필요해요.'); db.data[u.id] ||= { records: [], interests: [], badgeSeen: [] }; return db.data[u.id]; };
const requireAdmin = () => { const u = me(); if (!u) fail('unauthorized', '로그인이 필요해요.'); if (!u.isAdmin) fail('forbidden', '관리자 권한이 없어요.'); return u; };
function current() { const u = me(); return u ? copy({ id: u.id, nickname: u.nickname, provider: u.provider, email: u.email || '', isAdmin: !!u.isAdmin, marketing: !!u.marketing, reportUnseen: !!u.reportUnseen }) : null; }
function audit(action, table, id, changes) { const u = me(); db.audit.unshift({ id: db.audit.length + 1, actorId: u?.id, action, targetTable: table, targetId: String(id), changes: changes ? copy(changes) : null, createdAt: now() }); }
const purge = () => { Object.values(db.data).forEach(d => { d.records = d.records.filter(r => !r.deletedAt || Date.now() - Date.parse(r.deletedAt) < 10000); }); };

function seedFor(userId) {
  const d = db.data[userId] = { records: [], interests: [], badgeSeen: [] };
  const byId = Object.fromEntries(db.performances.map(p => [p.id, p]));
  demoSeed.records.forEach(r => {
    const pid = String(r.refId || '').replace('kopis:', '');
    const p = byId[pid];
    d.records.push({ id: uid(), type: r.type, performanceId: p ? p.id : null, openingId: null, title: p?.title || r.title, date: p ? p.startDate : rel(r.date), venue: p?.venue || r.venue, region: p?.region || r.region, artists: p?.artists || r.artists || [], createdAt: now(), updatedAt: now(), deletedAt: null });
  });
  demoSeed.artists.forEach(a => d.interests.push({ name: a.name, source: 'manual', createdAt: now() }));
}

/* ---------- 인증 ---------- */
const PROVIDER_NAME = { kakao: '카카오', google: 'Google', email: '이메일' };
const auth = {
  current,
  pendingProfile: () => copy(pendingProfile),
  onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  async signInSocial(provider) {
    const id = 'local-' + provider;
    if (db.users[id]) { session = { id }; pendingProfile = null; saveSession(); emit(); return { needsProfile: false }; }
    pendingProfile = { provider, id, suggestedNickname: (PROVIDER_NAME[provider] || '') + ' 데모' };
    saveSession(); emit();
    return { needsProfile: true };
  },
  async completeProfile({ nickname, consents }) {
    if (!pendingProfile) fail('unauthorized', '다시 로그인해 주세요.');
    const n = String(nickname || '').trim();
    if (n.length < 2 || n.length > 12) fail('validation', '닉네임은 2~12자로 입력해 주세요.');
    if (!(consents?.age14 && consents?.terms && consents?.privacy)) fail('validation', '필수 약관에 동의해 주세요.');
    const { id, provider } = pendingProfile;
    db.users[id] = { id, email: '', nickname: n, provider, isAdmin: false, marketing: !!consents.marketing, reportUnseen: false, createdAt: now(), consents: [{ ...consents, at: now() }] };
    seedFor(id);   // 데모: 소셜 계정엔 예시 기록을 채워 배지·추천을 바로 볼 수 있게
    pendingProfile = null; session = { id }; save(); saveSession(); emit();
    return current();
  },
  cancelProfile() { pendingProfile = null; saveSession(); emit(); },
  async signUpEmail({ email, nickname, consents }) {
    const e = String(email || '').trim().toLowerCase();
    if (Object.values(db.users).some(u => u.email === e)) fail('conflict', '이미 가입된 이메일이에요. 로그인해 주세요.');
    if (!(consents?.age14 && consents?.terms && consents?.privacy)) fail('validation', '필수 약관에 동의해 주세요.');
    const id = 'local-' + uid();
    db.users[id] = { id, email: e, nickname: String(nickname).trim(), provider: 'email', isAdmin: false, marketing: !!consents.marketing, reportUnseen: false, createdAt: now(), consents: [{ ...consents, at: now() }] };
    db.data[id] = { records: [], interests: [], badgeSeen: [] };
    session = { id }; save(); saveSession(); emit();
    return { verificationRequired: false };   // 로컬 모드는 인증 메일을 보낼 수 없어 바로 가입 (서버 모드는 인증 메일, R-06a)
  },
  async signInEmail({ email }) {
    const e = String(email || '').trim().toLowerCase();
    const u = Object.values(db.users).find(x => x.email === e);
    if (!u) fail('validation', '이메일 또는 비밀번호가 맞지 않아요.');
    session = { id: u.id }; pendingProfile = null; saveSession(); emit();
    return current();
  },
  async sendPasswordReset() { return true; },
  async signOut() { session = null; pendingProfile = null; saveSession(); emit(); },
  async updateNickname(nickname) {
    const n = String(nickname || '').trim(); if (n.length < 2 || n.length > 12) fail('validation', '닉네임은 2~12자로 입력해 주세요.');
    const u = me(); if (!u) fail('unauthorized'); u.nickname = n; save(); emit(); return current();
  },
  async setMarketing(agreed) { const u = me(); if (!u) fail('unauthorized'); u.marketing = !!agreed; (u.consents ||= []).push({ marketing: !!agreed, at: now() }); save(); emit(); },
  async withdraw() {
    const u = me(); if (!u) fail('unauthorized', '로그인이 필요해요.');
    if (u.isAdmin) fail('forbidden', '운영자 계정은 탈퇴할 수 없어요.');            // R-09b
    delete db.data[u.id]; delete db.users[u.id];
    db.reports.forEach(r => { if (r.userId === u.id) r.userId = null; });          // R-117
    session = null; save(); saveSession(); emit();
  }
};

/* ---------- 콘텐츠 ---------- */
const content = {
  async openings() { return copy(db.openings.filter(o => o.isPublished && !o.hidden)); },
  async performances() { return copy(db.performances.filter(p => !p.hidden)); },
  async performance(id) { const p = db.performances.find(x => x.id === id && !x.hidden); if (!p) fail('not_found', '공연 정보를 찾지 못했어요.'); return copy(p); },
  async promotions() { return copy(db.promotions.filter(p => p.isPublished && !p.hidden)); },
  async clubVenues() { return db.clubVenues.filter(v => !v.hidden).map(v => v.name); },
  async meta() { const last = db.kopisRuns.find(r => r.status === 'success'); return { updatedAt: last?.finishedAt || db.seededAt, source: snapshot ? 'KOPIS (스냅샷)' : '예시 데이터' }; }
};

/* ---------- 기록 ---------- */
function snapshotOf({ performanceId, openingId }) {
  if (performanceId) { const p = db.performances.find(x => x.id === performanceId && !x.hidden); if (!p) fail('not_found', '공연 정보를 찾지 못했어요.'); return { performanceId: p.id, openingId: null, title: p.title, date: p.startDate, venue: p.venue, region: p.region, artists: p.artists || [] }; }
  const o = db.openings.find(x => x.id === openingId); if (!o) fail('not_found', '공지를 찾지 못했어요.');
  return { performanceId: null, openingId: o.id, title: o.title, date: o.showDate || null, venue: o.venue || '', region: '', artists: o.artists || [] };
}
const records = {
  async list() { purge(); return copy(mine().records.filter(r => !r.deletedAt)); },
  async plan(ref) {
    const d = mine(); const s = snapshotOf(ref);
    if (d.records.some(r => !r.deletedAt && r.type === 'planned' && ((s.performanceId && r.performanceId === s.performanceId) || (s.openingId && r.openingId === s.openingId)))) fail('conflict', '이미 보고 싶은 공연에 있어요.');
    const rec = { id: uid(), type: 'planned', ...s, createdAt: now(), updatedAt: now(), deletedAt: null };
    d.records.push(rec); save(); return copy(rec);
  },
  async unplan(id) { const d = mine(); d.records = d.records.filter(r => r.id !== id); save(); },
  async attend({ performanceId, date }) {
    const d = mine(); const p = db.performances.find(x => x.id === performanceId && !x.hidden);
    if (!p) fail('not_found', '공연 정보를 찾지 못했어요.');
    if (!date || date < p.startDate || date > p.endDate || date > kstToday()) fail('validation', '공연 기간 안의 지난 날짜를 골라 주세요.');
    if (d.records.some(r => !r.deletedAt && r.type === 'attended' && r.performanceId === p.id && r.date === date)) fail('conflict', '이미 관람 기록이 있어요.');
    const rec = { id: uid(), type: 'attended', performanceId: p.id, openingId: null, title: p.title, date, venue: p.venue, region: p.region, artists: p.artists || [], createdAt: now(), updatedAt: now(), deletedAt: null };
    const planned = d.records.find(r => r.type === 'planned' && r.performanceId === p.id);
    d.records = d.records.filter(r => r !== planned); d.records.push(rec); save();
    return { record: copy(rec), removedPlannedId: planned?.id || null };
  },
  async toAttended(id) {
    const d = mine(); const r = d.records.find(x => x.id === id && !x.deletedAt); if (!r) fail('not_found', '기록을 찾지 못했어요.');
    if (!r.date || r.date > kstToday()) fail('validation', '공연이 끝난 뒤에 관람 완료로 옮길 수 있어요.');
    r.type = 'attended'; r.createdAt = now(); r.updatedAt = now(); save(); return { record: copy(r), removedPlannedId: null };
  },
  async createManual(input) {
    const d = mine(); const title = String(input.title || '').trim();
    if (!title || !input.date) fail('validation', '공연명과 날짜를 입력해 주세요.');
    if (input.type === 'attended' && input.date > kstToday()) fail('validation', '미래 공연은 ‘보고 싶은 공연’으로 기록해 주세요.');
    if (d.records.some(r => !r.deletedAt && !r.performanceId && r.type === input.type && nameKey(r.title) === nameKey(title) && r.date === input.date)) fail('conflict', input.type === 'planned' ? '이미 보고 싶은 공연에 있어요.' : '이미 관람 기록이 있어요.');
    const rec = { id: uid(), type: input.type, performanceId: null, openingId: null, title, date: input.date, venue: input.venue || '', region: input.region || '', artists: input.artists || [], createdAt: now(), updatedAt: now(), deletedAt: null };
    d.records.push(rec); save(); return copy(rec);
  },
  async update(id, patch) {
    const d = mine(); const r = d.records.find(x => x.id === id && !x.deletedAt); if (!r) fail('not_found', '기록을 찾지 못했어요.');
    if (patch.date) {
      if (r.type === 'attended' && patch.date > kstToday()) fail('validation', '관람일은 오늘 이전이어야 해요.');
      if (r.performanceId) { const p = db.performances.find(x => x.id === r.performanceId); if (p && (patch.date < p.startDate || patch.date > p.endDate)) fail('validation', '공연 기간 안의 날짜를 골라 주세요.'); }
      r.date = patch.date;
    }
    if (!r.performanceId) ['venue', 'region', 'artists'].forEach(k => { if (patch[k] !== undefined) r[k] = patch[k]; });   // R-36: KOPIS 공연은 날짜만
    r.updatedAt = now(); save(); return copy(r);
  },
  async remove(id) { const r = mine().records.find(x => x.id === id); if (r) { r.deletedAt = now(); save(); } },
  async restore(id) { const r = mine().records.find(x => x.id === id); if (!r) fail('not_found', '되돌릴 수 없어요.'); r.deletedAt = null; save(); return copy(r); }
};
const interests = {
  async list() { return copy(mine().interests); },
  async add(name, source = 'manual') {
    const n = String(name || '').normalize('NFKC').trim().replace(/\s+/g, ' ');
    if (!n || n.length > 40) fail('validation', '아티스트 이름을 확인해 주세요.');
    const d = mine(); if (d.interests.some(i => nameKey(i.name) === nameKey(n))) fail('conflict', '이미 관심 아티스트예요.');
    const item = { name: n, source, createdAt: now() }; d.interests.push(item); save(); return copy(item);
  },
  async remove(name) { const d = mine(); d.interests = d.interests.filter(i => nameKey(i.name) !== nameKey(name)); save(); }
};
const badges = {
  async seen() { return copy(mine().badgeSeen); },
  async markSeen(keys) { const d = mine(); keys.forEach(k => { if (!d.badgeSeen.includes(k)) d.badgeSeen.push(k); }); save(); }
};

/* ---------- 제보 ---------- */
function transition(r, to, reason) {
  const from = r.status; r.status = to; if (reason) r.rejectReason = reason; r.updatedAt = now();
  r.userSeen = !['registered', 'rejected'].includes(to);
  db.reportLogs.push({ reportId: r.id, from, to, actorId: me()?.id, reason: reason || null, createdAt: now() });
  if (['registered', 'rejected'].includes(to) && r.userId && db.users[r.userId]) db.users[r.userId].reportUnseen = true;
  audit('status_change', 'reports', r.id, { from, to, reason });
}
const reports = {
  async create(input) {
    const u = me(); if (!u) fail('unauthorized', '제보하려면 로그인해 주세요.');
    const hourAgo = Date.now() - 3600e3;
    if (db.reports.filter(r => r.userId === u.id && Date.parse(r.createdAt) > hourAgo).length >= 10) fail('rate_limited', '잠시 후 다시 시도해 주세요.');   // R-77
    const msg = validateReport(input); if (msg) fail('validation', msg);
    const r = { id: uid(), userId: u.id, kind: input.kind === 'performance' ? 'performance' : 'opening', title: input.title.trim(), artists: input.artists || [], venue: input.venue || '', showDate: input.showDate || null,
      openAtText: input.openAtText || '', ticketUrl: input.ticketUrl || '', sourceUrl: input.sourceUrl || '', note: input.note || '', status: 'submitted', rejectReason: null,
      registeredOpeningId: null, registeredPerformanceId: null, userSeen: true, createdAt: now(), updatedAt: now() };
    db.reports.unshift(r); db.reportLogs.push({ reportId: r.id, from: null, to: 'submitted', actorId: u.id, createdAt: now() }); save(); return copy(r);
  },
  async listMine() { const u = me(); if (!u) fail('unauthorized'); return copy(db.reports.filter(r => r.userId === u.id)); },
  async cancel(id) {
    const u = me(); const r = db.reports.find(x => x.id === id && x.userId === u?.id);
    if (!r || r.status !== 'submitted') fail('conflict', '이미 확인 중인 제보는 취소할 수 없어요.');      // R-75
    r.status = 'canceled'; db.reportLogs.push({ reportId: id, from: 'submitted', to: 'canceled', actorId: u.id, createdAt: now() }); save();
  },
  async markSeen() { const u = me(); if (!u) return; db.reports.forEach(r => { if (r.userId === u.id) r.userSeen = true; }); u.reportUnseen = false; save(); emit(); }
};

/* ---------- 이용 기록 ---------- */
const ALLOWED = new Set(['visit', 'open_mode', 'schedule_filter', 'perf_view', 'reco_view', 'reco_click', 'hexagon_open', 'event_view', 'event_detail_view', 'badge_guide_view', 'badge_guide_open', 'calendar_open', 'calendar_add', 'opening_click', 'ticket_link_click', 'planned_add', 'attended_add', 'record_edit', 'record_remove', 'record_restore', 'artist_interest', 'artist_uninterest', 'badge_earned', 'badge_scope', 'stamp_open', 'photo_select', 'photo_error', 'stamp_ready', 'share_click', 'share_done', 'share_cancel', 'share_error', 'share_unsupported', 'save_click', 'auth_gate', 'auth_view', 'login_attempt', 'login_success', 'signup_attempt', 'signup_complete', 'settings_view', 'marketing_toggle', 'logout', 'report_open', 'report_view', 'report_submit', 'report_mine_view', 'report_reason_open', 'report_cancel', 'event_apply_click', 'inapp_escape_click']);
const logs = {
  async track(events) {
    const list = (Array.isArray(events) ? events : [events]).filter(e => ALLOWED.has(e.event) && e.visitorId).slice(0, 20);
    list.forEach(e => db.logs.push({ event: e.event, item: String(e.item || '').slice(0, 200), value: String(e.value || '').slice(0, 200), visitorId: e.visitorId, at: e.at || now() }));
    if (db.logs.length > 3000) db.logs = db.logs.slice(-3000);
    try { save(); } catch { /* 기록 실패는 화면에 영향 없음 */ }
    return list.length;
  }
};

/* ---------- 관리자 ---------- */
function metrics7d() {
  const since = Date.now() - 7 * 864e5; const L = db.logs.filter(l => Date.parse(l.at) >= since);
  const uniq = ev => new Set(L.filter(l => ev.includes(l.event)).map(l => l.visitorId)).size;
  const cnt = ev => L.filter(l => ev.includes(l.event)).length;
  return { visitors: uniq(['visit']), calendar_add: uniq(['calendar_add']), ticket_click: uniq(['opening_click', 'ticket_link_click']), attended: cnt(['attended_add']), share_done: cnt(['share_done']), stamp_saved: cnt(['save_click']), auth_gate: uniq(['auth_gate']), signups: Object.values(db.users).filter(u => Date.parse(u.createdAt) >= since).length };
}
const upsert = (table, data, defaults) => {
  const list = db[table]; const isNew = !data.id || !list.some(x => x.id === data.id);
  const u = me();
  if (isNew) { const row = { ...defaults, ...data, id: data.id || uid(), createdBy: u.id, createdAt: now(), updatedAt: now() }; list.unshift(row); audit('create', table, row.id, row); save(); return copy(row); }
  const row = list.find(x => x.id === data.id); const before = copy(row);
  Object.assign(row, data, { updatedBy: u.id, updatedAt: now() });
  audit('update', table, row.id, { before, after: row }); save(); return copy(row);
};
const setFlag = (table, id, key, val) => { requireAdmin(); const row = db[table].find(x => String(x.id) === String(id)); if (!row) fail('not_found', '찾지 못했어요.'); row[key] = val; row.updatedAt = now(); audit(key === 'hidden' ? 'hide' : 'publish', table, id, { [key]: val }); save(); return copy(row); };
const admin = {
  isAdmin: () => !!me()?.isAdmin,
  async dashboard() {
    requireAdmin(); const t = kstToday(); const week = addDays(t, 6);
    const openDay = o => (o.openAt ? new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date(o.openAt)) : '');
    const live = db.openings.filter(o => o.isPublished && !o.hidden);
    return {
      reportsSubmitted: db.reports.filter(r => r.status === 'submitted').length, reportsReviewing: db.reports.filter(r => r.status === 'reviewing').length,
      openToday: live.filter(o => openDay(o) === t).length, openWeek: live.filter(o => openDay(o) >= t && openDay(o) <= week).length,
      upcoming: copy(live.filter(o => o.openAt && Date.parse(o.openAt) >= Date.now()).sort((a, b) => a.openAt.localeCompare(b.openAt)).slice(0, 3)),
      promotionsLive: db.promotions.filter(p => p.isPublished && !p.hidden && t >= p.startDate && t <= p.endDate).length,
      promotionsSoon: db.promotions.filter(p => p.isPublished && !p.hidden && p.startDate > t).length,
      lastSync: copy(db.kopisRuns[0]), lastSuccess: copy(db.kopisRuns.find(r => r.status === 'success')),
      members: Object.keys(db.users).length, membersToday: Object.values(db.users).filter(u => u.createdAt?.slice(0, 10) === t).length,
      metrics7d: metrics7d()
    };
  },
  openings: {
    async list() { requireAdmin(); return copy(db.openings); },
    async save(data) { requireAdmin(); if (!String(data.title || '').trim()) fail('validation', '공연명은 필수 항목이에요.'); return upsert('openings', data, { isPublished: true, hidden: false, source: 'admin', reportId: null, artists: [], openHasTime: true }); },
    async setPublished(id, on) { return setFlag('openings', id, 'isPublished', !!on); },
    async hide(id, hidden = true) { return setFlag('openings', id, 'hidden', !!hidden); }
  },
  reports: {
    async list() { requireAdmin(); return copy(db.reports.map(r => ({ ...r, nickname: db.users[r.userId]?.nickname || '(탈퇴 회원)' }))); },
    async open(id) { requireAdmin(); const r = db.reports.find(x => x.id === id); if (!r) fail('not_found', '제보를 찾지 못했어요.'); if (r.status === 'submitted') { transition(r, 'reviewing'); save(); } return copy(r); },
    async duplicates(id) { requireAdmin(); const r = db.reports.find(x => x.id === id); if (!r) return []; const k = nameKey(r.title); return copy([...db.openings.filter(o => nameKey(o.title).includes(k) || k.includes(nameKey(o.title))).map(o => ({ type: '공지', ...o })), ...db.performances.filter(p => nameKey(p.title).includes(k) || k.includes(nameKey(p.title))).map(p => ({ type: '공연', ...p }))].slice(0, 5)); },
    async register(id, as, data) {
      requireAdmin(); const r = db.reports.find(x => x.id === id);
      if (!r || !['submitted', 'reviewing'].includes(r.status)) fail('conflict', '이미 처리된 제보예요.');
      let created;
      if (as === 'opening') { created = await admin.openings.save({ ...data, source: 'report', reportId: id }); r.registeredOpeningId = created.id; }
      else { created = await admin.performances.save({ ...data, source: 'manual' }); r.registeredPerformanceId = created.id; }
      transition(r, 'registered'); save(); return { report: copy(r), createdId: created.id };
    },
    async reject(id, reason) {
      requireAdmin(); if (!String(reason || '').trim()) fail('validation', '등록하지 못한 이유를 적어 주세요.');     // R-74
      const r = db.reports.find(x => x.id === id); if (!r || !['submitted', 'reviewing'].includes(r.status)) fail('conflict', '이미 처리된 제보예요.');
      transition(r, 'rejected', String(reason).trim()); save(); return copy(r);
    }
  },
  promotions: {
    async list() { requireAdmin(); return copy(db.promotions); },
    async save(data) {
      requireAdmin();
      if (!String(data.title || '').trim() || !data.startDate || !data.endDate) fail('validation', '제목과 기간은 필수 항목이에요.');
      if (!/^https:\/\//.test(data.applyUrl || '')) fail('validation', '응모 링크는 https:// 로 시작해야 해요.');
      if (data.endDate < data.startDate) fail('validation', '종료일이 시작일보다 빨라요.');
      return upsert('promotions', data, { isPublished: true, hidden: false, notes: [], tag: '' });
    },
    async hide(id, hidden = true) { return setFlag('promotions', id, 'hidden', !!hidden); },
    async setPublished(id, on) { return setFlag('promotions', id, 'isPublished', !!on); },
    async uploadThumbnail(file) {
      requireAdmin(); if (!/^image\/(jpeg|png)$/.test(file.type)) fail('validation', 'JPG·PNG 이미지만 올릴 수 있어요.'); if (file.size > 2 * 1024 * 1024) fail('validation', '2MB 이하 이미지만 올릴 수 있어요.');
      return new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = () => rej(new ApiError('server', '이미지를 읽지 못했어요.')); fr.readAsDataURL(file); });
    }
  },
  performances: {
    async list() { requireAdmin(); return copy(db.performances); },
    async save(data) {
      requireAdmin();
      if (!String(data.title || '').trim() || !data.startDate || !data.venue) fail('validation', '공연명·공연일·공연장은 필수 항목이에요.');
      const prev = data.id && db.performances.find(p => p.id === data.id);
      const patch = { ...data, endDate: data.endDate || data.startDate, region: shortRegion(data.region || '') };
      if (prev && JSON.stringify(prev.artists) !== JSON.stringify(data.artists)) patch.artistsLocked = true;   // R-106
      return upsert('performances', patch, { source: 'manual', kopisId: null, artists: [], artistsLocked: true, castRaw: '', ticketLinks: [], hidden: false });
    },
    async hide(id, hidden = true) { return setFlag('performances', id, 'hidden', !!hidden); }
  },
  kopis: {
    async runs() { requireAdmin(); return copy(db.kopisRuns.slice(0, 7)); },
    async resync() {
      requireAdmin();
      const run = { id: db.kopisRuns.length + 1, startedAt: now(), finishedAt: now(), status: 'failed', listCount: 0, detailCount: 0, remainingDetails: 0, error: '로컬 모드에서는 KOPIS를 수집할 수 없어요 (서버 연결 후 사용)', trigger: 'admin' };
      db.kopisRuns.unshift(run); audit('kopis_resync', 'kopis_sync_runs', run.id); save(); return copy(run);
    }
  },
  clubVenues: {
    async list() { requireAdmin(); return copy(db.clubVenues); },
    async add(name) { requireAdmin(); const n = String(name || '').trim(); if (!n) fail('validation', '공연장 이름을 입력해 주세요.'); if (db.clubVenues.some(v => v.name === n)) fail('conflict', '이미 있는 공연장이에요.'); const row = { id: Math.max(0, ...db.clubVenues.map(v => v.id)) + 1, name: n, hidden: false }; db.clubVenues.push(row); audit('create', 'club_venues', row.id, row); save(); return row; },
    async hide(id, hidden = true) { return setFlag('clubVenues', id, 'hidden', !!hidden); }
  },
  members: {
    async list(q = '') {
      requireAdmin(); const k = nameKey(q);
      return Object.values(db.users).filter(u => !k || nameKey(u.nickname).includes(k)).map(u => {
        const d = db.data[u.id] || { records: [], interests: [] };
        return { id: u.id, nickname: u.nickname, provider: u.provider, createdAt: u.createdAt, marketing: !!u.marketing, isAdmin: !!u.isAdmin, emailMasked: u.email ? u.email.replace(/^(.).*(@.*)$/, '$1***$2') : '',
          planned: d.records.filter(r => r.type === 'planned' && !r.deletedAt).length, attended: d.records.filter(r => r.type === 'attended' && !r.deletedAt).length, artists: d.interests.length, reports: db.reports.filter(r => r.userId === u.id).length };
      }).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    },
    async revealEmail(id) { requireAdmin(); audit('view_pii', 'profiles', id); save(); return db.users[id]?.email || ''; }
  },
  async auditLogs() { requireAdmin(); return copy(db.audit.slice(0, 50)); }
};

export function createLocalBackend() {
  load();   // 스냅샷 없이 먼저 준비 (init에서 개발 모드면 스냅샷 반영)
  return { backend: 'local', isDemo: true, adminEmailHint: ADMIN_EMAIL, async init() { await loadSnapshot(); if (snapshot && !db.performances.some(p => p.source === 'kopis')) { const keep = { users: db.users, data: db.data, reports: db.reports, reportLogs: db.reportLogs, audit: db.audit, logs: db.logs }; db = Object.assign(seedDb(), keep); save(); } return current(); }, auth, content, records, interests, badges, reports, logs, admin, resetDemo() { localStorage.removeItem(DB_KEY); localStorage.removeItem(SESSION_KEY); load(); emit(); } };
}
