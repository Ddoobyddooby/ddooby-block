# ddooby-block TASKS (v0.1)

> 기준 문서: [`SPEC.md`](./SPEC.md), [`PLAN.md`](./PLAN.md). 위에서부터 첫 번째 미완료 태스크를 진행한다. 한 번에 태스크 하나.
> ID는 `W<주차>-<번호>`, 브랜치는 `feat/w1-01-<요약>`이다. **완료 기준**을 실제로 확인한 뒤에만 체크한다.
> 태스크를 마치면 [`DEVELOPMENT.md`](./DEVELOPMENT.md) 4절 "작업별 확인 방법"에 사용자가 직접 확인할 절차를, 6절 "Study for App"에 그 태스크에서 공부할 개념(쓰인 파일 포함)을 추가한다. 새 명령·URL 옵션이 생기면 2·3절의 "(예정)"을 지운다.
> 범례: 🧪 테스트 필수 · 👀 수동(브라우저) 확인 · ⛓ 선행 작업 · 🔎 PLAN 9절 검토 포인트
> 기획 결정 반영: 2026-11-11. v0.1은 기본 게임 완성에 집중하며 전략형 3수 보정은 후속 버전 후보로 남긴다.
> 착수 조건: ddooby-pang v0.2 3주차 완료 (SPEC 1.1). 2026-11-11에 W1-01부터 착수했다.
> 3~4주차는 큰 틀만 잡았다. 각 주를 시작하기 전에 완료 기준을 구체화한다.

---

## 1주차 — 코어 + 드래그 (SPEC 10절)

- [x] **W1-01** 🧪 프로젝트 세팅: pang 설정 복사 (PLAN 3.1 표 1행), `rng.ts` + 테스트 복사, `config.ts` 뼈대(PLAN 5절), 기존 `CLAUDE.md`·`AGENTS.md`의 명령어·아키텍처 규칙을 실제 세팅과 대조해 갱신, `vite.config.ts`에 `server.port: 5180` (WORKFLOW 6절), 빈 Boot 씬
  - 파일: `package.json`, `tsconfig.json`, `vite.config.ts`, `eslint.config.js`, `.prettierrc.json`, `.prettierignore`, `.gitignore`(지금 것에 pang 항목을 합친다), `src/main.ts`, `src/config.ts`, `src/core/rng.ts`, `src/scenes/BootScene.ts`, `tests/core/rng.test.ts`, `tests/lint/coreGuard.test.ts`, `index.html`, `.vscode/`, `package-lock.json`, `CLAUDE.md`, `AGENTS.md`(실제 세팅과 다를 때만 수정)
  - 완료 기준: `npm run lint && npm test && npm run build` 통과. `src/core/`에 `Math.random()`, `import Phaser`, `import '../view/x'`를 임시로 넣으면 lint 에러가 남 (확인 후 지움). `npm run dev`에서 빈 화면에 콘솔 오류 0
  - 확인 메모 (2026-11-11, `b54baf1`·`f3d8679`·`d58b92e`): lint·typecheck·build 통과, 테스트 31개 통과, 390×844 빈 화면 콘솔 오류 0 (5183 포트). Codex 독립 리뷰 3회차 통과: core 차단을 금지 목록에서 허용 목록(브라우저·Node 전역 끔 + `no-undef`)으로 바꾸고 `Date`·동적 import 금지와 차단 테스트 추가. 의존성은 phaser와 개발 도구만 (Capacitor·Supabase는 W3·W4). `PIECE_WEIGHTS`(W1-03)·`VIEW`(W1-06)·`FX`(2주차)는 해당 태스크에서 `config.ts`에 넣는다. 남은 한계는 FEEDBACK R1
