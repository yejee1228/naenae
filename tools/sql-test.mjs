// 내내(nae nae) — DB(마이그레이션)·권한(RLS)·서버 함수 테스트 (P0-5)
// 실제 PostgreSQL(PGlite, 메모리)에 supabase/migrations/*.sql 을 그대로 실행하고
// 비회원(anon)·회원 A·회원 B·운영자로 각각 읽기·쓰기를 시도해 규칙대로 막히는지 확인합니다.
// 실행: npm run test:sql
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const db = new PGlite();
let pass = 0; const fails = [];
const ok = (cond, name, extra = '') => { if (cond) pass++; else fails.push(name + (extra ? ' — ' + extra : '')); };

// Supabase가 기본으로 갖고 있는 것 흉내: auth 스키마·사용자 표·auth.uid()·역할
await db.exec(`
create role anon nologin; create role authenticated nologin; create role service_role nologin;
create schema auth;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
`);
for (const f of fs.readdirSync(path.join(root, 'supabase/migrations')).sort()) {
  try { await db.exec(fs.readFileSync(path.join(root, 'supabase/migrations', f), 'utf8')); ok(true, f); }
  catch (e) { fails.push(`마이그레이션 ${f} 실패: ${e.message}`); console.error(fails.at(-1)); process.exit(1); }
}

const ID = { admin: '00000000-0000-0000-0000-0000000000aa', a: '00000000-0000-0000-0000-00000000000a', b: '00000000-0000-0000-0000-00000000000b' };
async function as(who, sql, params) {
  await db.exec('reset role');
  if (who === 'super') return db.query(sql, params);
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [who === 'anon' ? '' : ID[who]]);
  await db.exec(`set role ${who === 'anon' ? 'anon' : 'authenticated'}`);
  try { return await db.query(sql, params); } finally { await db.exec('reset role'); }
}
async function err(who, sql, params) { try { await as(who, sql, params); return ''; } catch (e) { return e.message; } }
const one = async (who, sql, params) => (await as(who, sql, params)).rows[0];

// 준비: 사용자 3명 + 프로필
await as('super', `insert into auth.users values ($1, 'admin@naenae.test'), ($2, 'alice@example.com'), ($3, 'bob@example.com')`, [ID.admin, ID.a, ID.b]);
const consents = JSON.stringify({ age14: true, terms: true, privacy: true, marketing: false });
for (const w of ['admin', 'a', 'b']) await as(w, `select public.complete_profile($1, 'email', $2::jsonb)`, [w === 'admin' ? '운영자' : '회원' + w.toUpperCase(), consents]);
await as('super', `update public.profiles set is_admin = true where id = $1`, [ID.admin]);
ok((await err('a', `select public.complete_profile('x', 'email', $1::jsonb)`, [consents])).includes('validation'), '닉네임 2자 미만 거절');
ok((await err('b', `select public.complete_profile('회원B', 'email', '{"age14":true}'::jsonb)`)).includes('필수 약관'), '필수 약관 없으면 거절');
ok((await as('super', `select count(*)::int n from public.consents where user_id = $1`, [ID.a])).rows[0].n === 4, '동의 이력 4건');

// 회원 권한
ok((await err('a', `update public.profiles set is_admin = true where id = $1`, [ID.a])).includes('permission denied'), '회원이 is_admin을 못 바꿈');
ok((await as('a', `update public.profiles set nickname = '앨리스' where id = $1 returning nickname`, [ID.a])).rows[0]?.nickname === '앨리스', '회원이 자기 닉네임 변경');
ok((await as('a', `select * from public.profiles`)).rows.length === 1, '회원은 자기 프로필만 보임');
ok((await err('anon', `select * from public.profiles`)).includes('permission denied'), '비회원은 프로필 못 봄');

