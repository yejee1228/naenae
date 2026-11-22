// 로컬 모드용 KOPIS 스냅샷 만들기 → data/kopis-snapshot.json (git에 안 올라감, KOPIS 이용 조건 확인 전 공개 금지)
// 키: .env.local 의 KOPIS_KEY · 실행: npm run kopis:snapshot (상세는 기본 120건, KOPIS_MAX_DETAIL로 조절)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseKopisList, parseKopisDetail, extractArtists, kstToday, addDays } from '../src/shared/domain.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envFile = path.join(root, '.env.local');
const KEY = process.env.KOPIS_KEY || ((fs.existsSync(envFile) ? fs.readFileSync(envFile, 'utf8') : '').match(/^\s*KOPIS_KEY\s*=\s*(.+?)\s*$/m) || [])[1];
if (!KEY) { console.error('✗ .env.local 에 KOPIS_KEY가 없습니다.'); process.exit(1); }
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function call(p) {
  for (let i = 0; i < 3; i++) {
    await sleep(i ? 3000 : 1000);
    const t = await (await fetch(`https://www.kopis.or.kr/openApi/restful${p}${p.includes('?') ? '&' : '?'}service=${encodeURIComponent(KEY)}`)).text();
    if (/<db>|<dbs\s*\/>|<dbs>\s*<\/dbs>/.test(t)) return t;
  }
  throw new Error('KOPIS 응답 없음');
}
const today = kstToday();
const ymd = d => d.replaceAll('-', '');
const list = new Map();
for (let page = 1; page < 30; page++) {
  const items = parseKopisList(await call(`/pblprfr?stdate=${ymd(addDays(today, -14))}&eddate=${ymd(addDays(today, 60))}&cpage=${page}&rows=100&shcate=CCCD`));
  items.forEach(p => list.set(p.kopisId, p));
  process.stdout.write(`\r목록 ${list.size}건`);
  if (items.length < 100) break;
}
const perfs = [...list.values()].sort((a, b) => a.startDate.localeCompare(b.startDate)).map(p => ({ ...p, artists: extractArtists(p.title), castRaw: '', ticketLinks: [] }));
const max = Number(process.env.KOPIS_MAX_DETAIL || 120);
let n = 0;
for (const p of perfs.filter(x => x.endDate >= today).slice(0, max)) {
  try { const d = parseKopisDetail(await call(`/pblprfr/${p.kopisId}`)); if (d) Object.assign(p, d); } catch { /* 다음 공연 */ }
  process.stdout.write(`\r상세 ${++n}/${max}   `);
}
fs.writeFileSync(path.join(root, 'data/kopis-snapshot.json'), JSON.stringify({ fetchedAt: new Date().toISOString(), performances: perfs }));
console.log(`\n✓ ${perfs.length}건 저장 (상세 ${n}건) → data/kopis-snapshot.json`);
