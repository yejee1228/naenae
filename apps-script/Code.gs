/**
 * my Live. MVP 0.5 — Google Apps Script (구글 시트 1개로 운영)
 *
 *  1) 행동 기록 수집   doPost  → 'events' 시트
 *  2) KOPIS 공연 일정  syncKopis(매일 자동) → 'kopis' 시트 → doGet?type=performances 로 사이트에 제공
 *
 * 설치
 *  - 기록용 구글 시트 → 확장 프로그램 → Apps Script → 이 파일 붙여넣기 → 저장
 *  - 프로젝트 설정 → 스크립트 속성 → KOPIS_KEY = (KOPIS에서 발급받은 서비스키)   ※ 키는 사이트 코드에 넣지 않음
 *  - 편집기에서 installTriggers 한 번 실행 (권한 승인) → 매일 오전 6시 syncKopis 자동 실행
 *  - syncKopis 한 번 직접 실행해 'kopis' 시트가 채워지는지 확인
 *  - 배포 → 새 배포 → 웹 앱 / 실행: 나 / 액세스: 모든 사용자 → URL(…/exec)을 config.js appsScriptUrl에
 *
 * 수집하지 않는 것: 사진, 이름, 연락처, IP
 */
const SHEET_EVENTS = 'events';
const SHEET_KOPIS = 'kopis';
const SHEET_SUMMARY = 'summary';
const COLS = ['received_at', 'ts', 'event', 'show', 'value', 'item', 'src', 'inapp', 'vid', 'sid', 'v'];
const ALLOWED = [
  'visit', 'open_mode', 'calendar_open', 'calendar_add', 'opening_click', 'planned_add', 'attended_add', 'record_remove',
  'artist_interest', 'artist_uninterest', 'badge_earned', 'perf_view', 'schedule_filter', 'ticket_link_click',
  'stamp_open', 'photo_select', 'photo_error', 'stamp_ready', 'share_click', 'share_done', 'share_cancel', 'share_error',
  'share_unsupported', 'save_click', 'inapp_escape_click',
  'event_view', 'badge_scope', 'badge_guide_view', 'badge_guide_open', 'auth_view', 'login_attempt', 'signup_attempt'
];

/* KOPIS 설정 — 실제 키로 호출해 응답 항목을 한 번 확인하세요 (README 5장) */
const KOPIS = {
  base: 'http://www.kopis.or.kr/openApi/restful/pblprfr',
  genre: 'CCCD',      // 대중음악
  daysAhead: 60,      // 오늘부터 며칠 뒤까지 수집
  windowDays: 31,     // 한 번 조회 기간 (KOPIS 기간 제한 대비)
  rows: 100,
  maxDetailPerRun: 150 // 상세(출연진·예매처) 호출 상한 — 시간 제한(6분) 대비
};

/* ===================== 1. 행동 기록 ===================== */
function doPost(e) {
  try {
    const raw = (e && e.postData && e.postData.contents) || '';
    if (raw.length > 4000) return text_('too_large');
    const d = JSON.parse(raw);
    if (!d || ALLOWED.indexOf(d.event) < 0) return text_('ignored');
    const row = COLS.map(c => c === 'received_at' ? new Date() : clean_(d[c]));
    const lock = LockService.getScriptLock();
    lock.waitLock(5000);
    try { sheet_(SHEET_EVENTS, COLS).appendRow(row); } finally { lock.releaseLock(); }
    return text_('ok');
  } catch (err) { return text_('error'); }
}

