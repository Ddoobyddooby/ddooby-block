# 개발 가이드

> VSCode에서 프로젝트를 열고, 서버를 띄우고, 작업 결과를 확인하는 방법.
> 태스크가 끝날 때마다 **4절 작업별 확인 방법**과 **6절 Study for App**에 항목을 추가한다. 새 명령이 생기면 2절, 새 URL 옵션이 생기면 3절도 갱신한다.
> 지금은 기획 단계라 2·3절은 [PLAN](./PLAN.md)에서 정한 **예정** 명령·옵션이다. 해당 태스크가 끝나면 "(예정)" 표시를 지운다.

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
| `npm run dev` | 개발 서버 (http://localhost:5173). 코드를 저장하면 브라우저가 자동 갱신된다. 끄려면 `Ctrl+C` | W1-01 (예정) |
| `npm test` | 테스트 한 번 실행 (`tests/**/*.test.ts`) | W1-01 (예정) |
| `npm run test:watch` | 파일을 저장할 때마다 테스트 자동 재실행. 끄려면 `q` | W1-01 (예정) |
| `npm run typecheck` | 타입 에러만 확인 | W1-01 (예정) |
| `npm run lint` | ESLint 규칙 검사 (`src/core`의 Phaser·DOM·`Math.random` 사용 금지 포함) | W1-01 (예정) |
| `npm run format` | Prettier로 코드 정리 (md 문서는 제외) | W1-01 (예정) |
| `npm run build` | 타입체크 + 배포용 빌드 (`dist/`) | W1-01 (예정) |
| `npm run sim` | 자동 플레이 봇으로 seed 1~1000을 돌려 평균 점수·배치 수·보정 발생률을 찍는다. 가중치·점수를 고친 뒤 밸런스를 잴 때 | W4-02 (예정) |
| `npm run android:sync` | 웹 빌드 후 `android/` 앱에 복사 (`cap sync`). Android Studio에서 ▶ 하기 전에 실행 | W4-03 (예정) |

커밋 전에는 항상 `npm run lint && npm test && npm run build`가 통과해야 한다.

## 3. 게임 화면 확인하기

1. `npm run dev` 실행 → 터미널에 주소가 뜬다
   ```
   ➜  Local:   http://localhost:5173/
   ➜  Network: http://192.168.x.x:5173/
   ```
2. **PC 브라우저**: `Local` 주소를 연다 (`Cmd` + 클릭)
3. **휴대폰 크기로 보기**: Chrome 개발자도구(`Cmd+Option+I`) → 기기 툴바(`Cmd+Shift+M`) → 390×844(iPhone 12~14 크기) 선택. 태스크 확인과 캡처는 이 크기로 한다
4. **실제 휴대폰으로 보기**: PC와 같은 Wi-Fi에 연결한 뒤 휴대폰 브라우저로 `Network` 주소를 연다. 드래그(터치) 감각은 꼭 실제 휴대폰으로도 본다
   - 밖에서는 Tailscale로: `http://<PC 이름>.<tailnet>.ts.net:5173/` (`vite.config.ts`의 `allowedHosts`, ddooby-pang과 같음)
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

(아직 끝난 태스크 없음)

## 5. 문제 해결

| 증상 | 해결 |
|---|---|
| `Port 5173 is in use` | 다른 터미널에서 서버가 이미 떠 있다. 그 터미널에서 `Ctrl+C`, 또는 Vite가 제안하는 다른 포트를 쓴다. ddooby-pang 서버가 떠 있을 수도 있다 |
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

(아직 끝난 태스크 없음)
