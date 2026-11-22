// 내내(nae nae) — KOPIS 실제 응답 확인 (개발 계획 P0-1)
//
// 키는 프로젝트 폴더의 .env.local 에만 넣습니다 (git에 올라가지 않음):
//   KOPIS_KEY=발급받은키
// 실행: node tools/kopis-probe.mjs
//
// 확인하는 것
//   1. 주소: https / http 중 어느 쪽이 되는지
//   2. 목록(pblprfr): 대중음악(CCCD) 조회, 칸 이름, 날짜·지역 형식, 한 번에 받는 최대 건수
//   3. 조회 기간 제한: 31일 / 60일 / 90일을 한 번에 조회할 수 있는지
//   4. 상세(pblprfr/{id}): 출연진(prfcast), 예매처(relates), 시간·가격 칸
//   5. 60일치 전체 건수 (수집량 가늠)
// 원본 응답은 tmp/kopis-probe/ 에 저장 (키는 지운 채, git에 안 올라감)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(root, 'tmp', 'kopis-probe');
fs.mkdirSync(OUT, { recursive: true });

function readKey() {
  if (process.env.KOPIS_KEY) return process.env.KOPIS_KEY.trim();
  const f = path.join(root, '.env.local');
  if (fs.existsSync(f)) {
    const m = fs.readFileSync(f, 'utf8').match(/^\s*KOPIS_KEY\s*=\s*(.+?)\s*$/m);
    if (m && m[1]) return m[1].replace(/^["']|["']$/g, '');
  }
  return '';
}
const KEY = readKey();
if (!KEY) { console.error('✗ KOPIS_KEY가 없습니다. 프로젝트 폴더의 .env.local 에 KOPIS_KEY=키 를 넣고 다시 실행해 주세요.'); process.exit(1); }

/* ---------- XML 도구 ---------- */
const decode = s => String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&').trim();
const tag = (xml, name) => { const m = String(xml).match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`)); return m ? decode(m[1]) : ''; };
const blocks = (xml, name) => [...String(xml).matchAll(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`, 'g'))].map(m => m[1]);
const childNames = xml => [...new Set([...String(xml).matchAll(/<([a-zA-Z0-9_]+)>/g)].map(m => m[1]))];

/* ---------- 호출 ---------- */
const BASES = { https: 'https://www.kopis.or.kr/openApi/restful/pblprfr', http: 'http://www.kopis.or.kr/openApi/restful/pblprfr' };
let BASE = BASES.https;
const mask = s => s.split(KEY).join('***');
let saved = 0;
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function call(pathQuery, label) {
  await sleep(1000); // KOPIS는 쉬지 않고 연달아 부르면 빈 응답을 줌 (P0-1 확인) → 1초 간격
  const url = BASE + pathQuery + (pathQuery.includes('?') ? '&' : '?') + 'service=' + encodeURIComponent(KEY);
  const t0 = Date.now();
  let status = 0, text = '', err = '';
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
    status = r.status; text = await r.text();
  } catch (e) { err = e.message; }
  const ms = Date.now() - t0;
  if (label) fs.writeFileSync(path.join(OUT, `${String(++saved).padStart(2, '0')}-${label}.xml`), mask(text || err));
  return { status, text, err, ms, code: tag(text, 'returncode'), errmsg: tag(text, 'errmsg') };
}
const ymd = d => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(d).replace(/-/g, '');
const addDays = (d, n) => new Date(d.getTime() + n * 864e5);
const today = new Date();
const report = [];
const log = (ok, title, detail = '') => { const line = `${ok === true ? '✓' : ok === false ? '✗' : '•'} ${title}${detail ? ' — ' + detail : ''}`; console.log(line); report.push(line); };

/* ---------- 1. 주소 ---------- */
console.log('\n[1] 주소 (https / http)');
const q30 = `?stdate=${ymd(today)}&eddate=${ymd(addDays(today, 30))}&cpage=1&rows=10&shcate=CCCD`;
const viaHttps = await call(q30, 'https-list');
if (viaHttps.status === 200 && /<dbs/.test(viaHttps.text)) log(true, 'https 사용 가능', `${viaHttps.ms}ms`);
else {
  log(false, 'https 실패', viaHttps.err || `HTTP ${viaHttps.status} ${viaHttps.errmsg}`);
  BASE = BASES.http;
  const viaHttp = await call(q30, 'http-list');
  if (viaHttp.status === 200 && /<dbs/.test(viaHttp.text)) log(true, 'http 사용 가능 (서버에서만 호출할 것)', `${viaHttp.ms}ms`);
  else { log(false, 'http도 실패', viaHttp.err || `HTTP ${viaHttp.status} ${mask(viaHttp.text).slice(0, 200)}`); finish(); process.exit(1); }
}
const first = BASE === BASES.https ? viaHttps : await call(q30);
if (first.code && first.code !== '00') { log(false, '키 또는 요청 오류', `${first.code} ${first.errmsg}`); finish(); process.exit(1); }

