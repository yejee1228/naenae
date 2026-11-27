// 내내 nae nae beta 1.0 — 단위 검증 + 배포 전 점검
// 사용: node tools/check.mjs          (단위 검증 + 배포 전 점검, 막히는 항목이 있으면 종료 코드 1)
//       node tools/check.mjs --unit   (단위 검증만)
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const ctx = { console, Intl, Date, URL, URLSearchParams, Math, String, Number, Array, Object, JSON, RegExp, Set, Map, unescape, encodeURIComponent };
vm.createContext(ctx);
vm.runInContext(read('src/shared/legacy-lib.js'), ctx, { filename: 'legacy-lib.js' });
const L = ctx.MyLiveLib;
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
// '서로 다른 지역 3곳'만으로는 원정러가 아님 (결정 7 → 삭제)
const metro3 = ['서울', '경기', '인천'].map((region, i) => ({ type: 'attended', date: `2026-11-0${i + 1}`, venue: 'M' + i, region, artists: ['M' + i] }));
assert.equal(L.computeBadges(metro3, [], 'month', '2026-11').extras.find(x => x.id === 'travel'), undefined);
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
console.log('✓ 0.5 순수 함수 검증 통과 (날짜·오픈 상태·달력·구글 캘린더·ics·KOPIS 정리·공연장 필터·취향 배지)');


/* ---------- 1-2. 베타 도메인 함수 (src/shared/domain.js) ---------- */
const D = await import(pathToFileURL(path.join(root, 'src/shared/domain.js')).href);
// 공연명에서 아티스트 뽑기 (결정 29) — KOPIS 실제 공연명 기준
const ex = t => plain(D.extractArtists(t));
assert.deepEqual(ex('HYUKOH 단독 콘서트'), ['HYUKOH']);
assert.deepEqual(ex('노브레인 연말 공연 [서울]'), ['노브레인']);
assert.deepEqual(ex('라라라온'), ['라라라온']);
assert.deepEqual(ex('A X B'), ['A', 'B']);
assert.deepEqual(ex(''), []);
assert.deepEqual(ex('크리스마스 콘서트'), []);              // 일반 단어는 아티스트가 아님
// 관심 아티스트 매칭: 공연명 + 아티스트 + KOPIS 출연진
assert.ok(D.matchesArtist('혁 오', { title: 'x', artists: ['혁오'] }));
assert.ok(D.matchesArtist('hyukoh', { title: 'HYUKOH 단독 콘서트' }));
assert.ok(D.matchesArtist('김수유', { title: 'x', castRaw: '이한결, 김수유' }));
assert.ok(!D.matchesArtist('a', { title: 'a' }));                      // 1글자는 매칭 안 함
assert.equal(D.nameKey(' Ａ B '), 'ab');
// 아티스트 ID 매칭 (R-130): 연결돼 있으면 ID로, 같은 이름이 다른 아티스트에 연결돼 있으면 안 맞음, 연결 없으면 이름·별칭으로
const dawnBand = { name: '새벽', artistId: 'g1', artist: { id: 'g1', name: '새벽', aliases: ['DAWN'] } };
assert.ok(D.matchesInterest(dawnBand, { title: 'x', artists: ['새벽'], links: [{ artistId: 'g1', name: '새벽' }] }));
assert.ok(!D.matchesInterest(dawnBand, { title: '새벽 단독', artists: ['새벽'], links: [{ artistId: 's1', name: '새벽' }] }));   // 동명이인
assert.ok(D.matchesInterest(dawnBand, { title: 'DAWN LIVE', artists: [] }));                                                 // 연결 전 · 별칭
assert.ok(D.matchesInterest({ name: '혁 오' }, { title: 'x', artists: ['혁오'] }));                                           // 이전 데이터(이름만)
assert.deepEqual(plain(D.matchedArtists([dawnBand, { name: 'BB' }], { title: 'x', artists: ['BB', '새벽'], links: [{ artistId: 'g1', name: '새벽' }] })), ['새벽', 'BB']);
assert.equal(D.shortRegion('서울특별시'), '서울'); assert.equal(D.shortRegion('전남광주통합특별시'), '전남광주');
// 날짜
assert.equal(D.addDays('2026-12-31', 1), '2027-01-01'); assert.equal(D.dayDiff('2026-11-23', '2026-12-01'), 8);
assert.equal(D.kstToday(new Date('2026-11-23T15:30:00Z')), '2026-11-24');
// 이벤트 상태
assert.equal(D.eventStatus({ startDate: '2026-12-01', endDate: '2026-12-10' }, '2026-11-23').key, 'soon');
assert.equal(D.eventStatus({ startDate: '2026-11-01', endDate: '2026-11-23' }, '2026-11-23').label, '오늘 마감');
assert.equal(D.eventStatus({ startDate: '2026-11-01', endDate: '2026-11-20' }, '2026-11-23').past, true);
// 추천 3구역: 겹치지 않고, 이미 담은 공연 제외, 30일·5개
const pf = (id, title, start, venue, artists = []) => ({ id, title, startDate: start, endDate: start, venue, artists });
const pool = [pf('p1', 'A 단독', '2026-11-25', '롤링홀', ['A']), pf('p2', 'B 공연', '2026-11-26', '롤링홀'), pf('p3', 'C 공연', '2026-11-27', '우무지'),
  pf('p4', 'A 투어', '2027-02-01', '롤링홀', ['A']), pf('p5', 'D 공연', '2026-11-24', '롤링홀', ['D'])];
