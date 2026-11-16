// Edge Function이 쓸 src 코드를 rolldown으로 한 파일씩 묶어 supabase/functions/_shared/에 둔다 (PLAN 7절).
// pang scripts/server-shared/build.ts에서 복사해 nickname target만 남기고, 파일 쓰기·비교를 build.ts로 나눠 시험할 수 있게 했다.
// 타입은 tsc 선언 파일로 옆에 두고, JS 맨 위의 @ts-self-types로 Deno에 알려 준다.
// W3-03: 리플레이(core)·판정 target(src/replay/server.ts)을 더했다. 그 선언은 여러 파일에 걸치므로 한 파일로 합친다 (declaration).
import { basename, dirname, resolve } from 'node:path';
// rolldown은 devDependency로 버전을 고정한다 (package.json). vite도 같은 버전을 쓴다
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
  { entry: 'src/replay/server.ts', out: 'supabase/functions/_shared/replay.js' },
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
 * entry의 선언(.d.ts)을 한 파일로 만든다. tsc가 파일마다 낸 선언에서 import·re-export를 지우고 의존하는 파일의 선언을 앞에 이어 붙인다.
 * entry가 내보내는 이름만 `export`를 남기고 나머지는 이 파일 안의 비공개 선언으로 둔다 (JS 번들의 export와 같은 집합).
 * 다른 파일에 같은 이름의 선언이 둘 있거나(이름 충돌), 상대 경로가 아닌 import가 있거나, 이름을 바꾼 re-export가 있으면 실패한다.
 */
export function declaration(entry: string): string {
  const file = resolve(ROOT, entry);
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
  const emitted = new Map<string, string>();
  program.emit(undefined, (out, data, _bom, _onError, sources) => {
    const source = sources?.[0];
    if (out.endsWith('.d.ts') && source) emitted.set(resolve(source.fileName), data);
  });
  if (!emitted.has(file)) throw new Error(`${entry} 선언 파일을 만들지 못했다`);

  // entry가 내보내는 이름. 이름을 바꿔 내보내면 선언의 이름과 달라 묶을 수 없다
  const checker = program.getTypeChecker();
  const entrySource = program.getSourceFile(file);
  const entrySymbol = entrySource && checker.getSymbolAtLocation(entrySource);
  if (!entrySymbol) throw new Error(`${entry}가 모듈이 아니다`);
  const exported = new Set<string>();
  for (const symbol of checker.getExportsOfModule(entrySymbol)) {
    const target = symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
    if (target.name !== symbol.name) {
      throw new Error(`${entry}: ${target.name}을 ${symbol.name}으로 바꿔 내보낼 수 없다`);
    }
    exported.add(symbol.name);
  }

  // 의존하는 파일이 앞에 오도록 깊이 우선으로 모은다
  const order: string[] = [];
  const seen = new Set<string>();
  const visit = (path: string): void => {
    if (seen.has(path)) return;
    seen.add(path);
    const text = emitted.get(path);
    if (text === undefined) throw new Error(`선언을 만들지 못했다: ${path}`);
    const sf = ts.createSourceFile(path, text, ts.ScriptTarget.ES2022, true);
    for (const st of sf.statements) {
      if (
        (ts.isImportDeclaration(st) || ts.isExportDeclaration(st)) &&
        st.moduleSpecifier !== undefined &&
        ts.isStringLiteral(st.moduleSpecifier)
      ) {
        const spec = st.moduleSpecifier.text;
        if (!spec.startsWith('.')) throw new Error(`${path} 선언이 외부 모듈 ${spec}을 가져온다`);
        visit(resolve(dirname(path), `${spec}.ts`));
      }
    }
    order.push(path);
  };
  visit(file);

  const declared = new Map<string, string>();
  const parts: string[] = [];
  for (const path of order) {
    const text = emitted.get(path) ?? '';
    const sf = ts.createSourceFile(path, text, ts.ScriptTarget.ES2022, true);
    const edits: { start: number; end: number; replace: string }[] = [];
    for (const st of sf.statements) {
      if (ts.isImportDeclaration(st) || ts.isExportDeclaration(st)) {
        edits.push({ start: st.getFullStart(), end: st.getEnd(), replace: '' });
        continue;
      }
      if (ts.isExportAssignment(st))
        throw new Error(`${path}: export default·export =는 묶을 수 없다`);
      const exportKw = ts.canHaveModifiers(st)
        ? ts.getModifiers(st)?.find((m) => m.kind === ts.SyntaxKind.ExportKeyword)
        : undefined;
      const names = declaredNames(st);
      for (const name of names) {
        const prev = declared.get(name);
        if (prev !== undefined) throw new Error(`선언 이름 충돌: ${name} (${prev}, ${path})`);
        declared.set(name, path);
      }
      if (exportKw !== undefined && !names.every((n) => exported.has(n))) {
        edits.push({ start: exportKw.getStart(sf), end: exportKw.getEnd() + 1, replace: '' });
      }
    }
    let out = text;
    for (const e of edits.sort((a, b) => b.start - a.start)) {
      out = out.slice(0, e.start) + e.replace + out.slice(e.end);
    }
    parts.push(out.trim());
  }
  for (const name of exported) {
    if (!declared.has(name)) throw new Error(`${entry}: 내보내는 ${name}의 선언을 찾지 못했다`);
  }
  return `${parts.filter((p) => p !== '').join('\n')}\n`;
}

/** 최상위 선언문이 정하는 이름들 */
function declaredNames(st: ts.Statement): string[] {
  if (ts.isVariableStatement(st)) {
    return st.declarationList.declarations.flatMap((d) =>
      ts.isIdentifier(d.name) ? [d.name.text] : [],
    );
  }
  if (
    ts.isFunctionDeclaration(st) ||
    ts.isInterfaceDeclaration(st) ||
    ts.isTypeAliasDeclaration(st) ||
    ts.isClassDeclaration(st) ||
    ts.isEnumDeclaration(st)
  ) {
    return st.name ? [st.name.text] : [];
  }
  return [];
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
