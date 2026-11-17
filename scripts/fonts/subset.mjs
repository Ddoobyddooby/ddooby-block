// 테마 글꼴 서브셋 만들기: `npm run fonts:subset` (확인만: `npm run fonts:check`)
// 원본(assets/fonts-src/*.ttf)에서 앱에 쓰는 글자만 남겨 public/fonts/*-subset.ttf로 만든다.
//   - 한글 글꼴(SUIT·고운돋움): src/ 아래 .ts 파일에 나오는 한글 + 기본 라틴 + 기호
//   - 영어 제목 글꼴(Fredoka·Space Grotesk·Baloo 2): 기본 라틴만
// 문구가 바뀌어 새 한글이 생기면 다시 실행한다. 서브셋 밖 글자(닉네임 등)는 theme.fonts의 시스템 글꼴로 보인다.
// 도구: HarfBuzz의 `hb-subset` (macOS: `brew install harfbuzz`). 이 도구는 WOFF2를 만들지 못해 TTF로 낸다.
// `--check`: 파일은 만들지 않고, 지금 소스의 글자 집합이 마지막 서브셋(public/fonts/subset-chars.txt)과 같은지만 본다 (다르면 종료 코드 1).

import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { findReserved, renameFont } from './rename.mjs';

const ROOT = resolve(import.meta.dirname, '../..');
const SRC_DIR = join(ROOT, 'src');
const FONT_SRC = join(ROOT, 'assets/fonts-src');
const OUT_DIR = join(ROOT, 'public/fonts');
const CHARS_FILE = join(OUT_DIR, 'subset-chars.txt');

/** SUIT 서브셋의 새 이름. 앱의 font-family(src/view/theme/themes.ts·fonts.ts)도 이 이름이다 */
const RENAMED_SUIT = { family: 'Ddooby Sans', reserved: 'SUIT(?: ?Variable)?' };

/** 원본 파일 → 서브셋 이름, 한글 포함 여부 */
const FONTS = [
  { src: 'Fredoka.ttf', out: 'Fredoka-subset.ttf', hangul: false },
  { src: 'SpaceGrotesk.ttf', out: 'SpaceGrotesk-subset.ttf', hangul: false },
  { src: 'Baloo2.ttf', out: 'Baloo2-subset.ttf', hangul: false },
  // SUIT는 Reserved Font Name이 SUIT: 글자를 뺀 수정본이므로 내부 이름을 독자 이름으로 바꾼다 (rename.mjs, OFL 제3조)
  { src: 'SUIT.ttf', out: 'SUIT-subset.ttf', hangul: true, rename: RENAMED_SUIT },
  { src: 'GowunDodum.ttf', out: 'GowunDodum-subset.ttf', hangul: true },
];

/** 화면에 나올 수 있는 기호 (· … 등). 글꼴에 없는 글자는 건너뛴다 */
const SYMBOLS = '·…×→←↑↓♪★☆♥';

function listTs(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...listTs(path));
    else if (name.endsWith('.ts')) out.push(path);
  }
  return out;
}

function collect() {
  const hangul = new Set();
  for (const file of listTs(SRC_DIR)) {
    // 주석의 한글은 화면에 나오지 않는다: 블록 주석과 줄 주석을 지우고 센다 (글자 집합이 커지지 않게)
    const code = readFileSync(file, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:\\])\/\/.*$/gm, '$1');
    for (const ch of code) {
      if (ch >= '가' && ch <= '힣') hangul.add(ch);
    }
  }
  let latin = '';
  for (let code = 0x20; code <= 0x7e; code++) latin += String.fromCharCode(code);
  return { hangul: [...hangul].sort().join(''), latin, symbols: SYMBOLS };
}

const { hangul, latin, symbols } = collect();
const summary = `hangul=${hangul}\nlatin=${latin}\nsymbols=${symbols}\n`;

if (process.argv.includes('--check')) {
  let saved = '';
  try {
    saved = readFileSync(CHARS_FILE, 'utf8');
  } catch {
    // 없음: 아래에서 다르다고 본다
  }
  // 예약 이름: 이름을 바꾼 서브셋의 name 테이블에 원래 이름이 남아 있지 않아야 한다
  for (const font of FONTS.filter((f) => f.rename)) {
    const left = findReserved(readFileSync(join(OUT_DIR, font.out)), font.rename.reserved);
    if (left.length > 0) {
      console.error(
        `${font.out}의 name 테이블에 예약 이름이 남았다: ${left.map((n) => `ID ${n.nid} "${n.text}"`).join(', ')}`,
      );
      process.exit(1);
    }
  }
  if (saved !== summary) {
    console.error('글꼴 서브셋이 소스의 글자와 다릅니다. `npm run fonts:subset`을 실행하세요.');
    process.exit(1);
  }
  console.log(`글꼴 서브셋이 최신입니다 (한글 ${[...hangul].length}자).`);
  process.exit(0);
}

mkdirSync(OUT_DIR, { recursive: true });
const tmp = join(tmpdir(), `ddooby-fonts-${process.pid}`);
mkdirSync(tmp, { recursive: true });

let total = 0;
for (const font of FONTS) {
  const text = font.hangul ? latin + symbols + hangul : latin;
  const textFile = join(tmp, `${font.out}.txt`);
  writeFileSync(textFile, text);
  const out = join(OUT_DIR, font.out);
  execFileSync('hb-subset', [
    join(FONT_SRC, font.src),
    `--text-file=${textFile}`,
    `--output-file=${out}`,
  ]);
  if (font.rename) {
    writeFileSync(out, renameFont(readFileSync(out), font.rename));
    if (findReserved(readFileSync(out), font.rename.reserved).length > 0)
      throw new Error(`${font.out}: 예약 이름이 남았다`);
  }
  const before = statSync(join(FONT_SRC, font.src)).size;
  const after = statSync(out).size;
  total += after;
  console.log(
    `${font.src} ${(before / 1024).toFixed(0)}KB → ${font.out} ${(after / 1024).toFixed(0)}KB`,
  );
}
writeFileSync(CHARS_FILE, summary);
console.log(
  `한글 ${[...hangul].length}자 + 라틴 ${[...latin].length}자 + 기호 ${[...symbols].length}자, 서브셋 합계 ${(total / 1024).toFixed(0)}KB`,
);
