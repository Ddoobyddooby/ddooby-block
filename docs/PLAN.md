# ddooby-block PLAN (v0.1 MVP)

> 기준 문서: [`SPEC.md`](./SPEC.md). 이 문서는 **어떻게**를 다룬다. 작업 단위와 완료 기준은 [`TASKS.md`](./TASKS.md).
> 문서끼리 충돌하면 SPEC > PLAN > TASKS 순으로 따른다. 규칙이 바뀌면 코드보다 SPEC·PLAN을 먼저 고친다.
> 작성일: 2026-11-05 · 기획 결정 반영: 2026-11-11 · 참조 프로젝트: `../ddooby-pang` (main `88e83fd` 기준)

**목표**: 8×8 보드에 조각 3개를 드래그해 놓고 줄을 지우는 무한 점수 블록 퍼즐을 웹과 Android로 만든다. 판은 이어서 할 수 있고, 주간 랭킹은 리플레이로 검증한다.

**구조**: ddooby-pang처럼 `core`(순수 TS 규칙)와 `view`/`scenes`(Phaser 연출·입력)를 나눈다. core는 `(state, action) → { state, events }`를 돌려주고, 화면은 이벤트를 재생만 한다. 같은 core를 서버(Edge Function)가 리플레이에 그대로 쓴다.

**스택**: Phaser 3.90 · TypeScript ~6.0 (strict) · Vite 8 · Vitest 5 · Capacitor 8 · Supabase (ddooby-block 전용) — 버전은 ddooby-pang `package.json`과 같게 맞춘다.

---

## 1. 전체 제약 (모든 태스크에 적용)

- `src/core/`는 `phaser`, DOM, `Math.random`, `@capacitor/*`, `view`·`scenes`·`storage`·`online`을 import하지 않는다. ESLint로 막는다 (pang `eslint.config.js`의 core 블록 복사)
- 랜덤은 `core/rng.ts`(mulberry32)만 쓴다. 같은 seed + 같은 배치 로그 → 같은 상태·점수 (SPEC 3.3, 11절)
- 점수·가중치·재추첨 횟수·애니메이션 시간은 `src/config.ts`에 둔다. 코드에 박지 않는다 (SPEC 4절)
- 점수는 항상 정수: 배율 곱셈 뒤 `Math.floor` (클라이언트·서버 결과가 같아야 한다)
- 규칙(조각 세트·가중치·점수·보정)이 바뀌면 `RULES_VERSION`을 올린다. 서버는 버전이 다른 기록을 거부하고, 이어하기 저장은 버전이 다르면 버린다
- 화면은 세로 고정, 기준 해상도 720×1280 (`Phaser.Scale.EXPAND`, pang `main.ts`와 같음). 브라우저 확인은 390×844
- 소리 파일은 `.ogg`와 `.m4a`를 같이 둔다 (pang 규칙)
- ddooby-pang과 Supabase 프로젝트·계정·데이터를 공유하지 않는다. 공통 코드는 **복사**한다 (SPEC 1.1)
- 커밋 `[type] W1-01 설명`, 브랜치 `feat/w1-01-<요약>`. 커밋 전에 `npm run lint && npm test && npm run build`가 통과해야 한다

## 2. 오픈 이슈 잠정 결정 (SPEC 12절)

| # | 이슈 | v0.1 결정 | 바꾸는 곳 |
|---|---|---|---|
| 1 | 생성 보정 강도 | v0.1은 최소 1개 배치 가능 (세 조각 완주 보장 없음) | `GENERATOR` |
| 2 | 모드 | 클래식만 | — |
| 3 | 콤보 유예 | 2회 | `COMBO.graceMisses` |
| 4 | 회전 | 불가 | — |
| 5 | 조각 세트·가중치 | 4.2절 표 (W4-02 시뮬 후 조정) | `PIECE_WEIGHTS` |
| 6 | 그래픽 | 단색 블록 + 하이라이트 (코드로 그린 텍스처) | `view/blockTexture.ts` |