- [x] **W1-02** 🧪 core 타입 + 보드: `types.ts`, `board.ts` (PLAN 4.1, 4.3), 테스트 헬퍼 `boardFrom` ⛓ W1-01
  - 테스트 (`tests/core/board.test.ts`):
    - `canPlace`: 보드 밖(음수, 8 이상), 채워진 칸과 겹침 → false. 오른쪽 아래 끝에 딱 맞음 → true
    - `fullLines`: 가로 1줄, 세로 1줄, 가로 2 + 세로 1 동시
    - `clearLines`: 가로 3번 + 세로 5번 → `cleared` 15칸, 교차 칸 (3,5)는 한 번만, 순서는 PLAN 4.3대로
    - 원래 `Board` 객체가 바뀌지 않음 (불변)
  - 완료 기준: 위 테스트 통과
  - 확인 메모 (2026-11-12, `ca3bd46`·`09f30a5`): lint·typecheck·build 통과, 테스트 77개 통과 (`board.test.ts` 46개). Codex 독립 리뷰 재리뷰 1 통과: 소수·NaN 좌표가 다른 정수 칸으로 계산되던 것을 `inBounds`의 정수 검사로 막았다. `PieceDef`는 `types.ts`에 둔다 (PLAN 4.1에 추가). `fillCells`는 보드 밖·정수가 아닌 좌표를 무시하고, `clearLines`는 `fullLines` 결과를 그대로 받는 전제로 줄 번호를 검사하지 않는다
- [x] **W1-03** 🧪 조각 세트: `pieces.ts`, `PIECE_WEIGHTS` (PLAN 4.2) ⛓ W1-02
  - 테스트 (`tests/core/pieces.test.ts`): 29개, ID 중복 없음, 그룹별 칸 수가 SPEC 3.2 표와 같음(`o3` 9칸, `l5a` 5칸 등), 모든 모양의 최소 r·c = 0, `PIECE_WEIGHTS`의 키가 `PIECES` ID와 정확히 같고 모두 양수
  - 완료 기준: 위 테스트 통과
  - 확인 메모 (2026-11-12, `e36a551`): lint·typecheck·build 통과, 테스트 209개 통과 (`pieces.test.ts` 132개). Codex 독립 리뷰 1차 통과, 지적 없음. `PIECES`와 조각·칸은 `Object.freeze`로 얼리고 `PIECE_WEIGHTS`는 얼리지 않는다. `getPiece(id)`는 없는 ID에 `undefined`를 돌려주므로 엔진(W1-05)·저장 복원(W2-05)이 이를 확인해야 한다. 가중치 합계 109
- [x] **W1-04** 🧪 조각 생성 + 보정: `generator.ts` (PLAN 4.4) ⛓ W1-03
  - 테스트 (`tests/core/generator.test.ts`):
    - 같은 seed → 같은 트레이와 같은 다음 RNG 상태
    - `weightedPick`: 가중치 `[0, 1, 0]` → 항상 1. seed 1~10000으로 뽑은 빈도가 가중치 비율 ±2%p
    - **seed 1~1000** × (빈 보드, seed로 40~60칸을 무작위로 채우고 꽉 찬 줄은 지운 보드) → 트레이 중 최소 1개 `canPlaceAnywhere` (SPEC 11절)
    - 빈 칸이 (0,0) 하나뿐인 보드 → 보정이 일어나고 트레이에 놓을 수 있는 조각이 있음 (그 조각은 `dot`)
  - 완료 기준: 위 테스트 통과
  - 확인 메모 (2026-11-13, `bf6d756`·`1598654`): lint·typecheck·build 통과, 테스트 261개 통과 (`generator.test.ts` 20개). Codex 테스트 전략 → 독립 리뷰 재리뷰 1 통과: `weightedPick`의 가중치 합계 상한(2^32)을 추가했다. RNG는 mock하지 않고 테스트 안의 기준 구현과 seed 탐색으로 검증한다. seed 1~1000 × 보드 2종에서 보정은 0회(재추첨 63회)라 보정 경로는 전용 테스트(빈 칸 한 개·두 개 보드)가 지킨다. SPEC 3.3의 "재추첨 최대 N회"는 PLAN 4.4대로 총 10번 시도로 구현했다
