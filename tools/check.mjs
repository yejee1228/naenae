// my Live. MVP 0.5 — 단위 검증 + 배포 전 점검
// 사용: node tools/check.mjs          (단위 검증 + 배포 전 점검, 막히는 항목이 있으면 종료 코드 1)
//       node tools/check.mjs --unit   (단위 검증만)
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const ctx = { console, Intl, Date, URL, URLSearchParams, Math, String, Number, Array, Object, JSON, RegExp, Set, Map, unescape, encodeURIComponent };
vm.createContext(ctx);
vm.runInContext(read('lib.js'), ctx, { filename: 'lib.js' });
vm.runInContext(read('config.js').replace('window.MYLIVE_CONFIG', 'globalThis.MYLIVE_CONFIG'), ctx, { filename: 'config.js' });
const L = ctx.MyLiveLib;
const CFG = ctx.MYLIVE_CONFIG;
const at = s => new Date(s);
const plain = v => JSON.parse(JSON.stringify(v));

/* ---------- 1. 단위 검증 ---------- */
// 날짜·오픈 상태 (0.4와 동일)
assert.equal(L.parseKST('2026-11-03 20:00').date.toISOString(), '2026-11-03T11:00:00.000Z');
assert.equal(L.kstDay(at('2026-11-26T15:30:00Z')), '2026-11-27');
const o = L.normalizeOpening({ id: 'x1', title: 'A, B; 공연', artists: 'A, B', venue: '롤링홀', showDate: '2026-12-01', openAt: '2026-11-16 20:00', ticketUrl: 'https://t.example/1', vendor: '예매처' }, 0);
assert.equal(L.openingStatus(o, at('2026-11-09T03:00:00Z')).label, 'D-7');
assert.equal(L.openingStatus(o, at('2026-11-16T11:00:00Z')).key, 'open');
assert.equal(L.safeURL('javascript:alert(1)'), null);
assert.equal(L.normalizeOpening({ title: 'x', publish: 'N' }), null);
assert.equal(L.csvToObjects('공연명,KOPIS ID\nA,PF123\n')[0].kopisId, 'PF123');
// 달력
const g = L.monthGrid('2026-11');
assert.equal(g.length, 42);
assert.equal(g[0].ymd, '2026-11-01');        // 2026-11-01은 일요일
assert.equal(L.monthGrid('2026-12')[0].ymd, '2026-11-29');
assert.equal(L.shiftMonth('2026-12', 1), '2027-01');
assert.equal(L.shiftMonth('2026-01', -1), '2025-12');
// 캘린더 연동: 시간 있는 오픈 → 30분 일정
const ev = L.openingEvent(o);
assert.equal(ev.allDay, false);
assert.equal(ev.start.toISOString(), '2026-11-16T11:00:00.000Z');
assert.equal(ev.end.toISOString(), '2026-11-16T11:30:00.000Z');
const gurl = new URL(L.googleCalendarUrl(ev));
assert.equal(gurl.searchParams.get('dates'), '20261116T110000Z/20261116T113000Z');
assert.equal(gurl.searchParams.get('text'), '[티켓 오픈] A, B; 공연');
const ics = L.icsText(ev, at('2026-11-09T00:00:00Z'));
assert.ok(ics.includes('DTSTART:20261116T110000Z\r\n'));
assert.ok(ics.includes('SUMMARY:[티켓 오픈] A\\, B\\; 공연'));
assert.ok(ics.includes('TRIGGER:-PT30M'));
assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
for (const line of ics.split('\r\n')) assert.ok(Buffer.byteLength(line, 'utf8') <= 75, '75바이트 초과: ' + line);
// 날짜만 있는 오픈 → 종일 일정
const ev2 = L.openingEvent(L.normalizeOpening({ id: 'x2', title: 'B', openAt: '2026-11-24' }, 1));
assert.equal(ev2.allDay, true);
assert.equal(new URL(L.googleCalendarUrl(ev2)).searchParams.get('dates'), '20261124/20261125');
assert.ok(L.icsText(ev2).includes('DTSTART;VALUE=DATE:20261124'));
assert.equal(L.openingEvent(L.normalizeOpening({ title: 'C' }, 2)), null);
// 긴 설명 줄 접기 (한글)
const longEv = { ...ev, details: '가'.repeat(200) };
for (const line of L.icsText(longEv).split('\r\n')) assert.ok(Buffer.byteLength(line, 'utf8') <= 75);
// KOPIS 정리
const p = L.normalizePerformance({ id: 'PF1', title: '공연', date: '2026.11.27', endDate: '', venue: ' 롤링홀 ', artists: 'A, B', ticketLinks: [{ name: 'N', url: 'javascript:x' }, { name: '예매', url: 'https://a.b' }] });
assert.equal(p.date, '2026-11-27'); assert.equal(p.endDate, '2026-11-27'); assert.equal(p.venue, '롤링홀');
assert.equal(p.ticketLinks.length, 1);
assert.equal(L.normalizePerformance({ id: 'x', title: 't', date: '' }), null);
assert.ok(L.matchVenue('KT&G 상상마당 라이브홀 [마포]', ['상상마당 라이브홀']));
assert.ok(L.matchVenue('Vel.R 벨르 (구. 벨로주 [홍대])', ['벨르']));
assert.ok(!L.matchVenue('이화여자대학교 영산극장', ['벨르', '롤링홀']));
// 취향 배지
let b = L.computeBadges([{ type: 'planned' }, { type: 'attended' }], []);
assert.equal(b.primary, null); assert.equal(b.remaining, 1);
b = L.computeBadges([{ type: 'planned' }, { type: 'attended' }], [{ name: 'A' }]);
assert.equal(b.primary.id, 'all-rounder');
b = L.computeBadges([{ type: 'attended', venue: '롤링홀', artists: ['A'] }, { type: 'attended', venue: '롤링홀', artists: ['A', 'B'] }, { type: 'attended', venue: '우무지', artists: ['C'] }], []);
assert.equal(b.primary.id, 'live-goer');
assert.deepEqual(plain(b.extras.map(x => x.name)), ['롤링홀 단골', 'A 찐팬', '관람완료 3회']);
// 매월 갱신: 그 달 기록만 (관람=관람일, 보고싶어요·관심=담은 날)
const recs = [
  { type: 'attended', date: '2026-10-25', venue: '롤링홀', region: '서울', artists: ['A'] },
  { type: 'attended', date: '2026-11-02', venue: '롤링홀', region: '서울', artists: ['A'] },
  { type: 'planned', date: '2026-12-20', createdAt: '2026-11-05T03:00:00Z', venue: '우무지', region: '서울' },
  { type: 'attended', date: '2026-11-07', venue: '벨르', region: '서울', artists: ['B'] }
];
const arts = [{ name: 'X', createdAt: '2026-10-31T16:00:00Z' }]; // KST 11/1
let m = L.computeBadges(recs, arts, 'month', '2026-11');
assert.deepEqual(plain(m.counts), { planned: 1, attended: 2, artists: 1 });
assert.equal(m.primary.id, 'all-rounder');
assert.equal(L.computeBadges(recs, arts, 'month', '2026-10').primary, null); // 10월은 1건뿐
// 원정러 / 장거리 원정러 (지방 = 서울·경기·인천 외)
assert.equal(L.isLocalRegion('부산'), true); assert.equal(L.isLocalRegion('서울특별시'), false); assert.equal(L.isLocalRegion('경기'), false); assert.equal(L.isLocalRegion(''), false);
const trip = n => Array.from({ length: n }, (_, i) => ({ type: 'attended', date: `2026-11-0${i + 1}`, venue: 'V' + i, region: ['부산', '대구', '전남광주', '대전', '강원'][i % 5], artists: ['Z' + i] }));
assert.equal(L.computeBadges(trip(1), [], 'month', '2026-11').extras.find(x => x.id === 'travel').name, '원정러');
assert.equal(L.computeBadges(trip(3), [], 'month', '2026-11').extras.find(x => x.id === 'travel').name, '장거리 원정러');
assert.equal(L.computeBadges(trip(3), [], 'year', '2026').extras.find(x => x.id === 'travel').name, '원정러'); // 연간은 5회부터 프로
assert.equal(L.computeBadges(trip(5), [], 'year', '2026').extras.find(x => x.id === 'travel').name, '장거리 원정러');
// 연말 결산: 12개월 기록, 12월 1일 공개
const yearRecs = Array.from({ length: 12 }, (_, i) => ({ type: 'attended', date: `2026-${String(i + 1).padStart(2, '0')}-10`, venue: i % 2 ? '롤링홀' : '우무지', region: i < 6 ? '서울' : '부산', artists: ['렘피스트'] }));
const y = L.computeBadges(yearRecs, [{ name: 'Q', createdAt: '2026-03-01T00:00:00Z' }], 'year', '2026');
assert.equal(y.earned, 5);
assert.deepEqual(plain([y.primary.id, ...y.extras.map(x => x.name)]), ['live-goer', '롤링홀 단골', '렘피스트 찐팬', '장거리 원정러', '관람완료 12회']);
assert.equal(L.yearRevealed('2026', '2026-11-30'), false); assert.equal(L.yearRevealed('2026', '2026-12-01'), true);
assert.equal(L.computeBadges([], [{ name: 'a' }, { name: 'b' }, { name: 'c' }]).primary.id, 'digger');
assert.equal(L.computeBadges([{ type: 'planned' }, { type: 'planned' }, { type: 'planned' }], []).primary.id, 'radar');
assert.equal(L.computeBadges([{ type: 'planned' }, { type: 'planned' }, { type: 'attended' }, { type: 'attended' }], []).primary.id, 'live-goer'); // 동점 → 관람 우선
console.log('✓ 단위 검증 통과 (날짜·오픈 상태·달력·구글 캘린더·ics·KOPIS 정리·공연장 필터·취향 배지 월간·연말·장거리 원정러)');
if (process.argv.includes('--unit')) process.exit(0);

