// 내내(nae nae) — KOPIS 공연 수집 (R-20·R-102·R-106, 10_KOPIS_확인결과)
// 비밀값: KOPIS_KEY (supabase secrets set KOPIS_KEY=...) · SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY는 자동 제공
// 동작: 목록(오늘~60일, 100건씩 — 평소엔 마지막 수집 이후 바뀐 공연만, 7일마다 전체) → 표에 반영
//       → 상세 없는(또는 바뀐) 공연 최대 KOPIS_MAX_DETAIL건만 상세(1초 간격) → 수집 기록
// 첫 수집(약 630건)은 여러 번 실행해야 끝남 → cron.sql에서 첫 주엔 10분마다 실행 권장
// _shared/domain.js 는 src/shared/domain.js 의 복사본 (tools/check.mjs가 같은지 검사)
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { parseKopisList, parseKopisDetail, kopisError, extractArtists, kstToday, addDays } from '../_shared/domain.js';

const BASE = 'https://www.kopis.or.kr/openApi/restful';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const KEY = Deno.env.get('KOPIS_KEY') ?? '';
const MAX_DETAIL = Number(Deno.env.get('KOPIS_MAX_DETAIL') ?? 100);

async function call(path: string): Promise<string> {
  for (let attempt = 0; attempt < 3; attempt++) {
    await sleep(attempt ? 3000 : 1000); // 연달아 부르면 빈 응답 → 1초 간격, 실패 시 3초 뒤 재시도
    const r = await fetch(`${BASE}${path}${path.includes('?') ? '&' : '?'}service=${encodeURIComponent(KEY)}`);
    const text = await r.text();
    if (r.ok && /<db>/.test(text)) {
      const err = kopisError(text);
      if (err) throw new Error(err);
      return text;
    }
    if (r.ok && /<dbs\s*\/>|<dbs>\s*<\/dbs>/.test(text)) return text; // 빈 목록
  }
  throw new Error('KOPIS 응답 없음 (호출 제한 가능성)');
}