- [x] **W1-05** 🧪🔎 엔진: `createGame`, `place`, `previewPlacement`, `isGameOver` (PLAN 4.5, 4.7). 점수·콤보 필드는 0으로만 둔다 (W2-01) ⛓ W1-04
  - 테스트 (`tests/core/engine.test.ts`):
    - 놓을 수 없는 위치 → `{ ok: false, reason: 'blocked' }`, 상태 그대로 (SPEC 11절 1번의 core 쪽)
    - 빈 슬롯 → `emptySlot`, `over` 상태 → `over`
    - 가로·세로가 동시에 차는 배치 → `clear` 이벤트 하나, 교차 칸 한 번 (SPEC 11절 2번)
    - 이벤트 순서 `place → clear → … → tray → gameOver`
    - 세 번째 조각을 놓으면 `tray` 이벤트와 새 트레이 3개
    - 🔎 마지막 조각을 놓아 새 트레이가 나온 직후 놓을 곳이 없으면 그 배치에서 바로 `gameOver` (트레이가 비었을 때 판정하지 않음)
    - 남은 조각 2개가 모두 놓을 수 없으면 즉시 `gameOver` (SPEC 11절 4번)
  - 완료 기준: 위 테스트 통과
  - 확인 메모 (2026-11-13, `e2ec568`·`9626a44`): lint·typecheck·build 통과, 테스트 261개 통과 (`engine.test.ts` 27개, `engine.trayOver.test.ts` 5개). Codex 테스트 전략 → 독립 리뷰 재리뷰 1 통과: 숫자가 아닌 좌표(`row: null` 등)가 0으로 바뀌어 배치되던 것을 막았다. 🔎 "새 트레이 직후 게임 오버"는 생성기가 놓을 수 있는 조각을 최소 1개 보장하므로 실제 생성기로는 일어나지 않는다. 판정 순서는 `engine.trayOver.test.ts`에서 `vi.mock`으로 생성기를 바꿔 고정했다 (엔진 시그니처에 생성기 주입 없음). `score`·`combo` 이벤트와 점수·콤보 계산은 W2-01에서 `place`의 4단계에 넣는다. `trayIndex` 문제·모르는 조각 ID는 `emptySlot`, 좌표 문제는 `blocked`
- [x] **W1-06** 🧪🔎 화면 구역 + 드래그 계산: `view/layout.ts`(pang 복사 + 구역), `view/drag.ts` (PLAN 6.1) ⛓ W1-01
  - 테스트 (`tests/view/drag.test.ts`, `layout.test.ts`):
    - 손가락 위치가 같으면 조각은 1.5칸 위에 그려지고 anchor는 그 위치 기준 (SPEC 11절 마지막)
    - 🔎 경계: 조각 왼쪽이 보드 왼쪽에서 0.4칸 밖 → anchor c = 0, 0.6칸 밖 → c = −1 (반올림)
    - `traySlotRect` 3개가 겹치지 않고 화면 폭 720 안에 있음
  - 완료 기준: 위 테스트 통과
  - 확인 메모 (2026-11-13, `8a4da3f`): lint·typecheck·build 통과, 테스트 315개 통과 (`tests/view` 54개). Codex 테스트 전략 → 독립 리뷰 1차 통과, 지적 없음. 구역 수치(`VIEW.screen`: HUD 180, 보드 x 40·y 200·640, 트레이 높이 260·아래 여백 40, `boardShare` 0.6)는 화면에 그려 보지 않은 초안이라 W1-07에서 조정한다. W1-07로 넘긴 것: 가로로 넓은 창의 가운데 정렬(논리 폭이 720을 넘을 수 있다), 390×844의 실제 논리 높이, safe-area, 슬롯 경계 터치. 3행 이상 조각은 중심이 1.5칸 위여도 아래쪽이 손가락에 닿는다(`i5v`는 맨 아래 칸이 가려진다) → W1-07·W1-08에서 보고 사용자가 정한다
