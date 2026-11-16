// scripts/·tests/supabase가 쓰는 Node API의 최소 타입 선언.
// @types/node를 의존성에 넣지 않고(W3-01 승인 범위는 @supabase/supabase-js뿐) typecheck를 통과시키려는 용도다.
// 쓰는 API가 늘면 여기에 더하거나, 그때 @types/node 도입을 사용자에게 묻는다.

declare module 'node:fs' {
  export function readFileSync(path: string, encoding: 'utf8'): string;
  export function writeFileSync(path: string, data: string): void;
  export function mkdirSync(path: string, options: { recursive: true }): string | undefined;
  /** W3-03 서버 번들 대조 시험이 임시 입력 파일을 만든다 */
  export function mkdtempSync(prefix: string): string;
}

declare module 'node:os' {
  export function tmpdir(): string;
}

declare module 'node:path' {
  export function basename(path: string): string;
  export function dirname(path: string): string;
  export function resolve(...paths: string[]): string;
  export function join(...paths: string[]): string;
}

declare module 'node:util' {
  export function parseEnv(content: string): Record<string, string | undefined>;
}

declare module 'node:child_process' {
  export function execFileSync(
    file: string,
    args: readonly string[],
    options: { encoding: 'utf8'; cwd?: string; maxBuffer?: number },
  ): string;
  /** W3-03 서버 번들 대조 시험이 Node·Deno 별도 프로세스를 실행한다 */
  export function spawnSync(
    file: string,
    args: readonly string[],
    options: { encoding: 'utf8'; maxBuffer?: number; env?: Record<string, string> },
  ): { status: number | null; stdout: string; stderr: string; error?: Error };
}

// Node와 Deno가 같은 파일을 실행하는 시험 러너(tests/server-shared/runners)가 쓴다
declare module 'node:process' {
  const process: {
    argv: string[];
    stdout: { write(text: string): boolean };
  };
  export default process;
}

/** 원격 시험(scripts/supabase-check)이 새 연결(keep-alive 끔)로 함수를 부른다 */
declare module 'node:https' {
  export class Agent {
    constructor(options: { keepAlive: boolean });
  }
  export function request(
    options: {
      hostname: string;
      path: string;
      method: string;
      agent: Agent;
      headers: Record<string, string>;
      timeout: number;
    },
    callback: (res: {
      statusCode?: number;
      setEncoding(encoding: 'utf8'): void;
      headers: Record<string, string | string[] | undefined>;
      on(event: 'data', listener: (chunk: string) => void): void;
      on(event: 'end', listener: () => void): void;
      on(event: 'error', listener: () => void): void;
    }) => void,
  ): {
    on(event: 'timeout' | 'error', listener: () => void): void;
    destroy(): void;
    end(data?: string): void;
  };
}

declare module 'node:crypto' {
  export function createHash(algorithm: 'sha256'): {
    update(data: string): { digest(encoding: 'hex'): string };
  };
}

// Node 20.11+의 import.meta.dirname (vite/client 타입에는 없다)
interface ImportMeta {
  readonly dirname: string;
}

declare const process: {
  argv: string[];
  env: Record<string, string | undefined>;
  execPath: string;
  exit(code?: number): never;
};