추가로 정한 것:
- **배치 기준점**: `(row, col)` = 조각 bounding box의 왼쪽 위 칸
- **배치 로그의 `t`**: 판 시작부터 **실제로 플레이한 누적 시간(ms)**. 일시정지와 앱이 꺼져 있던 시간은 빠진다. 이어하기를 하면 저장된 `elapsedMs`부터 이어서 센다. 그래서 `t`는 항상 늘어난다
- **사람 한계 최소 간격**: `REPLAY.minIntervalMs = 200` (W4-02 실측 후 조정)
- **오프라인 판**: `runId`가 없는 판은 로컬 최고 점수만 갱신하고 랭킹에는 올리지 않는다. 1~2주차에는 모든 판이 오프라인이다
- **앱 ID**: `com.ddooby.block`, 앱 이름 `Ddooby-Block` (설치 후 바꾸지 않는다)

## 3. 프로젝트 구조

```
src/
├── main.ts              # Phaser.Game 생성 (pang 복사 후 씬 목록만 교체)
├── config.ts            # 모든 수치 (5절 값 포함)
├── core/                # 순수 규칙. 서버도 이 폴더를 import한다
│   ├── rng.ts           # pang 그대로 복사
│   ├── types.ts         # Pos, Board, PieceId, GameState, Placement, GameEvent
│   ├── board.ts         # 빈 보드, 칸 읽기, canPlace, 배치, 꽉 찬 줄 찾기, 줄 제거
│   ├── pieces.ts        # 조각 29개의 모양·색 그룹 (가중치는 config)
│   ├── generator.ts     # 가중치 추첨, 트레이 생성 + 보정
│   ├── scoring.ts       # 줄 점수표, 콤보 배율, 배치 점수
│   ├── engine.ts        # createGame, place, previewPlacement, isGameOver
│   └── replay.ts        # replay, checkIntervals
├── view/
│   ├── layout.ts        # pang 복사: createLayout, cellCenter, cellAt + 트레이 구역
│   ├── drag.ts          # 순수 함수: dragAnchor, 트레이 슬롯 배치
│   ├── blockTexture.ts  # 단색 + 하이라이트 텍스처 생성
│   ├── BoardView.ts     # 보드 칸 스프라이트, 이벤트 재생
│   ├── TrayView.ts      # 트레이 조각 3개, 놓을 수 없는 조각 흐리게
│   ├── DragController.ts# 포인터 → 드래그·고스트·놓기 (포인터 하나만 추적)
│   ├── Hud.ts           # 점수 / 최고 점수 / 콤보 / 일시정지 버튼
│   ├── Sfx.ts, ui/*     # pang 복사
│   └── fx/              # 줄 파티클, 팝업 텍스트, 흔들림(pang shake.ts 복사), 전체 비우기
├── scenes/              # Boot, Menu, Game, Pause, GameOver, Ranking
├── storage/
│   ├── progress.ts      # 최고 점수·설정 (pang 어댑터 복사, SaveData만 교체)
│   └── run.ts           # 진행 중인 판 저장·복원
└── online/              # 3주차. pang V2-W3 코드 복사
supabase/
├── migrations/          # pang 마이그레이션 복사 후 수정
└── functions/           # start-run, submit-score
tests/                   # core / view(순수 함수) / storage / online
scripts/sim/             # 자동 플레이 봇 (W4-02)
```

SPEC 9.1의 `data/` 폴더는 만들지 않는다. 조각 세트는 서버 리플레이에도 필요하므로 `core/pieces.ts`에 두고, 가중치는 `config.ts`에 둔다 (core → config 의존은 pang과 같이 허용).

### 3.1 ddooby-pang에서 가져오는 것