- [x] **W1-07** 👀🧪🔎 게임 화면: 블록 텍스처, `BoardView`, `TrayView`, `DragController`, `GameScene`(seed는 `?seed=N` 또는 `crypto.getRandomValues`), 메뉴는 "새 게임" 버튼만 ⛓ W1-05, W1-06
  - 테스트: 입력 잠금 규칙을 순수 함수 `canPickUp(state: { playing: boolean; paused: boolean; over: boolean })`로 빼서 테스트 (`tests/view/dragRules.test.ts`)
  - 완료 기준 (390×844, `?seed=1`): 드래그하면 조각이 손가락 위에 뜨고 고스트와 채워질 줄 하이라이트가 보임 · 보드 밖이나 겹치는 곳에서 놓으면 트레이로 돌아감 · 줄이 지워짐 · 3개를 놓으면 새 트레이 · 게임 오버가 되면 "게임 오버" 글자(임시) · 🔎 줄 제거 재생 중에 다른 조각을 집을 수 없음 · 두 번째 손가락 무시 · DEV에서 매 배치 후 view ↔ core 보드 대조 통과, 콘솔 오류 0 · 캡처를 남긴다
  - 확인 메모 (2026-11-15, `39b8e23`·`54c4f70`): lint·typecheck·build 통과, 테스트 372개 통과 (W1-07 몫 57개). 390×844 터치 에뮬레이션(Playwright)으로 `/?seed=1`에서 완료 기준 전 항목 확인, 게임 오버까지 자동 진행 중 콘솔 오류 0·`view ≠ board` 0, 캡처는 구현 worktree의 `.playwright-mcp/w1-07/`(gitignore). Codex 독립 리뷰 재리뷰 1 통과: 캔버스를 벗어나면 드래그 취소로 정책을 통일했다. 가로로 넓은 창은 가운데 정렬. `?seed=N`은 0~4294967295의 정수만 받는다. 실제 휴대폰 터치·safe-area는 확인하지 못했다 (W1-08). 사용자가 보고 정할 것은 FEEDBACK R2(긴 조각의 손가락 가림)·R3(조각이 고스트를 덮음)

- [ ] **W1-08** 👀 초기 사용자 시범 플레이 (W1-07 직후) ⛓ W1-07
  - 범위: 휴대폰 브라우저에서 최초 사용자(조카 등)가 설명 없이 조각 선택·드래그·배치·줄 제거를 이해하는지 관찰한다. 손가락 가림, 보드 경계 스냅, 게임 오버 이해, 자발적인 다시 하기 의향, 계획한 배치가 성공했을 때의 반응을 기록한다.
  - 완료 기준: 기기·화면 크기, 관찰 상황, 막힌 지점, 직접 발언·행동(해석과 구분), 후속 개선 후보를 `docs/FEEDBACK.md`에 기록한다. 점수·콤보·메뉴 등 W2 기능은 아직 없는 상태이므로 해당 기능은 이번 평가 대상이 아니다. W4-04 최종 시범 플레이는 유지한다.

## 2주차 — 점수 + 콤보 + 연출 + 이어하기

- [x] **W2-01** 🧪 점수·콤보: `scoring.ts`, 엔진에 반영 (PLAN 4.6) ⛓ W1-05
  - 테스트 (`tests/core/scoring.test.ts`, `engine.test.ts`): `lineScore` 0~6줄 = 0, 100, 300, 600, 1000, 1500, 2000 · 3칸 조각으로 1줄 지움(콤보 1) = 103 · 콤보 2에서 2줄 = 칸 수 + 450 · 보드 전체 비움 +3000(배율 없음) · 지움 → 못 지움 ×2 → 지움 = 콤보 2 · 지움 → 못 지움 ×3 → 콤보 0, 다음 지움은 콤보 1 (SPEC 11절 5번)
  - 완료 기준: 위 테스트 통과. 수치는 모두 `SCORE`·`COMBO`에서 읽음
  - 확인 메모 (2026-11-15, `8df90a7`): lint·typecheck·build 통과, 테스트 396개 통과 (`scoring.test.ts` 17개, `engine.test.ts`에 9개 추가). Codex 독립 리뷰 1차 통과, 지적 없음. `score` 이벤트는 모든 성공 배치에 나오고(`lines: 0` 포함, `delta`에 보드 비움 보너스 포함) `combo` 이벤트는 값이 바뀔 때만 나온다. 콤보가 끊기면 `missStreak`도 0이 된다. W1-05의 "점수 0" 단언 9곳을 새 규칙에 맞게 고쳤다. 화면 표시는 W2-03. 규칙 봇 seed 1~20의 최종 점수 255~9497, 평균 3626.5 (구현 탭 측정)
