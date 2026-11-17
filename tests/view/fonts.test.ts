import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FONT_FILES } from '../../src/view/theme/fonts';
import { fontOf, cssColor } from '../../src/view/theme/textStyle';
import { THEME_LIST } from '../../src/view/theme/themes';

const ROOT = join(import.meta.dirname, '../..');

/** 파일을 읽는다 (shim 타입에는 utf8 읽기뿐이라 이진 파일도 문자열로 읽어 머리와 길이만 본다). 없으면 null */
function readText(path: string): string | null {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

describe('글꼴 파일', () => {
  it('서브셋 파일이 모두 있고 비어 있지 않다', () => {
    for (const { file } of FONT_FILES) {
      const text = readText(join(ROOT, 'public/fonts', file));
      expect(text, file).not.toBeNull();
      expect(text!.length).toBeGreaterThan(1000);
      // TrueType 파일 머리 (0x00010000)
      expect([...text!.slice(0, 4)].map((ch) => ch.charCodeAt(0))).toEqual([0, 1, 0, 0]);
    }
  });

  it('라이선스 원문(OFL)이 글꼴과 함께 있다', () => {
    for (const name of [
      'fredoka-OFL.txt',
      'spacegrotesk-OFL.txt',
      'baloo2-OFL.txt',
      'gowundodum-OFL.txt',
      'SUIT-LICENSE.txt',
    ]) {
      expect(readText(join(ROOT, 'public/fonts', name)), name).toContain('SIL');
    }
  });

  it('테마가 쓰는 글꼴 이름이 모두 읽는 글꼴 목록에 있다', () => {
    const families = new Set(FONT_FILES.map((f) => f.family));
    for (const theme of THEME_LIST) {
      for (const stack of [theme.fonts.title, theme.fonts.ui, theme.fonts.number]) {
        const first = /^"([^"]+)"/.exec(stack)?.[1];
        expect(first && families.has(first), `${theme.id}: ${stack}`).toBe(true);
        // 시스템 글꼴이 뒤에 붙어 있어 글꼴이 없어도 글자는 보인다
        expect(stack).toContain('sans-serif');
      }
    }
  });

  it('서브셋이 지금 소스의 한글과 같다 (문구가 바뀌면 npm run fonts:subset)', () => {
    // 다르면 스크립트가 종료 코드 1로 끝나 예외가 난다
    const out = execFileSync('node', ['scripts/fonts/subset.mjs', '--check'], {
      encoding: 'utf8',
      cwd: ROOT,
    });
    expect(out).toContain('최신');
  });
});

describe('글자 스타일', () => {
  it('cssColor는 6자리 16진수로 채운다', () => {
    expect(cssColor(0x0000ff)).toBe('#0000ff');
    expect(cssColor(0xfff5d8)).toBe('#fff5d8');
  });

  it('역할마다 테마 글꼴·굵기를 고른다', () => {
    const butter = THEME_LIST.find((t) => t.id === 'butter')!;
    expect(fontOf(butter, 'logo')).toEqual({ family: butter.fonts.title, weight: 650 });
    expect(fontOf(butter, 'number').family).toBe(butter.fonts.number);
    expect(fontOf(butter, 'body').weight).toBeLessThan(fontOf(butter, 'heading').weight);
  });
});