| 가져오는 것 | pang 위치 | 처리 |
|---|---|---|
| 빌드·린트·테스트 설정 | `package.json`, `tsconfig.json`, `vite.config.ts`, `eslint.config.js`, `.prettierrc.json`, `.prettierignore`, `.gitignore`, `.vscode/` | 복사. eslint에서 `modes`·`data`·`stageLoader` 블록은 지우고 `online` 금지 패턴을 core에 추가 |
| seed RNG | `src/core/rng.ts`, `tests/core/rng.test.ts` | 그대로 |
| 좌표 변환 | `src/view/layout.ts` (`createLayout`, `cellCenter`, `cellAt`) | 복사. `screenLayout`은 block 화면 구역으로 새로 씀 |
| 저장 어댑터 | `src/storage/progress.ts` (`KeyValueStore`, `LocalStorageAdapter`, `CapacitorPreferencesStorage`, `parseSave` 패턴) | 어댑터는 그대로, `SaveData`·`parseSave`는 block용으로 다시 씀 |
| 흔들림 | `src/view/fx/shake.ts` (`pickShake`) + 테스트 | 그대로 |
| 소리·버튼·패널 | `src/view/Sfx.ts`, `src/view/ui/*`, `scenes/backAction.ts`, `backButton.ts`, `pauseRules.ts`, `PauseScene.ts`, `muteToggle.ts` | 복사 후 import 경로·문구만 수정 |
| 부팅·저장소 연결 | `src/scenes/BootScene.ts` | 저장소 선택(Capacitor/localStorage)과 `navigator.storage.persist()` 부분만 가져옴 |
| 글꼴 | `public/fonts/Jua-subset.woff2`, `scripts/subset-font.mjs` | 복사. 서브셋 문자 목록은 block 문구로 다시 생성 |
| 배포 | `.github/workflows/pages.yml`, `capacitor.config.ts` | 복사 후 앱 ID·이름·주소 수정 |
| 인증·랭킹 | pang v0.2 3주차 산출물 (`src/online/`, `supabase/`) | **pang V2-W3 완료 후** 복사 (7절) |

새로 쓰는 것: `core/` 전체(rng 제외), 드래그·고스트·트레이, 줄 제거 연출, 이어하기. pang의 `matcher`·`gravity`·`specials`·`moves`·`modes/`는 쓰지 않는다.

## 4. core 설계

### 4.1 타입 (`core/types.ts`)

```ts
export interface Pos { readonly r: number; readonly c: number }

/** 1차원, index = r * size + c. null = 빈 칸, 숫자 = 색 그룹(0~6, 표시용) */
export interface Board { readonly size: number; readonly cells: readonly (number | null)[] }

export type PieceId = string; // 4.2절 표의 ID

/** 조각 정의 (4.2절). cells는 bounding box가 (0,0)에서 시작하는 상대 좌표, color는 색 그룹(0~6) */
export interface PieceDef { readonly id: PieceId; readonly cells: readonly Pos[]; readonly color: number }

export interface GameState {
  readonly board: Board;
  /** 길이 3. 놓은 칸은 null. 셋 다 null이 되면 바로 새 트레이로 바뀐다 */
  readonly tray: readonly (PieceId | null)[];
  readonly rngState: number;
  readonly score: number;
  /** 0 = 콤보 없음 */
  readonly combo: number;
  /** 줄을 못 지운 배치 연속 횟수 */
  readonly missStreak: number;
  readonly over: boolean;
}

export interface PlaceAction { readonly trayIndex: number; readonly row: number; readonly col: number }
/** 배치 로그 한 줄 (SPEC 8.1). t = 누적 플레이 시간 ms */
export interface Placement extends PlaceAction { readonly t: number }
```

### 4.2 조각 세트 (`core/pieces.ts`)

모양은 문자열로 정의하고(`#` = 칸, `.` = 빈칸, 줄은 `/`로 구분), 모듈 로드 때 `Pos[]`로 바꾼다. 모든 모양은 bounding box가 (0,0)에서 시작한다. 색 그룹은 SPEC 3.1에 따라 그룹마다 고정이다.

