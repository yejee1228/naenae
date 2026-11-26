// 내내 사용자 화면 — 상태와 데이터 불러오기
import api from '../shared/api/index.js';
import { L } from '../shared/lib.js';
import { kstToday, matchedArtists, nameKey, interestName } from '../shared/domain.js';
import { store, toast, track, sheet, esc } from './ui.js';
import { CONFIG } from '../shared/config.js';

export const today = () => kstToday();
export const S = {
  perfs: [], openings: [], promotions: [], clubVenues: [], meta: {}, loaded: false,
  records: [], interests: [], badgeSeen: [],
  openMode: store.get('ml05_open_mode', 'list'), calMonth: kstToday().slice(0, 7), calDay: kstToday(),
  sched: { q: '', region: '', club: false, past: false }, myTab: 'planned',
  badgeScope: kstToday().slice(5, 7) === '12' ? 'year' : 'month', badgeMonth: kstToday().slice(0, 7),
  keepScroll: false, afterRoute: null
};

/* 0.5 lib(sortOpenings·openingEvent)이 기대하는 모양으로 */
export const toLibOpening = o => ({ ...o, kopisId: o.performanceId || '', openAt: o.openAt ? new Date(o.openAt) : null, openHasTime: o.openAt ? o.openHasTime !== false : false, showDate: o.showDate || '' });
export const visibleOpenings = () => L.sortOpenings(S.openings.map(toLibOpening));
export const perfById = id => S.perfs.find(p => p.id === id);
export const openingByPerf = id => visibleOpenings().find(o => o.performanceId && o.performanceId === id);

export async function loadContent() {
  const [perfs, openings, promos, clubs, meta] = await Promise.all([
    api.content.performances().catch(() => []), api.content.openings().catch(() => []), api.content.promotions().catch(() => []),
    api.content.clubVenues().catch(() => []), api.content.meta().catch(() => ({}))
  ]);
  S.perfs = perfs.sort((a, b) => a.startDate.localeCompare(b.startDate) || a.title.localeCompare(b.title, 'ko'));
  S.openings = openings; S.promotions = promos; S.clubVenues = clubs; S.meta = meta; S.loaded = true;
  const first = visibleOpenings().find(o => o.openAt && o.status.key === 'soon');
  if (first) { S.calDay = L.kstDay(first.openAt); S.calMonth = S.calDay.slice(0, 7); }
}
export async function loadMine() {
  if (!api.auth.current()) { S.records = []; S.interests = []; S.badgeSeen = []; return; }
  const [r, i, b] = await Promise.all([api.records.list().catch(() => []), api.interests.list().catch(() => []), api.badges.seen().catch(() => [])]);
  S.records = r; S.interests = i; S.badgeSeen = b;
}

/* 0.5 배지 계산(computeBadges)용 기록 모양 */
export const badgeRecords = () => S.records.map(r => ({ ...r, refId: r.performanceId ? 'kopis:' + r.performanceId : r.openingId ? 'open:' + r.openingId : '' }));
// 이름(별칭 포함)으로 관심 아티스트 찾기 — 아티스트가 연결되지 않은 공연 칩용
export const interestByName = name => S.interests.find(i => [interestName(i), ...(i.artist?.aliases || [])].some(n => nameKey(n) === nameKey(name)));
export const isInterested = name => !!interestByName(name);
export const myArtistsIn = item => (api.auth.current() ? matchedArtists(S.interests, item) : []);

/* 새 배지 축하 창 (R-47): 이달 배지 중 처음 본 것 하나 */
export async function checkNewBadge(silent) {
  if (!api.auth.current()) return;
  const ym = today().slice(0, 7);
  const b = L.computeBadges(badgeRecords(), S.interests, 'month', ym);
  const now = [b.primary, ...b.extras].filter(Boolean).map(x => ({ x, key: `${ym}:${x.id}:${x.name}` }));
  const fresh = now.filter(n => !S.badgeSeen.includes(n.key));
  if (!fresh.length) return;
  S.badgeSeen.push(...fresh.map(f => f.key));
  api.badges.markSeen(fresh.map(f => f.key)).catch(() => {});
  if (silent) return;
  const first = fresh[0].x;
  track('badge_earned', { item: first.id, value: (ym + ' ' + first.name).slice(0, 60) });
  sheet(`<p class="eyebrow">${Number(ym.slice(5))}월의 NEW BADGE</p><div class="medal big"><span class="emo xl" style="--c:${esc(first.color || '#d9cce6')}">${esc(first.emoji || '⭐')}</span></div><h2>${esc(first.name)}</h2><p class="small muted">${esc(first.desc)}</p>
    <a class="btn primary block" href="#/my" data-act="close-sheet">${esc(CONFIG.myName)}에서 보기</a>`);
}
export const notifyError = e => toast((e && e.message) || '저장하지 못했어요. 잠시 후 다시 시도해 주세요.');
