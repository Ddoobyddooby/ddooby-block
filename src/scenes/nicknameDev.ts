// DEV 전용 `?ranking=fake`: 서버·계정 없이 닉네임 창의 글자 입력·거부 문구·[나중에]·연타를 눈으로 확인하는 가짜 제출 함수.
// 호출부의 `import.meta.env.DEV`와 함께 프로덕션 빌드에서 지워진다. 규칙 판정은 실제 checkNickname을 쓴다.
//
// 이 이름을 쓰면 해당 결과가 나온다 (규칙을 통과하는 한글 이름):
//   서버오류 → server / 연결끊김 → network / 권한없음 → unauthorized / 이미있음 → already-set / 무응답 → 응답 없음(10초 뒤 시간 초과)
// 그 밖의 이름은 0.4초 뒤 `#0427`로 성공한다.
import { checkNickname } from '../online';
import type { NicknameResult } from '../view/nicknamePromptState';

const CANNED: Record<string, NicknameResult | null> = {
  서버오류: { ok: false, code: 'server' },
  연결끊김: { ok: false, code: 'network' },
  권한없음: { ok: false, code: 'unauthorized' },
  이미있음: { ok: false, code: 'already-set' },
  무응답: null,
};

export function fakeSubmit(name: string): Promise<NicknameResult> {
  const check = checkNickname(name);
  if (!check.ok) return Promise.resolve({ ok: false, code: check.code });
  const canned = CANNED[check.nickname];
  if (canned === null) return new Promise(() => undefined); // 끝나지 않는 요청
  if (canned !== undefined) return delay(canned);
  return delay({ ok: true, nickname: check.nickname, tag: '#0427' });
}

function delay(result: NicknameResult): Promise<NicknameResult> {
  return new Promise((resolve) => setTimeout(() => resolve(result), 400));
}
