// 내내(nae nae) 베타 — Supabase 백엔드 (08 API 명세). local.js와 같은 함수·입출력.
// ⚠ 2026-11-24 기준 Supabase 프로젝트가 없어 실제 연결로는 검증하지 못함 — SQL 쪽은 tools/sql-test.mjs로 검증됨
import { createClient } from '@supabase/supabase-js';
import { ApiError, fail, fromSupabase } from './errors.js';
import { nameKey } from '../domain.js';

const toLinks = rows => (rows || []).map(l => ({ artistId: l.artist_id, name: l.name || '' }));
const toPerf = r => r && ({ id: r.id, source: r.source, kopisId: r.kopis_id, title: r.title, startDate: r.start_date, endDate: r.end_date, venue: r.venue, region: r.region, artists: r.artists || [], artistsLocked: r.artists_locked, castRaw: r.cast_raw || '', ticketLinks: r.ticket_links || [], hidden: r.is_hidden, timeText: r.time_text, priceText: r.price_text, ageText: r.age_text, updatedAt: r.updated_at, links: toLinks(r.performance_artists) });
const fromPerf = p => ({ id: p.id, source: p.source || 'manual', title: p.title, start_date: p.startDate, end_date: p.endDate || p.startDate, venue: p.venue || '', region: p.region || '', artists: p.artists || [], ticket_links: p.ticketLinks || [] });
const toOpening = r => r && ({ id: r.id, title: r.title, artists: r.artists || [], venue: r.venue, showDate: r.show_date, openAt: r.open_at, openHasTime: r.open_has_time, vendor: r.vendor, ticketUrl: r.ticket_url, note: r.note, performanceId: r.performance_id, isPublished: r.is_published, hidden: r.is_hidden, source: r.source, reportId: r.report_id, updatedAt: r.updated_at, links: toLinks(r.opening_artists) });
const PERF_SEL = '*, performance_artists(artist_id, name)'; const OPEN_SEL = '*, opening_artists(artist_id, name)';
const toInterest = r => ({ name: r.name, artistId: r.artist_id || null, source: r.source, createdAt: r.created_at, artist: r.artists ? { id: r.artists.id, name: r.artists.name, kind: r.artists.kind, disambig: r.artists.disambig, aliases: (r.artists.artist_aliases || []).map(x => x.alias) } : null });
const fromOpening = o => ({ id: o.id, title: o.title, artists: o.artists || [], venue: o.venue || '', show_date: o.showDate || null, open_at: o.openAt || null, open_has_time: o.openHasTime !== false, vendor: o.vendor || '', ticket_url: o.ticketUrl || '', note: o.note || '', performance_id: o.performanceId || null, is_published: o.isPublished !== false });
const toPromo = (r, url) => r && ({ id: r.id, title: r.title, tag: r.tag, summary: r.summary, body: r.body, notes: r.notes || [], startDate: r.start_date, endDate: r.end_date, applyLabel: r.apply_label, applyUrl: r.apply_url, thumbnail: r.thumbnail_path ? url(r.thumbnail_path) : null, thumbnailPath: r.thumbnail_path, isPublished: r.is_published, hidden: r.is_hidden, updatedAt: r.updated_at });
const fromPromo = p => ({ id: p.id, title: p.title, tag: p.tag || '', summary: p.summary || '', body: p.body || '', notes: p.notes || [], start_date: p.startDate, end_date: p.endDate, apply_label: p.applyLabel || '응모하기', apply_url: p.applyUrl, thumbnail_path: p.thumbnailPath || null, is_published: p.isPublished !== false });
const toRecord = r => r && ({ id: r.id, type: r.type, performanceId: r.performance_id, openingId: r.opening_id, title: r.title, date: r.date, venue: r.venue, region: r.region, artists: r.artists || [], createdAt: r.created_at, updatedAt: r.updated_at, deletedAt: r.deleted_at });
const toReport = r => r && ({ id: r.id, userId: r.user_id, kind: r.kind, title: r.title, artists: r.artists || [], venue: r.venue, showDate: r.show_date, openAtText: r.open_at_text, ticketUrl: r.ticket_url, sourceUrl: r.source_url, note: r.note, status: r.status, rejectReason: r.reject_reason, registeredOpeningId: r.registered_opening_id, registeredPerformanceId: r.registered_performance_id, registeredArtistId: r.registered_artist_id || null, artistKind: r.artist_kind || null, artistGroup: r.artist_group || null, artistMembers: r.artist_members || [], userSeen: r.user_seen, createdAt: r.created_at, updatedAt: r.updated_at, nickname: r.profiles?.nickname });