// 콘텐츠: 운영자만 쓰기, 숨김·비게시 안 보임
const perf = (await as('admin', `insert into public.performances (source, title, start_date, end_date, venue, region, artists) values ('manual', '테스트 단독 공연', current_date - 5, current_date + 3, '롤링홀', '서울', '{테스트밴드}') returning id`)).rows[0].id;
const hiddenPerf = (await as('admin', `insert into public.performances (source, title, start_date, end_date, is_hidden) values ('manual', '숨긴 공연', current_date, current_date, true) returning id`)).rows[0].id;
ok((await as('anon', `select id from public.performances`)).rows.length === 1, '비회원은 숨긴 공연 안 보임');
ok((await err('a', `insert into public.performances (source, title, start_date, end_date) values ('manual', 'x', current_date, current_date)`)).includes('row-level security'), '회원은 공연 등록 못 함');
await as('admin', `insert into public.openings (title, open_at, is_published) values ('게시 공지', now() + interval '1 day', true), ('비게시 공지', now(), false)`);
ok((await as('anon', `select title from public.openings`)).rows.length === 1, '비회원은 비게시 공지 안 보임');
ok((await as('admin', `select title from public.openings`)).rows.length === 2, '운영자는 모든 공지 보임');
await as('admin', `update public.performances set artists = '{보정된밴드}' where id = $1`, [perf]);
ok((await one('super', `select artists_locked from public.performances where id = $1`, [perf])).artists_locked === true, '운영자가 아티스트 고치면 잠금 (R-106)');
ok((await one('super', `select count(*)::int n from public.admin_audit_logs where target_table = 'performances'`)).n >= 2, '운영자 작업 기록 (R-104)');
ok((await err('a', `select * from public.admin_audit_logs`)) === '' && (await as('a', `select * from public.admin_audit_logs`)).rows.length === 0, '회원은 작업 기록 못 봄');

// 기록
await as('a', `insert into public.records (user_id, type, performance_id, title, date) values ($1, 'planned', $2, '테스트 단독 공연', current_date + 3)`, [ID.a, perf]);
ok((await err('a', `insert into public.records (user_id, type, performance_id, title, date) values ($1, 'planned', $2, '중복', current_date)`, [ID.a, perf])).includes('duplicate'), '보고 싶어요 중복 막힘 (R-31)');
ok((await err('a', `insert into public.records (user_id, type, title, date) values ($1, 'planned', '남의 기록', current_date)`, [ID.b])).includes('row-level security'), '남의 기록 못 만듦');
const att = (await one('a', `select public.attend($1, current_date - 1) r`, [perf])).r;
ok(att.record?.type === 'attended' && att.removedPlannedId, '관람 저장 + 보고 싶은 공연 정리 (R-33)');
ok((await err('a', `select public.attend($1, current_date - 1)`, [perf])).includes('conflict'), '같은 날 관람 중복 막힘 (R-32)');
ok((await err('a', `select public.attend($1, (now() at time zone 'Asia/Seoul')::date + 1)`, [perf])).includes('validation'), '미래 날짜 관람 막힘');
ok((await err('a', `select public.attend($1, current_date)`, [hiddenPerf])).includes('not_found'), '숨긴 공연은 관람 저장 안 됨');
ok((await as('b', `select * from public.records`)).rows.length === 0, '남의 기록 안 보임');
await as('a', `insert into public.interests (user_id, name) values ($1, '테스트 밴드')`, [ID.a]);
ok((await err('a', `insert into public.interests (user_id, name) values ($1, '테스트밴드')`, [ID.a])).includes('duplicate'), '관심 아티스트 띄어쓰기만 다른 중복 막힘 (R-37)');