/* ---------- 2. 배포 전 점검 ---------- */
const errors = []; const warns = [];
const today = L.kstDay(new Date());
if (!CFG.appsScriptUrl) errors.push('config.js: appsScriptUrl이 비어 있습니다. 행동 기록이 저장되지 않고, 공연 일정이 엑셀 스냅샷으로 고정됩니다.');
else if (!/^https:\/\/script\.google\.com\/macros\/s\/.+\/exec$/.test(CFG.appsScriptUrl)) warns.push('config.js: appsScriptUrl이 Apps Script 웹 앱 주소(…/exec) 형식이 아닙니다.');
if (CFG.debug) errors.push('config.js: debug가 true입니다.');
if (/KOPIS_KEY|service=/.test(read('config.js') + read('app.js'))) errors.push('사이트 코드에 KOPIS 키로 보이는 문자열이 있습니다. 키는 Apps Script에만 두세요.');

const perfDoc = JSON.parse(read('data/performances.json'));
const perfs = (perfDoc.performances || []).map(L.normalizePerformance).filter(Boolean);
const upcoming = perfs.filter(x => x.endDate >= today);
if (!CFG.appsScriptUrl && upcoming.length === 0) errors.push(`공연 일정: 스냅샷(${perfDoc.updatedAt} 기준)에 앞으로의 공연이 없습니다. KOPIS 자동 수집을 연결하세요.`);

