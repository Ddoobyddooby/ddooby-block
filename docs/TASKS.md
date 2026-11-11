# ddooby-block TASKS (v0.1)

> 기준 문서: [`SPEC.md`](./SPEC.md), [`PLAN.md`](./PLAN.md). 위에서부터 첫 번째 미완료 태스크를 진행한다. 한 번에 태스크 하나.
> ID는 `W<주차>-<번호>`, 브랜치는 `feat/w1-01-<요약>`이다. **완료 기준**을 실제로 확인한 뒤에만 체크한다.
> 태스크를 마치면 [`DEVELOPMENT.md`](./DEVELOPMENT.md) 4절 "작업별 확인 방법"에 사용자가 직접 확인할 절차를, 6절 "Study for App"에 그 태스크에서 공부할 개념(쓰인 파일 포함)을 추가한다. 새 명령·URL 옵션이 생기면 2·3절의 "(예정)"을 지운다.
> 범례: 🧪 테스트 필수 · 👀 수동(브라우저) 확인 · ⛓ 선행 작업 · 🔎 PLAN 9절 검토 포인트
> 기획 결정 반영: 2026-11-11. v0.1은 기본 게임 완성에 집중하며 전략형 3수 보정은 후속 버전 후보로 남긴다.
> 착수 조건: ddooby-pang v0.2 3주차 완료 (SPEC 1.1). 1~2주차는 pang과 무관하게 진행할 수 있지만 SPEC에 따라 그때 시작한다.
> 3~4주차는 큰 틀만 잡았다. 각 주를 시작하기 전에 완료 기준을 구체화한다.

---

## 1주차 — 코어 + 드래그 (SPEC 10절)

- [ ] **W1-01** 🧪 프로젝트 세팅: pang 설정 복사 (PLAN 3.1 표 1행), `rng.ts` + 테스트 복사, `config.ts` 뼈대(PLAN 5절), 기존 `CLAUDE.md`·`AGENTS.md`의 명령어·아키텍처 규칙을 실제 세팅과 대조해 갱신, `vite.config.ts`에 `server.port: 5180` (WORKFLOW 6절), 빈 Boot 씬
  - 파일: `package.json`, `tsconfig.json`, `vite.config.ts`, `eslint.config.js`, `.prettierrc.json`, `.prettierignore`, `.gitignore`(지금 것에 pang 항목을 합친다), `src/main.ts`, `src/config.ts`, `src/core/rng.ts`, `src/scenes/BootScene.ts`, `tests/core/rng.test.ts`, `CLAUDE.md`, `AGENTS.md`(실제 세팅과 다를 때만 수정)
  - 완료 기준: `npm run lint && npm test && npm run build` 통과. `src/core/`에 `Math.random()`, `import Phaser`, `import '../view/x'`를 임시로 넣으면 lint 에러가 남 (확인 후 지움). `npm run dev`에서 빈 화면에 콘솔 오류 0
- [ ] **W1-02** 🧪 core 타입 + 보드: `types.ts`, `board.ts` (PLAN 4.1, 4.3), 테스트 헬퍼 `boardFrom` ⛓ W1-01
  - 테스트 (`tests/core/board.test.ts`):
    - `canPlace`: 보드 밖(음수, 8 이상), 채워진 칸과 겹침 → false. 오른쪽 아래 끝에 딱 맞음 → true
    - `fullLines`: 가로 1줄, 세로 1줄, 가로 2 + 세로 1 동시
    - `clearLines`: 가로 3번 + 세로 5번 → `cleared` 15칸, 교차 칸 (3,5)는 한 번만, 순서는 PLAN 4.3대로
    - 원래 `Board` 객체가 바뀌지 않음 (불변)
  - 완료 기준: 위 테스트 통과
- [ ] **W1-03** 🧪 조각 세트: `pieces.ts`, `PIECE_WEIGHTS` (PLAN 4.2) ⛓ W1-02
  - 테스트 (`tests/core/pieces.test.ts`): 29개, ID 중복 없음, 그룹별 칸 수가 SPEC 3.2 표와 같음(`o3` 9칸, `l5a` 5칸 등), 모든 모양의 최소 r·c = 0, `PIECE_WEIGHTS`의 키가 `PIECES` ID와 정확히 같고 모두 양수
  - 완료 기준: 위 테스트 통과