// 제보
const rep = (await one('a', `select (public.create_report('{"kind":"opening","title":"새 공연","showDate":"2026-12-31"}'::jsonb)).id`)).id;
ok(!!rep, '제보 만들기');
ok((await err('a', `select public.create_report('{"title":"날짜 없음"}'::jsonb)`)).includes('validation'), '날짜·일시·링크 없는 제보 거절 (R-71)');
ok((await err('anon', `select public.create_report('{"title":"x","showDate":"2026-12-31"}'::jsonb)`)) !== '', '비회원 제보 막힘 (R-70)');
for (let i = 0; i < 10; i++) await as('b', `select public.create_report('{"title":"반복","sourceUrl":"https://a.b"}'::jsonb)`);
ok((await err('b', `select public.create_report('{"title":"11번째","sourceUrl":"https://a.b"}'::jsonb)`)).includes('rate_limited'), '1시간 10건 제한 (R-77)');
ok((await as('b', `select * from public.reports where id = $1`, [rep])).rows.length === 0, '남의 제보 안 보임');
ok((await err('a', `select public.admin_open_report($1)`, [rep])).includes('forbidden'), '회원은 제보 검수 못 함');
ok((await one('admin', `select (public.admin_open_report($1)).status s`, [rep])).s === 'reviewing', '제보 열면 확인 중 (R-72)');
ok((await err('a', `select public.cancel_report($1)`, [rep])).includes('conflict'), '확인 중이면 취소 불가 (R-75)');
ok((await err('admin', `select public.admin_reject_report($1, '  ')`, [rep])).includes('validation'), '실패 이유 없으면 거절 (R-74)');
const reg = (await one('admin', `select public.admin_register_report($1, 'opening', '{"title":"새 공연","openAt":"2026-12-01T20:00:00+09:00","artists":["새밴드"]}'::jsonb) r`, [rep])).r;
ok(reg.report.status === 'registered' && reg.createdId, '공지로 등록 → 등록 완료');
ok((await one('a', `select report_unseen from public.profiles where id = $1`, [ID.a])).report_unseen === true, '제보자에게 보라 점 (R-76)');
ok((await as('a', `select status, registered_opening_id from public.reports where id = $1`, [rep])).rows[0].registered_opening_id === reg.createdId, '제보자가 등록된 공지 연결 확인');
await as('a', `select public.mark_reports_seen()`);
ok((await one('a', `select report_unseen from public.profiles where id = $1`, [ID.a])).report_unseen === false, '내 제보 보면 보라 점 사라짐');
const rep2 = (await one('a', `select (public.create_report('{"title":"취소할 제보","sourceUrl":"https://x.y"}'::jsonb)).id`)).id;
await as('a', `select public.cancel_report($1)`, [rep2]);
ok((await one('a', `select status from public.reports where id = $1`, [rep2])).status === 'canceled', '제보 완료 상태에서 취소 (R-75)');

