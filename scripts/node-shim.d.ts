// scripts/·tests/supabase가 쓰는 Node API의 최소 타입 선언.
// @types/node를 의존성에 넣지 않고(W3-01 승인 범위는 @supabase/supabase-js뿐) typecheck를 통과시키려는 용도다.
// 쓰는 API가 늘면 여기에 더하거나, 그때 @types/node 도입을 사용자에게 묻는다.

declare module 'node:fs' {
  export function readFileSync(path: string, encoding: 'utf8'): string;
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
}

declare module 'node:crypto' {
  export function createHash(algorithm: 'sha256'): {
    update(data: string): { digest(encoding: 'hex'): string };
  };
}

declare const process: {
  argv: string[];
  exit(code?: number): never;
};