- [x] **W2-02** 🧪 리플레이: `replay.ts` (PLAN 4.8) ⛓ W2-01
  - 테스트 (`tests/core/replay.test.ts`): 무작위 봇이 seed 1~200을 게임 오버까지 플레이한 로그 → `replay` 상태가 원래 상태와 `toEqual` (SPEC 11절 6번) · 로그 중간에 막힌 배치 → `{ ok: false, index }` · `checkIntervals`: 간격 199ms → false, 200ms → true, `t`가 줄어들면 false
  - 완료 기준: 위 테스트 통과
  - 확인 메모 (2026-11-15, `44b03f7`·`63b3438`): lint·typecheck·build 통과, 테스트 427개 통과 (`replay.test.ts` 31개). Codex 독립 리뷰 재리뷰 1 통과: 로그 항목이 `null` 같은 객체가 아닌 값이면 예외가 나던 것을 `reason: 'invalid'` 실패로 바꿨다. 200판 `toEqual`은 엔진이 일관되게 틀려도 통과하므로, seed·로그·기대 상태를 숫자로 적어 둔 고정 로그 2개(seed 579: 보드 비움 포함 3282점, seed 1601: 293점)를 더했다. 이 테스트가 실패하면 규칙이 바뀐 것이므로 `RULES_VERSION`을 검토한다. 무작위 봇은 금방 진다(배치 7~43, 평균 14.2 / 점수 26~3884, 평균 276.2, 85판은 줄을 못 지움). 그래서 "판마다 줄 제거" 대신 "전체의 40% 초과"로 단언한다. 200판에서 보드 비움·생성 보정은 0회였고, 보정에 닿는 로그는 seed 4000개에서도 못 찾아 보정은 `generator.test.ts`에만 의존한다 (구현 탭 측정). seed 검증·로그 길이 한도는 `replay`가 하지 않는다. 호출부(W2-05 저장 파서, W3-03 서버)가 하고, `'invalid'`를 포함한 모든 `reason`을 처리해야 한다
- [x] **W2-03** 👀 HUD + 일시정지: 점수 / 최고 점수 / 콤보 표시, pang `PauseScene`·버튼 복사 ⛓ W1-07, W2-01
  - 완료 기준: 점수가 `score` 이벤트대로 오름, 콤보 표시가 생기고 사라짐, 일시정지 중 드래그 불가·드래그 중 일시정지하면 조각이 트레이로 돌아감
  - 확인 메모 (2026-11-15, `70bdee8`·`aa79331`): lint·typecheck·build 통과, 테스트 446개 통과 (`pauseRules`·`bestScore`·`hudText`·`playback` 테스트 추가, `DragController.test.ts`에 드래그 중 일시정지). 390×844 캡처로 점수 113·콤보 1, 일시정지 화면, 새 판에서 최고 점수 유지를 확인했다. Codex 독립 리뷰 재리뷰 1 통과: 새 트레이 연출 중 일시정지 → 창 크기 변경 → [계속]이면 재생이 버려져 조각을 영영 집을 수 없던 것(높음)을 고쳤다. 재생 루프를 `scenes/playback.ts`로 빼서 일시정지 중에는 [계속]까지 기다리고, 판이 바뀌거나 씬이 끝나면 버린다. 최고 점수는 W2-05 전까지 앱이 켜져 있는 동안만 기억한다(`scenes/bestScore.ts`, 새로고침하면 0). [다시 하기]는 새 seed, `?seed=N`이면 같은 seed. 버튼 소리·음소거 버튼은 W2-04, Android 뒤로 가기는 W4-03. 🔎 일시정지 중 [다시 하기]·[메뉴]에서 이전 재생이 새 판을 건드리지 않는 것은 가짜 host 단위 테스트로만 확인했고, 실제 Phaser를 돌리는 테스트는 없다
