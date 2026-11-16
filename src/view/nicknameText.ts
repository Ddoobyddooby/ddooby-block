// 닉네임 입력 창의 문구 (W3-02, PLAN 7절). 화면 글자를 한곳에 모은다 (pang src/view/nicknameText.ts에서 복사).
// 오류 code는 src/online 쪽 판정과 같은 이름이다. 이 창은 "이름 정하기"까지만 한다: 점수 제출·랭킹 등록은 W3-03·04라서
// 성공 문구가 "랭킹에 등록됐다"로 읽히지 않게 쓴다.

export type NicknameErrorCode =
  | 'too-short'
  | 'too-long'
  | 'bad-chars'
  | 'banned'
  | 'already-set'
  | 'network'
  | 'server'
  | 'unauthorized';

export interface NicknamePromptText {
  title: string;
  confirm: string;
  later: string;
  placeholder: string;
  /** 입력칸 아래 작은 안내 (저장 전) */
  notice: string;
  /** [나중에]를 눌렀을 때 닫기 전에 잠깐 보여 준다 */
  laterNotice: string;
  /** 정한 이름 ("이름을 정했어요: 뚜비#0427"). tag는 `#0427` 형태 */
  success: (nickname: string, tag: string) => string;
  errors: Record<NicknameErrorCode, string>;
}

const OFFLINE = '지금은 연결이 안 돼요. 다음에 다시 물어볼게요';

export const NICKNAME_TEXT: NicknamePromptText = {
  title: '랭킹에 쓸 이름을 정해 주세요',
  confirm: '확인',
  later: '나중에',
  placeholder: '이름',
  notice: '한 번 정하면 바꿀 수 없어요. 실명은 쓰지 마세요',
  laterNotice: '이름을 정하기 전까지 기록이 랭킹에 보이지 않아요',
  success: (nickname, tag) => `이름을 정했어요: ${nickname}${tag}`,
  errors: {
    'too-short': '두 글자 이상 써 주세요',
    'too-long': '열 글자까지 쓸 수 있어요',
    'bad-chars': '한글·영문·숫자만 쓸 수 있어요',
    banned: '쓸 수 없는 말이 들어 있어요',
    'already-set': '이미 이름이 있어요',
    network: OFFLINE,
    server: OFFLINE,
    unauthorized: OFFLINE,
  },
};
