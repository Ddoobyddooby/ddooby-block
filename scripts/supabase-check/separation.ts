// ddooby-pang 프로젝트와의 분리 검사 (SPEC 11절 9번). 순수 함수라 파일·git 없이도 시험한다.
//
// pang 프로젝트 ref는 이 저장소 어디에도 평문으로 쓸 수 없다 (그것이 검사 대상이라 시험 파일도 걸린다).
// 그래서 ref의 SHA-256만 상수로 두고, 파일의 후보 문자열을 같은 방식으로 해시해 비교한다.
// 해시는 되돌릴 수 없으므로 이 파일에서 ref를 알아낼 수 없다.

import { createHash } from 'node:crypto';

/** pang 프로젝트 ref(20자 소문자·숫자)의 SHA-256 */
export const PANG_REF_SHA256 = '192e7983d6bf56e679ca362c9b96c564e735a12dcc12f21a5bfb824cc08428bf';

export const sha256Hex = (text: string): string => createHash('sha256').update(text).digest('hex');

export interface Finding {
  file: string;
  /** 무엇이 발견됐는지. 값 자체는 남기지 않는다 (비밀이 로그에 찍히지 않게) */
  kind: 'pang-ref' | 'supabase-url' | 'api-key';
  line: number;
}

/** Supabase 프로젝트 ref는 20자 소문자·숫자다 */
const REF_LENGTH = 20;
/** `<라벨>.supabase.co` 형태의 호스트. 라벨 길이가 ref와 같으면 실제 프로젝트 URL이다 */
const SUPABASE_HOST = /([a-z0-9-]+)\.supabase\.(?:co|in|net)\b/gi;
/** 키 모양: 새 형식 publishable/secret 키, 구형 JWT(anon·service_role) */
const KEY_PATTERNS = [
  /sb_(?:publishable|secret)_[A-Za-z0-9_-]{10,}/,
  /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}/,
];

/** 한 파일 내용을 검사한다 */
export function scanText(
  file: string,
  text: string,
  options: { refHash?: string } = {},
): Finding[] {
  const refHash = options.refHash ?? PANG_REF_SHA256;
  const found: Finding[] = [];
  const lines = text.split('\n');
  lines.forEach((raw, index) => {
    const line = index + 1;
    const lower = raw.toLowerCase();
    let hit: Finding['kind'] | null = null;

    // 20자 소문자·숫자 덩어리(ref 후보)를 해시로 비교한다
    for (const match of lower.matchAll(/[a-z0-9]+/g)) {
      if (match[0].length === REF_LENGTH && sha256Hex(match[0]) === refHash) hit = 'pang-ref';
    }
    // 호스트 라벨이 ref면 `https://<ref>.supabase.co` 같은 URL이다 (라벨이 길어 위 검사에 안 걸리는 경우 포함)
    for (const match of lower.matchAll(SUPABASE_HOST)) {
      const label = match[1] ?? '';
      if (sha256Hex(label) === refHash) hit = 'pang-ref';
      else if (hit === null && label.length === REF_LENGTH && /^[a-z0-9]+$/.test(label)) {
        hit = 'supabase-url'; // pang 것은 아니지만 실제 프로젝트 URL은 레포에 두지 않는다
      }
    }
    if (hit === null && KEY_PATTERNS.some((pattern) => pattern.test(raw))) hit = 'api-key';
    if (hit !== null) found.push({ file, kind: hit, line });
  });
  return found;
}

/** 모든 파일을 검사한다. 읽을 수 없는 파일은 호출한 쪽이 걸러서 넘긴다 */
export function scanFiles(
  files: readonly { path: string; text: string }[],
  options: { refHash?: string } = {},
): Finding[] {
  return files.flatMap((f) => scanText(f.path, f.text, options));
}

export interface EnvExampleProblem {
  key: string;
  reason: 'missing' | 'has-value';
}

/** `.env.example`에 필요한 변수가 있고 값은 비어 있는지 (또는 `<...>` 자리표시인지) */
export function checkEnvExample(text: string, keys: readonly string[]): EnvExampleProblem[] {
  const values = new Map<string, string>();
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq > 0) values.set(line.slice(0, eq).trim(), line.slice(eq + 1).trim());
  }
  const problems: EnvExampleProblem[] = [];
  for (const key of keys) {
    const value = values.get(key);
    if (value === undefined) problems.push({ key, reason: 'missing' });
    else if (value !== '' && !/^<[^>]*>$/.test(value)) problems.push({ key, reason: 'has-value' });
  }
  return problems;
}