export function createSupabaseBackend(cfg) {
  const sb = createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });   // R-09a 로그인 유지
  const q = async p => { const { data, error } = await p; if (error) throw fromSupabase(error); return data; };
  const rpc = (fn, args) => q(sb.rpc(fn, args));
  const publicUrl = path => sb.storage.from('promotions').getPublicUrl(path).data.publicUrl;
  let profile = null; let pending = null; let authUser = null;
  const listeners = new Set();
  const current = () => (profile ? { id: profile.id, nickname: profile.nickname, provider: profile.provider, email: authUser?.email || '', isAdmin: profile.is_admin, marketing: profile.marketing_opt_in, reportUnseen: profile.report_unseen } : null);
  const emit = () => listeners.forEach(f => { try { f(current()); } catch { /* 무시 */ } });
  const uid = () => { if (!authUser) fail('unauthorized', '로그인이 필요해요.'); return authUser.id; };
  async function refresh(session) {
    authUser = session?.user || null; profile = null; pending = null;
    if (authUser) {
      const { data } = await sb.from('profiles').select('*').eq('id', authUser.id).maybeSingle();
      if (data) profile = data;
      else { const prov = authUser.app_metadata?.provider; pending = { provider: prov === 'email' ? 'email' : prov, suggestedNickname: String(authUser.user_metadata?.name || authUser.user_metadata?.nickname || '').slice(0, 12) }; }   // ACC-03
    }
    emit();
  }
  sb.auth.onAuthStateChange((_e, session) => { refresh(session); });

  const auth = {
    current, pendingProfile: () => pending,
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    async signInSocial(provider) { await q(sb.auth.signInWithOAuth({ provider, options: { redirectTo: location.href.split('#')[0] + location.hash } })); return { redirected: true }; },
    async completeProfile({ nickname, consents }) {
      const prov = pending?.provider || 'email';
      profile = await rpc('complete_profile', { p_nickname: nickname, p_provider: prov, p_consents: { ...consents, version: cfg.termsVersion } });
      pending = null; emit(); return current();
    },
    cancelProfile() { pending = null; sb.auth.signOut(); },
    async signUpEmail({ email, password, nickname, consents }) {
      const { data, error } = await sb.auth.signUp({ email, password, options: { data: { nickname, consents }, emailRedirectTo: location.href.split('#')[0] } });
      if (error) throw (/registered/i.test(error.message) ? new ApiError('conflict', '이미 가입된 이메일이에요. 로그인해 주세요.') : fromSupabase(error));
      if (data.session) { await refresh(data.session); await auth.completeProfile({ nickname, consents }); return { verificationRequired: false }; }
      return { verificationRequired: true };   // R-06a: 인증 메일 → 링크 누르면 로그인되고, 첫 로그인 때 프로필(닉네임·약관) 확정
    },
    async signInEmail({ email, password }) {
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw new ApiError('validation', /confirm/i.test(error.message) ? '메일함에서 인증 링크를 먼저 눌러 주세요.' : '이메일 또는 비밀번호가 맞지 않아요.');
      await refresh(data.session);
      if (pending) { const m = data.user.user_metadata || {}; if (m.nickname && m.consents) await auth.completeProfile({ nickname: m.nickname, consents: m.consents }); }
      return current();
    },
    async sendPasswordReset(email) { await q(sb.auth.resetPasswordForEmail(email, { redirectTo: location.href.split('#')[0] })); return true; },
    async signOut() { await sb.auth.signOut(); profile = null; emit(); },
    async updateNickname(nickname) { profile = (await q(sb.from('profiles').update({ nickname }).eq('id', uid()).select().single())); emit(); return current(); },
    async setMarketing(agreed) { await rpc('set_marketing', { p_agreed: !!agreed }); profile = { ...profile, marketing_opt_in: !!agreed }; emit(); },
    async withdraw() { await rpc('withdraw'); await sb.auth.signOut(); profile = null; emit(); }
  };

  const content = {
    async openings() { return (await q(sb.from('openings').select(OPEN_SEL).order('open_at', { ascending: true, nullsFirst: false }))).map(toOpening); },
    async performances() {
      const since = new Date(Date.now() - 60 * 864e5).toISOString().slice(0, 10);
      const rows = []; for (let from = 0; ; from += 1000) { const page = await q(sb.from('performances').select(PERF_SEL).gte('end_date', since).order('start_date').range(from, from + 999)); rows.push(...page); if (page.length < 1000) break; }
      return rows.map(toPerf);
    },
    async performance(id) { const r = await q(sb.from('performances').select(PERF_SEL).eq('id', id).maybeSingle()); if (!r) fail('not_found', '공연 정보를 찾지 못했어요.'); return toPerf(r); },
    async promotions() { return (await q(sb.from('promotions').select('*').order('end_date'))).map(r => toPromo(r, publicUrl)); },
    async clubVenues() { return (await q(sb.from('club_venues').select('name'))).map(r => r.name); },
    async meta() { return { updatedAt: (await q(sb.from('performances').select('updated_at').eq('source', 'kopis').order('updated_at', { ascending: false }).limit(1)))[0]?.updated_at || '', source: 'KOPIS' }; }
  };

  const records = {
    async list() { return (await q(sb.from('records').select('*').is('deleted_at', null))).map(toRecord); },
    async plan({ performanceId, openingId }) {
      let snap;
      if (performanceId) { const p = await content.performance(performanceId); snap = { performance_id: p.id, title: p.title, date: p.startDate, venue: p.venue, region: p.region, artists: p.artists }; }
      else { const o = toOpening(await q(sb.from('openings').select('*').eq('id', openingId).single())); snap = { opening_id: o.id, title: o.title, date: o.showDate, venue: o.venue, artists: o.artists }; }
      try { return toRecord(await q(sb.from('records').insert({ user_id: uid(), type: 'planned', ...snap }).select().single())); }
      catch (e) { if (e.code === 'conflict') fail('conflict', '이미 보고 싶은 공연에 있어요.'); throw e; }
    },
    async unplan(id) { await q(sb.from('records').delete().eq('id', id)); },
    async attend({ performanceId, date }) { const r = await rpc('attend', { p_performance_id: performanceId, p_date: date }); return { record: toRecord(r.record), removedPlannedId: r.removedPlannedId }; },
    async toAttended(id) { const r = await rpc('attend', { p_performance_id: null, p_date: null, p_record_id: id }); return { record: toRecord(r.record), removedPlannedId: null }; },
    async createManual(i) { return toRecord(await q(sb.from('records').insert({ user_id: uid(), type: i.type, title: i.title, date: i.date, venue: i.venue || '', region: i.region || '', artists: i.artists || [] }).select().single())); },
    async update(id, patch) { const p = {}; ['date', 'venue', 'region', 'artists'].forEach(k => { if (patch[k] !== undefined) p[k] = patch[k]; }); return toRecord(await q(sb.from('records').update(p).eq('id', id).select().single())); },
    async remove(id) { await q(sb.from('records').update({ deleted_at: new Date().toISOString() }).eq('id', id)); },
    async restore(id) { return toRecord(await q(sb.from('records').update({ deleted_at: null }).eq('id', id).select().single())); }
  };
  // 관심 아티스트 (R-129): ref = { artistId, name } — artistId가 있으면 등록된 아티스트로, 없으면 이름으로(이전 데이터·연결 전 공연)
  const ISEL = 'name, source, created_at, artist_id, artists(id, name, kind, disambig, artist_aliases(alias))';
  const interests = {
    async list() { return (await q(sb.from('interests').select(ISEL).order('created_at', { ascending: false }))).map(toInterest); },
    async add(ref, source = 'manual') {
      const r0 = typeof ref === 'string' ? { name: ref } : ref;
      const row = { user_id: uid(), name: String(r0.name || '').trim(), source, artist_id: r0.artistId || null };
      try { return toInterest(await q(sb.from('interests').insert(row).select(ISEL).single())); } catch (e) { if (e.code === 'conflict') fail('conflict', '이미 관심 아티스트예요.'); throw e; }
    },
    async remove(ref) {
      const r0 = typeof ref === 'string' ? { name: ref } : ref;
      if (r0.artistId) { await q(sb.from('interests').delete().eq('user_id', uid()).eq('artist_id', r0.artistId)); return; }
      const hit = (await interests.list()).find(i => !i.artistId && nameKey(i.name) === nameKey(r0.name));
      if (hit) await q(sb.from('interests').delete().eq('user_id', uid()).is('artist_id', null).eq('name', hit.name));
    }
  };
  const artists = {
    async search(text, lim = 20) { return String(text || '').trim() ? rpc('search_artists', { p_q: String(text).trim(), p_lim: lim }) : []; },
    async cards(ids) { return (ids || []).length ? rpc('artist_cards', { p_ids: ids }) : []; }
  };
  const badges = {
    async seen() { return (await q(sb.from('badge_seen').select('period, badge_key'))).map(r => `${r.period}:${r.badge_key}`); },
    async markSeen(keys) { if (!keys.length) return; await q(sb.from('badge_seen').upsert(keys.map(k => { const i = k.indexOf(':'); return { user_id: uid(), period: k.slice(0, i), badge_key: k.slice(i + 1) }; }), { ignoreDuplicates: true })); }
  };
  const reports = {
    async create(input) { return toReport(await rpc('create_report', { p: input })); },
    async listMine() { return (await q(sb.from('reports').select('*').eq('user_id', uid()).order('created_at', { ascending: false }))).map(toReport); },
    async cancel(id) { await rpc('cancel_report', { p_id: id }); },
    async markSeen() { await rpc('mark_reports_seen'); if (profile) profile = { ...profile, report_unseen: false }; emit(); }
  };
  const logs = { async track(events) { try { await sb.rpc('track_events', { p_events: Array.isArray(events) ? events : [events] }); } catch { /* 기록 실패는 화면에 영향 없음 */ } } };

  const save = async (table, row) => q(row.id ? sb.from(table).update(row).eq('id', row.id).select().single() : sb.from(table).insert(row).select().single());
  const admin = {
    isAdmin: () => !!profile?.is_admin,
    async dashboard() { const d = await rpc('admin_dashboard'); const upcoming = (await q(sb.from('openings').select('*').gte('open_at', new Date().toISOString()).order('open_at').limit(3))).map(toOpening); return { ...d, upcoming, metrics7d: d.metrics7d || {} }; },
    openings: {
      async list() { return (await q(sb.from('openings').select(OPEN_SEL).order('updated_at', { ascending: false }))).map(toOpening); },
      async save(o) { const row = fromOpening(o); if (!row.id) delete row.id; row.updated_by = uid(); if (!o.id) row.created_by = uid(); return toOpening(await save('openings', row)); },
      async setPublished(id, on) { return toOpening(await save('openings', { id, is_published: !!on })); },
      async hide(id, hidden = true) { return toOpening(await save('openings', { id, is_hidden: !!hidden })); }
    },
    reports: {
      async list() { return (await q(sb.from('reports').select('*, profiles(nickname)').order('created_at', { ascending: false }))).map(r => ({ ...toReport(r), nickname: r.profiles?.nickname || '(탈퇴 회원)' })); },
      async open(id) { return toReport(await rpc('admin_open_report', { p_id: id })); },
      async duplicates(id) {
        const r = toReport(await q(sb.from('reports').select('*').eq('id', id).single())); const word = r.title.slice(0, 12);
        const o = (await q(sb.from('openings').select('*').ilike('title', `%${word}%`).limit(3))).map(x => ({ type: '공지', ...toOpening(x) }));
        const p = (await q(sb.from('performances').select('*').ilike('title', `%${word}%`).limit(3))).map(x => ({ type: '공연', ...toPerf(x) }));
        let same = [];
        if (r.showDate && (r.artists || []).length) {   // 같은 아티스트 · 같은 날
          same = [...(await q(sb.from('openings').select('*').eq('show_date', r.showDate).overlaps('artists', r.artists).limit(3))).map(x => ({ type: '공지', ...toOpening(x) })),
            ...(await q(sb.from('performances').select('*').eq('start_date', r.showDate).overlaps('artists', r.artists).limit(3))).map(x => ({ type: '공연', ...toPerf(x) }))];
        }
        const seen = new Set(); return [...o, ...p, ...same].filter(x => !seen.has(x.type + x.id) && seen.add(x.type + x.id)).slice(0, 6);
      },
      async register(id, as, data) { const r = await rpc('admin_register_report', { p_id: id, p_as: as, p_data: data }); return { report: toReport(r.report), createdId: r.createdId }; },
      async reject(id, reason) { return toReport(await rpc('admin_reject_report', { p_id: id, p_reason: reason })); }
    },
    promotions: {
      async list() { return (await q(sb.from('promotions').select('*').order('end_date', { ascending: false }))).map(r => toPromo(r, publicUrl)); },
      async save(p) { const row = fromPromo(p); if (!row.id) delete row.id; row.updated_by = uid(); return toPromo(await save('promotions', row), publicUrl); },
      async hide(id, hidden = true) { return toPromo(await save('promotions', { id, is_hidden: !!hidden }), publicUrl); },
      async setPublished(id, on) { return toPromo(await save('promotions', { id, is_published: !!on }), publicUrl); },
      async uploadThumbnail(file) {
        if (!/^image\/(jpeg|png)$/.test(file.type)) fail('validation', 'JPG·PNG 이미지만 올릴 수 있어요.'); if (file.size > 2 * 1024 * 1024) fail('validation', '2MB 이하 이미지만 올릴 수 있어요.');
        const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${file.type === 'image/png' ? 'png' : 'jpg'}`;
        await q(sb.storage.from('promotions').upload(path, file, { contentType: file.type })); return path;
      }
    },
    artists: {
      async list(qs = '', status = 'all') { return rpc('admin_artists', { p_q: qs, p_status: status }); },
      async save(a) { return rpc('admin_artist_save', { p: a }); },
      async merge(alias, intoId, perfIds = [], openingIds = []) { return rpc('admin_artist_merge', { p_alias: alias, p_into: intoId, p_perf_ids: perfIds, p_opening_ids: openingIds }); },
      async hide(id, hidden = true) { return rpc('admin_artist_hide', { p_id: id, p_hidden: !!hidden }); },
      async candidates(qs = '', status = 'pending') { return rpc('admin_candidates', { p_q: qs, p_status: status }); },
      async ignore(name, on = true) { await rpc('admin_candidate_ignore', { p_name: name, p_ignore: !!on }); },
      async uploadPhoto(file) {
        if (!/^image\/(jpeg|png|webp)$/.test(file.type)) fail('validation', 'JPG·PNG·WEBP 이미지만 올릴 수 있어요.'); if (file.size > 2 * 1024 * 1024) fail('validation', '2MB 이하 이미지만 올릴 수 있어요.');
        const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${file.type.split('/')[1].replace('jpeg', 'jpg')}`;
        await q(sb.storage.from('artist-photos').upload(path, file, { contentType: file.type }));
        return sb.storage.from('artist-photos').getPublicUrl(path).data.publicUrl;
      }
    },
    async saveLinks(kind, id, links) { await rpc('admin_links_save', { p_kind: kind, p_id: id, p_links: links }); },
    performances: {
      async list() { return (await q(sb.from('performances').select(PERF_SEL).order('start_date', { ascending: false }).limit(2000))).map(toPerf); },
      async save(p) { const row = fromPerf(p); if (!row.id) { delete row.id; row.created_by = uid(); row.artists_locked = true; } row.updated_by = uid(); return toPerf(await save('performances', row)); },
      async hide(id, hidden = true) { return toPerf(await save('performances', { id, is_hidden: !!hidden })); }
    },
    kopis: {
      async runs() { return (await q(sb.from('kopis_sync_runs').select('*').order('started_at', { ascending: false }).limit(7))).map(r => ({ id: r.id, startedAt: r.started_at, finishedAt: r.finished_at, status: r.status, listCount: r.list_count, detailCount: r.detail_count, remainingDetails: r.remaining_details, error: r.error, trigger: r.trigger })); },
      async resync() { const { data, error } = await sb.functions.invoke('kopis-sync', { body: { trigger: 'admin' } }); if (error) fail('server', 'KOPIS 수집을 시작하지 못했어요.'); return data; }
    },
    clubVenues: {
      async list() { return (await q(sb.from('club_venues').select('*').order('name'))).map(r => ({ id: r.id, name: r.name, hidden: r.is_hidden })); },
      async add(name) { const r = await q(sb.from('club_venues').insert({ name: String(name).trim(), created_by: uid() }).select().single()); return { id: r.id, name: r.name, hidden: r.is_hidden }; },
      async hide(id, hidden = true) { await q(sb.from('club_venues').update({ is_hidden: !!hidden }).eq('id', id)); }
    },
    members: {
      async list(qs = '') { return (await rpc('admin_members', { p_q: qs })).map(m => ({ id: m.id, nickname: m.nickname, provider: m.provider, createdAt: m.created_at, marketing: m.marketing_opt_in, isAdmin: !!m.is_admin, emailMasked: m.email_masked, planned: m.planned, attended: m.attended, artists: m.artists, reports: m.reports })); },
      async revealEmail(id) { return rpc('admin_reveal_email', { p_user: id }); }
    },
    async auditLogs() { return q(sb.from('admin_audit_logs').select('*').order('created_at', { ascending: false }).limit(50)); }
  };

  return {
    backend: 'supabase', isDemo: false,
    async init() { const { data } = await sb.auth.getSession(); await refresh(data.session); return current(); },
    auth, content, records, interests, artists, badges, reports, logs, admin
  };
}
