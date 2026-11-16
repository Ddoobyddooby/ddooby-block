// Edge Function이 쓸 src 코드를 rolldown으로 한 파일씩 묶어 supabase/functions/_shared/에 둔다 (PLAN 7절).
// pang scripts/server-shared/build.ts에서 복사해 nickname target만 남기고, 파일 쓰기·비교를 build.ts로 나눠 시험할 수 있게 했다.
// 타입은 tsc 선언 파일로 옆에 두고, JS 맨 위의 @ts-self-types로 Deno에 알려 준다.
// W3-03에서 리플레이(core) target을 여기에 더한다.
import { basename, resolve } from 'node:path';
import { build } from 'rolldown';
import ts from 'typescript';

export interface Target {
  /** 저장소 루트 기준 입력 파일 */
  entry: string;
  /** 저장소 루트 기준 출력 .js. 같은 이름의 .d.ts를 옆에 만든다 */
  out: string;
}

export const TARGETS: readonly Target[] = [
  { entry: 'src/online/nicknameRules.ts', out: 'supabase/functions/_shared/nicknameRules.js' },
];

/** 저장소 루트 (scripts/server-shared/ 기준 두 단계 위) */
export const ROOT = resolve(import.meta.dirname, '../..');

/** target 하나를 묶어 {저장소 루트 기준 경로 → 파일 내용}으로 돌려준다. 파일은 쓰지 않는다 */
export async function bundle(target: Target): Promise<Map<string, string>> {
  const header = `// 자동 생성: npm run server:shared (${target.entry}). 직접 고치지 않는다\n`;
  const result = await build({
    input: resolve(ROOT, target.entry),
    platform: 'neutral',
    write: false,
    output: { format: 'esm' },
  });
  const chunk = result.output[0];
  const dts = basename(target.out).replace(/\.js$/, '.d.ts');
  const files = new Map<string, string>();
  files.set(target.out, `${header}// @ts-self-types="./${dts}"\n${chunk.code}`);
  files.set(target.out.replace(/\.js$/, '.d.ts'), header + declaration(target.entry));
  return files;
}

/**
 * entry 파일의 선언(.d.ts). 다른 파일의 타입을 참조하면 그 파일도 같이 묶어야 하므로 import가 남으면 실패
 */
export function declaration(entry: string): string {
  const file = resolve(ROOT, entry);
  let text: string | undefined;
  const program = ts.createProgram([file], {
    declaration: true,
    emitDeclarationOnly: true,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    strict: true,
    skipLibCheck: true,
    types: [],
  });
  program.emit(program.getSourceFile(file), (out, data) => {
    if (out.endsWith('.d.ts')) text = data;
  });
  if (text === undefined) throw new Error(`${entry} 선언 파일을 만들지 못했다`);
  if (/^import |^export .* from /m.test(text)) {
    throw new Error(`${entry} 선언에 다른 파일 참조가 남았다`);
  }
  return text;
}

/** 모든 target을 묶는다 */
export async function bundleAll(): Promise<Map<string, string>> {
  const files = new Map<string, string>();
  for (const target of TARGETS) {
    for (const [path, text] of await bundle(target)) files.set(path, text);
  }
  return files;
}

/**
 * 다시 만든 결과(files)와 지금 파일(read가 돌려주는 내용, 없으면 null)이 다른 경로 목록.
 * 파일을 읽을 수 있는 쪽(build.ts)과 시험(가짜 read)이 같은 비교를 쓴다
 */
export function findStale(
  files: ReadonlyMap<string, string>,
  read: (path: string) => string | null,
): string[] {
  const stale: string[] = [];
  for (const [path, text] of files) {
    if (read(path) !== text) stale.push(path);
  }
  return stale;
}
