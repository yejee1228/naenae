// REC-01 추천 탭 + 내 취향 육각형 (R-50~58), SHT-08 육각형 설명
import api from '../../shared/api/index.js';
import { L } from '../../shared/lib.js';
import { recommendSections, hexagon, hexSummary, HEX_AXES } from '../../shared/domain.js';
import { esc, page, sheet, track, emptyBox } from '../ui.js';
import { S, today, badgeRecords } from '../state.js';
import { perfRow } from './schedule.js';

const SAMPLE = { attend: 70, plan: 45, explore: 60, regular: 35, travel: 20, variety: 55 };
export function hexSvg(values, { muted = false } = {}) {
  const cx = 110, cy = 105, R = 78;
  const pt = (i, r) => { const a = -Math.PI / 2 + (i * Math.PI) / 3; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; };
  const ring = f => HEX_AXES.map((_, i) => pt(i, R * f).join(',')).join(' ');
  const shape = HEX_AXES.map((a, i) => pt(i, R * Math.max(0.04, (values[a.key] || 0) / 100)).join(',')).join(' ');
  const labels = HEX_AXES.map((a, i) => { const [x, y] = pt(i, R + 16); return `<text x="${x.toFixed(1)}" y="${(y + 4).toFixed(1)}" text-anchor="middle">${a.name}</text>`; }).join('');
  return `<svg class="hex${muted ? ' muted' : ''}" viewBox="0 0 220 210" role="img" aria-label="취향 육각형 ${HEX_AXES.map(a => `${a.name} ${values[a.key] || 0}`).join(', ')}">
    ${[1, 0.66, 0.33].map(f => `<polygon class="hex-grid" points="${ring(f)}"/>`).join('')}
    ${HEX_AXES.map((_, i) => { const [x, y] = pt(i, R); return `<line class="hex-grid" x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}"/>`; }).join('')}
    <polygon class="hex-shape" points="${shape}"/>${labels}</svg>`;
}
function tasteCard() {
  const user = api.auth.current();
  if (!user) return `<section class="taste guest">${hexSvg(SAMPLE, { muted: true })}
    <div class="taste-over"><b>로그인하면 내 취향에 맞춰 추천해요</b><button class="btn primary small" type="button" data-act="login-sheet" data-ctx="reco">로그인 · 회원가입</button></div></section>`;
  const hex = hexagon(S.records, S.interests);
  if (hex.empty) return `<section class="taste empty-taste"><p class="eyebrow">MY TASTE</p><p class="small muted">공연을 담고 기록하면 내 취향이 그려져요.</p><a class="btn small" href="#/schedule">관심 아티스트 담으러 가기</a></section>`;
  const primary = L.computeBadges(badgeRecords(), S.interests, 'all').primary;
  return `<button type="button" class="taste" data-act="hex-open"><span class="taste-head"><span class="eyebrow">MY TASTE</span><span class="guide-link">ⓘ</span></span>${hexSvg(hex.values)}
    <span class="taste-sum">${esc(hexSummary(hex, primary?.name))}</span></button>`;
}
export function hexSheet() {
  const hex = hexagon(S.records, S.interests);
  track('hexagon_open');
  sheet(`<h2>내 취향 육각형</h2><ul class="hex-list">${HEX_AXES.map(a => `<li><b>${a.name}</b><span>${a.q}</span><em>${hex.values[a.key]}</em></li>`).join('')}</ul><p class="small muted">기간: 전체 기록 기준 · 기록을 바탕으로 매번 다시 계산해요.</p>`);
}
const section = (title, items) => (items.length ? `<section class="reco"><h2>${title}</h2>${items.map(x => perfRow(x.perf, x.reason)).join('')}</section>` : '');
export function renderReco() {
  const user = api.auth.current();
  track('reco_view', { value: user ? 'member' : 'guest' });
  const s = recommendSections(S.perfs, user ? S.records : [], user ? S.interests : [], S.clubVenues, today());
  const club = section('이번 주 라이브클럽 공연', s.club) || `<section class="reco"><h2>이번 주 라이브클럽 공연</h2>${emptyBox('이번 주 라이브클럽 공연이 없어요.')}</section>`;
  page('reco', `<section class="intro compact"><p class="eyebrow">FOR YOU</p><h1>추천</h1></section>
    ${tasteCard()}
    ${user ? section('관심 아티스트가 나오는 공연', s.fav) + section('내가 다녀온 공연장의 공연', s.venue) : ''}
    ${club}`);
}