// 관리자 페이지(브라우저)에서 부를 때 필요한 CORS
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const body = await req.json().catch(() => ({}));
  if (body.trigger === 'admin') { // 관리자 페이지 '지금 다시 수집' → 운영자만
    const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
    const { data: u } = await sb.auth.getUser(token);
    const { data: p } = u?.user ? await sb.from('profiles').select('is_admin').eq('id', u.user.id).single() : { data: null };
    if (!p?.is_admin) return reply({ error: { code: 'forbidden', message: '관리자 권한이 없어요.' } }, 403);
  } else { // 자동 작업(cron) → 비밀값 CRON_SECRET 이 맞아야 함 (공개 키만으로 수집을 돌리지 못하게)
    const secret = Deno.env.get('CRON_SECRET') ?? '';
    if (!secret || req.headers.get('x-cron-secret') !== secret) return reply({ error: { code: 'forbidden', message: '권한이 없어요.' } }, 403);
  }
  // 수집 방식 (11/26): 평소 = 마지막 성공 수집 날짜(하루 겹치게) 이후 등록·수정된 공연만(afterdate),
  // 전체 = 성공한 전체 수집이 7일 넘게 없거나, 기록이 없거나, { full: true }로 부를 때
  const today = kstToday();
  const { data: lastOk } = await sb.from('kopis_sync_runs').select('started_at').eq('status', 'success').order('started_at', { ascending: false }).limit(1).maybeSingle();
  const { data: lastFull } = await sb.from('kopis_sync_runs').select('started_at').eq('status', 'success').eq('mode', 'full').order('started_at', { ascending: false }).limit(1).maybeSingle();
  const kstDay = (iso: string) => kstToday(new Date(iso));
  const full = body.full === true || !lastOk || !lastFull || kstDay(lastFull.started_at) <= addDays(today, -7);
  const after = full ? null : addDays(kstDay(lastOk!.started_at), -1);
  const { data: run, error: runErr } = await sb.from('kopis_sync_runs').insert({ trigger: body.trigger === 'admin' ? 'admin' : 'schedule', mode: full ? 'full' : 'incremental', after_date: after }).select().single();
  if (runErr || !run) return reply({ ok: false, error: `수집 기록을 만들지 못했어요: ${runErr?.message ?? 'unknown'}` }, 500);
  try {
    if (!KEY) throw new Error('KOPIS_KEY 비밀값이 없어요');
    const ymd = (d: string) => d.replaceAll('-', '');
    const list = new Map();
    for (let page = 1; page < 30; page++) {
      const items = parseKopisList(await call(`/pblprfr?stdate=${ymd(today)}&eddate=${ymd(addDays(today, 60))}&cpage=${page}&rows=100&shcate=CCCD${after ? `&afterdate=${ymd(after)}` : ''}`));
      items.forEach((p: any) => list.set(p.kopisId, p));
      if (items.length < 100) break;
    }
    const ids = [...list.keys()];
    const existing = new Map<string, any>();
    for (let i = 0; i < ids.length; i += 200) {
      const { data } = await sb.from('performances').select('id, kopis_id, artists_locked, locked_fields').in('kopis_id', ids.slice(i, i + 200));
      (data ?? []).forEach((r: any) => existing.set(r.kopis_id, r));
    }
    // 운영자가 고친 칸(locked_fields)은 보내지 않음 → 다음 수집이 덮어쓰지 않음 (R-106 확장, …03_kopis_edits)
    // 운영자가 숨긴(지운) 공연은 is_hidden을 보내지 않으므로 숨김 그대로 유지 (R-105)
    const rows = [...list.values()].map((p: any) => {
      const ex = existing.get(p.kopisId); const lock = new Set<string>(ex?.locked_fields ?? []);
      if (ex?.artists_locked) lock.add('artists');
      const row: any = { source: 'kopis', kopis_id: p.kopisId, title: p.title, start_date: p.startDate, end_date: p.endDate, venue: p.venue, region: p.region, kopis_state: p.kopisState, poster_url: p.posterUrl, kopis_missing: false, artists: extractArtists(p.title) };
      lock.forEach((k) => { delete row[k]; });
      return row;
    });
    // 한 번에 보내는 행들은 칸이 같아야 함 (빈 칸이 null로 채워져 오류) → 칸 모양별로 나눠 보냄
    const groups = new Map<string, any[]>();
    rows.forEach((r: any) => { const k = Object.keys(r).sort().join(','); (groups.get(k) ?? groups.set(k, []).get(k)!).push(r); });
    for (const group of groups.values()) {
      for (let i = 0; i < group.length; i += 200) {
        const { error } = await sb.from('performances').upsert(group.slice(i, i + 200), { onConflict: 'kopis_id' });
        if (error) throw error;
      }
    }
    // 바뀐 것만 받은 경우: 이미 상세를 받은 공연도 KOPIS에서 수정됐으니 상세를 다시 받게 표시
    if (!full) {
      const changed = [...list.keys()].filter((k) => existing.has(k));
      for (let i = 0; i < changed.length; i += 200) {
        const { error } = await sb.from('performances').update({ detail_fetched_at: null }).in('kopis_id', changed.slice(i, i + 200)).not('detail_fetched_at', 'is', null);
        if (error) throw error;
      }
    }
    // 전체 수집: 기간 안의 KOPIS 공연인데 목록에서 빠진 것 → 'KOPIS에서 빠짐' 표시 (취소·삭제 가능성, 운영자가 확인)
    let missing = 0;
    if (full) {
      const gone: string[] = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await sb.from('performances').select('id, kopis_id').eq('source', 'kopis').eq('kopis_missing', false)
          .gte('end_date', today).lte('start_date', addDays(today, 60)).range(from, from + 999);
        if (error) throw error;
        (data ?? []).forEach((r: any) => { if (!list.has(r.kopis_id)) gone.push(r.id); });
        if ((data ?? []).length < 1000) break;
      }
      for (let i = 0; i < gone.length; i += 200) {
        const { error } = await sb.from('performances').update({ kopis_missing: true }).in('id', gone.slice(i, i + 200));
        if (error) throw error;
      }
      missing = gone.length;
    }
    const { data: need } = await sb.from('performances').select('id, kopis_id, locked_fields').eq('source', 'kopis').is('detail_fetched_at', null).gte('end_date', today).order('start_date').limit(MAX_DETAIL);
    let done = 0;
    for (const p of need ?? []) {
      const d = parseKopisDetail(await call(`/pblprfr/${encodeURIComponent(p.kopis_id)}`));
      if (!d) continue;
      const patch: any = {
        cast_raw: d.castRaw, ticket_links: d.ticketLinks, time_text: d.timeText, price_text: d.priceText, age_text: d.ageText, runtime_text: d.runtimeText,
        organizer: d.organizer, facility_id: d.facilityId, kopis_updated_at: d.kopisUpdatedAt, detail_fetched_at: new Date().toISOString()
      };
      (p.locked_fields ?? []).forEach((k: string) => { delete patch[k]; });   // 운영자가 고친 예매처 등은 그대로
      await sb.from('performances').update(patch).eq('id', p.id);
      done++;
    }
    const { count } = await sb.from('performances').select('id', { count: 'exact', head: true }).eq('source', 'kopis').is('detail_fetched_at', null).gte('end_date', today);
    await sb.from('kopis_sync_runs').update({ status: 'success', finished_at: new Date().toISOString(), list_count: rows.length, detail_count: done, remaining_details: count ?? 0 }).eq('id', run.id);
    return reply({ ok: true, mode: full ? 'full' : 'incremental', after, list: rows.length, details: done, remaining: count ?? 0, missing });
  } catch (e) {
    await sb.from('kopis_sync_runs').update({ status: 'failed', finished_at: new Date().toISOString(), error: String((e as Error).message ?? e).slice(0, 500) }).eq('id', run.id);
    return reply({ ok: false, error: String((e as Error).message ?? e) }, 500);
  }
});