if (CFG.openingsCsvUrl) warns.push('오픈 공지를 구글 시트에서 불러옵니다. 시트 내용은 화면에서 직접 확인하세요.');
const norm = JSON.parse(read('data/openings.json')).map(L.normalizeOpening).filter(Boolean);
norm.forEach(x => {
  const tag = `openings.json "${x.title}"`;
  if (x.sample) (CFG.openingsCsvUrl ? warns : errors).push(`${tag}: 예시 항목이 남아 있습니다.`);
  if (!x.ticketUrl) warns.push(`${tag}: 예매 링크 없음.`);
  if (!x.openAt) warns.push(`${tag}: 오픈 일시 없음 → 캘린더 추가 버튼이 나오지 않습니다.`);
  if (x.kopisId && !perfs.some(q => q.id === x.kopisId)) warns.push(`${tag}: KOPIS ID ${x.kopisId}가 현재 공연 일정에 없습니다 (자동 수집 후 다시 확인).`);
});
if (!CFG.openingsCsvUrl && !L.sortOpenings(norm).some(x => !x.sample)) errors.push('화면에 보일 실제 오픈 공지가 0건입니다.');

console.log('\n배포 전 점검 결과');
console.log(`  공연 일정 ${perfs.length}건(앞으로 ${upcoming.length}건, ${perfDoc.source}) · 오픈 공지 ${norm.length}건 · Apps Script ${CFG.appsScriptUrl ? '설정됨' : '미설정'}`);
warns.forEach(w => console.log('  ! 확인: ' + w));
errors.forEach(e => console.log('  ✗ 막힘: ' + e));
if (errors.length) { console.log(`\n✗ 배포 전 해결할 항목 ${errors.length}건`); process.exit(1); }
console.log('\n✓ 배포 가능 (확인 항목은 화면에서 한 번 더 봐 주세요)');
