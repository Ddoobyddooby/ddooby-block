// 닉네임 규칙의 독립 리터럴 코퍼스. 금칙어 목록을 순회해 기대값을 만들면 오탐을 못 잡으므로 사람이 정한 이름을 그대로 적는다.
// tests/online/nicknameRules.test.ts(클라이언트 원본)와 tests/server-shared/bundle.test.ts(서버용 생성본)가 같이 쓴다.

import type { NicknameErrorCode } from '../../src/online/nicknameRules';

/** 통과하는 이름 (저장 이름 = 정규화한 입력) */
export const PASS_NAMES: readonly string[] = [
  '뚜비',
  '이안',
  '블록왕',
  '도전123',
  'BlueSky',
  'AB',
  '00',
  '가나다라마바사아자차', // 정확히 10자
  // 금칙어를 품은 정상 말 (예외 목록)
  '시발점',
  '무지개새',
  '새끼고양이',
  '새끼강아지',
  '새끼손가락',
  '닥쳐오는봄',
  '해보지',
  '보지마',
  '남자지만',
  '여자지요',
  '누나야동생',
  'Sussex',
  'Essex',
  'Pussycat',
  // 사칭 접두는 접두일 때만 막는다 (포함 검사가 아니다)
  '수학공식',
  'Badminton',
];

/** 거부되는 이름과 이유 */
export const REJECT_NAMES: readonly (readonly [string, NicknameErrorCode])[] = [
  ['', 'too-short'],
  ['뚜', 'too-short'],
  ['😀', 'too-short'], // 코드 포인트 1
  ['ㅋ', 'too-short'],
  ['가나다라마바사아자차카', 'too-long'], // 11자
  ['!!!!!!!!!!!', 'too-long'], // 길이가 글자 종류보다 먼저
  ['뚜 비', 'bad-chars'], // 내부 공백
  ['뚜\t비', 'bad-chars'],
  ['뚜\n비', 'bad-chars'],
  ['ㅋㅋ', 'bad-chars'], // 단독 자모
  ['ㅏㅏ', 'bad-chars'],
  ['ＡＢ', 'bad-chars'], // 전자 영문
  ['😀😀', 'bad-chars'],
  ['뚜비!', 'bad-chars'],
  ['뚜.비', 'bad-chars'],
  ['뚜​비', 'bad-chars'], // ZWSP
  ['뚜‍비', 'bad-chars'], // ZWJ
  ['뚜‌비', 'bad-chars'], // ZWNJ
  ['뚜‮비', 'bad-chars'], // 방향 제어
  ['뚜비️', 'bad-chars'], // variation selector
  ['​뚜비', 'bad-chars'], // 앞의 ZWSP는 trim으로 지워지지 않는다
  // 금칙어
  ['시발', 'banned'],
  ['시1발', 'banned'],
  ['FuCk', 'banned'],
  ['시발왕', 'banned'],
  ['시발점시발', 'banned'], // 예외 바깥에 한 번 더
  ['개새끼고양이', 'banned'], // 예외(새끼고양이) 밖의 개새
  // 운영자 사칭 (접두)
  ['관리자님', 'banned'],
  ['운영자1', 'banned'],
  ['admin7', 'banned'],
  ['Official왕', 'banned'],
  ['공식계정', 'banned'],
  // R18 알려진 오탐: 어린이 대상이라 오탐을 감수하고 거부를 유지한다 (사용자가 정하면 바꾼다. 예외를 임의로 넓히지 않는다)
  ['가보지', 'banned'],
  ['먹어보지', 'banned'],
  ['감자지', 'banned'],
  ['모자지', 'banned'],
  ['새끼줄', 'banned'],
  ['개새우', 'banned'],
  ['시발택시', 'banned'],
  ['sexton', 'banned'],
];

/** 앞뒤 공백·BOM·NBSP는 지우고 판정한다: [입력, 저장 이름] */
export const TRIM_NAMES: readonly (readonly [string, string])[] = [
  ['  뚜비  ', '뚜비'],
  ['\n뚜비\n', '뚜비'],
  ['﻿뚜비', '뚜비'],
  ['뚜비 ', '뚜비'],
  ['뚜비'.normalize('NFD'), '뚜비'], // 조합형 → 완성형
  ['가나다라마바사아자차'.normalize('NFD'), '가나다라마바사아자차'],
];
