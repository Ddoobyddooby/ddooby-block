// 닉네임 묻기 진행 (W3-02·03). GameOver 씬이 새로 뜰 때 만들고 떠날 때 끝낸다.
// 점수 제출이 성공하면 `afterSubmit`을 부르고, 이름이 아직 없을 때만 입력 창을 띄운다 (규칙은 nicknameGate.ts).
// DEV `?ranking=fake`의 가짜 제출은 GameOver 씬의 DEV 분기가 `beginFake`로 넘긴다 (가짜 제출 코드가 프로덕션 번들에 들어가지 않게).
import {
  currentUserId,
  formatTag,
  getMyProfile,
  isNetworkOnline,
  onlineStatus,
  setNickname,
  type SubmitOutcome,
} from '../online';
import { NicknamePrompt } from '../view/NicknamePrompt';
import type { NicknameResult } from '../view/nicknamePromptState';
import { shouldCheckProfile, shouldOpenPrompt } from './nicknameGate';

/** idle(아직) → checking(프로필 조회 중) → open(창이 떠 있음) → done(이 게임 오버에서는 끝) */
type AskState = 'idle' | 'checking' | 'open' | 'done';

/** 실제 제출: set-nickname 함수 결과를 창이 아는 모양으로 바꾼다 (태그는 `#0427` 문자열) */
export async function submitNickname(name: string): Promise<NicknameResult> {
  const r = await setNickname(name);
  return r.ok ? { ok: true, nickname: r.nickname, tag: formatTag(r.tag) } : r;
}

export class NicknameFlow {
  private state: AskState = 'idle';
  /** 화면을 떠날 때 올린다. 늦게 온 프로필 조회가 새 화면에 창을 만들지 못하게 한다 */
  private run = 0;
  private prompt: NicknamePrompt | null = null;

  /** onSaved: 이름이 서버에 저장됐다(이미 정해져 있던 경우 포함). 창이 닫힐 때 한 번 부른다. destroy로 지운 창에서는 부르지 않는다 */
  constructor(
    private readonly canvas: HTMLElement,
    private readonly onSaved?: () => void,
  ) {}

  /**
   * 점수 제출이 끝났을 때 한 번 부른다. 성공이고 조건이 맞으면 프로필을 조회해 이름이 없을 때 창을 띄운다.
   * 조건이 안 맞으면(실패·거부·계정 바뀜·오프라인) 이 화면에서는 묻지 않는다
   */
  afterSubmit(outcome: SubmitOutcome): void {
    if (this.state !== 'idle') return;
    const ask = shouldCheckProfile({
      outcome,
      userId: currentUserId(),
      status: onlineStatus(),
      networkOnline: isNetworkOnline(),
    });
    if (!ask) {
      this.state = 'done';
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

  /** DEV `?ranking=fake`: 온라인 없이 가짜 제출로 창만 띄운다 */
  beginFake(fake: (name: string) => Promise<NicknameResult>): void {
    if (this.state !== 'idle') return;
    this.open(fake);
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
      onClose: (outcome) => {
        this.prompt = null;
        this.state = 'done';
        if (outcome === 'saved') this.onSaved?.();
      },
    });
  }
}
