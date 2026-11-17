// 배포 경로 (W4-03): 같은 빌드가 Capacitor(파일 경로)와 GitHub Pages(/ddooby-block/ 아래)에서 모두 돌아야 한다.
// 그래서 Vite base는 './' 이고, 코드가 읽는 에셋(글꼴·소리) 경로는 절대 경로('/…')가 아니라 상대 경로여야 한다.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import config from '../../vite.config';

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sources(path) : path.endsWith('.ts') ? [path] : [];
  });
}

describe('배포 경로', () => {
  it('Vite base는 상대 경로(./)다', () => {
    expect(config.base).toBe('./');
  });

  it('src의 에셋 경로(audio/, fonts/)는 절대 경로가 아니다', () => {
    const offenders: string[] = [];
    for (const file of sources('src')) {
      const text = readFileSync(file, 'utf8');
      if (/['"`(]\/(audio|fonts)\//.test(text)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });

  it('index.html도 절대 에셋 경로를 쓰지 않는다 (진입 스크립트 /src/main.ts는 빌드가 바꾼다)', () => {
    const html = readFileSync('index.html', 'utf8');
    expect(html).not.toMatch(/(href|src)="\/(audio|fonts|favicon)/);
  });

  it('Capacitor 설정: 앱 ID·이름·웹 폴더', async () => {
    const { default: cap } = await import('../../capacitor.config');
    expect(cap.appId).toBe('com.ddooby.block');
    expect(cap.appName).toBe('Ddooby Block');
    expect(cap.webDir).toBe('dist');
  });
});