| 그룹 (색) | ID → 모양 | 가중치 (`PIECE_WEIGHTS`) |
|---|---|---|
| 점 (0) | `dot` `#` | 4 |
| 직선 (1) | `i2h` `##`, `i2v` `#/#`, `i3h`, `i3v`, `i4h`, `i4v`, `i5h`, `i5v` | 2칸 6, 3칸 6, 4칸 4, 5칸 2 (방향별 같음) |
| 사각형 (2) | `o2` `##/##`, `r2x3` `###/###`, `r3x2` `##/##/##`, `o3` `###/###/###` | 6, 3, 3, 1 |
| L 소형 (3) | `l3a` `#./##`, `l3b` `.#/##`, `l3c` `##/#.`, `l3d` `##/.#` | 각 5 |
| L 대형 (4) | `l5a` `#../#../###`, `l5b` `..#/..#/###`, `l5c` `###/#../#..`, `l5d` `###/..#/..#` | 각 2 |
| T (5) | `tu` `.#./###`, `td` `###/.#.`, `tl` `.#/##/.#`, `tr` `#./##/#.` | 각 4 |
| S/Z (6) | `sh` `.##/##.`, `sv` `#./##/.#`, `zh` `##./.##`, `zv` `.#/##/#.` | 각 3 |

총 29개. `PIECES: readonly PieceDef[]`(`{ id, cells: readonly Pos[], color }`)의 순서는 위 표 순서로 고정한다. 순서는 가중치 추첨 결과에 영향을 주므로 바꾸면 `RULES_VERSION`을 올린다.

### 4.3 보드 (`core/board.ts`)

| 함수 | 설명 |
|---|---|
| `createBoard(size: number): Board` | 빈 보드 |
| `cellsAt(piece: PieceDef, anchor: Pos): Pos[]` | 조각 칸을 기준점만큼 옮긴 좌표 |
| `canPlace(board, piece, anchor): boolean` | 모든 칸이 보드 안이고 빈 칸. 정수가 아닌 좌표(소수, NaN)는 보드 밖으로 본다 |
| `canPlaceAnywhere(board, piece): boolean` | 64칸 기준점 전수 검사 (SPEC 9.1, 최적화 안 함) |
| `fillCells(board, cells, color): Board` | 불변 갱신. 보드 밖 좌표는 무시한다 |
| `fullLines(board): { rows: number[]; cols: number[] }` | 꽉 찬 가로·세로 줄 번호 (오름차순) |
| `clearLines(board, rows, cols): { board; cleared: Pos[] }` | 교차 칸은 한 번만. `cleared` 순서 = 가로 줄 먼저(위→아래, 왼→오), 그다음 세로 줄에서 아직 안 나온 칸(왼→오, 위→아래). view가 이 순서로 파티클을 뿌린다 |

### 4.4 조각 생성 (`core/generator.ts`)

```
generateTray(board, rng) → [tray: PieceId[3], rng]
  for attempt in 0..GENERATOR.maxRerolls-1 (=10):
      tray = 가중치 추첨 3번 (중복 허용)
      tray 중 하나라도 canPlaceAnywhere → 반환
  // 보정: 마지막 추첨을 쓰되 슬롯 하나를 놓을 수 있는 조각으로 바꾼다
  placeable = PIECES 중 canPlaceAnywhere (표 순서 유지)
  slot = nextInt(rng, 3)
  tray[slot] = placeable 안에서 가중치 추첨
  반환
```
- `weightedPick(weights: readonly number[], rng): [index, rng]`: `nextInt(rng, 합계)` 하나로 누적합 구간을 찾는다. RNG 호출 수가 고정이라 재현된다. 가중치는 0 이상의 정수, 합계는 1 이상 2^32 이하이고 어기면 `throw`
- `placeable`은 비지 않는다: 줄 제거가 끝난 보드는 꽉 찰 수 없고(꽉 차면 모든 줄이 지워진다) `dot`은 빈 칸 하나만 있어도 놓인다. 그래도 비면 `throw` (버그로 본다)
- 첫 트레이도 같은 함수로 만든다 (빈 보드라 보정이 일어나지 않음)
- **v0.1에서는 위 알고리즘을 그대로 사용한다.** 후속 버전의 전략형 보정은 아래 10절의 검토안이며 현재 생성·검증 로직에 포함하지 않는다.

### 4.5 엔진 (`core/engine.ts`)