/* ===================== 2. 공연 일정 제공 ===================== */
function doGet(e) {
  const type = e && e.parameter && e.parameter.type;
  if (type !== 'performances') return text_('my Live endpoint: alive');
  const cache = CacheService.getScriptCache();
  const hit = cache.get('performances');
  if (hit) return json_(hit);
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_KOPIS);
  const out = { source: 'KOPIS API', updatedAt: PropertiesService.getScriptProperties().getProperty('KOPIS_UPDATED') || '', performances: [] };
  if (sh && sh.getLastRow() > 1) {
    const v = sh.getDataRange().getValues(); const h = v.shift();
    const ix = n => h.indexOf(n);
    out.performances = v.map(r => ({
      id: r[ix('id')], title: r[ix('title')], date: fmtDate_(r[ix('date')]), endDate: fmtDate_(r[ix('endDate')]),
      venue: r[ix('venue')], region: r[ix('region')], state: r[ix('state')],
      artists: String(r[ix('artists')] || '').split(',').map(s => s.trim()).filter(Boolean),
      artistSource: r[ix('artists')] ? 'kopis' : 'none',
      ticketLinks: safeJson_(r[ix('ticketLinks')], [])
    }));
  }
  const body = JSON.stringify(out);
  if (body.length < 95000) cache.put('performances', body, 600);
  return json_(body);
}

/* ===================== 3. KOPIS 수집 ===================== */
function syncKopis() {
  const key = PropertiesService.getScriptProperties().getProperty('KOPIS_KEY');
  if (!key) throw new Error('스크립트 속성에 KOPIS_KEY가 없습니다.');
  const tz = 'Asia/Seoul';
  const today = new Date();
  const list = new Map();
  for (let off = 0; off < KOPIS.daysAhead; off += KOPIS.windowDays) {
    const st = new Date(today.getTime() + off * 864e5);
    const ed = new Date(today.getTime() + Math.min(off + KOPIS.windowDays - 1, KOPIS.daysAhead) * 864e5);
    for (let page = 1; page < 50; page++) {
      const url = `${KOPIS.base}?service=${encodeURIComponent(key)}&stdate=${Utilities.formatDate(st, tz, 'yyyyMMdd')}&eddate=${Utilities.formatDate(ed, tz, 'yyyyMMdd')}&cpage=${page}&rows=${KOPIS.rows}&shcate=${KOPIS.genre}`;
      const items = fetchDbs_(url);
      items.forEach(db => {
        const id = val_(db, 'mt20id'); if (!id) return;
        list.set(id, {
          id, title: val_(db, 'prfnm'), date: kopisDate_(val_(db, 'prfpdfrom')), endDate: kopisDate_(val_(db, 'prfpdto')),
          venue: val_(db, 'fcltynm'), region: val_(db, 'area'), state: val_(db, 'prfstate')
        });
      });
      if (items.length < KOPIS.rows) break;
    }
  }

  // 이전 수집본의 상세(출연진·예매처)는 재사용 → 새 공연만 상세 호출
  const sh = sheet_(SHEET_KOPIS, ['id', 'title', 'date', 'endDate', 'venue', 'region', 'state', 'artists', 'ticketLinks', 'detailAt']);
  const prev = new Map();
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, 10).getValues().forEach(r => prev.set(String(r[0]), { artists: r[7], ticketLinks: r[8], detailAt: r[9] }));
  let calls = 0;
  const rows = [...list.values()].sort((a, b) => a.date.localeCompare(b.date)).map(p => {
    let d = prev.get(p.id);
    if ((!d || !d.detailAt) && calls < KOPIS.maxDetailPerRun) {
      calls++;
      try {
        const db = fetchDbs_(`${KOPIS.base}/${encodeURIComponent(p.id)}?service=${encodeURIComponent(key)}`)[0];
        const cast = db ? val_(db, 'prfcast').replace(/\s*등\s*$/, '') : '';
        const links = db ? relates_(db) : [];
        d = { artists: cast, ticketLinks: JSON.stringify(links), detailAt: new Date() };
      } catch (err) { d = { artists: '', ticketLinks: '[]', detailAt: '' }; }
    }
    d = d || { artists: '', ticketLinks: '[]', detailAt: '' };
    return [p.id, p.title, p.date, p.endDate, p.venue, p.region, p.state, d.artists, d.ticketLinks, d.detailAt];
  });
  sh.getRange(2, 1, Math.max(sh.getLastRow() - 1, 1), 10).clearContent();
  if (rows.length) sh.getRange(2, 1, rows.length, 10).setValues(rows);
  PropertiesService.getScriptProperties().setProperty('KOPIS_UPDATED', Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HH:mm'));
  CacheService.getScriptCache().remove('performances');
  Logger.log(`KOPIS ${rows.length}건 저장, 상세 호출 ${calls}건`);
}