- [x] **W2-04** 👀🧪 연출: 줄 파티클, 다줄·콤보 팝업, 흔들림(pang `shake.ts`), 전체 비우기, 놓을 수 없는 조각 흐리게, 효과음 (PLAN 6.4) ⛓ W2-03
  - 테스트: 팝업 문구·흔들림 단계 고르기 순수 함수 (`tests/view/fx.test.ts`)
  - 완료 기준: DEV `?fill=`로 1줄 / 2줄 / 3줄 / 콤보 3 / 전체 비우기 상황을 만들어 캡처, 연출 값은 `ANIM`·`FX`에서만
  - 확인 메모 (2026-11-16, `2a4a78d`·`30348ad`·`524e804`·`0754181`): lint·typecheck·build 통과, 테스트 527개 통과 (`fx`·`sfx`·`sfxPlay`·`sfxPhaser`·`devFill`·`muteSetting` 테스트 추가). 390×844 캡처로 "트리플!", "콤보 x3!", "전체 비우기!", 흐린 조각을 확인했다. Codex 독립 리뷰는 재리뷰 3에서 통과(재리뷰 3은 사용자 지시로 한도 2회를 넘겨 진행): 음소거 뒤 멈췄던 소리 재개(중간) → 음소거를 사운드 매니저 출력에도 반영, resize 때 흔들림이 남음(낮음) → 초기화, 재생 실패한 소리가 목록에 남음(중간) → 수명을 한 곳에서 정리, 밖에서 파괴된 소리를 다시 파괴해 예외(중간) → 이벤트로 알게 된 종료는 목록에서 빼기만. 효과음은 pang의 Kenney CC0 6종을 이름만 바꿔 복사(`public/audio/CREDITS.md`), 다듬기는 W4-01. `?fill=`은 DEV 전용 이름 5개(`line1`·`line2`·`line3`·`combo3`·`clear`)이고 트레이도 fill이 정한다. 음소거는 W2-05 전까지 앱이 켜져 있는 동안만 기억한다. 흔들림 단계 = (줄 수 − 1) + (콤보 − 1), 상한 4. 🔎 소리를 실제로 들어 본 확인, 실제 기기·iPhone Safari 확인은 없다(재생 호출과 오류 없음까지). 🔎 `?fill=` 판은 리플레이할 수 없다(`GameScene.isReplayable === false`). 지금은 표시만 있고, W2-05(저장·최고 점수)와 W3-03(제출)에서 빼야 한다
- [x] **W2-05** 🧪🔎 저장·이어하기: `storage/progress.ts`, `storage/run.ts`, Boot에서 저장소 선택 (PLAN 6.2) ⛓ W2-02
  - 테스트 (`tests/storage/run.test.ts`, `progress.test.ts`):
    - 10번 배치 → 저장 → 새 어댑터로 `parseRun` + `restoreRun` → 보드·트레이·점수·콤보·RNG가 같음 (SPEC 11절 7번)
    - 🔎 복원 후 다음 배치의 `t`가 마지막 `t`보다 큼, 복원한 로그 + 이어서 둔 로그가 `replay`·`checkIntervals`를 통과 (SPEC 11절 8번)
    - 🔎 잘린 JSON, `rulesVersion` 다름, `version` 다름 → `null` (예외 없음)
    - `snapshot`이 replay 결과와 달라도 replay 결과를 씀
    - pang 어댑터 테스트(`preferencesStorage.test.ts`) 복사
  - 완료 기준: 위 테스트 통과
  - 확인 메모 (2026-11-16, `f18b328`·`5d2033e`·`a550f4a`): lint·typecheck·build 통과, 테스트 658개 통과 (`tests/storage/` 4개 파일, `playClock`·`runSession`·`bootLoad` 테스트 추가). Codex 테스트 전략 → 독립 리뷰 재리뷰 1 통과: 부팅 읽기가 늦을 때 새로 저장·삭제한 판 대신 옛 판이 이어하기 대상으로 남음(중간) → 읽기 시작 뒤 판을 바꾼 요청이 있으면 늦은 읽기가 덮지 않음, 첫 읽기가 한 번 실패하면 저장된 설정을 기본값으로 덮음(중간) → 쓰기 직전에 다시 읽은 값을 바탕으로 이번 실행에서 바꾼 항목만 덮음. 사용자 결정: 배치 뒤 200ms 동안 다음 조각을 집을 수 없다, 게임 오버는 기록 저장 → 최고 점수 저장 → run 삭제 순서이고 끝난 run이 남아 있으면 부팅 때 최고 점수를 되살린다, 최고 점수의 영구 저장은 게임 오버 때, 두 탭은 지원하지 않는다, 기록 한도 20,000수. 패키지 `@capacitor/core`·`@capacitor/preferences` 추가. 이어하기 버튼은 W2-06이고 그 전까지 DEV `?resume`으로 연다. `?fill=` 판은 저장·최고 점수에 닿지 않는다. 🔎 브라우저 확인(3수 뒤 복원, 음소거 유지, 게임 오버 뒤 run 삭제)은 구현 탭이 했다. 🔎 200ms 잠금의 손가락 체감, 실제 기기, Capacitor Preferences 실제 동작, 사파리 사생활 보호 모드, `navigator.storage.persist()` 응답은 확인하지 않았다. 🔎 매 수마다 기록 전체를 다시 저장하므로 긴 판의 비용과 한도 값은 W4-02에서 측정한다. 🔎 W2-06에서 버튼을 붙일 때 실제 씬으로 이어한 뒤의 로그가 `checkIntervals`를 통과하는지 다시 본다
