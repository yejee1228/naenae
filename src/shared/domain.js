// 내내(nae nae) 베타 — 화면·서버·도구가 함께 쓰는 순수 함수 (DOM·네트워크 없음, tools/check.mjs 단위 검증)

/* ---------- 이름 비교 (R-37) ---------- */
export const nameKey = s => String(s ?? '').normalize('NFKC').toLowerCase().replace(/\s+/g, '');

/* ---------- 지역 (10_KOPIS_확인결과 §8) ---------- */
export const REGION_SHORT = {
  서울특별시: '서울', 경기도: '경기', 인천광역시: '인천', 부산광역시: '부산', 대구광역시: '대구', 광주광역시: '광주', 대전광역시: '대전',
  울산광역시: '울산', 세종특별자치시: '세종', 강원도: '강원', 강원특별자치도: '강원', 충청북도: '충북', 충청남도: '충남',
  전라북도: '전북', 전북특별자치도: '전북', 전라남도: '전남', 전남광주통합특별시: '전남광주', 경상북도: '경북', 경상남도: '경남',
  제주도: '제주', 제주특별자치도: '제주'
};
export const shortRegion = a => REGION_SHORT[String(a ?? '').trim()] || String(a ?? '').trim();
export const REGIONS = ['서울', '경기', '인천', '강원', '대전', '세종', '충북', '충남', '광주', '전남광주', '전북', '전남', '대구', '부산', '울산', '경북', '경남', '제주'];

/* ---------- 공연명에서 아티스트 뽑기 (R-22, 결정 29) ----------
 * KOPIS 출연진은 멤버 실명이라 쓰지 않고 공연명에서 뽑는다. 못 뽑으면 빈 배열 → 운영자가 보정.
 */
const KEYWORDS = '단독|정규|첫|데뷔|\\d+주년|연말|송년|겨울|여름|봄|가을|크리스마스|앨범|EP|싱글|콘서트|공연|쇼케이스|팬미팅|투어|CONCERT|Concert|concert|LIVE|Live|TOUR|Tour|SHOWCASE|Showcase|FAN\\s?CONCERT|Christmas|CHRISTMAS|Special|SPECIAL';
const GENERIC = new Set(['christmas', '크리스마스', 'special', '송년', '연말', '겨울', 'live', 'concert', '콘서트', '공연', '토요콘서트', '밴드특집']);
const splitNames = s => String(s).split(/\s+(?:X|x|×|&|and|with|feat\.?|ft\.?)\s+/).map(cleanName).filter(Boolean);
function cleanName(s) {
  let n = String(s).replace(/^.*\bVol\.?\s*\d+\s*/i, '').replace(/\s+at\s+.*$/i, '').replace(/\s+(\d+(st|nd|rd|th)?|vol\.?\s*\d+)$/i, '').trim();
  n = n.replace(/\s+(X|x|×|&)$/, '').replace(/^[,:\-·\s]+|[,:\-·\s!]+$/g, '');
  const w = n.split(' ');
  if (w.length > 1 && /^[A-Z0-9]{2,}$/.test(w[0]) && /[a-z]/.test(w.slice(1).join(''))) n = w[0]; // 'NEMESIS Nightfall to …' → 'NEMESIS'
  if (!n || n.length > 30 || /^\d+$/.test(n) || GENERIC.has(nameKey(n))) return '';
  return n;
}
export function extractArtists(title) {
  const t = String(title ?? '').replace(/\[[^\]]*\]/g, ' ').replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t) return [];
  const colon = t.indexOf(':');
  const head = colon >= 0 ? t.slice(0, colon).trim() : t;
  const tail = colon >= 0 ? t.slice(colon + 1).trim() : '';
  const comma = head.lastIndexOf(',');
  const seg = (comma >= 0 ? head.slice(comma + 1) : head).trim();
  const out = [];
  const kw = new RegExp(`^(.+?)\\s+(?:${KEYWORDS})`);
  const m = seg.match(kw) || (comma >= 0 ? head.match(kw) : null);
  if (m) out.push(...splitNames(m[1].split(',')[0]));
  else if (/\s(X|x|×|&)\s/.test(seg) || /\s+at\s+/i.test(seg)) out.push(...splitNames(seg));
  else if (comma >= 0 && seg.split(' ').length <= 2) out.push(cleanName(seg));        // '시리즈명, 아티스트'
  else if (colon >= 0 && !seg.includes(' ') && /^[A-Za-z0-9.\-]+$/.test(seg)) out.push(cleanName(seg)); // 'JOVYNN: …'
  else if (colon < 0 && !t.includes(' ')) out.push(cleanName(t));                     // '라라라온'
  if (!out.filter(Boolean).length && tail && /\s(X|x|×|&)\s/.test(tail)) out.push(...splitNames(tail));
  return [...new Set(out.filter(Boolean))];
}

