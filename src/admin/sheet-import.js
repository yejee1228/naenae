// 엑셀(.xlsx)·CSV·붙여넣기 읽기 — 아티스트 한 번에 등록용 (R-141, 베타 전용). 외부 라이브러리 없이 브라우저 기능만 씀
const td = new TextDecoder();

/* .xlsx = zip 안의 xml. 첫 번째 시트만 읽음 */
export async function readXlsx(buf) {
  const u8 = new Uint8Array(buf); const dv = new DataView(buf);
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('엑셀 파일을 읽지 못했어요. CSV로 저장해서 올려 주세요.');
  const count = dv.getUint16(eocd + 10, true); let off = dv.getUint32(eocd + 16, true); const files = {};
  for (let n = 0; n < count && dv.getUint32(off, true) === 0x02014b50; n++) {
    const method = dv.getUint16(off + 10, true); const csize = dv.getUint32(off + 20, true);
    const nameLen = dv.getUint16(off + 28, true); const extraLen = dv.getUint16(off + 30, true); const commLen = dv.getUint16(off + 32, true);
    files[td.decode(u8.subarray(off + 46, off + 46 + nameLen))] = { method, csize, lho: dv.getUint32(off + 42, true) };
    off += 46 + nameLen + extraLen + commLen;
  }
  const read = async name => {
    const f = files[name]; if (!f) return null;
    const start = f.lho + 30 + dv.getUint16(f.lho + 26, true) + dv.getUint16(f.lho + 28, true); const data = u8.subarray(start, start + f.csize);
    if (f.method === 0) return td.decode(data);
    if (typeof DecompressionStream === 'undefined') throw new Error('이 브라우저에서는 엑셀 파일을 읽을 수 없어요. CSV로 저장해서 올려 주세요.');
    return td.decode(await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
  };
  const xml = s => new DOMParser().parseFromString(s, 'application/xml');
  const sharedXml = await read('xl/sharedStrings.xml');
  const strings = sharedXml ? [...xml(sharedXml).getElementsByTagName('si')].map(si => [...si.getElementsByTagName('t')].filter(t => t.parentNode.nodeName !== 'rPh').map(t => t.textContent).join('')) : [];
  const sheet = Object.keys(files).filter(n => /^xl\/worksheets\/sheet\d+\.xml$/.test(n)).sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]))[0];
  if (!sheet) throw new Error('엑셀 파일에서 시트를 찾지 못했어요.');
  const col = ref => { const m = String(ref || '').match(/^[A-Z]+/); return m ? [...m[0]].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1 : 0; };
  const rows = [];
  for (const r of xml(await read(sheet)).getElementsByTagName('row')) {
    const cells = [];
    for (const c of r.getElementsByTagName('c')) {
      const t = c.getAttribute('t'); const v = c.getElementsByTagName('v')[0]?.textContent ?? '';
      cells[col(c.getAttribute('r'))] = t === 's' ? strings[Number(v)] ?? '' : t === 'inlineStr' ? [...c.getElementsByTagName('t')].map(x => x.textContent).join('') : v;
    }
    rows.push(Array.from(cells, x => x ?? ''));
  }
  return rows;
}

/* CSV(쉼표) · 엑셀에서 복사한 표(탭) */
export function parseDelimited(text) {
  const s = String(text || '').replace(/^﻿/, '');
  const first = s.split(/\r?\n/)[0] || '';
  const d = (first.match(/\t/g) || []).length > (first.match(/,/g) || []).length ? '\t' : ',';
  const rows = []; let row = []; let cell = ''; let q = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) { if (ch === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
    else if (ch === '"' && cell === '') q = true;
    else if (ch === d) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && s[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(c => String(c).trim() !== ''));
}

/* 제목 줄로 칸 찾기 → 줄마다 { line, rec, name, kind, disambig, aliases, instagram, groupName, problem } */
const COLS = { rec: ['등록'], name: ['이름', '아티스트', '아티스트 이름', 'name'], kind: ['유형', '그룹/개인', '구분', 'type'], disambig: ['구분 문구', '구분문구'],
  aliases: ['별칭', '다른 표기', 'alias'], instagram: ['인스타그램', 'instagram'], groupName: ['소속 그룹', '소속그룹', '그룹'] };
const norm = s => String(s ?? '').normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ');
export const igId = v => String(v || '').trim().replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/[/?#].*$/, '');
export function toArtistRows(table) {
  const hi = table.findIndex(r => r.some(c => ['이름', '아티스트', '아티스트 이름', 'name'].includes(norm(c))));
  if (hi < 0) throw new Error("제목 줄에 '이름' 칸이 없어요. 양식을 내려받아 그대로 써 주세요.");
  const head = table[hi].map(norm); const idx = {};
  Object.entries(COLS).forEach(([k, names]) => { const i = head.findIndex(h => names.map(norm).includes(h)); if (i >= 0) idx[k] = i; });
  if (idx.disambig === idx.kind) delete idx.disambig;
  const cell = (r, k) => (idx[k] == null ? '' : String(r[idx[k]] ?? '').trim());
  return table.slice(hi + 1).map((r, i) => {
    const recRaw = norm(cell(r, 'rec')); const kindRaw = norm(cell(r, 'kind'));
    const rec = idx.rec == null || ['', 'o', 'ㅇ', '예', 'y', 'yes', '등록'].includes(recRaw) ? 'O' : ['x', '아니오', 'n', 'no', '제외'].includes(recRaw) ? 'X' : '확인';
    const kind = ['그룹', 'group', '밴드', '팀', '듀오'].includes(kindRaw) ? 'group' : ['개인', 'solo', '솔로'].includes(kindRaw) ? 'solo' : '';
    const row = { line: hi + i + 2, rec, name: cell(r, 'name'), kind, kindRaw: cell(r, 'kind'), disambig: cell(r, 'disambig'),
      aliases: cell(r, 'aliases').split(/[,·/;]/).map(x => x.trim()).filter(Boolean), instagram: igId(cell(r, 'instagram')), groupName: cell(r, 'groupName') };
    row.problem = rec === 'X' ? '' : rec === '확인' ? "등록 칸이 'O'나 'X'가 아니에요" : !row.name ? '이름이 비어 있어요' : row.name.length > 40 ? '이름은 40자까지예요'
      : !kind ? '유형을 그룹이나 개인으로 적어 주세요' : row.instagram && !/^[A-Za-z0-9._]{1,30}$/.test(row.instagram) ? '인스타그램은 계정 아이디만 적어 주세요' : '';
    return row;
  }).filter(r => r.name || r.rec !== 'O');
}

/* 양식 (CSV, 엑셀에서 바로 열림) */
export function templateCsv() {
  const rows = [['등록', '이름', '유형', '구분 문구', '별칭', '인스타그램', '소속 그룹'],
    ['X', '예시밴드', '그룹', '밴드 · 서울', 'Example Band', 'example.band', ''],
    ['X', '예시솔로', '개인', '싱어송라이터', '', '', '예시밴드']];
  return '﻿' + rows.map(r => r.join(',')).join('\r\n');
}