const rs = D.recommendSections(pool, [{ type: 'attended', venue: '롤링홀', performanceId: 'p5' }], [{ name: 'AA' }, { name: 'A 단독' }], ['우무지'], '2026-11-23');
assert.deepEqual(plain(rs.fav.map(x => x.perf.id)), ['p1']);
assert.deepEqual(plain(rs.venue.map(x => x.perf.id)), ['p2']);
assert.deepEqual(plain(rs.club.map(x => x.perf.id)), ['p3']);
// 육각형
const hx = D.hexagon([{ type: 'attended', venue: '롤링홀', region: '부산', artists: ['A'] }, { type: 'attended', venue: '롤링홀', region: '서울', artists: ['B'] }, { type: 'planned' }], [{ name: 'A' }]);
assert.equal(hx.values.travel, 50); assert.equal(hx.values.regular, 25); assert.equal(hx.empty, false);
assert.equal(D.hexagon([], []).empty, true); assert.equal(D.hexSummary(D.hexagon([], []), 'x'), '');
// 제보 검사
assert.equal(D.validateReport({}), '공연명을 입력해 주세요.');
assert.equal(D.validateReport({ title: 'x' }), '공연 날짜를 입력해 주세요.');   // 공연명·공연 날짜 필수 (11/28)
assert.equal(D.validateReport({ title: 'x', showDate: '2026-12-01' }), '티켓 오픈 날짜를 입력해 주세요.');   // 오픈 공지(기본)는 오픈 날짜 필수
assert.equal(D.validateReport({ kind: 'opening', title: 'x', showDate: '2026-12-01', openAtText: '2026-11-30' }), '');   // 시간은 선택
assert.equal(D.validateReport({ kind: 'performance', title: 'x', showDate: '2026-12-01', ticketUrl: 'javascript:alert(1)' }), '링크는 https:// 로 시작하는 주소로 넣어 주세요.');
assert.equal(D.validateReport({ kind: 'performance', title: 'x', showDate: '2026-12-01' }), '');
// KOPIS 응답 정리
const listXml = '<dbs><db><mt20id>PF1</mt20id><prfnm><![CDATA[A &amp; B 공연]]></prfnm><prfpdfrom>2026.12.01</prfpdfrom><prfpdto>2026.12.02</prfpdto><fcltynm>롤링홀</fcltynm><area>서울특별시</area><prfstate>공연예정</prfstate><poster>http://x/p.gif</poster></db><db><mt20id></mt20id></db></dbs>';
const li = D.parseKopisList(listXml);
assert.equal(li.length, 1); assert.equal(li[0].title, 'A & B 공연'); assert.equal(li[0].startDate, '2026-12-01'); assert.equal(li[0].region, '서울');
const det = D.parseKopisDetail('<dbs><db><mt20id>PF1</mt20id><prfcast>이한결, 김수유 등</prfcast><relates><relate><relatenm>NOL</relatenm><relateurl>https://t.example</relateurl></relate><relate><relatenm>X</relatenm><relateurl>javascript:x</relateurl></relate></relates></db></dbs>');
assert.equal(det.castRaw, '이한결, 김수유'); assert.equal(det.ticketLinks.length, 1);
assert.equal(D.kopisError('<dbs><returncode>06</returncode><errmsg>rows</errmsg></dbs>'), '06 rows'); assert.equal(D.kopisError('<dbs><db></db></dbs>'), '');
console.log('✓ 베타 도메인 함수 검증 통과 (아티스트 추출·매칭·지역·이벤트 상태·추천 3구역·육각형·제보 검사·KOPIS 응답)');
if (process.argv.includes('--unit')) process.exit(0);

