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

**URL 옵션 (개발용, 예정)**

| 주소 | 동작 | 생기는 태스크 |
|---|---|---|
| `?seed=1001` | 항상 같은 조각 순서. 버그를 봤으면 seed를 적어두고 이 주소로 재현 | W1-07 |
| `?fill=<패턴>` | (개발 모드) 보드를 미리 채운 상태로 시작. 줄 제거·콤보·전체 비우기 연출 확인용 | W2-04 |
| `?over` | (개발 모드) 게임 없이 게임 오버 화면만 띄운다 | W2-06 |

개발 모드(`npm run dev`)에서는 매 배치 후 화면과 게임 상태가 같은지 검사한다 (W1-07). Console에 `view ≠ board`가 찍히면 버그이니 seed와 함께 기록해두자.

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

## 5. 문제 해결

| 증상 | 해결 |
|---|---|
| `Port 5180 is in use` | 다른 터미널에서 block 서버가 이미 떠 있다. 그 터미널에서 `Ctrl+C`, 또는 Vite가 제안하는 다른 포트를 쓴다. 5181·5182는 구현 탭 몫이다 (WORKFLOW 6절) |
| `vite: command not found` 등 | `npm install`을 안 했거나 실패했다. 다시 실행 |
| 휴대폰에서 `Network` 주소가 안 열림 | 같은 Wi-Fi인지 확인. macOS 방화벽이 Node 연결을 막고 있는지 확인 |
| 화면이 갱신 안 됨 | 브라우저 강력 새로고침 `Cmd+Shift+R` |
| 이어하기가 이상하다 / 처음부터 다시 보고 싶다 | 개발자도구 → Application → Local Storage에서 `ddooby-block-run`(진행 중인 판), `ddooby-block-save`(최고 점수·설정) 키를 지운다 (W2-05 이후) |
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