- [ ] **W1-04** 🧪 조각 생성 + 보정: `generator.ts` (PLAN 4.4) ⛓ W1-03
  - 테스트 (`tests/core/generator.test.ts`):
    - 같은 seed → 같은 트레이와 같은 다음 RNG 상태
    - `weightedPick`: 가중치 `[0, 1, 0]` → 항상 1. seed 1~10000으로 뽑은 빈도가 가중치 비율 ±2%p
    - **seed 1~1000** × (빈 보드, seed로 40~60칸을 무작위로 채우고 꽉 찬 줄은 지운 보드) → 트레이 중 최소 1개 `canPlaceAnywhere` (SPEC 11절)
    - 빈 칸이 (0,0) 하나뿐인 보드 → 보정이 일어나고 트레이에 놓을 수 있는 조각이 있음 (그 조각은 `dot`)
  - 완료 기준: 위 테스트 통과
- [ ] **W1-05** 🧪🔎 엔진: `createGame`, `place`, `previewPlacement`, `isGameOver` (PLAN 4.5, 4.7). 점수·콤보 필드는 0으로만 둔다 (W2-01) ⛓ W1-04
  - 테스트 (`tests/core/engine.test.ts`):
    - 놓을 수 없는 위치 → `{ ok: false, reason: 'blocked' }`, 상태 그대로 (SPEC 11절 1번의 core 쪽)
    - 빈 슬롯 → `emptySlot`, `over` 상태 → `over`
    - 가로·세로가 동시에 차는 배치 → `clear` 이벤트 하나, 교차 칸 한 번 (SPEC 11절 2번)
    - 이벤트 순서 `place → clear → … → tray → gameOver`
    - 세 번째 조각을 놓으면 `tray` 이벤트와 새 트레이 3개
    - 🔎 마지막 조각을 놓아 새 트레이가 나온 직후 놓을 곳이 없으면 그 배치에서 바로 `gameOver` (트레이가 비었을 때 판정하지 않음)
    - 남은 조각 2개가 모두 놓을 수 없으면 즉시 `gameOver` (SPEC 11절 4번)
  - 완료 기준: 위 테스트 통과
- [ ] **W1-06** 🧪🔎 화면 구역 + 드래그 계산: `view/layout.ts`(pang 복사 + 구역), `view/drag.ts` (PLAN 6.1) ⛓ W1-01
  - 테스트 (`tests/view/drag.test.ts`, `layout.test.ts`):
    - 손가락 위치가 같으면 조각은 1.5칸 위에 그려지고 anchor는 그 위치 기준 (SPEC 11절 마지막)
    - 🔎 경계: 조각 왼쪽이 보드 왼쪽에서 0.4칸 밖 → anchor c = 0, 0.6칸 밖 → c = −1 (반올림)
    - `traySlotRect` 3개가 겹치지 않고 화면 폭 720 안에 있음
  - 완료 기준: 위 테스트 통과
- [ ] **W1-07** 👀🧪🔎 게임 화면: 블록 텍스처, `BoardView`, `TrayView`, `DragController`, `GameScene`(seed는 `?seed=N` 또는 `crypto.getRandomValues`), 메뉴는 "새 게임" 버튼만 ⛓ W1-05, W1-06
  - 테스트: 입력 잠금 규칙을 순수 함수 `canPickUp(state: { playing: boolean; paused: boolean; over: boolean })`로 빼서 테스트 (`tests/view/dragRules.test.ts`)
  - 완료 기준 (390×844, `?seed=1`): 드래그하면 조각이 손가락 위에 뜨고 고스트와 채워질 줄 하이라이트가 보임 · 보드 밖이나 겹치는 곳에서 놓으면 트레이로 돌아감 · 줄이 지워짐 · 3개를 놓으면 새 트레이 · 게임 오버가 되면 "게임 오버" 글자(임시) · 🔎 줄 제거 재생 중에 다른 조각을 집을 수 없음 · 두 번째 손가락 무시 · DEV에서 매 배치 후 view ↔ core 보드 대조 통과, 콘솔 오류 0 · 캡처를 남긴다

- [ ] **W1-08** 👀 초기 사용자 시범 플레이 (W1-07 직후) ⛓ W1-07
  - 범위: 휴대폰 브라우저에서 최초 사용자(조카 등)가 설명 없이 조각 선택·드래그·배치·줄 제거를 이해하는지 관찰한다. 손가락 가림, 보드 경계 스냅, 게임 오버 이해, 자발적인 다시 하기 의향, 계획한 배치가 성공했을 때의 반응을 기록한다.
  - 완료 기준: 기기·화면 크기, 관찰 상황, 막힌 지점, 직접 발언·행동(해석과 구분), 후속 개선 후보를 `docs/FEEDBACK.md`에 기록한다. 점수·콤보·메뉴 등 W2 기능은 아직 없는 상태이므로 해당 기능은 이번 평가 대상이 아니다. W4-04 최종 시범 플레이는 유지한다.

