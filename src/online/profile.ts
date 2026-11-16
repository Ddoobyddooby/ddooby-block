// 닉네임 읽기·정하기 (PLAN 7절). 쓰기는 Edge Function set-nickname만 한다 (profiles는 클라이언트 쓰기 금지).
// pang src/online/profile.ts에서 복사해 응답 검사를 엄격하게 했다: 손상된 행은 'error', 200은 요청한 이름과 같아야 성공, 409는 already-set 코드가 있어야 중복
import type { Account } from './account';
import { checkNickname, isValidTag, type NicknameErrorCode } from './nicknameRules';

export interface MyProfile {
  nickname: string;
  tag: number;
}

export type SetNicknameErrorCode =
  NicknameErrorCode | 'already-set' | 'network' | 'server' | 'unauthorized';

export type SetNicknameResult =
  { ok: true; nickname: string; tag: number } | { ok: false; code: SetNicknameErrorCode };

const RULE_CODES: readonly string[] = [
  'too-short',
  'too-long',
  'bad-chars',
  'banned',
] satisfies NicknameErrorCode[];

export interface Profile {
  /** 닉네임이 있으면 {nickname, tag}, 아직 없으면 null, 계정 없음·조회 실패·손상된 행이면 'error' */
  getMyProfile(): Promise<MyProfile | null | 'error'>;
  setNickname(name: string): Promise<SetNicknameResult>;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * profiles 행 → 결과. 행 없음·닉네임과 태그가 둘 다 null이면 아직 안 정한 것(null).
 * 모양이 다르거나 한쪽만 비어 있거나 태그가 범위 밖이면 손상으로 보고 'error'
 * (미설정으로 위장하면 이미 이름이 있는 사람에게 다시 묻는다)
 */
export function parseProfileRow(row: unknown): MyProfile | null | 'error' {
  if (row === null || row === undefined) return null;
  const rec = asRecord(row);
  if (!rec) return 'error';
  const { nickname, tag } = rec;
  if (nickname === null && tag === null) return null;
  if (typeof nickname !== 'string' || nickname.length === 0 || !isValidTag(tag)) return 'error';
  return { nickname, tag };
}

export function createProfile(account: Account): Profile {
  return {
    async getMyProfile() {
      const backend = account.backend();
      const userId = account.userId();
      if (!backend || !userId) return 'error';
      try {
        const row = await backend.fetchProfile(userId);
        // 기다리는 사이 계정이 바뀌었으면(로그아웃·다른 계정) 그 응답은 지금 계정의 것이 아니다
        if (account.userId() !== userId) return 'error';
        return parseProfileRow(row);
      } catch {
        return 'error';
      }
    },

    async setNickname(name) {
      const check = checkNickname(name);
      if (!check.ok) return check;
      const backend = account.backend();
      const userId = account.userId();
      if (!backend || !userId) return { ok: false, code: 'network' };
      let res;
      try {
        res = await backend.callFunction('set-nickname', { nickname: check.nickname });
      } catch {
        return { ok: false, code: 'network' };
      }
      if (res === 'network') return { ok: false, code: 'network' };
      const body = asRecord(res.body) ?? {};
      switch (res.status) {
        case 200:
          return body.nickname === check.nickname && isValidTag(body.tag)
            ? { ok: true, nickname: check.nickname, tag: body.tag }
            : { ok: false, code: 'server' };
        case 400:
          return typeof body.code === 'string' && RULE_CODES.includes(body.code)
            ? { ok: false, code: body.code as NicknameErrorCode }
            : { ok: false, code: 'server' };
        case 401:
          return { ok: false, code: 'unauthorized' };
        case 409:
          return body.code === 'already-set'
            ? { ok: false, code: 'already-set' }
            : { ok: false, code: 'server' };
        default:
          return { ok: false, code: 'server' };
      }
    },
  };
}
