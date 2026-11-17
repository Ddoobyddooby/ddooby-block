// TTF의 name 테이블을 독자 이름으로 다시 쓴다 (npm 패키지 없이). SIL OFL 1.1 제3조: Reserved Font Name이 있는 글꼴을 수정(글자 빼기 포함)해
// 배포하면 그 이름을 쓸 수 없다. SUIT는 "Reserved Font Name SUIT"라서 서브셋의 내부 이름(family·full·PostScript·variations 접두사 등)을 바꾼다.
// 저작권(ID 0)·라이선스(ID 13·14) 문구는 원문 그대로 둔다 (원저작자 표시 보존).
// 테이블 체크섬과 head.checkSumAdjustment도 다시 계산한다.

import { Buffer } from 'node:buffer';

const COPYRIGHT_IDS = new Set([0, 13, 14]);
/** 띄어쓰기가 들어가는 이름 칸: family(1)·full(4)·typographic family(16)·WWS family(21) */
const SPACED_IDS = new Set([1, 4, 16, 21]);

function checksum(buf) {
  let sum = 0;
  for (let i = 0; i < buf.length; i += 4) {
    const chunk = Buffer.alloc(4);
    buf.copy(chunk, 0, i, Math.min(i + 4, buf.length));
    sum = (sum + chunk.readUInt32BE(0)) >>> 0;
  }
  return sum;
}

function decode(pid, bytes) {
  return pid === 0 || pid === 3
    ? Buffer.from(bytes).swap16().toString('utf16le')
    : Buffer.from(bytes).toString('latin1');
}

function encode(pid, text) {
  return pid === 0 || pid === 3
    ? Buffer.from(text, 'utf16le').swap16()
    : Buffer.from(text, 'latin1');
}

/** name 테이블을 읽는다: [{ pid, eid, lid, nid, text }] (형식 0만) */
export function readNames(font) {
  const table = findTable(font, 'name');
  const nt = font.subarray(table.offset, table.offset + table.length);
  if (nt.readUInt16BE(0) !== 0) throw new Error('name 테이블 형식 0만 다룬다');
  const count = nt.readUInt16BE(2);
  const stringOffset = nt.readUInt16BE(4);
  const out = [];
  for (let i = 0; i < count; i++) {
    const r = 6 + 12 * i;
    const length = nt.readUInt16BE(r + 8);
    const offset = nt.readUInt16BE(r + 10);
    const pid = nt.readUInt16BE(r);
    out.push({
      pid,
      eid: nt.readUInt16BE(r + 2),
      lid: nt.readUInt16BE(r + 4),
      nid: nt.readUInt16BE(r + 6),
      text: decode(pid, nt.subarray(stringOffset + offset, stringOffset + offset + length)),
    });
  }
  return out;
}

function readDirectory(font) {
  const numTables = font.readUInt16BE(4);
  const tables = [];
  for (let i = 0; i < numTables; i++) {
    const r = 12 + 16 * i;
    tables.push({
      tag: font.toString('latin1', r, r + 4),
      offset: font.readUInt32BE(r + 8),
      length: font.readUInt32BE(r + 12),
    });
  }
  return tables;
}

function findTable(font, tag) {
  const table = readDirectory(font).find((t) => t.tag === tag);
  if (!table) throw new Error(`${tag} 테이블이 없다`);
  return table;
}

/**
 * family = 새 글꼴 이름(띄어쓰기 허용, 예 "Ddooby Sans"), reserved = 바꿀 예약 이름 정규식 소스(예 "SUIT(?: ?Variable)?")
 * 저작권·라이선스 칸을 뺀 모든 이름 칸에서 예약 이름을 새 이름으로 바꾸고, ID 1·4·6·16·25는 새 이름으로 정한다.
 */
export function renameFont(font, { family, reserved }) {
  const ps = family.replace(/\s+/g, '');
  const pattern = new RegExp(reserved, 'g');
  const names = readNames(font).map((n) => {
    let text = n.text;
    if (n.nid === 1 || n.nid === 16) text = family;
    else if (n.nid === 4) text = `${family} Regular`;
    else if (n.nid === 6) text = `${ps}-Regular`;
    else if (n.nid === 3) text = `${ps}-Regular;subset`;
    else if (n.nid === 25) text = ps;
    else if (!COPYRIGHT_IDS.has(n.nid))
      text = text.replace(pattern, SPACED_IDS.has(n.nid) ? family : ps);
    return { ...n, text };
  });
  names.sort((a, b) => a.pid - b.pid || a.eid - b.eid || a.lid - b.lid || a.nid - b.nid);

  // 새 name 테이블
  const strings = [];
  const records = Buffer.alloc(12 * names.length);
  let offset = 0;
  names.forEach((n, i) => {
    const bytes = encode(n.pid, n.text);
    records.writeUInt16BE(n.pid, 12 * i);
    records.writeUInt16BE(n.eid, 12 * i + 2);
    records.writeUInt16BE(n.lid, 12 * i + 4);
    records.writeUInt16BE(n.nid, 12 * i + 6);
    records.writeUInt16BE(bytes.length, 12 * i + 8);
    records.writeUInt16BE(offset, 12 * i + 10);
    strings.push(bytes);
    offset += bytes.length;
  });
  const header = Buffer.alloc(6);
  header.writeUInt16BE(0, 0);
  header.writeUInt16BE(names.length, 2);
  header.writeUInt16BE(6 + records.length, 4);
  const nameTable = Buffer.concat([header, records, ...strings]);

  // 테이블을 다시 이어 붙인다 (4바이트 정렬, 순서 유지)
  const dir = readDirectory(font);
  const numTables = dir.length;
  const parts = dir.map((t) => ({
    tag: t.tag,
    data: t.tag === 'name' ? nameTable : Buffer.from(font.subarray(t.offset, t.offset + t.length)),
  }));
  const head = parts.find((p) => p.tag === 'head');
  if (head) head.data.writeUInt32BE(0, 8); // checkSumAdjustment를 0으로 놓고 계산한다
  let pos = 12 + 16 * numTables;
  const out = Buffer.alloc(pos);
  font.copy(out, 0, 0, 12);
  const body = [];
  parts.forEach((p, i) => {
    const padded = Buffer.concat([p.data, Buffer.alloc((4 - (p.data.length % 4)) % 4)]);
    out.write(p.tag, 12 + 16 * i, 'latin1');
    out.writeUInt32BE(checksum(padded), 12 + 16 * i + 4);
    out.writeUInt32BE(pos, 12 + 16 * i + 8);
    out.writeUInt32BE(p.data.length, 12 + 16 * i + 12);
    body.push(padded);
    pos += padded.length;
  });
  const result = Buffer.concat([out, ...body]);
  if (head) {
    const headOffset = readDirectory(result).find((t) => t.tag === 'head').offset;
    result.writeUInt32BE((0xb1b0afba - checksum(result)) >>> 0, headOffset + 8);
  }
  return result;
}

/** 예약 이름이 남은 칸을 모아 돌려준다 (저작권·라이선스 칸은 제외). 비어 있으면 통과 */
export function findReserved(font, reserved) {
  const pattern = new RegExp(reserved);
  return readNames(font).filter((n) => !COPYRIGHT_IDS.has(n.nid) && pattern.test(n.text));
}