// 아티스트 DB (12_아티스트_기획, R-120~140)
const save = async (who, obj) => (await one(who, `select public.admin_artist_save($1::jsonb) c`, [JSON.stringify(obj)])).c;
ok((await err('a', `select public.admin_artist_save('{"name":"x"}'::jsonb)`)).includes('forbidden'), '회원은 아티스트 등록 못 함 (R-120)');
ok((await err('a', `insert into public.artists (name) values ('직접')`)).includes('permission denied'), '아티스트 표에 직접 쓰기 막힘');
const band = await save('admin', { name: '테스트밴드', kind: 'group', disambig: '', instagram: 'test.band', aliases: ['TESTBAND'], linkPerfIds: [perf] });
ok(band.perfCount === 1 && band.next?.id === perf && band.aliases[0] === 'TESTBAND', '등록 + 체크한 공연 연결 + 별칭 (R-137)', JSON.stringify(band).slice(0, 160));
ok((await one('a', `select artist_id from public.interests where user_id = $1`, [ID.a])).artist_id === band.id, '이름으로 담아 둔 관심 아티스트가 자동 연결 (R-135)');
ok((await err('admin', `select public.admin_artist_save('{"name":"테스트 밴드","kind":"group"}'::jsonb)`)).includes('구분 문구'), '같은 이름은 구분 문구 필수 (R-122)');
ok((await err('admin', `select public.admin_artist_save('{"name":"x","instagram":"https://instagram.com/x"}'::jsonb)`)).includes('인스타그램'), '인스타그램은 아이디만 (R-132)');
const s1 = await save('admin', { name: '새벽', kind: 'group', disambig: '밴드 · 부산' });
const s2 = await save('admin', { name: '새벽', kind: 'solo', disambig: '싱어송라이터' });
const member = await save('admin', { name: '한결', kind: 'solo', disambig: '', groupIds: [band.id] });
ok(member.groups[0]?.id === band.id, '개인의 소속 그룹 연결 (R-121)');
const p2 = (await as('admin', `insert into public.performances (source, title, start_date, end_date, artists) values ('manual', '새벽 X 테스트 밴드', current_date + 1, current_date + 1, '{새벽,테스트 밴드}') returning id`)).rows[0].id;
const links = (await as('anon', `select artist_id from public.performance_artists where performance_id = $1`, [p2])).rows.map(r => r.artist_id);
ok(links.length === 1 && links[0] === band.id, '새 공연 자동 연결: 1명과 맞는 이름만, 동명이인은 연결 안 함 (R-125)', JSON.stringify(links));
const found = (await one('anon', `select public.search_artists('새벽') r`)).r;
ok(found.length === 2 && found.every(x => x.name === '새벽'), '비회원 아티스트 검색 · 동명이인 둘 다 (R-126)');
ok((await one('anon', `select public.search_artists('testband') r`)).r[0]?.id === band.id, '별칭으로도 검색 (R-123)');
await as('admin', `select public.admin_links_save('performance', $1, $2::jsonb)`, [p2, JSON.stringify([{ name: '새벽', artistId: s1.id }, { name: '테스트 밴드', artistId: band.id }])]);
ok((await as('anon', `select 1 from public.performance_artists where performance_id = $1`, [p2])).rows.length === 2, '공연 아티스트 박스 저장 — 여러 명 연결 (R-139)');
await as('admin', `update public.performances set artists = '{새벽,테스트 밴드,새이름}' where id = $1`, [p2]);
ok((await as('anon', `select 1 from public.performance_artists where performance_id = $1 and source = 'admin'`, [p2])).rows.length === 2, '자동 수집·수정이 운영자 연결을 지우지 않음');
ok((await err('a', `select public.admin_links_save('performance', $1, '[]'::jsonb)`, [p2])).includes('forbidden'), '회원은 연결 못 바꿈');
const cands = (await one('admin', `select public.admin_candidates('') r`)).r;
ok(cands.some(c => c.name === '새이름') && !cands.some(c => c.name === '테스트 밴드' || c.name === '새벽'), '후보: 아직 등록 안 된 이름만 (R-124)', JSON.stringify(cands.map(c => c.name)));
await as('admin', `select public.admin_candidate_ignore('새이름')`);
ok(!(await one('admin', `select public.admin_candidates('') r`)).r.some(c => c.name === '새이름'), '후보 제외');
const merged = (await one('admin', `select public.admin_artist_merge('새이름', $1, array[$2::uuid]) c`, [s2.id, p2])).c;
ok(merged.aliases.includes('새이름') && (await as('anon', `select 1 from public.performance_artists where performance_id = $1 and artist_id = $2`, [p2, s2.id])).rows.length === 1, '합치기: 별칭 + 체크한 공연 연결 (R-138)');
ok((await err('a', `insert into public.interests (user_id, name, artist_id, source) values ($1, '테스트밴드', $2, 'search')`, [ID.a, band.id])).includes('duplicate'), '같은 아티스트 관심 중복 막힘');
await as('a', `insert into public.interests (user_id, name, artist_id, source) values ($1, '새벽', $2, 'search'), ($1, '새벽', $3, 'search')`, [ID.a, s1.id, s2.id]);
ok((await as('a', `select 1 from public.interests where user_id = $1 and artist_id is not null`, [ID.a])).rows.length === 3, '동명이인은 각각 관심 등록 가능');
await as('admin', `select public.admin_artist_hide($1)`, [s2.id]);
ok((await one('anon', `select public.search_artists('새벽') r`)).r.length === 1 && (await as('anon', `select 1 from public.artists where id = $1`, [s2.id])).rows.length === 0, '숨긴 아티스트는 안 보임 (R-134)');
ok((await err('a', `select public.create_report('{"kind":"artist","title":"새 아티스트"}'::jsonb)`)).includes('링크'), '아티스트 제보는 링크 필수 (R-131)');
const arep = (await one('a', `select (public.create_report($1::jsonb)).id`, [JSON.stringify({ kind: 'artist', title: '새 아티스트', artistKind: 'group', sourceUrl: 'https://instagram.com/x', artistMembers: [{ id: member.id }, { name: '도윤' }] })])).id;
ok(!!arep, '아티스트 제보 만들기');
const areg = (await one('admin', `select public.admin_register_report($1, 'artist', '{"name":"새 아티스트","kind":"group","memberIds":[]}'::jsonb) r`, [arep])).r;
ok(areg.report.status === 'registered' && (await one('a', `select registered_artist_id from public.reports where id = $1`, [arep])).registered_artist_id === areg.createdId, '아티스트 제보 등록 → 제보자에게 연결 (R-140)');
ok((await err('a', `select public.link_interests($1)`, [band.id])).includes('permission denied'), '회원은 내부 연결 함수 못 부름');

