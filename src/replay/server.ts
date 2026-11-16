// Edge Function(start-run·submit-score)이 가져가는 서버 진입점. `npm run server:shared`가 이 파일 하나를 묶어
// supabase/functions/_shared/replay.js(+ .d.ts)로 만든다. 여기서 내보내는 이름만 서버에서 쓸 수 있다.
//
// 서버는 점수·배치 규칙을 다시 구현하지 않고 core의 replay를 그대로 쓴다 (같은 seed + 같은 로그 + 같은 규칙 버전 = 같은 점수).
// weekKey·시간·DB는 core 밖의 일이다 (judge.ts·handler). 번들이 src와 어긋나지 않는지는 `server:shared:check`와
// tests/server-shared/serverParity.test.ts(Node·Deno에서 같은 로그를 실제로 돌려 대조)가 지킨다.
// place·canPlace·getPiece·nextInt는 서버 판정이 아니라 원격 시험(scripts/supabase-check, 서버 발급 seed로 봇 로그를 만든다)이 쓴다.

export { REPLAY, RULES_VERSION } from '../config';
export { canPlace } from '../core/board';
export { createGame, place } from '../core/engine';
export { generateTray } from '../core/generator';
export { getPiece } from '../core/pieces';
export { checkIntervals, replay } from '../core/replay';
export { createRng, nextInt } from '../core/rng';
export {
  checkElapsed,
  isRulesVersion,
  isUuid,
  JUDGE,
  parseSubmission,
  readStoredResult,
  resubmitDecision,
  submissionHash,
  verifyContent,
} from './judge';
export type {
  ContentRejection,
  ContentVerdict,
  FormatCode,
  ParseResult,
  ReplayReason,
  StoredResult,
  Submission,
} from './judge';
export { weekKey } from './weekKey';