- [x] **W2-06** 👀 메뉴·게임 오버 화면: 이어하기 버튼(저장된 run이 있을 때만), GameOver 씬(점수·최고 점수·다시 하기·메뉴), `?over` 미리보기 ⛓ W2-05
  - 완료 기준: 판 도중 탭을 닫고 다시 열면 메뉴에 이어하기가 보이고 같은 판으로 이어짐 · 게임 오버 후에는 이어하기가 사라지고 최고 점수가 갱신됨
  - 확인 메모 (2026-11-16, `082343d`·`f27244e`·`d2b2951`): lint·typecheck·build 통과, 테스트 696개 통과 (`menuRules`·`gameOverRules`·`gameStart`·`pressLock` 테스트 추가). 390×844 캡처로 이어하기가 있는 메뉴, 이어한 판(점수 872·콤보 2), 게임 오버 화면(최고 기록 갱신·미갱신), `?over`를 확인했다. 이어한 뒤 둔 세 수의 `t`는 7892·18771·20361로 간격 200ms 이상(구현 탭 측정). Codex 독립 리뷰 재리뷰 2 통과: 메뉴를 다시 그리면 진행 중인 버튼 누름이 남아 전환이 두 번 요청됨(중간) → 버려진 버튼의 누름은 실행하지 않고 메뉴는 같은 잠금을 유지, 게임 오버 입력 지연이 resize로 풀림(낮음) → 처음 뜬 시각 기준으로 남은 시간만 잠금, 부팅 읽기가 늦으면 낮은 점수에 "최고 기록 갱신!"(낮음) → 부팅 때 저장소에 있던 최고 점수(`LoadResult.storedBest`)를 따로 두어 기준으로 씀. 구현 중 W2-05의 숨은 버그를 고쳤다: Phaser는 데이터 없는 `scene.start`에 이전 데이터를 다시 쓰므로 이어한 판 뒤 [다시 하기]·[새 게임]이 저장된 판을 또 열었다 → 새 판은 항상 `newGameData()`로 시작. 사용자 결정: 이어하기가 있어도 [새 게임]에 확인 창을 띄우지 않는다. 메뉴에 최고 점수는 표시하지 않는다(SPEC·PLAN에 없음). 최고 기록 갱신은 판 시작 전 최고 점수보다 클 때만. 게임 오버 화면은 소리 뒤 700ms에 뜨고 600ms 동안 버튼이 눌리지 않는다. 🔎 부팅 읽기 3초 초과 때의 메뉴 갱신·최고 기록 기준, `?fill=` 판의 게임 오버 화면은 브라우저에서 확인하지 않았다(단위 테스트와 Codex의 코드 수준 재현까지). 🔎 게임 오버 화면이 이미 뜬 뒤 늦은 읽기가 끝나면 문구를 고치지 않는다. 🔎 입력 지연의 손가락 체감, 실제 기기 확인은 없다

## 3주차 — 랭킹 연동 (큰 틀) ⛓ pang V2-W3-01~04