```ts
createGame(seed: number): GameState
place(state, action): PlaceResult
previewPlacement(state, action): { cells: Pos[]; rows: number[]; cols: number[] } | null
isGameOver(board, tray): boolean   // 남은 조각 중 어떤 것도 canPlaceAnywhere가 아님
type PlaceResult =
  | { ok: true; state: GameState; events: GameEvent[] }
  | { ok: false; reason: 'over' | 'emptySlot' | 'blocked' }
```

`place` 처리 순서 (이 순서가 이벤트 순서이고 리플레이 결과를 정한다):
1. 검사: `over`면 `over`, 슬롯이 비었거나 범위 밖이면 `emptySlot`, `canPlace`가 거짓이면 `blocked`. 실패는 상태를 바꾸지 않는다
   - `trayIndex`가 정수가 아니거나 슬롯의 조각 ID를 모르면(깨진 저장 데이터) `emptySlot`. `row`·`col`이 정수가 아니면(소수, NaN, `null` 등 숫자가 아닌 값) `blocked`. 배치 로그는 JSON이라 타입을 어긴 값이 들어올 수 있다
2. 칸 채움 → `place` 이벤트
3. `fullLines` → 있으면 `clearLines` → `clear` 이벤트
4. 콤보 갱신, 점수 계산 (4.6) → `score` 이벤트, 콤보가 바뀌면 `combo`
5. 보드가 비었으면 `boardClear` 이벤트
6. 트레이 슬롯을 null로. 셋 다 null이면 `generateTray` → `tray` 이벤트
7. **새 트레이를 만든 뒤에** `isGameOver` → 참이면 `over: true`, `gameOver` 이벤트

`previewPlacement`는 상태를 바꾸지 않고 고스트·줄 하이라이트용 정보만 준다. `place`가 실패할 조건(`over` 포함)이면 null.

`isGameOver`는 모르는 조각 ID를 놓을 수 없는 조각으로 본다. `boardClear`는 줄을 지운 결과 보드가 전부 비었을 때만 나온다. 7단계의 "새 트레이 직후 게임 오버"는 4.4의 보장 때문에 실제 생성기로는 일어나지 않지만, 판정 순서는 그대로 지킨다 (먼저 판정하면 빈 트레이를 게임 오버로 오판한다).

### 4.6 점수·콤보 (`core/scoring.ts`)

```
lineScore(n) = n == 0 → 0 | n ≤ 3 → SCORE.lines[n] (100, 300, 600)
             | n ≥ 4 → SCORE.line4 + (n - 4) × SCORE.lineExtra (1000, 500)
comboMultiplier(combo) = 1 + COMBO.step × (combo - 1)    // combo ≥ 1, step 0.5
배치 점수 = 칸 수 × SCORE.perCell
         + floor(lineScore(지운 줄 수) × comboMultiplier(새 combo))
         + (보드 전체 비움 ? SCORE.boardClear : 0)          // 3000, 배율 없음
```
- 줄 수 = 가로 줄 수 + 세로 줄 수 (교차해도 줄은 따로 센다. 칸만 한 번 지운다)
- 콤보: 줄을 지우면 `combo += 1`, `missStreak = 0`. 못 지우면 `missStreak += 1`, `missStreak > COMBO.graceMisses`(2)가 되면 `combo = 0`, `missStreak = 0`
  - 예: 지움(1) → 못 지움 → 못 지움 → 지움(2, ×1.5). 지움(1) → 못 지움 ×3 → 끊김 → 지움(1)

### 4.7 이벤트

```ts
type GameEvent =
  | { type: 'place'; trayIndex: number; pieceId: PieceId; cells: Pos[]; color: number }
  | { type: 'clear'; rows: number[]; cols: number[]; cells: Pos[] }
  | { type: 'score'; delta: number; lines: number; combo: number }
  | { type: 'combo'; combo: number }          // 0 = 끊김
  | { type: 'boardClear' }
  | { type: 'tray'; tray: PieceId[] }
  | { type: 'gameOver'; score: number }
```

