// 관리자 페이지 — 아티스트 한 번에 등록 (엑셀·CSV·붙여넣기, R-141 — 베타 전용)
import api from '../shared/api/index.js';
import { nameKey } from '../shared/domain.js';
import { escA as esc } from '../shared/artist-ui.js';
import { readXlsx, parseDelimited, toArtistRows, templateCsv } from './sheet-import.js';

const $ = s => document.querySelector(s);
const IMP = { rows: [], fileName: '', result: null };
let ctx = null;   // artists.js가 넘겨줌: { ui, tabsHtml, all(), reload() }

export function renderImport(c) {
  ctx = c; const { ui } = c;
  ui.main().innerHTML = ui.head('아티스트', '엑셀·CSV로 여러 팀을 한 번에 등록해요. <b>베타 기간에만 쓰는 기능이에요.</b>', '<a class="btn small" href="#/artists">← 등록된 아티스트</a>')
    + c.tabsHtml
    + `<section class="adm-card adm-import"><p class="eyebrow" style="margin:0">한 번에 등록 · 베타 전용</p>
      <ol class="adm-steps"><li><b>양식 내려받기</b> — 엑셀에서 열어 한 줄에 한 팀씩 적어요. 등록 칸이 <b>O</b>인 줄만 등록되고 <b>X</b>는 건너뛰어요.
        <button class="btn small" type="button" data-act="ar-template">양식 내려받기 (CSV)</button></li>
        <li><b>파일 올리기</b> — 엑셀(.xlsx)이나 CSV 파일을 올리거나, 엑셀에서 표를 복사해 아래에 붙여 넣어요. 한 번에 500줄씩 나눠 등록돼요.
          <label class="adm-file">파일 고르기<input type="file" accept=".xlsx,.csv,.txt" data-import-file></label>
          <textarea id="importPaste" rows="3" placeholder="엑셀에서 제목 줄까지 복사해 붙여 넣어도 돼요"></textarea><button class="btn small" type="button" data-act="ar-import-paste">붙여 넣은 내용 읽기</button></li>
        <li><b>미리 보기 확인 후 등록</b> — 문제가 있는 줄은 등록하지 않고 이유를 보여 줘요.</li></ol>
      <p class="ferr" id="importErr" role="alert"></p></section><div id="importPreview"></div>`;
  if (IMP.rows.length) drawPreview();
}
// 엑셀이 저장한 CSV(한글 윈도우, CP949)도 읽음
const decodeText = buf => { try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch { return new TextDecoder('euc-kr').decode(buf); } };
export async function importFile(input) {
  const file = input.files?.[0]; $('#importErr').textContent = ''; if (!file) return;
  try {
    const buf = await file.arrayBuffer();
    const table = /\.xlsx$/i.test(file.name) ? await readXlsx(buf) : parseDelimited(decodeText(buf));
    IMP.rows = toArtistRows(table); IMP.fileName = file.name; IMP.result = null; drawPreview();
  } catch (e) { $('#importErr').textContent = e.message || '파일을 읽지 못했어요.'; input.value = ''; }
}
function readPaste() {
  $('#importErr').textContent = '';
  try { IMP.rows = toArtistRows(parseDelimited($('#importPaste').value)); IMP.fileName = '붙여 넣은 내용'; IMP.result = null; drawPreview(); }
  catch (e) { $('#importErr').textContent = e.message; }
}
const keysOf = a => [a.name, ...(a.aliases || [])].map(nameKey);
/* 줄마다 상태: 등록 예정 · 제외(X) · 이미 등록됨 · 문제 */
function judge() {
  const all = ctx.all() || []; const seen = new Set();
  const groupsInFile = new Set(IMP.rows.filter(r => r.kind === 'group' && r.rec === 'O').map(r => nameKey(r.name)));
  return IMP.rows.map(r => {
    if (r.rec === 'X') return { ...r, st: 'skip', msg: '제외 (X)' };
    if (r.problem) return { ...r, st: 'bad', msg: r.problem };
    const k = nameKey(r.name) + '|' + r.disambig;
    if (seen.has(k)) return { ...r, st: 'bad', msg: '파일 안에 같은 이름·구분 문구가 또 있어요' };
    seen.add(k);
    const same = all.filter(a => nameKey(a.name) === nameKey(r.name));
    if (same.some(a => (a.disambig || '') === r.disambig)) return { ...r, st: 'exist', msg: '이미 등록됨 (건너뜀)' };
    if (same.length && !r.disambig) return { ...r, st: 'bad', msg: '같은 이름이 이미 있어요. 구분 문구를 적어 주세요' };
    let msg = '등록 예정';
    if (r.kind === 'solo' && r.groupName) {
      const found = groupsInFile.has(nameKey(r.groupName)) || all.some(a => a.kind === 'group' && keysOf(a).includes(nameKey(r.groupName)));
      msg = found ? `등록 예정 · 소속 그룹 '${r.groupName}' 연결` : `등록 예정 · 소속 그룹 '${r.groupName}'을 찾지 못해 연결 안 됨`;
    }
    return { ...r, st: 'ok', msg };
  });
}
function drawPreview() {
  const rows = judge(); const n = s => rows.filter(r => r.st === s).length; const ready = n('ok');
  const KIND = { group: '그룹', solo: '개인' }; const cls = { ok: '', skip: ' muted-row', exist: ' muted-row', bad: ' warn-row' };
  const cols = '--cols: 56px 52px minmax(0,1.4fr) 60px minmax(0,1fr) minmax(0,1fr) minmax(0,1fr) minmax(0,1.6fr)';
  $('#importPreview').innerHTML = `<section class="adm-card" style="margin-top:14px"><h2 style="margin:0;font-size:17px">미리 보기 · ${esc(IMP.fileName)}</h2>
    <p class="small muted" style="margin:2px 0 10px">등록 예정 <b>${ready}</b> · 제외(X) ${n('skip')} · 이미 등록됨 ${n('exist')} · <span class="warn">문제 ${n('bad')}</span> (문제가 있는 줄은 등록하지 않아요)</p>
    <div class="adm-list" style="max-height:480px;overflow:auto"><div class="adm-row head" style="${cols}"><span>줄</span><span>등록</span><span>이름</span><span>유형</span><span>구분 문구</span><span>별칭</span><span>소속 그룹</span><span>상태</span></div>
      ${rows.slice(0, 600).map(r => `<div class="adm-row${cls[r.st]}" style="${cols}"><span class="sub">${r.line}</span><span class="sub">${esc(r.rec)}</span><span class="t">${esc(r.name)}</span><span class="sub">${esc(KIND[r.kind] || r.kindRaw || '')}</span>
        <span class="sub">${esc(r.disambig)}</span><span class="sub">${esc(r.aliases.join(', '))}</span><span class="sub">${esc(r.groupName)}</span><span class="sub${r.st === 'bad' ? ' warn' : ''}">${esc(r.msg)}</span></div>`).join('')}</div>
    ${rows.length > 600 ? `<p class="small muted">앞의 600줄만 보여요. 등록은 전체 ${ready}팀을 해요.</p>` : ''}
    <label class="check" style="margin-top:12px"><input type="checkbox" id="importLink" checked> 등록하면서 이름이 정확히 같은 공연·공지에 자동 연결 (같은 이름이 둘 이상이면 연결하지 않아요)</label>
    <div class="bar" style="margin-top:12px"><button class="btn primary" type="button" data-act="ar-import-run"${ready ? '' : ' disabled'}>${ready}팀 등록하기</button></div>
    <div id="importResult">${IMP.result ? resultHtml(IMP.result) : ''}</div></section>`;
}
const list = items => (items.length ? `<ul style="margin:6px 0 0;padding-left:18px">${items.map(e => `<li>${e.line}줄 ${esc(e.name)} — ${esc(e.message)}</li>`).join('')}</ul>` : '');
const resultHtml = r => `<div class="adm-note" style="margin-top:12px"><b>등록 ${r.created}팀 · 건너뜀 ${r.skipped} · 실패 ${r.errors.length} · 공연·공지 자동 연결 ${r.linked}건</b>${list(r.errors)}${list(r.notes)}</div>`;
async function run(btn) {
  const ready = judge().filter(r => r.st === 'ok').sort((a, b) => (a.kind === 'group' ? 0 : 1) - (b.kind === 'group' ? 0 : 1));   // 그룹 먼저 → 개인의 소속 그룹 연결
  if (!ready.length) return;
  btn.disabled = true; btn.textContent = '등록하는 중…';
  const link = $('#importLink')?.checked !== false; const total = { created: 0, skipped: 0, linked: 0, errors: [], notes: [] };
  try {
    for (let i = 0; i < ready.length; i += 500) {
      const chunk = ready.slice(i, i + 500);
      const res = await api.admin.artists.import(chunk.map(r => ({ name: r.name, kind: r.kind, disambig: r.disambig, aliases: r.aliases, instagram: r.instagram, groupName: r.groupName })), link);
      total.created += res.created || 0; total.linked += res.linked || 0;
      (res.results || []).forEach(x => {
        const item = { line: (chunk[x.row - 1] || {}).line, name: x.name, message: x.message };
        if (x.status === 'skipped') total.skipped++; else if (x.status === 'error') total.errors.push(item); else if (x.message) total.notes.push(item);
      });
    }
    total.errors.sort((a, b) => a.line - b.line); IMP.result = total; ctx.ui.toast(`${total.created}팀을 등록했어요.`);
    await ctx.reload(); drawPreview();
  } catch (e) { $('#importErr').textContent = ctx.ui.errMsg(e); btn.disabled = false; btn.textContent = `${ready.length}팀 등록하기`; }
}
function downloadTemplate() {
  const url = URL.createObjectURL(new Blob([templateCsv()], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = '내내_아티스트_등록양식.csv'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 3000);
}
export async function importAction(act, el) {
  if (act === 'ar-template') downloadTemplate();
  if (act === 'ar-import-paste') readPaste();
  if (act === 'ar-import-run') await run(el);
}