## 2주차 — 점수 + 콤보 + 연출 + 이어하기

- [ ] **W2-01** 🧪 점수·콤보: `scoring.ts`, 엔진에 반영 (PLAN 4.6) ⛓ W1-05
  - 테스트 (`tests/core/scoring.test.ts`, `engine.test.ts`): `lineScore` 0~6줄 = 0, 100, 300, 600, 1000, 1500, 2000 · 3칸 조각으로 1줄 지움(콤보 1) = 103 · 콤보 2에서 2줄 = 칸 수 + 450 · 보드 전체 비움 +3000(배율 없음) · 지움 → 못 지움 ×2 → 지움 = 콤보 2 · 지움 → 못 지움 ×3 → 콤보 0, 다음 지움은 콤보 1 (SPEC 11절 5번)
  - 완료 기준: 위 테스트 통과. 수치는 모두 `SCORE`·`COMBO`에서 읽음
- [ ] **W2-02** 🧪 리플레이: `replay.ts` (PLAN 4.8) ⛓ W2-01
  - 테스트 (`tests/core/replay.test.ts`): 무작위 봇이 seed 1~200을 게임 오버까지 플레이한 로그 → `replay` 상태가 원래 상태와 `toEqual` (SPEC 11절 6번) · 로그 중간에 막힌 배치 → `{ ok: false, index }` · `checkIntervals`: 간격 199ms → false, 200ms → true, `t`가 줄어들면 false
  - 완료 기준: 위 테스트 통과
- [ ] **W2-03** 👀 HUD + 일시정지: 점수 / 최고 점수 / 콤보 표시, pang `PauseScene`·버튼 복사 ⛓ W1-07, W2-01
  - 완료 기준: 점수가 `score` 이벤트대로 오름, 콤보 표시가 생기고 사라짐, 일시정지 중 드래그 불가·드래그 중 일시정지하면 조각이 트레이로 돌아감
- [ ] **W2-04** 👀🧪 연출: 줄 파티클, 다줄·콤보 팝업, 흔들림(pang `shake.ts`), 전체 비우기, 놓을 수 없는 조각 흐리게, 효과음 (PLAN 6.4) ⛓ W2-03
  - 테스트: 팝업 문구·흔들림 단계 고르기 순수 함수 (`tests/view/fx.test.ts`)
  - 완료 기준: DEV `?fill=`로 1줄 / 2줄 / 3줄 / 콤보 3 / 전체 비우기 상황을 만들어 캡처, 연출 값은 `ANIM`·`FX`에서만
- [ ] **W2-05** 🧪🔎 저장·이어하기: `storage/progress.ts`, `storage/run.ts`, Boot에서 저장소 선택 (PLAN 6.2) ⛓ W2-02
  - 테스트 (`tests/storage/run.test.ts`, `progress.test.ts`):
    - 10번 배치 → 저장 → 새 어댑터로 `parseRun` + `restoreRun` → 보드·트레이·점수·콤보·RNG가 같음 (SPEC 11절 7번)
    - 🔎 복원 후 다음 배치의 `t`가 마지막 `t`보다 큼, 복원한 로그 + 이어서 둔 로그가 `replay`·`checkIntervals`를 통과 (SPEC 11절 8번)
    - 🔎 잘린 JSON, `rulesVersion` 다름, `version` 다름 → `null` (예외 없음)
    - `snapshot`이 replay 결과와 달라도 replay 결과를 씀
    - pang 어댑터 테스트(`preferencesStorage.test.ts`) 복사
  - 완료 기준: 위 테스트 통과
- [ ] **W2-06** 👀 메뉴·게임 오버 화면: 이어하기 버튼(저장된 run이 있을 때만), GameOver 씬(점수·최고 점수·다시 하기·메뉴), `?over` 미리보기 ⛓ W2-05
  - 완료 기준: 판 도중 탭을 닫고 다시 열면 메뉴에 이어하기가 보이고 같은 판으로 이어짐 · 게임 오버 후에는 이어하기가 사라지고 최고 점수가 갱신됨

## 3주차 — 랭킹 연동 (큰 틀) ⛓ pang V2-W3-01~04

- [ ] **W3-01** 🧪 전용 Supabase 프로젝트 + 마이그레이션 (pang 복사 → SPEC 8절 테이블, `runs.rules_version`)
  - 완료 기준: RLS로 `weekly_scores` 클라이언트 쓰기가 막힘. pang 프로젝트 URL·키가 레포 어디에도 없음 (SPEC 11절 9번)
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