### 4.8 리플레이 (`core/replay.ts`)

```ts
replay(seed: number, placements: readonly PlaceAction[]):
  | { ok: true; state: GameState }
  | { ok: false; index: number; reason: 'over' | 'emptySlot' | 'blocked' }
checkIntervals(placements: readonly Placement[], minMs: number): boolean // t가 늘어나고 간격 ≥ minMs
```
`createGame(seed)`에서 `place`를 차례로 적용한다. 이어하기 복원(6.2)과 서버 검증(7절)이 이 함수 하나를 쓴다.

## 5. config 값 (`src/config.ts`)

```ts
export const RULES_VERSION = 1;
export const GAME = { width: 720, height: 1280 };
export const BOARD = { size: 8 };
export const TRAY = { size: 3 };
export const GENERATOR = { maxRerolls: 10 };
export const PIECE_WEIGHTS: Record<PieceId, number> = { /* 4.2절 표 */ };
export const SCORE = { perCell: 1, lines: [0, 100, 300, 600], line4: 1000, lineExtra: 500, boardClear: 3000 };
export const COMBO = { graceMisses: 2, step: 0.5 };
export const REPLAY = { minIntervalMs: 200 };
export const VIEW = { dragLiftCells: 1.5, trayScale: 0.55, /* 화면 구역 */ };
export const ANIM = { place: 90, clearPerCell: 25, clearFade: 180, trayIn: 200, returnToTray: 160 };
export const FX = { /* 팝업 문구, 흔들림 단계 — 2주차 */ };
export const SAVE = { key: 'ddooby-block-save', runKey: 'ddooby-block-run' };
```

## 6. view / scenes / storage 설계

### 6.1 화면과 드래그

화면 구역 (720 기준, 위→아래): HUD(점수·최고·콤보·일시정지) → 보드(정사각형, 좌우 여백 40) → 트레이(조각 3개를 `VIEW.trayScale` 크기로 슬롯 가운데에). 트레이는 화면 아래 1/4 안, 엄지가 닿는 위치 (SPEC 6절).

`view/drag.ts` (순수 함수, 테스트 대상):
- `dragAnchor(layout, piece, pointer: {x, y}, liftCells = VIEW.dragLiftCells): Pos`
  - 조각을 실제 칸 크기로 그렸을 때 조각 중심 = `(pointer.x, pointer.y − liftCells × cell)`
  - 기준점 = 조각 왼쪽 위 좌표를 칸 단위로 **반올림** (`Math.round((left − layout.x) / cell)`). `Math.round(-0.4)`는 `-0`이므로 `+ 0`으로 정규화한다. 보드 밖 값도 그대로 돌려주고, 놓을 수 있는지는 core가 정한다
- `traySlotRect(screen, index)`: 슬롯 영역 (누르기 판정과 복귀 위치)

`DragController` (Phaser):
- `pointerdown`이 트레이 슬롯 안이면 그 조각을 집는다. **처음 누른 `pointer.id`만** 추적하고 다른 손가락은 무시한다
- 이동: 조각을 실제 칸 크기로 키워 `pointer`보다 1.5칸 위에 그린다. `dragAnchor` → `previewPlacement`가 있으면 고스트(반투명 칸)와 채워질 줄 하이라이트, 없으면 고스트를 숨긴다
- 놓기: **마지막으로 계산한 anchor**로 `place`를 부른다. 실패하면 조각을 슬롯으로 되돌린다 (`ANIM.returnToTray`, 페널티 없음)
- 입력 잠금: `place` 이벤트 재생 중, 일시정지, 게임 오버에는 집을 수 없다. 드래그 중에 잠기면(일시정지 등) 그 드래그는 취소하고 조각을 슬롯으로 되돌린다

### 6.2 저장과 이어하기 (`storage/`)