- [ ] **W3-01** 🧪 전용 Supabase 프로젝트 + 마이그레이션 (pang 복사 → SPEC 8절 테이블, `runs.rules_version`)
  - 완료 기준: RLS로 `weekly_scores` 클라이언트 쓰기가 막힘. pang 프로젝트 URL·키가 레포 어디에도 없음 (SPEC 11절 9번)
  - 진행 메모 (2026-11-16, `b0a3621`·`99b0911`, **로컬 확인만 끝남, 원격 적용 대기**): lint·typecheck·build 통과, 테스트 738개 통과 (`tests/supabase/` report·separation). 마이그레이션 `supabase/migrations/20261116100000_w3_01_schema_rls.sql`(profiles·runs·weekly_scores, RLS, anon·authenticated는 SELECT만). 구현 탭이 PGlite + 역할·auth 스텁으로 적용해 33개 확인 통과(실제 Supabase 아님). Codex 독립 리뷰 재리뷰 1 통과: 권한 시험이 네트워크·제약 오류와 0행 성공도 "차단"으로 판정(중간) → 권한 거부 `42501`만 PASS, 네트워크·인증 오류는 "시험 불가", 모두 PASS일 때만 exit 0. 사용자 결정: SPEC 8절 `runs`를 구현에 맞춤(seed `bigint`, `submitted_at`, `rules_version`·`week_key`). pang의 주간 최고 점수 upsert 함수는 W3-03, 랭킹 조회 함수는 W3-04로 미룸. pang ref는 레포에 SHA-256 해시로만 두고 추적 파일 전체를 검사한다. 남은 것: block 전용 프로젝트 생성(사용자) → `supabase db push --dry-run` 확인 → 적용 → `npm run supabase:check` 전부 PASS. **그 전에는 체크하지 않는다**. W3-03으로 넘긴 것: 재사용 run 거부와 최고 점수 갱신을 한 트랜잭션으로, run과 주간 점수의 소유자·주 일치, 실제 run으로 본인 읽기·남의 run 차단 대조, start-run이 seed를 숫자로 응답
- [ ] **W3-02** 👀🧪 익명 로그인 + 닉네임 (`src/online/`, pang 복사) ⛓ W3-01
- [ ] **W3-03** 🧪 `start-run` / `submit-score` + 서버 리플레이 (PLAN 7절) ⛓ W3-02
  - 완료 기준: W2-02의 봇 로그 200개가 서버에서 같은 점수, 조작 점수·재사용 run·간격 위반·버전 다름 거부, 이어한 판은 시작한 주로 등록
- [ ] **W3-04** 👀 주간 랭킹 화면 + GameOver 순위 + 오프라인 처리 ⛓ W3-03

## 4주차 — 폴리싱 + APK (큰 틀)

- [ ] **W4-01** 👀 사운드·음악 다듬기 (`.ogg` + `.m4a`)
- [ ] **W4-02** 🧪 밸런스 시뮬 `npm run sim`: 그리디 봇 seed 1~1000, 평균 점수·배치 수·보정 발생률·배치 간격 → `PIECE_WEIGHTS`·`SCORE`·`REPLAY.minIntervalMs` 조정 (바뀌면 `RULES_VERSION` 올림)
- [ ] **W4-03** 👀 Android APK (`com.ddooby.block`, 아이콘) + GitHub Pages 배포 (pang `pages.yml` 복사)
- [ ] **W4-04** 👀 최종 조카 시범 플레이 (W1-08 초기 테스트와 별도) → `docs/FEEDBACK.md`

## SPEC 11절 수용 기준 ↔ 태스크

| 수용 기준 | 태스크 |
|---|---|
| 보드 밖·채워진 칸에 놓으면 트레이로 복귀 | W1-05, W1-07 |
| 가로·세로 동시 제거, 교차 칸 중복 없음 | W1-02, W1-05 |
| 3개 중 최소 1개 배치 가능 (seed 1~1000) | W1-04 |
| 놓을 곳이 없으면 즉시 게임 오버 | W1-05 |
| 못 지운 배치 3회 연속에서 콤보 끊김 | W2-01 |
| 같은 seed + 로그 → 클라이언트·서버 점수 같음 | W2-02, W3-03 |
| 강제 종료 후 같은 판으로 이어짐 | W2-05, W2-06 |
| 이어한 판도 리플레이 검증 통과 | W2-05, W3-03 |
| 전용 Supabase에만 기록 | W3-01 |
| 드래그 중 조각이 손가락에 가려지지 않음 | W1-06, W1-07, W1-08 |

## 후속 버전 후보 (v0.1 작업에 포함하지 않음)

- **전략형 블록 생성** (SPEC 3.3.1, PLAN 10절): Seed 기반 복수 후보 → 최대 3수 배치 경로 평가 → 보드 상황별 난이도 평가. 완주 가능한 후보를 우선하되 완주 불가능한 트레이도 일부 허용한다.
- 적용 버전·탐색 예산·허용 기준을 확정하기 전에 기존 생성기와 비교 시뮬레이션 및 사용자 플레이 테스트를 수행한다.
- 정식 태스크 ID와 완료 기준은 해당 버전 계획 승인 시 부여한다. W1-04·W4-02의 기존 v0.1 범위를 바꾸지 않는다.