/* ---------- 2. 배포 전 점검 ---------- */
const errors = []; const warns = [];
const exists = f => fs.existsSync(path.join(root, f));
const walk = dir => fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]);
// Edge Function 공용 사본이 원본과 같은지
if (read('supabase/functions/_shared/domain.js') !== read('src/shared/domain.js')) errors.push('supabase/functions/_shared/domain.js 가 src/shared/domain.js 와 다릅니다. 복사해서 맞춰 주세요.');
// 키 유출: 사이트 코드·배포 결과물에 KOPIS 키나 서비스 키 흔적이 없어야 함
const envKey = exists('.env.local') ? ((read('.env.local').match(/^KOPIS_KEY=(.+)$/m) || [])[1] || '').trim() : '';
const scan = [...walk('src'), 'index.html', 'admin.html', ...(exists('dist') ? walk('dist') : [])].filter(f => /\.(js|html|css|json)$/.test(f));
for (const f of scan) {
  const t = read(f);
  if (envKey && t.includes(envKey)) errors.push(`${f}: KOPIS 키가 들어 있습니다.`);
  if (/service_role|sb_secret_/i.test(t)) errors.push(`${f}: Supabase 서비스 키로 보이는 문자열이 있습니다.`);
  if (f.startsWith('dist') && /PF\d{6}/.test(t)) errors.push(`${f}: KOPIS 스냅샷(PF…)이 배포 결과물에 섞였습니다 (결정 4 확인 전 공개 금지).`);
}
if (!exists('dist')) warns.push('dist 가 없어 배포 결과물 검사는 건너뛰었습니다. npm run build 후 다시 돌려 주세요.');
// 예시 데이터
const ymdRel = /^D[+-]\d+( \d{2}:\d{2})?$/;
for (const [file, list] of [['openings', JSON.parse(read('data/demo/openings.json'))], ['performances', JSON.parse(read('data/demo/performances.json')).performances]]) {
  list.forEach(x => {
    if (!x.id || !x.title) errors.push(`data/demo/${file}.json: id·title 없는 항목`);
    for (const k of ['showDate', 'openAt', 'date', 'endDate']) if (x[k] && !ymdRel.test(x[k])) warns.push(`data/demo/${file}.json "${x.title}": ${k}가 D+n 형식이 아닙니다.`);
  });
}
const migs = fs.readdirSync(path.join(root, 'supabase/migrations')).sort();
if (!migs.length) errors.push('supabase/migrations 가 비어 있습니다.');
if (!exists('.env.example')) warns.push('.env.example 이 없습니다.');
const gi = read('.gitignore');
if (!gi.includes('.env.*') || !gi.includes('data/kopis-snapshot.json')) errors.push('.gitignore 에 .env.* 또는 KOPIS 스냅샷 제외가 빠졌습니다.');

console.log('\n배포 전 점검 결과');
console.log(`  검사 파일 ${scan.length}개 · 마이그레이션 ${migs.length}개 · KOPIS 키 ${envKey ? '로컬에 있음(코드 유출 검사함)' : '로컬에 없음'}`);
warns.forEach(w => console.log('  ! 확인: ' + w));
errors.forEach(e => console.log('  ✗ 막힘: ' + e));
if (errors.length) { console.log(`\n✗ 배포 전 해결할 항목 ${errors.length}건`); process.exit(1); }
console.log('\n✓ 배포 가능');
