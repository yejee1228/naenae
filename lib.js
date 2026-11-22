/* my Live. MVP 0.5 — 순수 함수 모음 (DOM 없음, tools/check.mjs에서 단위 검증) */
(function (root) {
  'use strict';
  const KST = 'Asia/Seoul';
  const pad = n => String(n).padStart(2, '0');

  const esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

  /** http/https 링크만 허용 (javascript: 등 차단) */
  function safeURL(v) {
    try {
      const u = new URL(String(v || '').trim());
      return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null;
    } catch { return null; }
  }

  /** Date → 'YYYY-MM-DD' (한국 시간 기준) */
  const kstDay = d => new Intl.DateTimeFormat('sv-SE', { timeZone: KST, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);

  function dayDiff(a, b) {
    const p = s => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };
    return Math.round((p(b) - p(a)) / 86400000);
  }

  /**
   * 날짜·시간 문자열을 한국 시간으로 해석.
   * 허용: '2026-11-03 20:00', '2026.11.03 20:00', '2026/11/3', ISO(+09:00 또는 Z 포함)
   */
  function parseKST(v) {
    const s = String(v ?? '').trim();
    if (!s) return { date: null, hasTime: false };
    if (/T\d/.test(s) && /([zZ]|[+-]\d{2}:?\d{2})$/.test(s)) {
      const d = new Date(s);
      return { date: isNaN(d) ? null : d, hasTime: true };
    }
    const m = s.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})(?:[ T]+(\d{1,2}):(\d{2}))?/);
    if (!m) return { date: null, hasTime: false };
    const [, y, mo, d, h, mi] = m;
    const hasTime = h !== undefined;
    const dt = new Date(`${y}-${pad(mo)}-${pad(d)}T${hasTime ? pad(h) : '00'}:${hasTime ? mi : '00'}:00+09:00`);
    return { date: isNaN(dt) ? null : dt, hasTime };
  }

  const normDate = v => { const r = parseKST(v); return r.date ? kstDay(r.date) : ''; };

  const WD_KO = ['일', '월', '화', '수', '목', '금', '토'];
  const WD_EN = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  const weekday = ymd => { const [y, m, d] = ymd.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); };

  const fmtTime = d => new Intl.DateTimeFormat('en-GB', { timeZone: KST, hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
  /** '11월 27일(금)' */
  function fmtDayKo(ymd) {
    if (!ymd) return '';
    const [, m, d] = ymd.split('-').map(Number);
    return `${m}월 ${d}일(${WD_KO[weekday(ymd)]})`;
  }
  /** 인증샷용 '2026.11.27 FRI' */
  function fmtStampDate(ymd) {
    if (!ymd) return '';
    return `${ymd.replace(/-/g, '.')} ${WD_EN[weekday(ymd)]}`;
  }
  function fmtOpen(o) {
    if (!o.openAt) return '미정';
    const day = fmtDayKo(kstDay(o.openAt));
    return o.openHasTime ? `${day} ${fmtTime(o.openAt)}` : day;
  }

  function splitArtists(v) {
    if (Array.isArray(v)) return v.map(x => String(x).trim()).filter(Boolean);
    return String(v || '').split(/[,·/]/).map(x => x.trim()).filter(Boolean);
  }

  /** 구글 시트 한글 머리글 → 내부 필드명 */
  const HEADER_ALIASES = {
    'id': 'id', 'ID': 'id', '번호': 'id',
    'title': 'title', '공연명': 'title',
    'artists': 'artists', '아티스트': 'artists', '출연': 'artists',
    'venue': 'venue', '공연장': 'venue',
    'showDate': 'showDate', '공연일': 'showDate', '공연날짜': 'showDate',
    'openAt': 'openAt', '티켓오픈': 'openAt', '오픈일시': 'openAt', '티켓 오픈': 'openAt',
    'ticketUrl': 'ticketUrl', '예매링크': 'ticketUrl', '예매 링크': 'ticketUrl',
    'vendor': 'vendor', '예매처': 'vendor',
    'note': 'note', '메모': 'note', '안내': 'note',
    'publish': 'publish', '게시': 'publish',
    'sample': 'sample', '예시': 'sample',
    'kopisId': 'kopisId', 'KOPIS ID': 'kopisId', 'KOPIS': 'kopisId'
  };

  /** 공연 오픈 소식 1건 정리. 공연명이 없거나 게시=N이면 null */
  function normalizeOpening(raw, i) {
    if (!raw || typeof raw !== 'object') return null;
    const title = String(raw.title || '').trim();
    if (!title) return null;
    const pub = String(raw.publish ?? 'Y').trim().toUpperCase();
    if (['N', 'NO', '0', 'FALSE', 'X'].includes(pub)) return null;
    const open = parseKST(raw.openAt);
    return {
      id: (String(raw.id || '').trim() || 'o' + ((i || 0) + 1)).slice(0, 60),
      title: title.slice(0, 120),
      artists: splitArtists(raw.artists),
      venue: String(raw.venue || '').trim(),
      showDate: normDate(raw.showDate),
      openAt: open.date,
      openHasTime: open.hasTime,
      ticketUrl: safeURL(raw.ticketUrl),
      vendor: String(raw.vendor || '').trim(),
      note: String(raw.note || '').trim().slice(0, 200),
      kopisId: String(raw.kopisId || '').trim().slice(0, 40),
      sample: raw.sample === true || ['Y', 'TRUE', '1'].includes(String(raw.sample ?? '').trim().toUpperCase())
    };
  }

  /** 상태: soon(오픈 예정) → open(예매 중) → tba(오픈일 미정), 공연일 지난 건 past */
  function openingStatus(o, now = new Date()) {
    const today = kstDay(now);
    if (o.showDate && o.showDate < today) return { key: 'past', label: '지난 공연', rank: 9 };
    if (!o.openAt) return { key: 'tba', label: '오픈일 미정', rank: 3 };
    if (now < o.openAt) {
      const d = dayDiff(today, kstDay(o.openAt));
      const t = o.openHasTime ? ' ' + fmtTime(o.openAt) : '';
      const label = d === 0 ? `오늘${t} 오픈` : d === 1 ? `내일${t} 오픈` : `D-${d}`;
      return { key: 'soon', label, rank: 1, d };
    }
    return { key: 'open', label: '예매 중', rank: 2 };
  }

  function sortOpenings(list, now = new Date()) {
    return list
      .map(o => ({ ...o, status: openingStatus(o, now) }))
      .filter(o => o.status.key !== 'past')
      .sort((a, b) => a.status.rank - b.status.rank
        || (a.status.key === 'soon' ? a.openAt - b.openAt : (a.showDate || '9999').localeCompare(b.showDate || '9999'))
        || a.title.localeCompare(b.title, 'ko'));
  }

  /** RFC 4180 수준 CSV 파서 (따옴표·줄바꿈·"" 이스케이프) */
  function parseCSV(text) {
    const rows = []; let row = []; let cell = ''; let q = false;
    const s = String(text || '').replace(/^﻿/, '');
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (q) {
        if (c === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; }
        else cell += c;
      } else if (c === '"') q = true;
      else if (c === ',') { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && s[i + 1] === '\n') i++;
        row.push(cell); rows.push(row); row = []; cell = '';
      } else cell += c;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows;
  }

  function csvToObjects(text) {
    const rows = parseCSV(text).filter(r => r.some(c => String(c).trim() !== ''));
    if (!rows.length) return [];
    const head = rows[0].map(h => HEADER_ALIASES[h.trim()] || h.trim());
    return rows.slice(1).map(r => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
  }

  function normalizeShow(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const id = String(raw.id || '').trim();
    const title = String(raw.title || '').trim();
    if (!id || !title) return null;
    return {
      id, title,
      date: normDate(raw.date),
      venue: String(raw.venue || '').trim(),
      artists: splitArtists(raw.artists),
      todo: String(raw.todo || '').trim()
    };
  }

  /* ---------- 날짜 보조 ---------- */
  function addDays(ymd, n) {
    const [y, m, d] = ymd.split('-').map(Number);
    const t = new Date(Date.UTC(y, m - 1, d + n));
    return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
  }
  /** 'YYYY-MM' 달력: 6주 x 7일 셀 (일요일 시작) */
  function monthGrid(ym) {
    const [y, m] = ym.split('-').map(Number);
    const first = `${y}-${pad(m)}-01`;
    const start = addDays(first, -weekday(first));
    return Array.from({ length: 42 }, (_, i) => { const d = addDays(start, i); return { ymd: d, inMonth: d.slice(0, 7) === ym }; });
  }
  function shiftMonth(ym, n) {
    const [y, m] = ym.split('-').map(Number);
    const t = new Date(Date.UTC(y, m - 1 + n, 1));
    return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}`;
  }

  /* ---------- 캘린더 연동 (구글 캘린더 링크 · .ics 파일) ---------- */
  /** 티켓 오픈 공지 → 일정. 오픈 일시가 없으면 null. 시간이 있으면 30분 일정, 없으면 종일 일정 */
  function openingEvent(o) {
    if (!o || !o.openAt) return null;
    const details = [
      o.artists && o.artists.length ? o.artists.join(' · ') : '',
      o.showDate ? '공연 ' + fmtDayKo(o.showDate) + (o.venue ? ' · ' + o.venue : '') : o.venue,
      o.vendor ? '예매처 ' + o.vendor : '',
      o.ticketUrl || '',
      'my Live. 에서 추가한 일정'
    ].filter(Boolean).join('\n');
    const base = { uid: `${o.id}@mylive`, title: `[티켓 오픈] ${o.title}`, details, url: o.ticketUrl || '', location: o.vendor || '' };
    if (o.openHasTime) return { ...base, allDay: false, start: o.openAt, end: new Date(o.openAt.getTime() + 30 * 60000) };
    const day = kstDay(o.openAt);
    return { ...base, allDay: true, startDay: day, endDay: addDays(day, 1) };
  }
  const icsStamp = d => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  function googleCalendarUrl(ev) {
    const dates = ev.allDay ? `${ev.startDay.replace(/-/g, '')}/${ev.endDay.replace(/-/g, '')}` : `${icsStamp(ev.start)}/${icsStamp(ev.end)}`;
    const q = new URLSearchParams({ action: 'TEMPLATE', text: ev.title, dates, details: ev.details, location: ev.location || '', ctz: KST });
    return 'https://calendar.google.com/calendar/render?' + q.toString();
  }
  const icsEsc = s => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  /** RFC 5545: 한 줄 75바이트 넘으면 접기 (UTF-8 글자 중간에서 자르지 않음) */
  function icsFold(line) {
    const out = []; let cur = ''; let bytes = 0;
    for (const ch of line) {
      const b = unescape(encodeURIComponent(ch)).length;
      if (bytes + b > (out.length ? 74 : 75)) { out.push(cur); cur = ''; bytes = 0; }
      cur += ch; bytes += b;
    }
    out.push(cur);
    return out.join('\r\n ');
  }
  function icsText(ev, now = new Date()) {
    const L = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//my Live//MVP 0.5//KO', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
      'BEGIN:VEVENT', `UID:${ev.uid}`, `DTSTAMP:${icsStamp(now)}`,
      ev.allDay ? `DTSTART;VALUE=DATE:${ev.startDay.replace(/-/g, '')}` : `DTSTART:${icsStamp(ev.start)}`,
      ev.allDay ? `DTEND;VALUE=DATE:${ev.endDay.replace(/-/g, '')}` : `DTEND:${icsStamp(ev.end)}`,
      `SUMMARY:${icsEsc(ev.title)}`, `DESCRIPTION:${icsEsc(ev.details)}`
    ];
    if (ev.url) L.push(`URL:${ev.url}`);
    if (ev.location) L.push(`LOCATION:${icsEsc(ev.location)}`);
    // 알림: 시간 있는 오픈은 30분 전, 종일은 당일 오전 9시
    L.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsEsc(ev.title)}`, ev.allDay ? 'TRIGGER:PT9H' : 'TRIGGER:-PT30M', 'END:VALARM');
    L.push('END:VEVENT', 'END:VCALENDAR');
    return L.map(icsFold).join('\r\n') + '\r\n';
  }

  /* ---------- 공연 일정 (KOPIS) ---------- */
  function normalizePerformance(p) {
    if (!p || !p.id || !p.title) return null;
    const date = normDate(p.date);
    if (!date) return null;
    return {
      id: String(p.id).slice(0, 40),
      title: String(p.title).trim(),
      date, endDate: normDate(p.endDate) || date,
      venue: String(p.venue || '').trim(),
      region: String(p.region || '').trim(),
      seats: String(p.seats || '').trim(),
      artists: splitArtists(p.artists),
      artistSource: p.artistSource === 'kopis' ? 'kopis' : 'title',
      state: String(p.state || '').trim(),
      ticketLinks: (Array.isArray(p.ticketLinks) ? p.ticketLinks : [])
        .map(t => ({ name: String(t.name || '예매처').trim(), url: safeURL(t.url) })).filter(t => t.url)
    };
  }
  /** 공연장 이름에 목록 중 하나가 포함되면 true (띄어쓰기·대소문자 무시) */
  function matchVenue(venue, list) {
    const c = s => String(s || '').toLowerCase().replace(/\s+/g, '');
    const v = c(venue);
    return (list || []).some(x => c(x) && v.includes(c(x)));
  }

  /* ---------- 취향 배지 ----------
   * 매월 갱신: 그 달의 기록만으로 계산 (scope 'month', period 'YYYY-MM')
   * 연말 결산: 12개월 기록으로 '올해의 배지' 5칸 (scope 'year', period 'YYYY') — 12월 1일부터 공개
   * 자리 5칸: 대표 · 단골 · 찐팬 · 원정러(지방 공연이 많으면 장거리 원정러) · 관람완료 N회
   * 기록 데이터에서 실제로 확인되는 패턴만 배지로 줍니다 (추측성 '취향' 판정은 하지 않음).
   */
  const BADGE_THRESHOLD = 3;
  const BADGE_RULES = {
    //        대표(기록 합계) 단골(같은 공연장) 찐팬(같은 아티스트 관람) 원정러(지방 공연 | 지역 수) 장거리 원정러(지방 공연) 라이브(관람 횟수)
    month: { primary: 3, venue: 2, fan: 2, local: 1, regions: 3, proLocal: 3, lives: 3 },
    year:  { primary: 3, venue: 3, fan: 3, local: 2, regions: 3, proLocal: 5, lives: 12 }
  };
  const METRO = ['서울', '경기', '인천'];
  /** 지방 공연 = 서울·경기·인천 이외 지역 (KOPIS 지역명 기준, 앞글자 비교) */
  const isLocalRegion = region => { const r = String(region || '').trim(); return !!r && !METRO.some(m => r.startsWith(m)); };
  /* 대표 배지 4유형 — 세 가지 기록(관람 완료 · 관심 아티스트 · 보고 싶은 공연)의 비율로 결정 */
  const BADGES = {
    'all-rounder': { name: '라이브 올라운더', emoji: '🌈', color: '#b79ad0', desc: '보고, 찾고, 직접 가는 것까지 골고루 하는 사람' },
    'live-goer': { name: '프로직관러', emoji: '🔥', color: '#f0a07a', desc: '담아두기보다 직접 공연장에 가는 사람' },
    'digger': { name: '아티스트 디거', emoji: '🔍', color: '#93aee0', desc: '새로운 아티스트를 먼저 찾아내는 사람' },
    'radar': { name: '예매 레이더', emoji: '📡', color: '#c4a7e7', desc: '오픈 소식을 누구보다 먼저 챙기는 사람' }
  };
  /* 배지 5개 컨셉 — 각 배지가 무엇을(축) 어떤 기록으로(재료) 보여주는지 */
  const BADGE_CONCEPTS = [
    { slot: 'primary', axis: '유형', title: '대표 배지', q: '나는 어떤 관객일까?', source: '관람 완료 · 관심 아티스트 · 보고 싶은 공연의 비율', emoji: '🌈' },
    { slot: 'venue', axis: '공간', title: '단골', q: '어디에 자주 가나?', source: '관람 완료 · 보고 싶은 공연의 공연장', emoji: '💡', color: '#f3d27a' },
    { slot: 'fan', axis: '사람', title: '찐팬', q: '누구를 계속 보러 가나?', source: '관람 완료한 공연의 아티스트', emoji: '💜', color: '#e7b4d3' },
    { slot: 'travel', axis: '거리', title: '원정러 → 장거리 원정러', q: '얼마나 멀리 가나?', source: '관람 완료 · 보고 싶은 공연의 지역 (서울·경기·인천 외 = 지방)', emoji: '🚌', proEmoji: '🚄', color: '#9fd3df', proColor: '#6bb8cc' },
    { slot: 'lives', axis: '횟수', title: '관람완료 N회', q: '얼마나 자주 가나?', source: '그 기간에 본 공연 수 (관람했어요 + 직접 기록한 관람 완료)', emoji: '🎤', color: '#f2b58c' }
  ];
  const conceptOf = slot => BADGE_CONCEPTS.find(c => c.slot === slot);
  /** 기록이 속한 날짜: 관람 완료는 관람일, 보고 싶은 공연·관심 아티스트는 담은 날 */
  function activityDay(item, kind) {
    if (kind === 'attended') return item.date || '';
    const t = item.createdAt ? new Date(item.createdAt) : null;
    return t && !isNaN(t) ? kstDay(t) : (item.date || '');
  }
  /** 기간 필터: scope 'month' → 'YYYY-MM', 'year' → 'YYYY', 'all' → 전체 */
  function inPeriod(day, scope, period) {
    if (scope === 'all' || !scope) return true;
    return !!day && day.startsWith(period);
  }
  function computeBadges(records, interests, scope = 'all', period = '') {
    const R = BADGE_RULES[scope === 'year' ? 'year' : 'month'];
    const all = Array.isArray(records) ? records : [];
    const arts = (Array.isArray(interests) ? interests : []).filter(a => inPeriod(activityDay(a, 'artist'), scope, period));
    const rec = all.filter(r => inPeriod(activityDay(r, r.type), scope, period));
    const planned = rec.filter(r => r.type === 'planned');
    const attended = rec.filter(r => r.type === 'attended');
    const counts = { planned: planned.length, attended: attended.length, artists: arts.length };
    const total = counts.planned + counts.attended + counts.artists;
    const res = { scope, period, rules: R, total, threshold: R.primary, remaining: Math.max(0, R.primary - total), counts, primary: null, extras: [] };
    if (total >= R.primary) {
      const vals = [counts.attended, counts.artists, counts.planned];
      let key;
      if (vals.every(v => v >= 1) && Math.max(...vals) - Math.min(...vals) <= 1) key = 'all-rounder';
      else {
        const max = Math.max(...vals);
        key = counts.attended === max ? 'live-goer' : counts.artists === max ? 'digger' : 'radar'; // 동점이면 관람 > 아티스트 > 보고싶어요
      }
      res.primary = { id: key, ...BADGES[key] };
    }
    const tally = arr => arr.reduce((m, k) => (k && m.set(k, (m.get(k) || 0) + 1), m), new Map());
    const top = m => [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ko'))[0];
    const v = top(tally(rec.map(r => String(r.venue || '').trim())));
    if (v && v[1] >= R.venue) res.extras.push({ id: 'venue', emoji: '💡', color: conceptOf('venue').color, name: `${v[0]} 단골`, desc: `${v[0]} 기록 ${v[1]}회` });
    const a = top(tally(attended.flatMap(r => [...new Set(r.artists || [])])));
    if (a && a[1] >= R.fan) res.extras.push({ id: 'fan', emoji: '💜', color: conceptOf('fan').color, name: `${a[0]} 찐팬`, desc: `${a[0]} 공연 관람 ${a[1]}회` });
    const local = rec.filter(r => isLocalRegion(r.region)).length;
    const regions = new Set(rec.map(r => r.region).filter(Boolean)).size;
    if (local >= R.proLocal) res.extras.push({ id: 'travel', level: 'pro', emoji: '🚄', color: conceptOf('travel').proColor, name: '장거리 원정러', desc: `지방 공연 ${local}회 기록` });
    else if (local >= R.local || regions >= R.regions) res.extras.push({ id: 'travel', level: 'basic', emoji: '🚌', color: conceptOf('travel').color, name: '원정러', desc: local ? `지방 공연 ${local}회 기록` : `${regions}개 지역 공연 기록` });
    if (counts.attended >= R.lives) res.extras.push({ id: 'lives', emoji: '🎤', color: conceptOf('lives').color, name: `관람완료 ${counts.attended}회`, desc: `관람 완료 ${counts.attended}회` });
    res.earned = (res.primary ? 1 : 0) + res.extras.length;
    return res;
  }
  /** 연말 결산 공개 여부: 해당 연도 12월 1일 이후 */
  const yearRevealed = (year, todayYmd) => todayYmd >= `${year}-12-01`;

  root.MyLiveLib = {
    KST, esc, safeURL, kstDay, dayDiff, parseKST, normDate, fmtTime, fmtDayKo, fmtStampDate, fmtOpen,
    splitArtists, normalizeOpening, openingStatus, sortOpenings, parseCSV, csvToObjects, normalizeShow, HEADER_ALIASES,
    addDays, monthGrid, shiftMonth, weekday, openingEvent, googleCalendarUrl, icsText, icsFold,
    normalizePerformance, matchVenue, computeBadges, BADGES, BADGE_CONCEPTS, BADGE_THRESHOLD, BADGE_RULES, isLocalRegion, activityDay, yearRevealed
  };
})(typeof window !== 'undefined' ? window : globalThis);
