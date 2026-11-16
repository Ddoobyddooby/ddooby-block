// Edge Function이 쓸 src 코드를 묶어 supabase/functions/_shared/에 쓴다 (bundle.ts).
//
//   npm run server:shared          다시 만들어 쓴다
//   npm run server:shared:check    파일을 쓰지 않고, 다시 만든 결과가 커밋본과 다르면 exit 1 (CI·완료 검증)
//
// 종료 코드: 0 일치(또는 생성 완료) / 1 커밋본과 다름 (--check) / 2 묶기·선언 생성 오류
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { bundleAll, findStale, ROOT } from './bundle.ts';

function readOrNull(path: string): string | null {
  try {
    return readFileSync(resolve(ROOT, path), 'utf8');
  } catch {
    return null; // 아직 없는 파일
  }
}

async function main(): Promise<number> {
  const check = process.argv.includes('--check');
  const files = await bundleAll();
  const stale = findStale(files, readOrNull);

  if (check) {
    if (stale.length > 0) {
      console.error(
        `커밋본이 src와 다르다. npm run server:shared로 다시 만들어 커밋한다:\n  ${stale.join('\n  ')}`,
      );
      return 1;
    }
    console.log(`server:shared 일치 (${files.size}개 파일)`);
    return 0;
  }
  for (const path of stale) {
    const abs = resolve(ROOT, path);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, files.get(path) ?? '');
    console.log(`썼다: ${path}`);
  }
  if (stale.length === 0) console.log('바뀐 파일 없음');
  return 0;
}

main().then(
  (code) => process.exit(code),
  (e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(2);
  },
);