/* 관심 아티스트가 이 공연·공지에 나오는지: 공연명 + 아티스트 + KOPIS 출연진 (R-37) */
export function matchesArtist(name, item) {
  const k = nameKey(name);
  if (k.length < 2 || !item) return false;
  if ((item.artists || []).some(a => nameKey(a) === k)) return true;
  if (nameKey(item.title).includes(k)) return true;
  return String(item.castRaw || '').split(/\s*,\s*/).some(c => nameKey(c) === k);
}
export const matchedArtists = (interests, item) => (interests || []).map(i => i.name).filter(n => matchesArtist(n, item));

/* ---------- 날짜 ---------- */
export const kstToday = (d = new Date()) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(d);
export function addDays(ymd, n) {
  const [y, m, d] = ymd.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}
export const dayDiff = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 864e5);

/* ---------- 이벤트 상태 (R-81·84) ---------- */
export function eventStatus(p, today = kstToday()) {
  if (p.startDate && today < p.startDate) return { key: 'soon', label: '예정', rank: 2 };
  if (p.endDate && today > p.endDate) return { key: 'tba', label: '종료', rank: 3, past: true };
  const d = p.endDate ? dayDiff(today, p.endDate) : null;
  return { key: 'open', label: d === 0 ? '오늘 마감' : d != null ? `진행 중 · D-${d}` : '진행 중', rank: 1, d };
}
export const sortEvents = (list, today) => list.map(p => ({ p, st: eventStatus(p, today) }))
  .sort((a, b) => a.st.rank - b.st.rank || (a.st.rank === 1 ? (a.p.endDate || '').localeCompare(b.p.endDate || '') : (a.p.startDate || '').localeCompare(b.p.startDate || '')));

/* ---------- 추천 (R-50~53) ---------- */
const matchVenue = (venue, list) => { const v = nameKey(venue); return (list || []).some(x => nameKey(x) && v.includes(nameKey(x))); };
export function recommendSections(perfs, records, interests, clubVenues, today = kstToday(), opts = {}) {
  const { days = 30, max = 5 } = opts;
  const recs = (records || []).filter(r => !r.deletedAt);
  const taken = new Set(recs.map(r => r.performanceId).filter(Boolean));
  const until = addDays(today, days);
  const pool = (perfs || []).filter(p => !p.hidden && p.endDate >= today && p.startDate <= until && !taken.has(p.id))
    .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.title.localeCompare(b.title, 'ko'));
  const used = new Set();
  const pick = (fn) => { const out = []; for (const p of pool) { if (out.length >= max || used.has(p.id)) continue; const reason = fn(p); if (reason) { out.push({ perf: p, reason }); used.add(p.id); } } return out; };
  const fav = pick(p => { const n = matchedArtists(interests, p)[0]; return n ? `관심 아티스트 ${n} 출연` : ''; });
  const venueCount = new Map();
  recs.forEach(r => { const k = nameKey(r.venue); if (k) venueCount.set(k, (venueCount.get(k) || 0) + 1); });
  const venue = pick(p => { const c = venueCount.get(nameKey(p.venue)); return c ? (c > 1 ? `자주 가는 공연장 (${c}회)` : '다녀온 공연장') : ''; });
  const weekEnd = addDays(today, 6);
  const club = pick(p => (p.startDate <= weekEnd && matchVenue(p.venue, clubVenues) ? '라이브클럽' : ''));
  return { fav, venue, club };
}

/* ---------- 취향 육각형 (R-54~58, 결정 9·18) ---------- */
export const HEX_AXES = [
  { key: 'attend', name: '관람', q: '얼마나 자주 가나' },
  { key: 'plan', name: '기대', q: '얼마나 많이 챙겨 두나' },
  { key: 'explore', name: '탐색', q: '얼마나 많은 아티스트를 찾나' },
  { key: 'regular', name: '단골', q: '같은 곳에 다시 가나' },
  { key: 'travel', name: '원정', q: '얼마나 멀리 가나' },
  { key: 'variety', name: '다양성', q: '얼마나 넓게 보나' }
];
const METRO = ['서울', '경기', '인천'];
const pct = (v, full) => Math.max(0, Math.min(100, Math.round((v / full) * 100)));
export function hexagon(records, interests) {
  const recs = (records || []).filter(r => !r.deletedAt);
  const att = recs.filter(r => r.type === 'attended'); const pl = recs.filter(r => r.type === 'planned');
  const venues = new Map(); att.forEach(r => { const k = nameKey(r.venue); if (k) venues.set(k, (venues.get(k) || 0) + 1); });
  const maxSame = Math.max(0, ...venues.values());
  const local = att.filter(r => r.region && !METRO.some(m => String(r.region).startsWith(m))).length;
  const distinct = new Set([...att.flatMap(r => (r.artists || []).map(nameKey)), ...venues.keys()]).size;
  const values = {
    attend: pct(att.length, 12), plan: pct(pl.length, 12), explore: pct((interests || []).length, 15),
    regular: maxSame > 1 ? pct(maxSame - 1, 4) : 0, travel: att.length ? pct(local, att.length) : 0, variety: pct(distinct, 15)
  };
  const empty = Object.values(values).every(v => v === 0);
  const top = HEX_AXES.map(a => ({ ...a, v: values[a.key] })).filter(a => a.v > 0).sort((a, b) => b.v - a.v).slice(0, 2);
  return { values, empty, top };
}
export const hexSummary = (hex, badgeName) => {
  if (hex.empty || !hex.top.length) return '';
  const axes = hex.top.map(a => a.name).join(' · ');
  return badgeName ? `${axes}이 높은 ${badgeName} 타입이에요` : `${axes}이 높아요`;
};

