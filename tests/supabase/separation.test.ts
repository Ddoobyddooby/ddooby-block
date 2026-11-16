import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  PANG_REF_SHA256,
  checkEnvExample,
  scanFiles,
  scanText,
  sha256Hex,
} from '../../scripts/supabase-check/separation';

// SPEC 11절 9번: ddooby-pang 프로젝트의 URL·키가 이 레포 어디에도 없다.
// pang ref를 평문으로 쓰면 이 테스트 파일부터 걸리므로 SHA-256만 비교한다 (separation.ts).

const git = (...args: string[]) => execFileSync('git', args, { encoding: 'utf8' });

/** 추적 중인 텍스트 파일 전부 (이진 파일은 건너뛴다) */
function trackedTextFiles(): { path: string; text: string }[] {
  const paths = git('ls-files', '-z').split('\0').filter(Boolean);
  const files: { path: string; text: string }[] = [];
  for (const path of paths) {
    let text: string;
    try {
      text = readFileSync(path, 'utf8');
    } catch {
      continue; // 삭제됐거나 읽을 수 없는 항목 (작업 트리에서 빠진 추적 파일)
    }
    if (text.includes('\0')) continue;
    files.push({ path, text });
  }
  return files;
}

describe('pang 프로젝트 분리 (SPEC 11절 9번)', () => {
  it('추적 파일 전체에 pang ref·Supabase 실제 URL·API 키가 없다', () => {
    const files = trackedTextFiles();
    expect(files.length).toBeGreaterThan(50); // git ls-files가 비어서 통과하는 것을 막는다
    const findings = scanFiles(files);
    expect(findings).toEqual([]);
  });

  it('추적 파일 목록을 실제로 읽는다 (문서·설정 파일이 들어 있다)', () => {
    const paths = trackedTextFiles().map((f) => f.path);
    expect(paths).toContain('docs/SPEC.md');
    expect(paths).toContain('package.json');
  });

  it('.env.example에는 변수 이름과 자리표시만 있고 실제 값이 없다', () => {
    const problems = checkEnvExample(readFileSync('.env.example', 'utf8'), [
      'VITE_SUPABASE_URL',
      'VITE_SUPABASE_PUBLISHABLE_KEY',
    ]);
    expect(problems).toEqual([]);
  });

  it('.env.local과 supabase/.temp는 git이 무시하고 .env.example은 무시하지 않는다', () => {
    const ignored = (path: string) => {
      try {
        git('check-ignore', '-q', path);
        return true;
      } catch {
        return false; // 종료 코드 1: 무시되지 않음
      }
    };
    expect(ignored('.env.local')).toBe(true);
    expect(ignored('supabase/.temp/project-ref')).toBe(true);
    expect(ignored('.env.example')).toBe(false);
  });
});

describe('분리 검사기 (scanText·checkEnvExample)', () => {
  // 이 시험의 가짜 ref는 pang 것이 아니다. 검사기가 해시 비교로 동작하는지 보려고 해시를 따로 준다
  const fakeRef = 'abcdefghij0123456789';
  const refHash = sha256Hex(fakeRef);
  const scan = (text: string) => scanText('x.md', text, { refHash });
  // 키·URL 모양의 시험 값은 조각을 런타임에 이어 붙인다. 평문으로 쓰면 위의 레포 전체 검사가 이 파일을 잡는다
  const HOST = ['supabase', 'co'].join('.');
  const PUBLISHABLE = ['sb', 'publishable', ''].join('_');
  const SECRET = ['sb', 'secret', ''].join('_');
  const JWT_LIKE = ['eyJ' + 'A'.repeat(12), 'eyJ' + 'B'.repeat(12), 'sig'].join('.');

  it('상수 해시는 SHA-256 형식이다', () => {
    expect(PANG_REF_SHA256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('URL 안의 ref를 찾는다', () => {
    expect(scan(`URL=https://${fakeRef}.supabase.co`)).toEqual([
      { file: 'x.md', kind: 'pang-ref', line: 1 },
    ]);
  });

  it('맨 ref·대문자·주석 속 ref도 찾고 줄 번호를 알려 준다', () => {
    const found = scan(`첫 줄\n// ${fakeRef}\n셋째 ${fakeRef.toUpperCase()}`);
    expect(found.map((f) => [f.kind, f.line])).toEqual([
      ['pang-ref', 2],
      ['pang-ref', 3],
    ]);
  });

  it('호스트 라벨이 ref와 같으면 다른 글자가 붙어 있어도 URL로 잡는다', () => {
    expect(scan(`https://${fakeRef}.supabase.co/rest/v1`)[0]?.kind).toBe('pang-ref');
  });

  it('ref 길이(20자)의 다른 Supabase URL도 실제 프로젝트 URL로 보고 막는다', () => {
    expect(scan(`https://${'z'.repeat(20)}.${HOST}`)[0]?.kind).toBe('supabase-url');
  });

  it('자리표시·일반 문서 문구는 통과한다', () => {
    expect(scan('https://<ref>.supabase.co')).toEqual([]);
    expect(scan('https://your-project.supabase.co')).toEqual([]);
    expect(scan('Supabase 대시보드 → Project Settings → API Keys')).toEqual([]);
    expect(scan('abcdefghij012345678')).toEqual([]); // 19자
    expect(scan('abcdefghij01234567890')).toEqual([]); // 21자
  });

  it('API 키 모양을 막는다 (publishable·secret·JWT), 접두어만 있는 설명은 통과', () => {
    expect(scan(`KEY=${PUBLISHABLE}${'A'.repeat(14)}`)[0]?.kind).toBe('api-key');
    expect(scan(`KEY=${SECRET}${'A'.repeat(16)}`)[0]?.kind).toBe('api-key');
    expect(scan(JWT_LIKE)[0]?.kind).toBe('api-key');
    expect(scan('secret key는 sb_secret_ 로 시작한다')).toEqual([]);
  });

  it('발견 결과에 값 자체를 싣지 않는다', () => {
    const json = JSON.stringify(scan(`https://${fakeRef}.supabase.co`));
    expect(json).not.toContain(fakeRef);
  });

  it('scanFiles는 파일별 결과를 합친다', () => {
    const found = scanFiles(
      [
        { path: 'a.md', text: 'clean' },
        { path: 'b.md', text: `x ${fakeRef}` },
      ],
      { refHash },
    );
    expect(found).toEqual([{ file: 'b.md', kind: 'pang-ref', line: 1 }]);
  });

  it('checkEnvExample: 값이 있거나 변수가 빠지면 문제로 보고한다', () => {
    const keys = ['A', 'B'];
    expect(checkEnvExample('# 설명\nA=\nB=<여기에 입력>\n', keys)).toEqual([]);
    expect(checkEnvExample('A=\n', keys)).toEqual([{ key: 'B', reason: 'missing' }]);
    expect(checkEnvExample('A=https://x.example\nB=\n', keys)).toEqual([
      { key: 'A', reason: 'has-value' },
    ]);
  });
});