/* ---------- 2. 목록 ---------- */
console.log('\n[2] 목록 (대중음악 CCCD, 오늘~30일)');
const list10 = blocks(first.text, 'db');
log(list10.length > 0, `목록 건수 (rows=10 요청)`, `${list10.length}건`);
if (list10.length) {
  log(null, '목록 칸 이름', childNames(list10[0]).join(', '));
  const s = list10[0];
  log(null, '예시 1건', `mt20id=${tag(s, 'mt20id')} · prfnm=${tag(s, 'prfnm')} · prfpdfrom=${tag(s, 'prfpdfrom')} · prfpdto=${tag(s, 'prfpdto')} · fcltynm=${tag(s, 'fcltynm')} · area=${tag(s, 'area')} · genrenm=${tag(s, 'genrenm')} · prfstate=${tag(s, 'prfstate')}`);
  const genres = [...new Set(list10.map(d => tag(d, 'genrenm')))];
  log(genres.every(g => /대중음악/.test(g)), '장르가 모두 대중음악인지', genres.join(', ') || '(genrenm 칸 없음)');
}
const over = await call(`?stdate=${ymd(today)}&eddate=${ymd(addDays(today, 30))}&cpage=1&rows=500&shcate=CCCD`, 'list-rows500');
log(null, '한 번에 받는 최대 건수 (rows=500 요청)', (over.errmsg || tag(over.text, 'errmsg') || blocks(over.text, 'db').length + '건'));
const big = await call(`?stdate=${ymd(today)}&eddate=${ymd(addDays(today, 30))}&cpage=1&rows=100&shcate=CCCD`, 'list-rows100');
log(null, 'rows=100 요청', blocks(big.text, 'db').length + '건');
const areas = [...new Set(blocks(big.text, 'db').map(d => tag(d, 'area')))];
log(null, '지역(area) 값 모양', areas.slice(0, 20).join(', '));
const dates = blocks(big.text, 'db').slice(0, 3).map(d => tag(d, 'prfpdfrom'));
log(null, '날짜 형식', dates.join(', '));

/* ---------- 3. 조회 기간 제한 ---------- */
console.log('\n[3] 조회 기간 제한');
for (const days of [31, 60, 90]) {
  const r = await call(`?stdate=${ymd(today)}&eddate=${ymd(addDays(today, days))}&cpage=1&rows=10&shcate=CCCD`, `period-${days}`);
  const n = blocks(r.text, 'db').length;
  log(n > 0 && (!r.code || r.code === '00'), `${days}일 한 번에 조회`, n ? `${n}건` : `${r.code} ${r.errmsg || mask(r.text).slice(0, 120)}`);
}

/* ---------- 4. 상세 ---------- */
console.log('\n[4] 상세 (출연진·예매처)');
const ids = blocks(big.text, 'db').map(d => tag(d, 'mt20id')).filter(Boolean).slice(0, 10);
let withCast = 0, withRel = 0; const relNames = new Set(); const sampleCasts = [];
for (const [i, id] of ids.entries()) {
  const r = await call('/' + encodeURIComponent(id), i < 3 ? `detail-${id}` : '');
  const db = blocks(r.text, 'db')[0] || '';
  if (i === 0) log(null, '상세 칸 이름', childNames(db).join(', '));
  const cast = tag(db, 'prfcast');
  if (cast && cast.trim()) { withCast++; if (sampleCasts.length < 3) sampleCasts.push(cast.slice(0, 60)); }
  const rels = blocks(db, 'relate');
  if (rels.length) withRel++;
  rels.forEach(x => relNames.add(tag(x, 'relatenm')));
}
log(null, `출연진(prfcast)이 있는 공연`, `${withCast}/${ids.length}건 · 예: ${sampleCasts.join(' | ') || '없음'}`);
log(null, `예매처(relates)가 있는 공연`, `${withRel}/${ids.length}건 · 예매처 이름: ${[...relNames].slice(0, 8).join(', ') || '없음'}`);

/* ---------- 5. 60일치 전체 건수 ---------- */
console.log('\n[5] 60일치 전체 건수 (31일씩 나눠서)');
let total = 0; const seen = new Set();
for (const off of [0, 31]) {
  for (let page = 1; page < 30; page++) {
    const r = await call(`?stdate=${ymd(addDays(today, off))}&eddate=${ymd(addDays(today, Math.min(off + 30, 60)))}&cpage=${page}&rows=100&shcate=CCCD`);
    const items = blocks(r.text, 'db');
    items.forEach(d => seen.add(tag(d, 'mt20id')));
    total += items.length;
    if (items.length < 100) break;
  }
}
log(null, '오늘~60일 대중음악 공연', `중복 빼고 ${seen.size}건 (상세 호출도 이만큼 필요, 첫 수집 이후엔 새 공연만)`);

finish();
function finish() {
  const file = path.join(OUT, 'report.txt');
  fs.writeFileSync(file, `KOPIS 응답 확인 ${new Date().toISOString()}\n주소: ${BASE}\n\n` + report.join('\n') + '\n');
  console.log(`\n원본 응답·결과: tmp/kopis-probe/ (키는 *** 로 지움)`);
}