- `progress.ts`: `SaveData { version: 1; bestScore: number; settings: { muted: boolean; music: boolean } }`. pang `parseSave`처럼 깨진 필드는 기본값으로 채운다
- `run.ts`:
  ```ts
  interface SavedRun {
    version: 1; rulesVersion: number; seed: number; runId: string | null;
    placements: Placement[]; elapsedMs: number; snapshot: GameState;
  }
  parseRun(json: string | null): SavedRun | null   // 깨짐·버전 다름 → null
  restoreRun(saved: SavedRun): GameState | null    // replay(seed, placements). 실패 → null
  ```
  - **배치 로그가 기준이다.** 복원은 항상 `replay` 결과를 쓴다. `snapshot`과 다르면 경고만 남긴다 (SPEC 11절 "이어한 판도 리플레이 검증 통과"를 보장)
  - 배치에 성공할 때마다 저장한다. 앱이 백그라운드로 갈 때(`@capacitor/app` `pause`, 웹 `visibilitychange`)도 `elapsedMs`를 저장한다
  - 게임 오버가 되면 최고 점수를 갱신하고 run을 지운다
- 저장소 선택은 pang BootScene과 같다: 앱 = `CapacitorPreferencesStorage`, 웹 = `LocalStorageAdapter`, 시작할 때 `navigator.storage.persist()`

### 6.3 씬 흐름

```
Boot → Menu ─┬─ 새 게임 → Game ⇄ Pause → GameOver ─┬─ 다시 하기 → Game
             ├─ 이어하기 (저장된 run이 있을 때만) → Game   └─ 메뉴
             └─ 주간 랭킹 → Ranking (3주차)
```
GameOver: 점수, 최고 점수, (3주차) 이번 주 순위. 개발 URL 옵션: `?seed=N`(seed 고정), `?fill=<패턴>`(DEV 전용, 보드 미리 채우기), `?over`(게임 오버 화면 미리보기).

### 6.4 연출 (2주차, SPEC 5절)

- `clear` 이벤트의 `cells` 순서대로 `ANIM.clearPerCell` 간격으로 칸을 터뜨리고 파티클 + 효과음
- 줄 수 2/3/4+: "더블!" / "트리플!" / "대단해!" 팝업. 콤보 ≥ 2: "콤보 x{n}!". 흔들림 세기는 `FX`의 단계 표를 쓰고 `pickShake`로 고른다
- `boardClear`: 보드 전체 빛 + 큰 팝업
- 놓을 수 없는 트레이 조각은 흐리게 (매 배치 후 `canPlaceAnywhere`로 계산. 게임 오버 직전 연출을 겸한다)
- 연출 값은 `ANIM`·`FX`에서만 쓴다. view는 상태를 직접 계산하지 않는다 (흐림 판정은 core 함수 호출)

## 7. 온라인 (3주차, pang V2-W3 완료 후 자세히)

- pang `supabase/migrations/`를 복사해서 SPEC 8절의 `profiles`·`runs`·`weekly_scores`로 고친다. `runs`에 `rules_version int`를 추가한다
- `start-run`: `run_id` + seed 발급, `runs.created_at`이 기록 주(week_key, 월요일 00:00 KST)를 정한다 → 며칠에 걸친 판도 **시작한 주**로 등록 (SPEC 8.1)
- `submit-score`: `{ run_id, seed, placements, clientScore, version }` → 재사용 run 거부, `version ≠ RULES_VERSION` 거부, `checkIntervals` 실패 거부, `replay` 점수 ≠ `clientScore` 거부 → `weekly_scores` upsert (최고 점수만)
- 서버가 `src/core`를 import하는 방식(Deno 번들 등)은 pang V2-W2-08 PoC 결론을 그대로 따른다
- 네트워크가 없으면 오프라인 판으로 시작한다 (2절). 랭킹 화면은 오류 문구만 보이고 게임은 계속된다

## 8. 테스트 전략

