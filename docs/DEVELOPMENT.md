# 개발 가이드

> VSCode에서 프로젝트를 열고, 서버를 띄우고, 작업 결과를 확인하는 방법.
> 태스크가 끝날 때마다 **4절 작업별 확인 방법**과 **6절 Study for App**에 항목을 추가한다. 새 명령이 생기면 2절, 새 URL 옵션이 생기면 3절도 갱신한다.
> 2·3절에서 "(예정)"이 붙은 명령·옵션은 [PLAN](./PLAN.md)에서 정했지만 아직 없는 것이다. 해당 태스크가 끝나면 "(예정)" 표시를 지운다.

---

## 1. 처음 한 번

1. Node.js 20.19 이상 설치 (`node -v`로 확인)
2. repo 받기
   ```bash
   gh repo clone Ddoobyddooby/ddooby-block
   cd ddooby-block
   ```
3. VSCode로 열기: `code .`
   - `code` 명령이 없으면 VSCode에서 `Cmd+Shift+P` → "Shell Command: Install 'code' command in PATH"
4. 의존성 설치: VSCode 터미널(`` Ctrl+` ``)에서 `npm install` (W1-01 이후)
5. 추천 확장 설치: 처음 열면 오른쪽 아래에 "추천 확장을 설치할까요?" 알림이 뜬다 → 설치
   - ESLint, Prettier, Vitest (목록은 `.vscode/extensions.json`, W1-01에서 ddooby-pang 것을 복사)
   - 설치하면 저장할 때 자동 포맷되고, 규칙 위반은 빨간 밑줄로 보인다

## 2. 매일 쓰는 명령

VSCode 터미널에서 실행한다. 터미널은 `+` 버튼으로 여러 개 열 수 있다 (서버용 1개, 테스트용 1개 권장).

| 명령 | 용도 | 생기는 태스크 |
|---|---|---|
| `npm run dev` | 개발 서버 (http://localhost:5180, ddooby-pang 5173과 겹치지 않게). 코드를 저장하면 브라우저가 자동 갱신된다. 끄려면 `Ctrl+C` | W1-01 |
| `npm test` | 테스트 한 번 실행 (`tests/**/*.test.ts`) | W1-01 |
| `npm run test:watch` | 파일을 저장할 때마다 테스트 자동 재실행. 끄려면 `q` | W1-01 |
| `npm run typecheck` | 타입 에러만 확인 | W1-01 |
| `npm run lint` | ESLint 규칙 검사 (`src/core`의 Phaser·DOM·`Math.random` 사용 금지 포함) | W1-01 |
| `npm run format` | Prettier로 코드 정리 (md 문서는 제외) | W1-01 |
| `npm run build` | 타입체크 + 배포용 빌드 (`dist/`) | W1-01 |
| `npm run server:shared` / `server:shared:check` | 닉네임 규칙(`src/online/nicknameRules.ts`·`bannedWords.ts`)을 서버 함수용 파일로 묶는다 / 묶어 둔 파일이 원본과 같은지만 본다(다르면 1). 규칙을 고치면 `server:shared`를 돌리고 같이 커밋한다 | W3-02 |
| `npm run functions:check` | Edge Function 타입 검사 (`deno check`) | W3-02 |
| `npm run supabase:check -- --scores [--parity]` | 점수 제출 원격 시험. `--scores`는 정상·재제출·조작·간격·버전·남의 run·이른 제출·동시 제출 등 약 60개(판마다 실제 시간을 기다려 몇 분), `--parity`는 서버가 발급한 seed로 200판을 서버에서 다시 계산해 점수가 같은지 본다(run 200개가 남는다) | W3-03 |
| `npm run supabase:check -- --ranking` | 주간 랭킹 원격 시험: 비로그인 조회, 이름 있는/없는 시험 사용자의 목록·내 줄, 공동 순위, 클라이언트 직접 쓰기 차단(약 20개). 시험 사용자와 닉네임이 공개 목록에 남는다 | W3-04 |
| `npm run fonts:subset` / `fonts:check` | 테마 글꼴을 앱에 쓰는 글자만 남겨 다시 만든다(원본 글꼴을 `assets/fonts-src/README.md`대로 받아 두고, Homebrew `hb-subset` 필요) / 문구의 글자가 서브셋에 다 들어 있는지와 글꼴 이름(예약 이름 SUIT가 없는지)만 본다. 문구를 바꾸면 `fonts:check`가 실패하니 `fonts:subset`을 돌린다 | W4-05 |
| `npm run supabase:check` | Supabase 권한 시험. `.env.local`(또는 `-- <env 경로>`)의 URL·publishable key로 익명 사용자 둘과 비로그인을 만들어 쓰기가 막히는지 본다. 모두 PASS면 0, FAIL·시험 불가가 있으면 1, 설정이 없거나 키가 publishable이 아니면 2. 실행마다 익명 계정 2개가 남는다 | W3-01 |
| `npm run sim` | 자동 플레이 봇으로 seed 1~1000을 돌려 평균 점수·배치 수·보정 발생률을 찍는다. 가중치·점수를 고친 뒤 밸런스를 잴 때 | W4-02 (예정) |
| `npm run android:sync` | 웹 빌드 후 `android/` 앱에 복사 (`cap sync`). Android Studio에서 ▶ 하기 전에 실행 | W4-03 (예정) |

커밋 전에는 항상 `npm run lint && npm test && npm run build`가 통과해야 한다.

## 3. 게임 화면 확인하기

1. `npm run dev` 실행 → 터미널에 주소가 뜬다
   ```
   ➜  Local:   http://localhost:5180/
   ➜  Network: http://192.168.x.x:5180/
   ```
2. **PC 브라우저**: `Local` 주소를 연다 (`Cmd` + 클릭)
3. **휴대폰 크기로 보기**: Chrome 개발자도구(`Cmd+Option+I`) → 기기 툴바(`Cmd+Shift+M`) → 390×844(iPhone 12~14 크기) 선택. 태스크 확인과 캡처는 이 크기로 한다
4. **실제 휴대폰으로 보기**: PC와 같은 Wi-Fi에 연결한 뒤 휴대폰 브라우저로 `Network` 주소를 연다. 드래그(터치) 감각은 꼭 실제 휴대폰으로도 본다
   - 밖에서는 Tailscale로: `http://<PC 이름>.<tailnet>.ts.net:5180/` (`vite.config.ts`의 `allowedHosts`, ddooby-pang과 같음)
5. 에러가 나면 개발자도구의 **Console** 탭을 확인한다
6. **배포된 주소**: W4-03 이후 https://ddoobyddooby.github.io/ddooby-block/ — main에 push하면 1~2분 뒤 자동으로 새로 배포된다

**URL 옵션 (개발용)** — "(예정)"이 붙은 것은 아직 없다

| 주소 | 동작 | 생기는 태스크 |
|---|---|---|
| `?seed=1001` | 항상 같은 조각 순서. 메뉴를 건너뛰고 바로 게임으로 간다. 버그를 봤으면 seed를 적어두고 이 주소로 재현. 0~4294967295의 정수만 받는다 | W1-07 |
| `?fill=<이름>` | (개발 모드) 보드를 미리 채운 상태로 시작. 이름은 `line1`, `line2`, `line3`, `combo3`, `clear`. 맨 왼쪽 조각을 놓을 자리는 4절 W2-04 표 참고. 이 판은 저장·랭킹 대상이 아니다 | W2-04 |
| `?resume` | (개발 모드) 저장된 판이 있으면 그 판을 이어서 시작한다. 메뉴의 [이어하기]를 누른 것과 같다 | W2-05 |
| `?ranking` | (W3-03부터 쓰지 않는다) 닉네임 창은 점수 제출이 성공한 뒤에 저절로 뜬다 | W3-02 |
| `?rankingFake=<이름>` | (개발 모드) 서버 없이 랭킹 화면 모양만 본다: `top`·`far`(51위 밖)·`around`·`long`·`noname`·`empty`·`norecord`·`anon`·`offline`·`error` | W3-04 |
| `?theme=<id>` | (개발 모드) 테마를 바로 바꿔 본다: `soda`·`butter`·`orbit`. 저장하지 않는다 | W4-05 |
| `?ranking=fake` | (개발 모드) 서버 없이 입력 창만 본다. 이름으로 결과를 정한다: `서버오류`·`연결끊김`·`권한없음`·`이미있음`·`무응답`(10초 뒤 닫힘), 그 밖은 성공 `#0427` | W3-02 |
| `?over` | (개발 모드) 게임 없이 게임 오버 화면만 띄운다. `?over`는 최고 기록을 넘은 화면, `?over=low`는 못 넘은 화면. 예시 점수이고 저장되지 않는다 | W2-06 |

개발 모드(`npm run dev`)에서는 매 배치 후 화면과 게임 상태가 같은지 검사한다 (W1-07). Console에 `view ≠ board`나 `HUD ≠ state`(W2-03)가 찍히면 버그이니 seed와 함께 기록해두자. seed는 게임을 시작할 때 Console에 `seed 123`처럼 찍힌다.

## 4. 작업별 확인 방법

> 태스크를 마치면 여기에 **사용자가 직접 확인하는 절차**를 추가한다. 형식:
>
> ```
> ### W1-02 core 타입 + 보드
> - `npm test` → `tests/core/board.test.ts` N개 통과
> - 직접 확인: (코드를 일부러 바꿔 테스트가 실패하는지 보는 방법, 화면에서 볼 것, URL 옵션 등)
> ```

### W1-01 프로젝트 세팅

- `npm install` (처음 한 번)
- `npm run lint && npm run typecheck && npm test && npm run build` → 에러 없이 끝나고 테스트는 파일 2개, 31개 통과 (`tests/core/rng.test.ts` 6개, `tests/lint/coreGuard.test.ts` 25개)
- `npm run dev` → 터미널에 뜬 주소를 열고 기기 툴바를 390×844로 설정 → 검은 빈 화면, Console에 빨간 오류 없음 (`Phaser v3.90.0` 배너만 보인다)
  - 5180을 다른 프로그램이 쓰고 있으면 Vite가 다음 번호로 띄운다. 터미널에 뜬 주소를 그대로 쓴다 (5절)
- 직접 확인 (core 보호 규칙): `src/core/tmp.ts`를 만들어 `export const a = Math.random();`을 넣고 `npm run lint` → "랜덤은 core/rng.ts의 seed RNG만 쓴다" 에러. `export const b = document;`, `import 'phaser';`로 바꿔 가며 에러를 본 뒤 파일을 지운다
- 직접 확인 (테스트가 규칙을 지키는지): `eslint.config.js`에서 `Math.random` 금지 줄을 잠깐 주석 처리하고 `npm test` → `coreGuard` 테스트가 실패한다. 되돌린다

### W1-02 core 타입 + 보드

- `npm test` → 파일 3개, 77개 통과. 보드만 보려면 `npx vitest run tests/core/board.test.ts` → 46개
- 화면에 보이는 변화는 없다 (보드 계산 함수만 생겼다)
- 직접 확인 (그림과 기대값 대조): `tests/core/board.test.ts`에서 `CROSS` 보드 그림과 `cleared` 기대값 15줄을 눈으로 맞춰 본다. 가로 3번 줄 8칸이 먼저, 이어서 세로 5번 줄의 나머지 7칸
- 직접 확인 (테스트가 잡는지): `src/core/board.ts`에서 `if (seen.has(index)) return;` 한 줄을 지우고 `npm test` → 교차 칸이 두 번 나와 테스트가 실패한다. 되돌린다
- 직접 확인 (소수 좌표): `src/core/board.ts`의 `inBounds`에서 `Number.isInteger` 두 줄을 지우고 `npm test` → "소수 행 좌표" 테스트가 실패한다. 되돌린다

### W1-03 조각 세트

- `npm test` → 파일 4개, 209개 통과. 조각만 보려면 `npx vitest run tests/core/pieces.test.ts` → 132개
- 화면에 보이는 변화는 없다 (조각 정의와 가중치만 생겼다)
- 직접 확인 (표 대조): `tests/core/pieces.test.ts`의 `EXPECTED` 표 29줄을 `docs/PLAN.md` 4.2 표, `docs/SPEC.md` 3.2 표와 눈으로 맞춰 본다 (모양, 칸 수, 색, 가중치)
- 직접 확인 (테스트가 잡는지): `src/core/pieces.ts`에서 `l3a`의 모양을 `'.#/##'`로 바꾸고 `npm test` → 모양 테스트가 실패한다. 되돌린다

### W1-04 조각 생성 + 보정

- `npm test` → 파일 7개, 261개 통과. 생성기만 보려면 `npx vitest run tests/core/generator.test.ts` → 20개
- 화면에 보이는 변화는 없다 (조각 3개를 뽑는 함수만 생겼다)
- 직접 확인 (추첨을 건너뛰면 안 되는 이유): `src/core/generator.ts`의 `generateTray`에서 3개를 다 뽑기 전에 `return`하도록 바꾸면 `npm test`가 실패한다. 추첨 횟수가 달라지면 같은 seed에서 다음 조각이 달라지기 때문이다. 되돌린다
- 직접 확인 (구간 경계): `weightedPick`의 `roll < acc`를 `roll <= acc`로 바꾸고 `npm test` → 구간 경계 테스트가 실패한다. 되돌린다

### W1-05 엔진

- `npm test` → 파일 7개, 261개 통과. 엔진만 보려면 `npx vitest run tests/core/engine` → 파일 2개, 32개
- 화면은 W1-07부터 보인다. 그 전에는 테스트로만 확인한다
- 직접 확인 (판정 순서): `src/core/engine.ts`의 `place`에서 7단계(`isGameOver`)를 6단계(새 트레이 생성) 앞으로 옮기고 `npm test` → 세 번째 조각 테스트와 결정성 테스트가 실패한다. 트레이가 빈 순간에 판정하면 놓을 조각이 없어 게임 오버로 잘못 본다. 되돌린다
- 직접 확인 (이상한 좌표): `check`에서 `Number.isInteger(action.row)` 검사를 지우고 `npm test` → "숫자가 아닌 좌표" 테스트가 실패한다. 되돌린다

### W1-06 화면 구역 + 드래그 계산

- `npm test` → 파일 9개, 315개 통과. 화면 계산만 보려면 `npx vitest run tests/view` → 파일 2개, 54개
- 화면에 보이는 변화는 아직 없다 (좌표 계산 함수만 생겼다). 실제 드래그는 W1-07에서 본다
- 직접 확인 (반올림): `src/view/drag.ts`의 `dragAnchor`에서 `Math.round`를 `Math.floor`로 바꾸고 `npm test` → 경계 테스트가 실패한다. 조각이 칸의 절반을 넘어야 다음 칸으로 붙는 것이 반올림이다. 되돌린다
- 직접 확인 (화면 수치): `src/config.ts`의 `VIEW.screen`에서 `trayH`를 400으로 바꾸고 `npm test` → 트레이가 화면 아래 1/4을 벗어나 테스트가 실패한다. 되돌린다

### W1-07 게임 화면

- `npm test` → 파일 14개, 372개 통과
- `npm run dev` → 터미널에 뜬 주소를 연다. 탭 제목이 `Ddooby-Block`인지 먼저 확인한다 (다른 페이지가 뜨면 `localhost` 대신 `127.0.0.1`로 연다)
- 개발자도구 기기 툴바에서 390×844, 터치 모드로 `/?seed=1`을 연다. 첫 트레이는 작은 L, 점, 작은 L이다
- 직접 확인:
  1. 조각을 끌면 손가락 위에 뜨고, 보드 위에서 놓일 자리(고스트)가 보인다
  2. 보드 밖이나 이미 찬 칸 위에서 놓으면 트레이로 돌아온다
  3. 오른쪽 아래 구석과 맨 아랫줄에 놓아 본다. 고스트가 보인 칸과 놓인 칸이 같다
  4. 한 줄을 채우면 채워질 줄이 미리 밝아지고, 놓으면 지워진다. 지워지는 동안에는 다른 조각이 집히지 않는다
  5. 3개를 다 놓으면 새 조각 3개가 나온다
  6. 놓을 곳이 없어질 때까지 하면 "게임 오버" 글자가 뜨고, 화면을 누르면 메뉴로 간다
  7. Console에 빨간 오류와 `view ≠ board`가 없다
  8. 주소를 `/`로 열면 메뉴가 나오고 "새 게임"으로 들어간다. 창을 가로로 넓히면 보드가 가운데에 온다
- 실제 휴대폰: 3절 4번대로 `Network` 주소를 연다. 세로로 긴 조각(5칸 막대)을 끌 때 손가락에 가려지는지 본다 (FEEDBACK R2)

### W2-01 점수·콤보

- `npm test` → 파일 15개, 396개 통과. 점수만 보려면 `npx vitest run tests/core/scoring.test.ts` → 17개
- 화면에는 아직 점수가 보이지 않는다 (표시는 W2-03). 계산은 테스트로 확인한다
- 테스트에서 볼 숫자: 3칸 조각으로 1줄 = 103 / 콤보 2에서 2줄 = 칸 수 + 450 / 보드 전체 비움 +3000 / 지움 → 못 지움 3번 → 콤보 0
- 직접 확인 (유예 경계): `src/core/scoring.ts`의 `nextCombo`에서 `missStreak > COMBO.graceMisses`를 `>=`로 바꾸고 `npm test` → 콤보 테스트가 실패한다. 2번까지는 봐주고 3번째에 끊기는 것이 `>`다. 되돌린다
- 직접 확인 (수치는 config에): `src/config.ts`의 `SCORE.lines`에서 100을 200으로 바꾸고 `npm test` → 점수 테스트가 실패한다. 테스트는 기대값을 따로 적어 두었기 때문에 설정을 잘못 바꾸면 알려 준다. 되돌린다

### W2-02 리플레이

- `npm test` → 파일 16개, 427개 통과. 리플레이만 보려면 `npx vitest run tests/core/replay.test.ts` → 31개
- 화면에서 볼 것은 없다. 이어하기(W2-05)와 서버 점수 검증(3주차)이 이 함수를 쓴다
- 테스트가 하는 일: 무작위 봇이 seed 1~200을 게임 오버까지 두고, 그 기록을 처음부터 다시 돌려 200판 모두 같은 상태가 나오는지 본다
- 직접 확인 (규칙이 바뀌면 알려 주는가): `src/config.ts`의 `SCORE.lines`에서 100을 200으로 바꾸고 `npx vitest run tests/core/replay.test.ts` → "고정 로그 fixture" 테스트 4개가 실패한다. 200판 비교 테스트는 그대로 통과한다(원래 플레이도 같은 규칙으로 틀리기 때문). 되돌린다
- 직접 확인 (깨진 기록): "깨진 로그 항목" 묶음의 테스트가 `null`·숫자·문자열이 섞인 기록을 넣는다. 예외로 멈추지 않고 몇 번째가 잘못됐는지 돌려준다

### W2-03 HUD + 일시정지

- `npm test` → 파일 20개, 446개 통과
- `npm run dev` → `?seed=2`로 연다. 화면 위에 점수(0), 최고 점수, 일시정지 버튼이 보인다
- 점수·콤보: 트레이 조각 3개를 왼쪽부터 보드 맨 윗줄의 0번째, 3번째, 4번째 칸에 맞춰 놓으면 윗줄이 지워지고 점수 113, "콤보 1"이 된다. 이어서 줄을 못 지우는 배치를 3번 하면 세 번째에 콤보 표시가 사라진다
- 일시정지: 버튼을 누르면 [계속] [다시 하기] [메뉴]가 뜬다. 뒤의 트레이를 눌러도 집히지 않는다
- 드래그 중 일시정지: 휴대폰에서 한 손가락으로 조각을 끌면서 다른 손가락으로 일시정지 버튼을 누르면 조각이 트레이로 돌아간다
- 최고 점수: [다시 하기]나 [메뉴] → 새 게임 뒤에도 "최고" 숫자가 남는다. 게임 오버가 되면 저장돼 새로고침 뒤에도 남는다 (W2-05)
- 연출 중 일시정지: 세 번째 조각을 놓자마자 일시정지 → 창 크기를 바꿈 → [계속]. 조각을 다시 집을 수 있고 Console에 `HUD ≠ state`가 없어야 한다

### W2-04 연출·효과음

- `npm test` → 파일 26개, 527개 통과
- `npm run dev` → 아래 주소로 열고 **맨 왼쪽 조각**을 표의 자리에 놓는다

  | 주소 | 맨 왼쪽 조각을 놓을 자리 | 보이는 것 |
  |---|---|---|
  | `?fill=line1` | 가로 3칸을 맨 아래 줄 왼쪽 끝 | 1줄 제거, 파티클 |
  | `?fill=line2` | 세로 2칸을 아래 두 줄의 빈 칸(왼쪽에서 4번째) | "더블!" + 흔들림 |
  | `?fill=line3` | 세로 3칸을 아래 세 줄의 왼쪽 끝 | "트리플!" + 더 센 흔들림 |
  | `?fill=combo3` | 가로 3칸을 맨 아래 줄 왼쪽 끝 | "콤보 x3!" |
  | `?fill=clear` | 가로 3칸을 맨 아래 줄 왼쪽 끝 | "전체 비우기!" + 3000점 |

- 흐린 조각: `?fill=line1`에서 오른쪽 3×3 조각이 처음부터 흐리다(놓을 곳이 없다). 가로 3칸, 점 조각 순으로 놓으면 게임 오버가 된다
- 소리: 조각을 놓을 때, 줄이 지워질 때, 버튼을 누를 때 소리가 난다. 개발 모드 Console에 `[sfx] clear rate=1.1`처럼 찍힌다. **실제로 들리는지는 스피커로 직접 확인한다** (자동 확인은 재생 호출까지만 했다)
- 음소거: 일시정지 → 오른쪽 위 스피커 버튼. 켜면 소리와 `[sfx]` 로그가 멈추고 새 판에서도 유지된다. 새로고침 뒤에도 유지된다 (W2-05)
- 프로덕션에서는 `?fill=`이 무시된다: `npm run build && npm run preview` → `?seed=1&fill=line1`이 빈 보드로 시작
- 직접 확인 (연출 값은 config에): `src/config.ts`의 `FX.shake.levels` 값을 크게 바꾸고 `?fill=line3`을 다시 해 본다. 되돌린다

### W2-05 저장·이어하기

- `npm test` → 파일 33개, 658개 통과
- `npm run dev` → `?seed=4`로 열어 조각을 몇 개 놓는다 → 개발자도구 → Application → Local Storage → `ddooby-block-run`에 `placements`(놓은 수만큼)와 `elapsedMs`가 있다
- 주소를 `?resume`으로 바꿔 연다 → 보드·트레이·점수가 그대로이고 이어서 놓을 수 있다. 새로 놓은 수의 `t`는 앞의 `t`보다 크다
- 일시정지 → 음소거 → 새로고침 → 일시정지 화면의 스피커가 꺼진 모양 그대로다 (`ddooby-block-save`의 `muted: true`)
- 게임 오버까지 간다 → `ddooby-block-run`이 사라지고 `ddooby-block-save`의 `bestScore`가 그 점수다
- `?fill=line1`로 줄을 지워도 `bestScore`와 저장된 판은 바뀌지 않는다
- 조각을 놓은 직후 0.2초 안에는 다음 조각이 집히지 않는다. 연달아 빠르게 놓아 보고 답답한지 본다 (손가락 체감은 아직 아무도 확인하지 않았다)
- 직접 확인 (깨진 저장): Local Storage의 `ddooby-block-run` 값을 `{`로 바꾸고 `?resume`으로 연다 → Console에 "이어할 수 있는 판이 없음" 경고만 나오고 메뉴가 정상으로 뜬다

### W2-06 메뉴 이어하기·게임 오버 화면

- `npm test` → 파일 37개, 696개 통과
- `npm run dev` → 메뉴에서 [새 게임] → 조각을 몇 개 놓고 새로고침 → 메뉴에 [이어하기]가 [새 게임] 위에 보인다 → 누르면 같은 보드·트레이·점수로 이어진다
- 이어하기가 있는 상태에서 [새 게임] → 한 수도 안 두고 일시정지 → [메뉴] → [이어하기]가 그대로 있다. [새 게임] → 한 수 둠 → [메뉴] → [이어하기]가 방금 판을 연다
- 게임 오버까지 간다 → 약 0.7초 뒤 화면이 뜬다: 이번 점수, 최고 점수, 넘었으면 "최고 기록 갱신!". 뜬 직후 0.6초 동안은 버튼이 눌리지 않는다
- [다시 하기] → 빈 보드의 새 판 (이어하기로 시작했던 판이 다시 열리면 안 된다). [메뉴] → [이어하기]가 없다
- `?over`, `?over=low`로 화면만 따로 본다. 창 크기를 바꿔도 패널과 버튼이 가운데에 맞는다
- 프로덕션에서는 `?over`·`?resume`이 무시된다: `npm run build && npm run preview` → `?over`가 메뉴로 간다
- 직접 확인 (이어한 기록): 이어한 뒤 몇 수 두고 Local Storage의 `ddooby-block-run`에서 `placements`의 `t`가 계속 늘어나는지 본다

### W3-01 Supabase 스키마·권한

- `npm test` → 파일 39개, 738개 통과 (`tests/supabase/` 포함)
- `npm run supabase:check` (`.env.local` 없이) → 안내 문구와 함께 끝나고 `echo $?`가 2
- 원격 적용 (block 전용 프로젝트가 생긴 뒤): `.env.example`을 `.env.local`로 복사해 URL·publishable key를 넣는다 → `supabase login` → `supabase link --project-ref <ref>` → `supabase db push --dry-run`(올라갈 파일 목록만 보여 준다. SQL이 맞는지 검증하는 것은 아니다) → `supabase db push` → `npm run supabase:check`가 모두 PASS. 자세한 순서는 `supabase/README.md`
- 대시보드 Table Editor에서 `profiles`·`runs`·`weekly_scores`에 RLS가 켜져 있다
- `git ls-files | grep -E '\.env\.local|supabase/\.temp'` → 아무것도 안 나온다

### W3-02 익명 로그인·닉네임

- `npm test` → 파일 51개, 1053개 통과. `npm run server:shared:check`·`npm run functions:check` → 0
- 서버 없이: `npm run dev` → `?over&ranking=fake` → 입력 창에 `뚜`(짧음), `시발`(금칙어)을 넣어 거부 문구를 보고, `무응답`으로 10초 뒤 "지금은 연결이 안 돼요", Esc는 [나중에]와 같다
- 실제 서버 (`.env.local`에 키): `?ranking`으로 게임 오버까지 → 이름 저장 → "이름을 정했어요: 이름#1234" → 새로고침 뒤 게임 오버에서 다시 묻지 않는다. 대시보드 Table Editor → `profiles`에 그 이름이 있다
- 원격 시험: `npm run supabase:check -- --nickname` → 27개 PASS, exit 0. 실행마다 시험용 익명 계정과 `시험` 이름 행이 남는다
- 키 없이 `?ranking` → 창이 뜨지 않고 게임은 정상
- 프로덕션: `npm run build` 뒤 `grep -r ranking dist/assets` → 아무것도 안 나온다
- 함수 배포(바꿨을 때만): `supabase functions deploy set-nickname --project-ref <ref>` (`--no-verify-jwt`를 붙이지 않는다)

### W4-05 테마

- `npm test` → 파일 86개, 1634개 통과. `npm run fonts:check` → 0
- `npm run dev` → 메뉴 [테마] → 카드 세 개 중 하나를 고르면 메뉴가 바로 바뀐다 → 새로고침해도 유지
- 세 테마로 각각 한 판: 보드 빈 칸과 블록 색이 구분되는지, 고스트(놓일 자리)·흐린 조각·줄 제거 연출이 보이는지, 일시정지·게임 오버·랭킹·닉네임 창 색이 맞는지. **휴대폰 밝기를 낮춰서도** 빈 칸이 보이는지 본다
- `?theme=orbit`처럼 주소로 바로 바꿔 볼 수 있다(개발 모드만)

### W3-04 주간 랭킹

- `npm test` → 파일 79개, 1542개 통과
- 서버 없이: `npm run dev` → `?rankingFake=far`로 열고 메뉴 [주간 랭킹] → 50위 뒤 `⋯`와 내 위아래 5명, 하단 내 줄이 보인다. `noname`·`empty`·`offline`도 바꿔 본다
- 실제 서버: 메뉴 [주간 랭킹] → 기간 "11월 16일(월) ~ 11월 22일(일)"처럼 이번 주가 보인다. 한 판을 끝내면 게임 오버에 "이번 주 최고 N점 · N위"(이름이 없으면 "이름을 정하면 순위가 보여요"와 닉네임 창)
- 오프라인(Network → Offline) → [주간 랭킹] → "인터넷에 연결되면 랭킹을 볼 수 있어요" → 온라인으로 바꾸고 [다시 시도]
- 원격 시험: `npm run supabase:check -- --ranking` → 모두 PASS

### W3-03 점수 제출·서버 리플레이

- `npm test` → 파일 67개, 1277개 통과. `npm run server:shared:check`·`npm run functions:check` → 0
- 실제 서버 (`.env.local`에 키): 메뉴 [새 게임] → 개발자 도구 Network에 `start-run` 200 → 게임 오버까지 → `submit-score` 200, 게임 오버 화면에 "이번 주 최고 N점". 대시보드 Table Editor → `weekly_scores`에 그 점수
- 이름을 아직 안 정한 계정이면 위 결과 줄 뒤에 닉네임 창이 뜬다
- 새로고침해도 다시 제출되지 않는다. 오프라인(Network → Offline)에서 [새 게임] → 2.5초 안에 시작하고 게임 오버에 결과 줄이 없다
- `?seed=1`이나 `?fill=`로 시작한 판은 랭킹에 올리지 않는다(결과 줄 없음)
- 원격 시험: `npm run supabase:check -- --scores --parity` → ⑫ 200/200. 지금은 1.5MB 초과 본문 항목 등 "시험 불가" 2개가 남는다(TASKS W3-03 알려진 문제)
- 함수 배포(바꿨을 때만): `supabase functions deploy start-run --project-ref <ref>`, `submit-score`도 같이. DB 함수를 바꿨으면 `supabase db push --dry-run --remote` 뒤 `supabase db push --remote`

## 5. 문제 해결

| 증상 | 해결 |
|---|---|
| `Port 5180 is in use` | 다른 터미널에서 block 서버가 이미 떠 있거나 다른 프로그램이 5180을 쓰고 있다. block 서버면 그 터미널에서 `Ctrl+C`, 아니면 Vite가 제안하는 다른 포트를 쓴다 (열린 페이지 제목이 `Ddooby-Block`인지 확인). 5181·5182는 구현 탭 몫이다 (WORKFLOW 6절) |
| `vite: command not found` 등 | `npm install`을 안 했거나 실패했다. 다시 실행 |
| 휴대폰에서 `Network` 주소가 안 열림 | 같은 Wi-Fi인지 확인. macOS 방화벽이 Node 연결을 막고 있는지 확인 |
| 화면이 갱신 안 됨 | 브라우저 강력 새로고침 `Cmd+Shift+R` |
| 이어하기가 이상하다 / 처음부터 다시 보고 싶다 | 개발자도구 → Application → Local Storage에서 `ddooby-block-run`(진행 중인 판), `ddooby-block-save`(최고 점수·설정) 키를 지운다 |
| `git push`가 403 (`Permission ... denied`) | 등록된 토큰에 쓰기 권한이 없다. `gh auth status`에서 확인. Classic 토큰은 `repo` scope, Fine-grained 토큰은 이 저장소 + Contents: Read and write로 다시 만들고 `gh auth login` → `gh auth setup-git` |
| `git push`가 `refusing to allow an OAuth App to create or update workflow` | `.github/workflows/` 파일을 올리려면 토큰에 `workflow` 권한이 필요하다. `gh auth refresh -h github.com -s workflow` → 다시 push |
| 아이폰에서만 소리가 안 난다 | ① 옆면 무음 스위치를 끈다 ② 화면을 한 번 탭했는지 (첫 터치 전엔 소리가 막힘) ③ 그 소리의 `.m4a`가 `public/audio/`에 있는지 확인. iOS Safari는 `.ogg`를 못 읽을 수 있다. 없으면 `afconvert -f m4af -d aac 이름.ogg 이름.m4a` |

## 6. Study for App

> 태스크마다 같이 공부하면 좋은 개념. **이 프로젝트의 어느 파일에서 쓰이는지**를 같이 적는다. 코드를 열어놓고 읽으면 좋다.
> ddooby-pang에서 이미 공부한 개념(Vite, strict TS, ESLint flat config, mulberry32 RNG, 불변 업데이트, 판별 유니온 등)은 ddooby-pang `docs/DEVELOPMENT.md` 6절을 링크하고, 여기에는 **block에서 새로 나오는 것**(드래그 앤 드롭, 그리드 스냅, 가중치 추첨, 공정성 보정, 리플레이 검증, 이어하기 저장 등) 위주로 적는다. 형식:
>
> ```
> ### W1-04 조각 생성 + 보정
> - **개념 이름**: 한두 문장 설명 → `src/core/generator.ts`
> - 참고: [링크](https://...)
> ```

### W1-01 프로젝트 세팅

- pang에서 이미 본 것: Vite + Vitest 한 설정 파일(`vite.config.ts`), strict TypeScript 옵션(`tsconfig.json`), mulberry32 seed RNG(`src/core/rng.ts`), Phaser 부팅과 `Scale.EXPAND`(`src/main.ts`), safe-area(`index.html`) → ddooby-pang `docs/DEVELOPMENT.md` 6절
- **금지 목록과 허용 목록**: 처음에는 `window`, `document`처럼 막을 이름을 나열했는데 `location`, `DOMParser`처럼 빠진 이름이 계속 나왔다. 그래서 core에서는 브라우저·Node 전역을 전부 끄고 ES 내장만 켠 뒤 `no-undef`로 막는다. 막을 것을 나열하면 빠뜨리기 쉽고, 허용할 것을 나열하면 새로 생긴 것도 기본으로 막힌다 → `eslint.config.js`의 `src/core/**` 블록
- **ESLint flat config의 병합**: 뒤 블록의 `globals: {}`는 앞 블록의 전역을 지우지 못한다 (합쳐진다). 끄려면 이름마다 `'off'`를 줘야 한다 → `eslint.config.js`
- **규칙을 테스트로 지키기**: 린트 설정도 코드라서 누가 고치다 구멍을 낼 수 있다. ESLint Node API(`lintText`)로 "이 코드는 막혀야 한다 / 통과해야 한다"를 Vitest로 검사한다 → `tests/lint/coreGuard.test.ts`
- **core에서 시간·랜덤을 막는 이유**: 서버가 같은 seed와 배치 로그로 판을 다시 돌려 점수를 검증한다. core가 `Math.random`이나 `Date.now`를 읽으면 다시 돌릴 때 결과가 달라진다 → `src/core/rng.ts`, `eslint.config.js`
- **수치 한곳 관리와 규칙 버전**: `as const`로 값을 고정하고, 규칙에 영향을 주는 값을 바꾸면 `RULES_VERSION`을 올린다 → `src/config.ts`
- 참고: [ESLint 설정 파일 (globals)](https://eslint.org/docs/latest/use/configure/language-options), [ESLint Node.js API](https://eslint.org/docs/latest/integrate/nodejs-api)

### W1-02 core 타입 + 보드

- pang에서 이미 본 것: 불변 업데이트(`slice()`로 복사한 뒤 고치기), `readonly` 타입 → ddooby-pang `docs/DEVELOPMENT.md` 6절
- **1차원 보드와 줄 넘침**: 보드를 `index = r * size + c` 한 줄 배열로 둔다. 그래서 (0,8)은 index 8, 곧 (1,0)과 같은 칸이 된다. `canPlace`는 index를 계산하기 전에 r·c 범위를 먼저 본다 → `src/core/board.ts`의 `inBounds`
- **타입이 못 막는 값은 경계에서 막기**: 좌표 타입은 `number`라 0.125나 `NaN`도 들어올 수 있다. `0.125 * 8 = 1`이라 소수 좌표가 엉뚱한 정수 칸이 됐다. 서버가 배치 로그를 다시 돌려 검증할 때 잘못된 로그가 통과하지 않도록 `Number.isInteger`로 거른다 → `src/core/board.ts`의 `inBounds`
- **고정 모양 조각과 기준점**: 조각은 (0,0)에서 시작하는 상대 좌표이고 `cellsAt`이 기준점만큼 옮긴다. 회전이 없어서 "놓을 곳이 있나"는 64개 기준점을 전부 해 보면 된다 → `cellsAt`, `canPlaceAnywhere`
- **가로·세로 동시 제거와 교차 칸**: `Set`으로 이미 지운 칸을 기억해 한 번만 센다. `cleared`의 순서는 화면이 파티클을 뿌리는 순서로 쓰이므로 순서도 약속이다 → `clearLines`
- **문자열 그림으로 테스트 쓰기**: 보드를 `#`과 `.`으로 그려 기대값을 사람이 눈으로 검증한다. 채운 칸의 색을 0으로 둬서 "0은 빈 칸(`null`)이 아니다"도 같이 검사한다 → `tests/helpers/board.ts`
- **얼린 입력으로 불변 검사**: `Object.freeze`로 입력을 얼려 두면 구현이 입력을 고치는 순간 에러가 난다 → `tests/core/board.test.ts`의 `frozen`
- **변형 확인**: 구현을 일부러 망가뜨려 테스트가 정말 실패하는지 본다. 통과만 하는 테스트는 아무것도 지키지 못할 수 있다
- 참고: [Number.isInteger (MDN)](https://developer.mozilla.org/ko/docs/Web/JavaScript/Reference/Global_Objects/Number/isInteger), [Object.freeze (MDN)](https://developer.mozilla.org/ko/docs/Web/JavaScript/Reference/Global_Objects/Object/freeze)

### W1-03 조각 세트

- **문자열로 모양 정의하기**: 좌표 목록 대신 `'#./##'` 같은 그림으로 적고, 모듈을 읽을 때 한 번 `Pos[]`로 바꾼다. 사람이 보고 틀린 곳을 찾기 쉽다 → `src/core/pieces.ts`의 `parseShape`
- **회전 없는 조각 세트**: 돌릴 수 없으니 방향마다 다른 조각으로 센다. 그래서 29종이고, 모든 모양이 (0,0)에서 시작해 기준점 계산이 단순하다 → `PIECES`
- **순서도 규칙이다**: 가중치 추첨은 배열을 앞에서부터 더해 가며 고른다. `PIECES` 순서가 바뀌면 같은 seed에서 다른 조각이 나온다. 그래서 순서를 테스트로 고정하고, 바꿀 때는 `RULES_VERSION`을 올린다 → `src/core/pieces.ts`, `src/config.ts`의 `PIECE_WEIGHTS`
- **`readonly`와 `Object.freeze`**: `readonly`는 컴파일할 때만 막고, 얼리면 실행 중에도 막는다. 겉만 얼기 때문에 배열·조각·칸을 각각 얼린다 → `parseShape`, `def`
- **기대값은 구현과 따로 적기**: 기대값을 구현에서 가져오면 구현이 틀려도 통과한다. 그림 비교에 더해 조각 7개는 좌표를 직접 적는다. 가로·세로를 양쪽에서 똑같이 뒤집으면 그림 비교는 통과하기 때문이다 → `tests/core/pieces.test.ts`
- **객체 대신 `Map`으로 찾기**: 일반 객체는 `constructor` 같은 기본 속성도 조회된다. 저장 데이터에 이상한 ID가 들어와도 조각으로 착각하지 않게 `Map`을 쓴다 → `getPiece`
- 참고: [Map (MDN)](https://developer.mozilla.org/ko/docs/Web/JavaScript/Reference/Global_Objects/Map)

### W1-04 조각 생성 + 보정

- **가중치 추첨**: 가중치를 앞에서부터 더해 구간을 만들고(`dot` 0~3, `i2h` 4~9, …), 0부터 합계 - 1 사이 정수 하나를 뽑아 어느 구간에 들어가는지 본다. 구간은 `[앞 누적합, 누적합)`이라 `<`와 `<=`를 헷갈리면 경계에서 옆 조각이 뽑힌다 → `src/core/generator.ts`의 `weightedPick`
- **RNG 호출 수를 고정하기**: 한 시도에서 놓을 수 있는 조각이 먼저 나와도 3개를 끝까지 뽑는다. 상황에 따라 호출 수가 달라지면 같은 seed와 같은 배치 로그로 다시 돌릴 때 다른 조각이 나온다 → `generateTray`
- **재추첨 + 보정**: 10번까지 다시 뽑고, 그래도 안 되면 슬롯 하나를 놓을 수 있는 조각으로 바꾼다. 실제로는 seed 1~1000에서 보정이 한 번도 일어나지 않았다. 드문 경로일수록 일부러 그 상황을 만드는 테스트가 필요하다 → `generateTray`, `tests/core/generator.test.ts`
- **mock 없이 순수 함수 검증하기**: 랜덤을 가짜로 바꾸지 않고, 테스트 안에 따로 적은 기준 구현으로 기대값을 계산한다. 원하는 상황(30번 모두 `dot`이 안 나옴)은 seed를 찾아서 만들고, 찾은 seed가 정말 그 상황인지 먼저 확인한다 → `tests/core/generator.test.ts`
- **계약과 상한**: "0 이상의 정수"만으로는 부족했다. RNG가 32비트라 합계가 2^32를 넘으면 뽑히지 않는 값이 생긴다. 함수가 지킬 수 있는 범위를 적고 벗어나면 바로 에러를 낸다 → `MAX_TOTAL_WEIGHT`

### W1-05 엔진

- pang에서 이미 본 것: `(state, action) → { state, events }` 리듀서 형태, 판별 유니온 → ddooby-pang `docs/DEVELOPMENT.md` 6절
- **이벤트 순서가 곧 연출 순서**: `place → clear → boardClear → tray → gameOver`. 화면은 이 배열을 앞에서부터 재생만 한다. 판정을 화면에서 다시 하지 않는다 → `src/core/engine.ts`의 `place`, `src/core/types.ts`의 `GameEvent`
- **판정 순서도 규칙이다**: 게임 오버는 줄을 지운 뒤 보드로, 새 트레이를 만든 뒤에 본다. 순서를 바꾸면 빈 트레이를 게임 오버로 보거나, 줄을 지우면 생길 자리를 못 본다 → `place`의 6·7단계
- **타입은 실행 중에 사라진다**: TypeScript는 `row: number`라고 적어도 JSON에서 온 `null`을 막지 못한다. `null + 0`은 0이라 정상 좌표처럼 통과했다. 밖에서 들어오는 값은 더하기 전에 `Number.isInteger`로 확인한다 → `check`
- **실패를 값으로 돌려주기**: 놓을 수 없을 때 예외를 던지지 않고 `{ ok: false, reason }`을 돌려준다. 화면은 이유에 따라 조각을 트레이로 돌려보내기만 하면 된다 → `PlaceResult`
- **만들 수 없는 상황 테스트하기**: "새 트레이 직후 게임 오버"는 생성기가 막아 주므로 실제로는 안 생긴다. 그래도 순서를 지키는지 보려고 테스트에서만 `vi.mock`으로 생성기를 가짜로 바꾼다. 가짜는 분기 확인용일 뿐이다 → `tests/core/engine.trayOver.test.ts`
- **봇으로 결정성 보기**: 같은 seed로 두 판을 만들어 같은 순서로 놓고 단계마다 상태와 이벤트가 같은지 비교한다. 도는 동안 "꽉 찬 줄이 남지 않는다" 같은 불변식도 같이 본다 → `tests/core/engine.test.ts`
- 참고: [Vitest 모듈 mock](https://vitest.dev/guide/mocking/modules)

### W1-06 화면 구역 + 드래그 계산

- pang에서 이미 본 것: 칸 좌표 ↔ 화면 좌표 변환(`createLayout`, `cellCenter`, `cellAt`) → ddooby-pang `docs/DEVELOPMENT.md` 6절
- **그리드 스냅은 반올림이다**: 조각의 왼쪽 위 모서리를 칸 크기로 나눠 반올림하면 가장 가까운 칸에 붙는다. 점이 어느 칸 안에 있는지 볼 때(`cellAt`)는 내림을 쓴다. 둘을 섞으면 반 칸씩 어긋난다 → `src/view/drag.ts`의 `dragAnchor`, `src/view/layout.ts`의 `cellAt`
- **`-0`이라는 숫자**: `Math.round(-0.4)`는 `-0`이다. `0`과 `===`로는 같지만 `Object.is`나 테스트의 `toEqual`에서는 다르게 취급된다. `+ 0`을 더해 `0`으로 만든다 → `dragAnchor`
- **보인 곳에 놓이게 하기**: 조각을 그리는 위치(`dragTopLeft`)와 놓일 칸(`dragAnchor`)이 같은 계산을 쓴다. 따로 계산하면 고스트가 보인 칸과 실제로 놓인 칸이 달라질 수 있다 → `src/view/drag.ts`
- **손가락보다 위에 띄우기**: 조각 중심을 손가락보다 1.5칸 위에 둔다. 다만 세로로 긴 조각은 아래쪽이 손가락에 닿는다. 숫자 하나로 모든 모양을 해결하지 못하는 예다 → `VIEW.dragLiftCells`
- **화면 구역을 높이의 함수로**: 휴대폰마다 세로 길이가 달라서 구역을 고정 좌표로 두지 않고 `screenLayout(height)`가 계산한다. 트레이는 엄지가 닿도록 아래에 붙이고, 남는 공간은 보드 위아래로 나눈다 → `src/view/layout.ts`, `src/main.ts`의 `Scale.EXPAND`
- **Phaser 없이 테스트하기**: 화면 코드에서도 계산만 하는 부분은 순수 함수로 떼어 내면 브라우저 없이 테스트할 수 있다 → `tests/view/`
- 참고: [Math.round (MDN)](https://developer.mozilla.org/ko/docs/Web/JavaScript/Reference/Global_Objects/Math/round), [Phaser Scale Manager](https://docs.phaser.io/phaser/concepts/scale-manager)

### W1-07 게임 화면

- pang에서 이미 본 것: Phaser 씬 구조(`create`, `update`), 코드로 텍스처 만들기, 트윈 → ddooby-pang `docs/DEVELOPMENT.md` 6절
- **드래그 앤 드롭의 세 단계**: 누르기(집기) → 움직이기(따라가기, 고스트 갱신) → 떼기(놓기 또는 복귀). 단계마다 "지금 드래그 중인가"를 하나의 변수로 관리한다 → `src/view/DragController.ts`의 `onDown`·`onMove`·`onUp`
- **판정과 그리기의 분리**: 화면은 놓을 수 있는지를 스스로 계산하지 않는다. core의 `previewPlacement`에 물어서 고스트를 그리고, `place`의 결과를 재생한다. 규칙이 한곳에만 있어야 서버 검증과 어긋나지 않는다 → `src/scenes/GameScene.ts`
- **마지막 anchor로 놓기**: 손을 뗄 때의 좌표로 다시 계산하지 않고, 마지막으로 고스트를 그릴 때 쓴 칸에 놓는다. 그래야 "보인 곳에 놓인다" → `DragController.onUp`
- **포인터 하나만 추적하기**: 처음 누른 손가락의 `pointer.id`를 기억하고 다른 id의 이벤트는 무시한다. 안 그러면 두 번째 손가락이 조각을 낚아챈다 → `DragController`
- **이벤트 재생과 입력 잠금**: `place`가 돌려준 이벤트를 `await`로 하나씩 재생하고, 그동안은 `playing = true`라 조각을 집을 수 없다. 재생이 끝난 뒤에 상태를 바꾼다 → `GameScene.play`, `src/view/dragRules.ts`의 `canPickUp`
- **드래그가 끝나지 않는 경우 막기**: 손가락이 화면 밖으로 나가거나, 전화가 오거나(창이 가려짐), 화면이 돌아가면 "떼기" 이벤트가 오지 않을 수 있다. 이런 경우를 모두 취소로 처리해 조각이 손가락에 붙은 채 남지 않게 한다 → `GameScene.create`의 리스너들
- **Phaser 없이 테스트하도록 떼어 내기**: `DragController`는 Phaser 객체 대신 필요한 함수 묶음(host)만 받는다. 테스트에서는 가짜 host를 넣어 브라우저 없이 규칙을 검증한다 → `tests/view/DragController.test.ts`
- **개발 중에만 도는 검사**: `import.meta.env.DEV`가 참일 때만 화면의 보드와 core의 보드를 대조한다. 배포용 빌드에서는 이 코드가 통째로 빠진다 → `GameScene.play`, `src/view/boardCheck.ts`
- **`Scale.EXPAND`와 가운데 정렬**: 논리 폭 720을 기준으로 화면 비율에 따라 높이(또는 폭)가 늘어난다. 구역을 화면 크기의 함수로 계산하고, 크기가 바뀌면 다시 그린다 → `src/view/layout.ts`의 `screenLayout`, `GameScene.onResize`
- 참고: [Phaser Input](https://docs.phaser.io/phaser/concepts/input), [Vite 환경 변수 (`import.meta.env`)](https://vite.dev/guide/env-and-mode)

### W2-01 점수·콤보

- **수치와 계산을 나누기**: 점수표와 배율은 `config.ts`에, 계산식은 `scoring.ts`에 둔다. 밸런스를 바꿀 때 숫자만 고치면 되고, 계산식은 테스트가 지킨다 → `src/core/scoring.ts`, `src/config.ts`의 `SCORE`·`COMBO`
- **콤보는 두 숫자로 만든 상태 기계**: `combo`(이어진 횟수)와 `missStreak`(연속으로 못 지운 횟수). 지우면 combo + 1, 못 지우면 missStreak + 1, 2번을 넘으면 둘 다 0. "3번 연속 실패에 끊긴다"를 숫자 두 개로 표현한 것이다 → `nextCombo`
- **부동소수점과 `Math.floor`**: `100 × 1.15`는 115가 아니라 114.99999999999999다. 컴퓨터마다 결과가 같으려면 점수를 정수로 만들어야 한다. 지금 배율(0.5 단위)에서는 문제가 안 드러나서, 테스트에서 배율을 0.15로 바꿔 확인했다 → `placementScore`, `tests/core/scoring.test.ts`
- **경계값 `>`와 `>=`**: "유예 2회"는 2번까지 괜찮고 3번째에 끊긴다는 뜻이다. 한 글자 차이로 규칙이 바뀌므로 2번·3번을 각각 테스트한다 → `nextCombo`
- **계산 순서도 규칙이다**: 콤보를 먼저 올리고 그 값으로 배율을 구한다. 순서를 바꾸면 첫 연속 제거에 배율이 안 붙는다 → `src/core/engine.ts`의 `place` 4단계
- **테스트에서 설정 바꿔 끼우기**: `vi.doMock`으로 `config` 모듈을 다른 값으로 바꾼 뒤 `scoring`을 다시 불러온다. 실제 설정으로는 안 드러나는 경우를 확인할 때 쓴다 → `tests/core/scoring.test.ts`
- 참고: [부동소수점 (MDN Number)](https://developer.mozilla.org/ko/docs/Web/JavaScript/Reference/Global_Objects/Number#number_인코딩), [vi.doMock](https://vitest.dev/api/vi.html#vi-domock)

### W2-02 리플레이

- **결과 대신 기록을 저장한다**: 보드를 통째로 저장하지 않고 "seed + 어디에 놓았는지"만 저장해도 판을 똑같이 되살릴 수 있다. 랜덤이 seed로 정해지고 엔진이 순수 함수이기 때문이다. 서버가 점수를 믿지 않고 직접 다시 계산할 수 있는 것도 같은 이유다 → `src/core/replay.ts`의 `replay`
- **성공·실패를 값으로 돌려주기**: `{ ok: true, state }` 또는 `{ ok: false, index, reason }`. `ok`를 확인해야만 `state`를 꺼낼 수 있어서 실패 처리를 빼먹기 어렵다 (구별된 유니언) → `ReplayResult`
- **타입은 실행 중에 지켜 주지 않는다**: `readonly PlaceAction[]`이라고 적어도 JSON에서 읽은 값은 `null`일 수 있다. 바깥에서 들어오는 데이터는 `Array.isArray`, `typeof`로 직접 확인한다 → `isPlainObject`, `checkIntervals`
- **같은 코드로 두 번 돌려 비교하는 테스트의 한계**: 원래 플레이와 리플레이가 같은 엔진을 쓰면, 엔진이 틀려도 둘이 똑같이 틀려서 통과한다. 기대값을 숫자로 적어 둔 테스트(고정 로그)가 따로 있어야 한다 → `tests/core/replay.test.ts`의 "고정 로그"
- **무작위 봇**: 테스트 안에서 seed로 만든 난수로 아무 데나 두는 플레이어. 사람이 만들기 힘든 기록 200개를 매번 똑같이 만들어 준다. `Math.random`을 쓰지 않아서 실패해도 다시 재현된다 → `tests/core/replay.test.ts`
- **시간 검사는 따로**: 언제 놓았는지(`t`)는 판의 결과를 바꾸지 않는다. 그래서 상태 재현(`replay`)과 사람 같은 속도인지(`checkIntervals`)를 함수 둘로 나눴다 → `checkIntervals`
- 참고: [구별된 유니언 (TypeScript 핸드북)](https://www.typescriptlang.org/docs/handbook/2/narrowing.html#discriminated-unions), [Array.isArray (MDN)](https://developer.mozilla.org/ko/docs/Web/JavaScript/Reference/Global_Objects/Array/isArray)

### W2-03 HUD + 일시정지

- **이벤트로 화면 갱신하기**: HUD는 `state.score`를 직접 읽지 않고 `score` 이벤트의 `delta`를 더한다. 줄이 지워지는 연출 다음에 점수가 오르는 순서를 지킬 수 있다. 대신 어긋날 수 있으므로 DEV에서 재생이 끝날 때 state와 대조한다 → `src/scenes/GameScene.ts`의 `playEvent`, `src/view/Hud.ts`
- **씬을 겹쳐 띄우기**: `scene.launch('Pause')`로 위에 띄우고 `scene.pause()`로 아래 씬을 멈춘다. 멈춘 씬은 update·트윈·입력이 서고, `scene.resume`으로 그대로 이어진다. `start`는 지금 씬을 끝내고 넘어가는 것이라 다르다 → `GameScene.pause`, `src/scenes/PauseScene.ts`
- **"멈춤"과 "끝남"은 다르다**: 둘 다 "활성 아님"이라 한 검사로 묶었다가, 멈춘 동안 풀린 await가 재생을 버려 입력이 영영 잠겼다. 상태가 셋(진행 / 멈춤 / 끝남)이면 검사도 셋으로 나눈다 → `src/scenes/playback.ts`
- **await는 기다리던 일이 끝나서만 풀리지 않는다**: 트윈을 누가 멈춰도, 씬이 끝나도 풀린다. await 다음 줄에서는 "지금도 계속해도 되는가"를 다시 확인한다 → `playEvents`의 `settle`, `src/view/tween.ts`
- **Phaser 없이 테스트할 수 있게 빼기**: 재생 루프가 필요로 하는 것(같은 판인가, 멈췄나, 다시 시작될 때까지 기다리기)만 인터페이스로 받는다. 테스트는 가짜 host로 일시정지·종료 순서를 마음대로 만든다 → `PlaybackHost`, `tests/scenes/playback.test.ts`
- **나중에 바꿀 곳을 한 군데로**: 최고 점수를 읽고 쓰는 코드를 한 파일에 모았다. 처음에는 메모리였고 W2-05에서 저장소에 이었다 → `src/scenes/bestScore.ts`
- 참고: [Phaser Scene 다루기](https://docs.phaser.io/phaser/concepts/scenes), [async 함수 (MDN)](https://developer.mozilla.org/ko/docs/Web/JavaScript/Reference/Statements/async_function)

### W2-04 연출·효과음

- **"무엇을 보여 줄지"와 "어떻게 그릴지" 나누기**: 팝업 문구, 흔들림 단계, 흐리게 할 조각은 순수 함수가 정하고(테스트 가능), 그리는 일만 Phaser가 한다 → `src/view/fx/popup.ts`·`shake.ts`·`trayDim.ts` ↔ `FxDirector.ts`
- **기다리는 연출과 장식**: 다음 입력을 막아야 하는 것(칸이 터짐)만 `await`하고, 팝업·파티클은 시작만 하고 넘어간다. 전부 기다리면 게임이 답답해진다. 대신 장식은 화면이 바뀔 때 직접 치워야 한다 → `GameScene.playEvent`, `FxDirector.cancelDecor`
- **브라우저의 자동 재생 제한**: 사용자가 화면을 한 번 누르기 전에는 소리가 안 날 수 있다. 소리는 "안 나도 게임은 계속"이 원칙이라 재생 코드를 전부 try/catch로 감싼다 → `src/view/Sfx.ts`
- **만든 것은 만든 쪽이 치운다 (수명 관리)**: `sound.add`로 만든 소리는 끝나도 자동으로 사라지지 않는다. 끝남·실패·중단 어느 경우든 한 함수(`release`)로 모아 정리한다. 여러 번 불려도 안전하게 만든다 → `Sfx.release`
- **이벤트 안에서 같은 일을 다시 시키면 안 된다 (재진입)**: "파괴됐다"는 알림을 받고 그 자리에서 또 파괴를 부르면, 바깥의 파괴가 아직 끝나지 않은 상태라 오류가 난다. 알림을 받았을 때는 내 목록에서 지우기만 한다 → `Sfx.play`의 `stop`·`destroy` 리스너
- **가짜 객체 테스트의 한계**: 손으로 만든 가짜 소리로는 위 오류가 안 잡혔다. 가짜가 실제와 다르게 동작했기 때문이다. 설치된 Phaser의 실제 코드를 불러 쓰는 테스트를 더했다 → `tests/view/sfxPhaser.test.ts`
- **개발 전용 코드 막기**: `import.meta.env.DEV`는 개발 서버에서만 true다. 프로덕션에서 `?fill=`이 동작하지 않게 이 값을 함수 인자로 넘겨 테스트한다 → `src/scenes/devFill.ts`의 `parseFillParam`
- **`.ogg`와 `.m4a`를 같이 두는 이유**: iPhone Safari는 `.ogg`를 못 읽을 수 있다. 둘 다 넘기면 브라우저가 읽을 수 있는 것을 고른다 → `SOUND.formats`, `public/audio/CREDITS.md`
- 참고: [자동 재생 정책 (MDN)](https://developer.mozilla.org/ko/docs/Web/Media/Guides/Autoplay), [Phaser Audio](https://docs.phaser.io/phaser/concepts/audio), [Vite 환경 변수](https://ko.vite.dev/guide/env-and-mode)

### W2-05 저장·이어하기

- **기록이 기준, 사진은 보조**: 판을 되살릴 때 저장해 둔 보드 모양(snapshot)을 믿지 않고, 놓은 순서(배치 로그)를 처음부터 다시 재생한다. 서버도 같은 방법으로 점수를 검증하므로 이어한 판도 그대로 통과한다 → `src/storage/run.ts`의 `restoreRun`
- **바깥에서 온 데이터는 전부 의심한다**: 저장 파일은 잘리거나 손으로 고쳐질 수 있다. 버전·범위·길이를 하나씩 검사하고, 이상하면 예외 대신 `null`을 돌려 "저장된 판 없음"으로 처리한다 → `parseRun`
- **한 줄 세우기 (직렬 큐)**: 저장은 시간이 걸리는 비동기 작업이라, 먼저 시작한 느린 쓰기가 나중에 끝나면 새 값을 덮는다. Promise를 꼬리에 이어 붙여 요청한 순서대로만 끝나게 한다 → `src/storage/persistence.ts`의 `enqueue`
- **요청한 순간의 값을 잡아 둔다**: 저장할 문자열을 큐에 넣을 때 바로 만든다. 나중에 만들면 그 사이 배열이 늘어나 다른 내용이 저장된다 → `saveRun`
- **읽지 못했으면 쓰지 않는다**: 읽기에 실패했는데 기본값을 저장하면 멀쩡한 기록이 0으로 덮인다. 쓰기 직전에 다시 읽고, 내가 바꾼 항목만 덮는다 → `writeProgress`
- **여러 단계를 한 번에 끝낼 수 없을 때**: 최고 점수 저장과 판 삭제 사이에 앱이 꺼질 수 있다. 순서를 "잃어도 되살릴 수 있는 쪽"으로 정하고, 다음에 켤 때 마무리한다 → `finishRun`, `doLoad`
- **시간도 주입한다**: 시계가 `performance.now`를 직접 부르지 않고 함수로 받는다. 테스트는 가짜 시간을 넣어 199ms와 200ms의 차이를 정확히 본다. 벽시계(`Date.now`)는 사용자가 바꿀 수 있어 쓰지 않는다 → `src/scenes/playClock.ts`
- **화면용 상태와 저장용 상태**: 화면은 연출이 끝나야 바뀌지만 저장은 놓은 순간 해야 한다. 둘을 한 변수로 쓰면 연출 중 앱이 꺼질 때 마지막 수를 잃는다 → `src/scenes/runSession.ts` ↔ `GameScene.state`
- **웹과 앱의 저장소를 같은 모양으로**: `get/set/remove` 세 함수만 있는 인터페이스를 두고, 웹은 localStorage, 앱은 Capacitor Preferences로 구현한다. 나머지 코드는 어느 쪽인지 모른다 → `src/storage/adapters.ts`
- 참고: [Web Storage API (MDN)](https://developer.mozilla.org/ko/docs/Web/API/Web_Storage_API), [Page Visibility API (MDN)](https://developer.mozilla.org/ko/docs/Web/API/Page_Visibility_API), [performance.now (MDN)](https://developer.mozilla.org/ko/docs/Web/API/Performance/now), [Capacitor Preferences](https://capacitorjs.com/docs/apis/preferences)

### W2-06 메뉴 이어하기·게임 오버 화면

- **프레임워크가 기억하는 값 조심**: Phaser는 `scene.start('Game')`을 데이터 없이 부르면 그 씬이 전에 받은 데이터를 다시 쓴다. 그래서 이어하기 뒤의 "새 판"이 저장된 판을 또 열었다. 새 판은 빈 데이터를 명시한다 → `src/scenes/gameStart.ts`의 `newGameData`
- **씬을 바꾸기(start)와 덮기(launch)**: 게임 오버 화면은 끝난 보드가 뒤에 보이도록 Game 씬 위에 덮는다. 덮인 씬은 계속 살아 있으므로 아래로 입력이 새지 않게 화면 전체 덮개와 상태 잠금을 같이 둔다 → `src/scenes/GameOverScene.ts`
- **없앤 물건의 예약된 일**: 버튼을 destroy해도 이미 시작한 트윈의 끝 콜백은 실행된다. 콜백에서 "버튼이 아직 살아 있나"를 확인한다 → `src/view/ui/pressLock.ts`의 `finishPress`
- **한 화면, 한 번의 전환**: 버튼마다 잠금을 따로 두면 화면을 다시 그릴 때 잠금이 새로 생겨 두 번 눌린다. 잠금은 화면이 갖고 버튼들이 같이 쓴다 → `MenuScene.lock`
- **"언제까지"로 기억하기**: 입력 지연을 "0.6초 타이머"로 두면 화면을 다시 그릴 때 사라지거나 처음부터 다시 센다. 풀리는 시각을 기억하면 남은 시간만 계산하면 된다 → `gameOverRules.ts`의 `inputDelayLeft`
- **값의 출처를 섞지 않기**: "저장돼 있던 최고 점수"와 "이번 판이 올린 최고 점수"를 한 변수에 합치면 갱신 여부를 가릴 수 없다. 출처별로 따로 둔다 → `LoadResult.storedBest` ↔ `bestScore`
- **실수로 눌리는 버튼 막기**: 마지막 조각을 놓던 손가락 자리에 버튼이 뜨면 읽기도 전에 눌린다. 화면을 늦게 띄우고, 뜬 직후에는 잠깐 입력을 받지 않는다 → `VIEW.gameOver.showDelayMs`·`inputDelayMs`
- 참고: [Phaser Scenes](https://docs.phaser.io/phaser/concepts/scenes), [Phaser Tweens](https://docs.phaser.io/phaser/concepts/tweens)

### W3-01 Supabase 스키마·권한

- **권한은 두 겹**: GRANT는 "이 역할이 표에 손댈 수 있나", RLS는 "그중 어느 행인가"를 정한다. 먼저 `revoke all`로 다 걷고 필요한 것만 준다 → `supabase/migrations/20261116100000_w3_01_schema_rls.sql`
- **서버만 쓰게 하기**: 클라이언트 역할에는 쓰기 GRANT도, 쓰기 정책도 주지 않는다. 서버(Edge Function)는 RLS를 건너뛰는 service_role로 쓴다. 그래서 점수를 앱이 직접 바꿀 수 없다
- **숫자 범위는 저장소마다 다르다**: seed는 0~4294967295인데 Postgres `int`는 2147483647까지라 절반이 안 들어간다. `bigint`로 넓히고 check로 범위를 막는다
- **시험은 "왜 실패했는지"까지 본다**: 쓰기가 실패했다고 다 막힌 것이 아니다. 네트워크가 끊겨도, 없는 행을 지워도 실패나 0행이 나온다. 권한 거부 코드(`42501`)일 때만 "막혔다"고 인정한다 → `scripts/supabase-check/report.ts`의 `denied`
- **비밀을 레포에 두지 않는 검사**: 찾아야 할 값(pang 프로젝트 ref)을 평문으로 적으면 검사 파일 자체가 걸린다. 해시만 두고 후보를 해시해서 비교한다 → `scripts/supabase-check/separation.ts`
- **공개 키와 비밀 키**: 앱에 들어가는 publishable key는 공개돼도 RLS가 지켜 준다. secret·service_role 키는 RLS를 건너뛰므로 앱·레포·채팅 어디에도 두지 않는다. 권한 시험도 publishable key만 받는다
- 참고: [Supabase API 보안](https://supabase.com/docs/guides/api/securing-your-api), [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security), [Supabase API 키](https://supabase.com/docs/guides/getting-started/api-keys), [PostgREST 오류 코드](https://docs.postgrest.org/en/stable/references/errors.html)

### W3-02 익명 로그인·닉네임

- **익명 로그인**: 가입 화면 없이 Supabase가 계정을 만들고 세션(토큰)을 브라우저에 저장한다. 다음에 열면 그 세션을 다시 쓴다 → `src/online/account.ts`
- **"지금 누구인가"는 한 곳만 믿는다**: 앱이 따로 기억한 계정과 라이브러리가 들고 있는 로그인 세션이 갈리면, 다른 사람 이름으로 조회하고 다른 사람 토큰으로 저장하게 된다. 앱은 라이브러리의 세션 변경 이벤트를 따르고, 늦게 도착한 옛 조회 결과는 버린다 → `account.ts`의 `revision`
- **await 한 번이 틈이다**: `await` 사이에는 다른 이벤트가 끼어들 수 있다. "바뀌었나" 검사는 결과를 적용하는 바로 그 자리에서, 사이에 await 없이 해야 한다. 함수로 나눠 검사하면 그 함수가 돌려준 뒤에 또 틈이 생긴다
- **서버는 클라이언트를 믿지 않는다**: 이름 규칙은 앱도 검사하지만(즉시 안내) 서버가 다시 검사한다(최종 판정). 누가 보냈는지도 요청 본문이 아니라 토큰으로 확인한다 → `supabase/functions/set-nickname/handler.ts`·`adapter.ts`
- **CORS는 인증이 아니다**: 허용 출처 검사는 브라우저가 다른 사이트의 응답을 읽지 못하게 하는 장치다. 앱 밖의 프로그램은 Origin을 마음대로 쓸 수 있으므로 토큰 검사는 항상 따로 한다
- **"아직 없을 때만" 쓰기**: `UPDATE ... WHERE id = 나 AND nickname IS NULL`로 쓰면 두 요청이 동시에 와도 한 번만 성공한다. 먼저 읽고 나중에 쓰면 둘 다 "없음"을 보고 둘 다 쓴다 → `adapter.ts`
- **한 벌의 코드를 두 곳에서**: 이름 규칙은 앱(브라우저)과 서버 함수(Deno)가 같이 쓴다. 원본은 하나만 두고 서버용 파일은 도구로 만들며, 만든 파일이 원본과 같은지 검사한다 → `scripts/server-shared/`
- **캔버스 위의 글자 입력**: Phaser에는 글자 입력칸이 없어 HTML `<input>`을 화면 위에 띄운다. 한글은 조합 중에도 Enter가 오므로(`isComposing`) 그때는 제출하지 않는다 → `src/view/NicknamePrompt.ts`
- 참고: [Supabase 익명 로그인](https://supabase.com/docs/guides/auth/auth-anonymous), [onAuthStateChange](https://supabase.com/docs/reference/javascript/auth-onauthstatechange), [Edge Functions CORS](https://supabase.com/docs/guides/functions/cors), [CORS (MDN)](https://developer.mozilla.org/ko/docs/Web/HTTP/CORS), [compositionstart (MDN)](https://developer.mozilla.org/ko/docs/Web/API/Element/compositionstart_event)

### W3-03 점수 제출·서버 리플레이

- **점수는 서버가 다시 계산한다**: 앱이 보내는 점수는 믿지 않는다. 서버가 같은 seed와 놓은 순서로 게임을 처음부터 다시 돌려 점수를 구하고, 앱 점수와 다르면 거부한다. 그래서 seed 기반 결정적 게임(W1-02)이 필요했다 → `src/replay/judge.ts`
- **한 벌의 core를 서버로**: 서버(Deno)는 앱의 `src/core`를 묶은 파일을 쓴다. 묶은 파일이 원본과 다르면 검사가 실패한다. 200판을 앱과 서버 양쪽에서 돌려 결과가 같은지도 본다 → `scripts/server-shared/`, `supabase/functions/_shared/replay.js`
- **여러 단계를 한 번에 (트랜잭션)**: "아직 안 낸 판인가 확인 → 결과 저장 → 주간 최고 점수 갱신"을 따로 하면 사이에 다른 요청이 끼어든다. DB 함수 하나 안에서 판을 잠그고 한 번에 처리한다 → `supabase/migrations/20261117120000_w3_03_submit_score.sql`의 `commit_submission`
- **같은 요청을 두 번 받아도 괜찮게 (멱등)**: 응답을 못 받은 앱이 같은 내용을 다시 보내면 처음 결과를 그대로 돌려준다. 내용이 같은지는 해시로 비교한다. 다른 내용이면 거부한다
- **시간도 증거가 된다**: 기록상 플레이 시간이 서버가 판을 내준 뒤 실제로 흐른 시간보다 길면 미리 계산한 기록이다. 반대로 이 거부는 저장하지 않아 나중에 같은 내용으로 다시 낼 수 있다
- **기다리는 동안 화면이 바뀐다**: 서버 응답을 기다리는 2.5초 사이에 버튼이 다시 눌리거나 화면이 다시 그려질 수 있다. 요청마다 번호를 붙이고, 기존 판은 새 판으로 실제 넘어갈 때만 버린다 → `src/scenes/newRun.ts`·`screenActions.ts`·`restartGate.ts`
- **시험이 거짓말하지 않게**: 원격 시험은 "실패했다"만 보지 않고 정확한 응답 코드를 본다. 네트워크가 끊겨 판정하지 못한 항목은 통과가 아니라 "시험 불가"로 센다 → `scripts/supabase-check/scoresJudge.ts`
- 참고: [PostgreSQL SELECT FOR UPDATE](https://www.postgresql.org/docs/current/sql-select.html#SQL-FOR-UPDATE-SHARE), [PostgREST 트랜잭션](https://docs.postgrest.org/en/stable/references/transactions.html), [Supabase Edge Functions](https://supabase.com/docs/guides/functions), [멱등성 (MDN)](https://developer.mozilla.org/ko/docs/Glossary/Idempotent)

### W3-04 주간 랭킹

- **순위 매기기 (window 함수)**: `rank()`는 같은 점수에 같은 순위를 주고 다음 순위를 건너뛴다(1, 2, 2, 4). `dense_rank()`는 건너뛰지 않는다(1, 2, 2, 3). 화면에 보이는 순위와 줄을 세우는 순번(`row_number()`)을 따로 둔다 → `supabase/migrations/20261118100000_w3_04_weekly_ranking.sql`
- **"이번 주"는 서버가 정한다**: 휴대폰 날짜가 틀려도 랭킹 주가 바뀌면 안 된다. 서버 시각을 한국 시간 ISO 주로 바꿔 응답에 같이 싣고, 앱은 그 값만 믿는다 → `gameOverRanking.ts`
- **필요한 것만 내보내기**: 함수는 닉네임·태그·점수·순위와 "내 줄인가"만 돌려주고 사용자 ID는 빼다. 표 권한까지 좁히는 일은 따로 남아 있다
- **먼저 구독하고 나중에 시작**: 결과를 기다리는 객체를 만들기 전에 화면이 그 결과를 듣지 않으면, 결과가 와도 화면이 모른다. 객체를 먼저 만들고 듣기를 연결한 뒤 일을 시작한다
- **늦은 응답 버리기**: [새로고침]을 여러 번 누르면 응답이 순서대로 오지 않을 수 있다. 요청마다 번호를 붙여 마지막 요청의 응답만 화면에 쓴다 → `scenes/rankingController.ts`
- 참고: [PostgreSQL window 함수](https://www.postgresql.org/docs/current/functions-window.html), [ISO 8601 주 (Wikipedia)](https://ko.wikipedia.org/wiki/ISO_8601), [Supabase RPC](https://supabase.com/docs/reference/javascript/rpc)

### W4-05 테마

- **디자인 토큰**: 색·모서리·광택 같은 값을 화면 코드에 흩어 두지 않고 테마 객체 하나에 모은다. 테마를 바꾸면 객체만 갈아 끼우면 된다 → `src/view/theme/themes.ts`
- **그림도 순수 함수로**: "이 블록을 어떻게 그릴지"를 그리기 명령 목록으로 만드는 순수 함수와, 그 명령을 실제로 그리는 Phaser 코드를 나눈다. 앞쪽은 Phaser 없이 시험할 수 있다 → `blockPaint.ts`
- **한 판은 같은 옷을 입는다**: 판 도중에 테마가 바뀌면 이미 그린 보드와 새로 그리는 트레이의 테마가 달라진다. 판을 시작할 때 테마를 고정하고, 바뀐 선호는 다음 메뉴에서 적용한다 → `runTheme`
- **글꼴 줄이기 (서브셋)**: 한글 글꼴 하나가 수 MB다. 앱에 실제로 나오는 글자만 남기면 수십~백여 KB가 된다. 대신 사용자가 입력한 글자(닉네임)는 빠질 수 있어 시스템 글꼴로 보인다 → `scripts/fonts/`
- **글꼴 라이선스 (OFL)**: 무료 글꼴도 조건이 있다. SUIT는 "SUIT"라는 이름을 예약해 두어, 글자를 뺀 수정본에는 다른 이름을 붙여야 한다 → `public/fonts/SUIT-NOTICE.txt`
- **색 대비 재기**: 글자와 배경의 밝기 비율(WCAG 대비)과 두 색이 얼마나 다르게 보이는지(CIE 색차)를 숫자로 재서 시험한다. 숫자가 기준을 넘어도 낮은 밝기의 실제 화면은 따로 봐야 한다 → `tests/view/themes.test.ts`
- 참고: [WCAG 대비 (MDN)](https://developer.mozilla.org/ko/docs/Web/Accessibility/Understanding_WCAG/Perceivable/Color_contrast), [FontFace (MDN)](https://developer.mozilla.org/ko/docs/Web/API/FontFace), [OFL FAQ](https://openfontlicense.org/ofl-faq/), [HarfBuzz hb-subset](https://harfbuzz.github.io/)