// 운영자 화면
ok((await err('a', `select public.admin_dashboard()`)).includes('forbidden'), '회원은 대시보드 못 봄');
const dash = (await one('admin', `select public.admin_dashboard() d`)).d;
ok(dash.members === 3 && dash.reportsSubmitted >= 9, '대시보드 숫자', JSON.stringify(dash).slice(0, 120));
const mem = (await as('admin', `select * from public.admin_members('')`)).rows;
ok(mem.length === 3 && mem.every(m => !m.email_masked || m.email_masked.includes('***')), '회원 목록 이메일 가림 (R-107)');
ok((await one('admin', `select public.admin_reveal_email($1) e`, [ID.b])).e === 'bob@example.com', '이메일 보기');
ok((await one('super', `select count(*)::int n from public.admin_audit_logs where action = 'view_pii'`)).n === 1, '이메일 보기 기록 남음');

// 이용 기록·지표
const n = (await one('anon', `select public.track_events($1::jsonb) n`, [JSON.stringify([{ event: 'visit', visitorId: 'v1' }, { event: 'calendar_add', item: 'open:1', visitorId: 'v1' }, { event: 'hack', visitorId: 'v1' }, { event: 'visit' }])])).n;
ok(n === 2, '허용된 이벤트만 저장 (R-112·116)', String(n));
ok((await err('anon', `select * from public.activity_logs`)).includes('permission denied'), '비회원은 이용 기록 못 봄');
await as('super', `select public.metrics_aggregate((now() at time zone 'Asia/Seoul')::date)`);
ok((await one('super', `select value from public.metrics_daily where metric = 'visitors' and key = ''`))?.value === 1, '지표 합계 (R-114)');
ok((await err('a', `select public.metrics_aggregate()`)).includes('permission denied'), '회원은 지표 작업 못 돌림');

// 우회 시도 (P5 보안 점검)
await err('a', `update public.reports set status = 'registered' where id = $1`, [rep2]);
ok((await one('super', `select status from public.reports where id = $1`, [rep2])).status === 'canceled', '회원이 제보 상태를 직접 못 바꿈');
ok((await err('b', `insert into public.reports (user_id, kind, title, source_url) values ($1, 'opening', '직접 넣기', 'https://a.b')`, [ID.b])) !== '', '제보 직접 insert 막힘 (1시간 제한 우회 불가)');
ok((await err('a', `select * from public.admin_members('')`)).includes('forbidden'), '회원은 회원 목록 못 봄');
ok((await err('a', `select public.admin_reveal_email($1)`, [ID.b])).includes('forbidden'), '회원은 이메일 보기 못 함');
ok((await err('a', `insert into public.admin_audit_logs (actor_id, action, target_table, target_id) values ($1, 'x', 'y', 'z')`, [ID.a])) !== '', '회원은 작업 기록 못 씀');
ok((await err('a', `update public.promotions set title = 'x'`)) !== '' || (await one('super', `select count(*)::int n from public.promotions where title = 'x'`)).n === 0, '회원은 이벤트 못 고침');
ok((await err('anon', `select public.logs_cleanup()`)).includes('permission denied'), '비회원은 정리 작업 못 돌림');
ok((await err('anon', `select * from public.consents`)).includes('permission denied'), '비회원은 동의 이력 못 봄');
ok((await as('b', `select * from public.consents`)).rows.every(r => r.user_id === ID.b), '회원은 자기 동의 이력만');
ok((await err('a', `update public.profiles set report_unseen = false, nickname = 'x' where id = $1`, [ID.b])) !== '' || (await one('super', `select nickname from public.profiles where id = $1`, [ID.b])).nickname !== 'x', '남의 프로필 못 고침');

// 탈퇴
ok((await err('admin', `select public.withdraw()`)).includes('forbidden'), '운영자 탈퇴 막힘 (R-09b)');
await as('a', `select public.withdraw()`);
ok((await one('super', `select count(*)::int n from public.records where user_id = $1`, [ID.a])).n === 0, '탈퇴하면 기록 삭제 (R-08)');
ok((await one('super', `select user_id from public.reports where id = $1`, [rep])).user_id === null, '탈퇴해도 제보는 남고 연결만 끊김 (R-117)');
ok((await one('super', `select count(*)::int n from public.openings where report_id = $1`, [rep])).n === 1, '제보로 등록된 공지는 유지');

console.log(`\nSQL 테스트: 통과 ${pass} · 실패 ${fails.length}`);
fails.forEach(f => console.log('  ✗ ' + f));
process.exit(fails.length ? 1 : 0);