| 대상 | 방법 |
|---|---|
| core 전체 | Vitest 단위 테스트. 보드는 문자열 헬퍼 `boardFrom('#.......\n...')`로 만든다 (`tests/helpers/board.ts`) |
| 보정 | seed 1~1000 × (빈 보드 + 랜덤으로 채운 보드)에서 트레이 중 최소 1개 배치 가능 (SPEC 11절) |
| 결정성 | 무작위 봇이 seed 1~200을 게임 오버까지 플레이한 로그 → `replay` 결과가 원래 상태와 `toEqual` |
| view 순수 함수 | `dragAnchor`, `traySlotRect`, `pickShake` 등 Phaser 없는 함수 |
| storage | 가짜 `KeyValueStore`·`PreferencesLike`로 저장 → 복원 왕복, 깨진 JSON |
| 화면 | 390×844 브라우저 확인 (Playwright 캡처), 콘솔 오류 0 |
| 밸런스 | `npm run sim` (W4-02): 그리디 봇으로 seed 1~1000, 평균 점수·배치 수·보정 발생률 |

## 9. 검토 포인트 (SPEC이 직접 말하지 않지만 실제로 깨지기 쉬운 것)

각 항목은 담당 태스크의 테스트로 고정한다 (TASKS의 🔎 표시).

1. **보드 가장자리 스냅**: 조각 일부가 반 칸 이상 보드 밖에 있을 때 고스트가 보인 위치와 실제로 놓인 위치가 같아야 한다 → W1-06 `dragAnchor` 경계 테스트, 놓기는 마지막 anchor 사용
2. **이어한 판의 `t`**: 앱을 껐다 켠 뒤 `t`가 0부터 다시 시작하면 서버 간격 검사에서 거부된다 → W2-05 복원 후 다음 배치의 `t` > 마지막 `t` 테스트
3. **깨진 저장 데이터**: 저장 중 앱이 죽어 JSON이 잘리거나 규칙 버전이 다르면 이어하기 버튼만 사라지고 게임은 정상 시작 → W2-05 `parseRun` 테스트
4. **애니메이션·일시정지 중 입력**: 줄 제거 연출 중에 다른 조각을 놓거나, 드래그 중 일시정지하면 view와 core 상태가 어긋날 수 있다 → W1-07 입력 잠금 규칙 순수 함수 테스트 + 브라우저 확인
5. **새 트레이 직후 게임 오버**: 마지막 조각을 놓아 새 트레이가 나온 순간에도 판정해야 한다 (생성 전에 판정하면 빈 트레이라 오판). 4.5의 7단계 순서 → W1-05 테스트

## 10. 후속 설계 후보 — 전략형 조각 생성 (v0.1 미포함)

> SPEC 3.3.1에 따른 후속 버전 검토안이다. v0.1의 `generateTray` 구현·테스트·서버 리플레이 계약은 변경하지 않는다.

1. **후보 생성**: 동일한 seeded RNG로 가중치 랜덤 트레이 3개 조합을 여러 개 생성한다.
2. **경로 평가**: 각 후보에 대해 조각 순서·위치와 배치 후 줄 제거를 반영하여 최대 3수까지 탐색한다. 탐색 예산 초과는 `배치 불가능`과 구분한다.
3. **난이도 평가**: 완주 가능 경로, 유효한 첫 수, 순서 의존성, 배치 후 공간 활용도를 평가한다. 빈 칸 수만으로 위험도를 판정하지 않는다.
4. **후보 선택**: 완주 가능한 후보를 우선 고려하되 완주 불가능한 트레이도 일부 허용한다. 완주 보장은 하지 않는다. 최소 1개 배치 가능이라는 기존 안전 조건은 유지한다.
5. **결정성·성능**: 후보 생성·탐색 순서·동점 처리까지 Seed와 보드 상태에 대해 결정적이어야 한다. 클라이언트와 서버가 같은 결과를 내야 하며, 규칙 변경 시 `RULES_VERSION`을 갱신한다.
6. **검증**: 랜덤 봇과 전략 봇을 사용해 배치 수, 점수, 완주 가능한 트레이 비율, 막힘 발생률, 조각 생성 시간 등을 기존 방식과 비교한다. 실제 플레이에서 공정성과 재미를 확인한다.

**확인 필요**: 적용 버전, 후보 수, 탐색 폭·예산, 완주 불가능 트레이 허용 기준, 난이도 정책. 수치는 측정 후 결정한다.