function installTriggers() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'syncKopis').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('syncKopis').timeBased().everyDays(1).atHour(6).inTimezone('Asia/Seoul').create();
}

/* ===================== 4. 요약표 ===================== */
/** 오픈 공지별 캘린더 추가·보고싶어요·예매 클릭, 배지 획득 현황을 summary 시트에 */
function buildSummary() {
  const v = sheet_(SHEET_EVENTS, COLS).getDataRange().getValues(); const h = v.shift();
  const ix = n => h.indexOf(n);
  const uniq = (ev, item) => new Set(v.filter(r => r[ix('event')] === ev && (item === undefined || r[ix('item')] === item)).map(r => r[ix('vid')])).size;
  const items = [...new Set(v.filter(r => ['calendar_add', 'opening_click', 'calendar_open'].indexOf(r[ix('event')]) >= 0).map(r => r[ix('item')]))];
  const out = [['구분', '항목', '고유 방문자']];
  ['visit', 'calendar_add', 'planned_add', 'attended_add', 'artist_interest', 'badge_earned', 'share_done', 'save_click', 'auth_view', 'signup_attempt', 'login_attempt'].forEach(ev => out.push(['전체', ev, uniq(ev)]));
  items.forEach(it => {
    out.push(['오픈 공지 ' + it, '캘린더 추가', uniq('calendar_add', it)]);
    out.push(['오픈 공지 ' + it, '예매처 클릭', uniq('opening_click', it)]);
  });
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sum = ss.getSheetByName(SHEET_SUMMARY) || ss.insertSheet(SHEET_SUMMARY);
  sum.clearContents(); sum.getRange(1, 1, out.length, 3).setValues(out);
  sum.getRange(out.length + 2, 1).setValue('고유 방문자(익명 vid) 기준 · 갱신 ' + new Date());
}

/* ===================== 보조 ===================== */
function fetchDbs_(url) {
  const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw new Error('KOPIS ' + res.getResponseCode());
  const root = XmlService.parse(res.getContentText('UTF-8')).getRootElement(); // <dbs>
  return root.getChildren('db');
}
function val_(el, name) { const c = el.getChild(name); return c ? String(c.getText() || '').trim() : ''; }
function relates_(db) {
  const r = db.getChild('relates'); if (!r) return [];
  return r.getChildren('relate').map(x => ({ name: val_(x, 'relatenm'), url: val_(x, 'relateurl') })).filter(x => /^https?:\/\//.test(x.url));
}
function kopisDate_(s) { return String(s || '').replace(/\./g, '-').slice(0, 10); }
function fmtDate_(v) { return v instanceof Date ? Utilities.formatDate(v, 'Asia/Seoul', 'yyyy-MM-dd') : String(v || '').slice(0, 10); }
function safeJson_(s, d) { try { return JSON.parse(s); } catch (e) { return d; } }
function sheet_(name, head) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) { sh = ss.insertSheet(name); sh.appendRow(head); sh.setFrozenRows(1); }
  return sh;
}
function clean_(v) { const s = String(v === undefined || v === null ? '' : v).slice(0, 200); return /^[=+\-@]/.test(s) ? "'" + s : s; }
function text_(t) { return ContentService.createTextOutput(t).setMimeType(ContentService.MimeType.TEXT); }
function json_(s) { return ContentService.createTextOutput(s).setMimeType(ContentService.MimeType.JSON); }