/* ---------- 제보 (R-71) ---------- */
export const REPORT_STATUS = {
  submitted: { label: '제보 완료', badge: 'tba', line: '운영자 확인을 기다리고 있어요.' },
  reviewing: { label: '확인 중', badge: 'soon', line: '운영자가 확인하고 있어요.' },
  registered: { label: '등록 완료', badge: 'open', line: '' },
  rejected: { label: '등록 실패', badge: 'fail', line: '등록하지 못했어요.' },
  canceled: { label: '취소됨', badge: 'tba', line: '제보를 취소했어요.' }
};
export const REJECT_REASONS = ['이미 등록된 공연이에요', '정보를 확인할 수 없어요', '대중음악 공연이 아니에요'];
export function validateReport(r) {
  const v = k => String(r?.[k] ?? '').trim();
  if (!v('title')) return '공연명을 입력해 주세요.';
  if (!v('showDate') && !v('openAtText') && !v('ticketUrl') && !v('sourceUrl')) return '공연 날짜, 오픈 일시, 링크 중 하나는 알려 주세요.';
  if ((v('ticketUrl') && !/^https?:\/\//.test(v('ticketUrl'))) || (v('sourceUrl') && !/^https?:\/\//.test(v('sourceUrl')))) return '링크는 https:// 로 시작하는 주소로 넣어 주세요.';
  if (v('note').length > 300) return '메모는 300자까지 쓸 수 있어요.';
  return '';
}

/* ---------- KOPIS 응답 정리 (10_KOPIS_확인결과) ---------- */
const decode = s => String(s ?? '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&').trim();
export const xmlTag = (xml, name) => { const m = String(xml).match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`)); return m ? decode(m[1]) : ''; };
export const xmlBlocks = (xml, name) => [...String(xml).matchAll(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`, 'g'))].map(m => m[1]);
export const kopisDate = s => String(s ?? '').trim().replace(/\./g, '-').slice(0, 10);
export const castRaw = s => decode(s).replace(/\s*등\s*$/, '').trim();
export function kopisError(xml) { const code = xmlTag(xml, 'returncode'); const msg = xmlTag(xml, 'errmsg'); return (msg || (code && code !== '00')) ? `${code} ${msg}`.trim() : ''; }
export function parseKopisList(xml) {
  return xmlBlocks(xml, 'db').map(db => ({
    kopisId: xmlTag(db, 'mt20id'), title: xmlTag(db, 'prfnm'), startDate: kopisDate(xmlTag(db, 'prfpdfrom')), endDate: kopisDate(xmlTag(db, 'prfpdto')),
    venue: xmlTag(db, 'fcltynm'), region: shortRegion(xmlTag(db, 'area')), kopisState: xmlTag(db, 'prfstate'), posterUrl: xmlTag(db, 'poster')
  })).filter(p => p.kopisId && p.title && p.startDate);
}
export function parseKopisDetail(xml) {
  const db = xmlBlocks(xml, 'db')[0];
  if (!db || !xmlTag(db, 'mt20id')) return null;
  return {
    castRaw: castRaw(xmlTag(db, 'prfcast')),
    ticketLinks: xmlBlocks(db, 'relate').map(r => ({ name: xmlTag(r, 'relatenm') || '예매처', url: xmlTag(r, 'relateurl') })).filter(l => /^https?:\/\//.test(l.url)),
    timeText: xmlTag(db, 'dtguidance'), priceText: xmlTag(db, 'pcseguidance'), ageText: xmlTag(db, 'prfage'), runtimeText: xmlTag(db, 'prfruntime'),
    organizer: xmlTag(db, 'entrpsnmA') || xmlTag(db, 'entrpsnmP'), facilityId: xmlTag(db, 'mt10id'),
    kopisUpdatedAt: xmlTag(db, 'updatedate') ? xmlTag(db, 'updatedate').replace(' ', 'T').slice(0, 19) + '+09:00' : null
  };
}
