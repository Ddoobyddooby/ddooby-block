// DEV `?ranking`의 닉네임 묻기 진행 (W3-02). GameOver 씬이 새로 뜰 때 만들고 떠날 때 끝낸다.
// 별도 파일로 둔 이유: GameOver 씬의 `import.meta.env.DEV` 분기 안에서만 쓰여 프로덕션 번들에서 통째로 지워지게 하려는 것이다
// (씬 클래스의 메서드는 안 쓰여도 번들에 남는다).
//
// 점수 제출·랭킹 등록과는 연결하지 않는다 (W3-03·04). 규칙은 nicknameGate.ts.
import {
  currentUserId,
  formatTag,
  getMyProfile,
  isNetworkOnline,
  onlineStatus,
  setNickname,
} from '../online';
import { NicknamePrompt } from '../view/NicknamePrompt';
import type { NicknameResult } from '../view/nicknamePromptState';
import { fakeSubmit } from './nicknameDev';
import { parseRankingParam, shouldCheckProfile, shouldOpenPrompt } from './nicknameGate';

/** idle(아직) → checking(프로필 조회 중) → open(창이 떠 있음) → done(이 게임 오버에서는 끝) */
type AskState = 'idle' | 'checking' | 'open' | 'done';

/** 실제 제출: set-nickname 함수 결과를 창이 아는 모양으로 바꾼다 (태그는 `#0427` 문자열) */
async function submitNickname(name: string): Promise<NicknameResult> {
  const r = await setNickname(name);
  return r.ok ? { ok: true, nickname: r.nickname, tag: formatTag(r.tag) } : r;
}

export class NicknameFlow {
  private state: AskState = 'idle';
  /** 화면을 떠날 때 올린다. 늦게 온 프로필 조회가 새 화면에 창을 만들지 못하게 한다 */
  private run = 0;
  private prompt: NicknamePrompt | null = null;

  constructor(private readonly canvas: HTMLElement) {}

  /**
   * 새로 뜬 게임 오버에서 한 번 부른다. DEV `?ranking`이고 조건이 맞으면 프로필을 조회해 이름이 없을 때 창을 띄운다.
   * 조건이 안 맞으면 이 화면에서는 묻지 않는다 (계정이 화면 뒤에 늦게 준비돼도 다음 게임 오버부터)
   */
  begin(eligible: boolean): void {
    if (this.state !== 'idle') return;
    const ranking = parseRankingParam(window.location.search, import.meta.env.DEV);
    const ask = shouldCheckProfile({
      ranking,
      eligible,
      status: onlineStatus(),
      networkOnline: isNetworkOnline(),
    });
    if (!ask) {
      this.state = 'done';
      return;
    }
    if (ranking === 'fake') {
      this.open(fakeSubmit);
      return;
    }
    this.state = 'checking';
    const run = this.run;
    const userId = currentUserId();
    void getMyProfile().then((profile) => {
      // 기다리는 사이 화면을 떠났거나 계정이 바뀌었으면 버린다
      if (run !== this.run || this.state !== 'checking') return;
      if (currentUserId() !== userId || !shouldOpenPrompt(profile)) {
        this.state = 'done';
        return;
      }
      this.open(submitNickname);
    });
  }

  /** 이 화면을 떠난다: 창을 지우고 진행 중이던 조회·제출의 늦은 결과를 버린다 */
  end(): void {
    this.run += 1;
    this.prompt?.destroy();
    this.prompt = null;
    this.state = 'done';
  }

  private open(submit: (name: string) => Promise<NicknameResult>): void {
    this.state = 'open';
    this.prompt = new NicknamePrompt({
      canvas: this.canvas,
      submit,
      onClose: () => {
        this.prompt = null;
        this.state = 'done';
      },
    });
  }
}
