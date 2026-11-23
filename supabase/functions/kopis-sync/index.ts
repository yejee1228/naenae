// 내내(nae nae) — KOPIS 공연 수집 (R-20·R-102·R-106, 10_KOPIS_확인결과)
// 비밀값: KOPIS_KEY (supabase secrets set KOPIS_KEY=...) · SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY는 자동 제공
// 동작: 목록(오늘~60일, 한 번에, 100건씩) → 표에 반영 → 상세 없는 공연 최대 100건만 상세(1초 간격) → 수집 기록
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
  const { data: run, error: runErr } = await sb.from('kopis_sync_runs').insert({ trigger: body.trigger === 'admin' ? 'admin' : 'schedule' }).select().single();
  if (runErr || !run) return reply({ ok: false, error: `수집 기록을 만들지 못했어요: ${runErr?.message ?? 'unknown'}` }, 500);
  try {
    if (!KEY) throw new Error('KOPIS_KEY 비밀값이 없어요');
    const today = kstToday();
    const ymd = (d: string) => d.replaceAll('-', '');
    const list = new Map();
    for (let page = 1; page < 30; page++) {
      const items = parseKopisList(await call(`/pblprfr?stdate=${ymd(today)}&eddate=${ymd(addDays(today, 60))}&cpage=${page}&rows=100&shcate=CCCD`));
      items.forEach((p: any) => list.set(p.kopisId, p));
      if (items.length < 100) break;
    }
    const ids = [...list.keys()];
    const existing = new Map<string, any>();
    for (let i = 0; i < ids.length; i += 200) {
      const { data } = await sb.from('performances').select('id, kopis_id, artists_locked').in('kopis_id', ids.slice(i, i + 200));
      (data ?? []).forEach((r: any) => existing.set(r.kopis_id, r));
    }
    const rows = [...list.values()].map((p: any) => {
      const ex = existing.get(p.kopisId);
      const row: any = { source: 'kopis', kopis_id: p.kopisId, title: p.title, start_date: p.startDate, end_date: p.endDate, venue: p.venue, region: p.region, kopis_state: p.kopisState, poster_url: p.posterUrl };
      if (!ex || !ex.artists_locked) row.artists = extractArtists(p.title); // 운영자가 고친 아티스트는 유지 (R-106)
      return row;
    });
    for (let i = 0; i < rows.length; i += 200) {
      const { error } = await sb.from('performances').upsert(rows.slice(i, i + 200), { onConflict: 'kopis_id' });
      if (error) throw error;
    }
    const { data: need } = await sb.from('performances').select('id, kopis_id').eq('source', 'kopis').is('detail_fetched_at', null).gte('end_date', today).order('start_date').limit(MAX_DETAIL);
    let done = 0;
    for (const p of need ?? []) {
      const d = parseKopisDetail(await call(`/pblprfr/${encodeURIComponent(p.kopis_id)}`));
      if (!d) continue;
      await sb.from('performances').update({
        cast_raw: d.castRaw, ticket_links: d.ticketLinks, time_text: d.timeText, price_text: d.priceText, age_text: d.ageText, runtime_text: d.runtimeText,
        organizer: d.organizer, facility_id: d.facilityId, kopis_updated_at: d.kopisUpdatedAt, detail_fetched_at: new Date().toISOString()
      }).eq('id', p.id);
      done++;
    }
    const { count } = await sb.from('performances').select('id', { count: 'exact', head: true }).eq('source', 'kopis').is('detail_fetched_at', null).gte('end_date', today);
    await sb.from('kopis_sync_runs').update({ status: 'success', finished_at: new Date().toISOString(), list_count: rows.length, detail_count: done, remaining_details: count ?? 0 }).eq('id', run.id);
    return reply({ ok: true, list: rows.length, details: done, remaining: count ?? 0 });
  } catch (e) {
    await sb.from('kopis_sync_runs').update({ status: 'failed', finished_at: new Date().toISOString(), error: String((e as Error).message ?? e).slice(0, 500) }).eq('id', run.id);
    return reply({ ok: false, error: String((e as Error).message ?? e) }, 500);
  }
});
