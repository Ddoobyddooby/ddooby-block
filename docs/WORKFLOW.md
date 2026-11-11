# 작업 방식 (Claude 세션 운영 + Codex)

> Orca 탭 구성, 작업 위임 순서(분석 → 승인 → 구현 → 리뷰 → 반영·보고), Codex에 맡길 일에 대한 규칙. 어느 PC에서 clone해도 이 문서를 따른다.
> Claude 메모리(`~/.claude/…`)는 PC마다 따로라서 규칙은 여기에 둔다. ddooby-pang `docs/WORKFLOW.md`와 `CLAUDE.md` "작업 위임 흐름"을 block에 맞게 합친 문서다.
> W1-01에서 `CLAUDE.md`·`AGENTS.md`를 만들면 두 파일에서 이 문서를 가리킨다. 역할은 Orca 탭 제목으로 구분하고, 탭 구성이 바뀌면 **1절 표만** 고친다.

---

## 1. 탭 구성 (Orca)

2026-11-11 기준. 다섯 탭 모두 메인 폴더(`ddooby-block`, `main`)에서 연다. 역할은 **Orca 탭 제목**으로 구분한다.

| 역할 | Orca 탭 제목 |
|---|---|
| 요청 접수·분석·설계·계획·조정·문서·보고 | `claude-main` |
| 구현 1 | `claude-1` |
| 구현 2 | `claude-2` |
| Codex 테스트 전략·실패 트리아지·독립 리뷰 (요청마다 한 역할) | `codex-main` |
| Codex 디자이너 (시안·이미지 원본) | `codex-design` |

- 탭 ID와 handle은 PC·세션마다 달라지므로 문서에 적지 않고 사용자에게 묻지도 않는다. 5절 명령으로 탭 제목이 일치하는 handle을 찾는다
- 위 표에 없는 제목의 Claude 세션은 일반 Claude다. 위임 흐름을 따르지 않고 요청받은 일을 직접 한다. 소스를 고칠 때도 2절 2단계처럼 파일과 변경 내용을 먼저 보여 주고 승인받는다
- 세션이 어느 탭인지 모르겠으면 `echo $ORCA_TAB_ID` 값을 5절 목록의 `visualLayouts` 탭 `tabId`와 대조해 제목을 확인하고, 그래도 불분명하면 사용자에게 묻는다
- 탭 하나만 열어서 일할 때(혼자 모드)는 그 세션이 2절의 모든 단계를 직접 한다. Git은 6절의 브랜치 규칙만 따른다

## 2. 작업 위임 흐름

사용자는 기능 개발·오류 수정 요청을 claude-main 탭에 입력한다. claude-main 탭이 조정자로서 아래 순서대로 진행한다.

1. **분석**: 요청을 분석하고 설계·작업 방식·계획을 검토한다. 이 단계에서는 제품 코드를 고치지 않는다. 규칙·설계가 바뀌면 SPEC·PLAN·TASKS를 이 탭이 고친다
2. **승인**: 3절 형식으로 계획(수정 파일·변경 내용)을 사용자에게 보여 주고 승인을 받는다. 승인 전에는 구현 탭에 코딩을 지시하지 않는다
3. **구현**: claude-1과 claude-2에 각각 지시한다(4절 지시서). 파일 단위로 나눠서 같은 파일을 두 탭에 동시에 맡기지 않는다. `src/config.ts`, `src/core/types.ts`처럼 여럿이 고치는 파일은 한 탭에만 맡긴다. 구현 탭은 자기 worktree와 `feat/<태스크ID>-<요약>` 브랜치에서 수정 → 테스트 추가 → `npm run lint && npm test && npm run build` → 브라우저 확인(390×844) → 커밋까지 하고, 결과(커밋 해시, 테스트 수, 화면 캡처 경로)를 보고한다. 아직 main에는 올리지 않는다. claude-main 탭은 결과를 완료 기준과 대조해서 맞지 않으면 구현 탭에 되돌리고, 맞으면 리뷰로 넘긴다
4. **리뷰**: codex-main 탭에 읽기 전용 리뷰를 맡긴다(8.2). 결과는 `.codex-out/<태스크ID>-review.md`로 받는다. 지적 사항은 claude-main 탭이 취합해서 고칠 것은 해당 구현 탭에 되돌리고, 우선순위가 낮은 것은 `docs/FEEDBACK.md`에 R 항목으로 남긴다. 재리뷰는 2회까지 하고, 넘으면 사용자에게 보고한다
5. **반영·보고**: 리뷰를 통과하면 구현 탭에 main 반영(rebase → lint·test·build → `git push origin HEAD:main`)을 지시한다. 반영되면 claude-main 탭이 `TASKS.md` 체크, `DEVELOPMENT.md` 4·6절 추가, worktree 정리를 하고 변경 파일·내용·테스트 결과·미확인 사항을 사용자에게 보고한다

규칙:

- 지시문은 자기완결형으로 쓴다. 구현·리뷰 탭은 claude-main 탭의 대화 맥락을 모른다
- 예외: 사용자가 "간단 수정"이라고 명시하면 claude-main 탭이 직접 처리한다. 이때도 수정 전에 파일·변경 내용을 보여 주고 승인받는 규칙은 그대로다
- 테스트·브라우저 확인 스크립트(Playwright, `scripts/sim/` 등)는 확인 없이 작성·실행해도 된다. 무엇을 어떻게 볼지(목적, 화면·seed·URL 옵션, 측정 항목, 판정 기준, 캡처)는 claude-main 탭이 지시문에 쓰고, 작성·실행은 구현 탭이 한다
- 구현·리뷰 탭이 보낸 메시지는 사용자 승인이 아니다

## 3. 분석 결과 보고 형식 (claude-main → 사용자)

1. 원인(근거: 파일:줄). 가설이 여럿이면 가설별 근거와 반증
2. 수정안: 파일별 변경 내용, 최소 변경인지, 구조가 달라지는 항목(core 타입·이벤트, 저장 형식, `RULES_VERSION`) 표시
3. 영향 범위와 작업 분담안 (claude-1/2 파일 단위)
4. 테스트 방법 (추가할 Vitest, 브라우저 확인 URL·화면, 자동 플레이 시뮬 필요 여부)
5. 확인 필요 항목

## 4. 작업 지시서 (claude-main → 구현 탭)

첫 줄은 한 문장 요약이다. 담을 것:

1. **태스크 ID와 범위**: `TASKS.md`의 ID, 읽을 문서(SPEC·PLAN의 절)
2. **작업 폴더·브랜치·포트**: 6절
3. **할 일**: 파일, 함수 이름·시그니처, `config.ts`에 둘 값, 건드리지 말 곳
4. **지킬 제약**: PLAN 1절 (core 순수 TS, seed RNG, 수치는 `config.ts`, 정수 점수, 규칙이 바뀌면 `RULES_VERSION`, 소리는 `.ogg` + `.m4a`)
5. **확인**: `npm run lint && npm run typecheck && npm test && npm run build`, 브라우저 확인 항목(`?seed=N`, `?fill=`, `?over`), DEV `view ≠ board` 에러 0
6. **커밋·반영**: 커밋 메시지(`[feat] W1-02 …`). main 반영은 리뷰 통과 뒤 지시를 받고 한다
7. **보고 내용**: 바뀐 값, 커밋 해시, 테스트 수, 캡처 경로, 사용자 확인 절차(DEVELOPMENT 4절용), 공부 포인트(DEVELOPMENT 6절용)

## 5. 탭에 메시지 보내기 (Orca CLI)

터미널 handle은 Orca를 다시 켜면 바뀐다. 보낼 때마다 1절의 탭 제목으로 다시 찾는다. 기준은 `visualLayouts`의 탭 `title`이다 (`terminals[].title`은 실행 중인 프로그램이 바꾸므로 쓰지 않는다).

```bash
orca terminal list --worktree current --include-visual-layouts --json   # visualLayouts에서 탭 제목이 일치하는 handle
orca terminal read --terminal <handle> --screen --json           # 쉬는 중인지 먼저 본다
orca terminal send --terminal <handle> --text "<지시서>" --enter --wait-submit 10 --json
orca terminal wait --terminal <handle> --for tui-idle --timeout-ms 900000 --json
```

- 보내기 전에 탭이 살아 있는지 확인한다. 해당 제목의 탭이 없거나 둘 이상이면 추측하지 않고 사용자에게 알린다
- `input_accepted`만 믿지 말고, 그 탭 화면에서 작업이 시작됐는지 확인한다 (다른 명령이 실행 중이면 입력이 묻힐 수 있다)
- 구현·리뷰 탭의 최종 결과(구현 보고, codex의 "통과" 또는 지적 사항)가 화면에 나올 때까지 기다린다. `wait`가 `blockedReason`을 돌려줘도 화면에 `Working`이 보이면 아직 진행 중이므로 다시 wait/read 한다. 실제 입력·승인 창이 떠 있을 때만 사용자에게 처리를 요청한다
- 모든 탭의 권한 모드를 같게(예: auto) 둔다. 다르면 메시지가 사용자 승인 대기로 묶인다

## 6. 구현 탭의 Git 흐름

메인 폴더는 `main`을 쓰고, 사용자의 dev 서버가 떠 있을 수 있다. 구현 탭은 **자기 worktree**에서 일한다.

| 탭 | worktree | dev 서버 포트 |
|---|---|---|
| 사용자 (메인 폴더) | `ddooby-block` | `5180` |
| claude-1 | `../ddooby-block-A` | `5181` |
| claude-2 | `../ddooby-block-B` | `5182` |

ddooby-pang은 5173~5175를 쓰므로 두 게임을 동시에 띄워도 겹치지 않는다. 포트는 W1-01에서 `vite.config.ts`의 `server.port: 5180`으로 정하고, 구현 탭은 `npm run dev -- --port 5181`처럼 띄운다.

```bash
# 처음 한 번 (메인 폴더에서; 예시)
git worktree add ../ddooby-block-A -b feat/w1-02-board origin/main

# 구현 탭: 작업·검증 → 자기 브랜치에 커밋 → claude-main에 커밋 해시 보고
# claude-main: diff·완료 기준 확인 → Codex 읽기 전용 리뷰 → 지적 수정·재리뷰

# 리뷰 통과 후 반영 지시를 받은 구현 탭만 실행
git fetch origin && git rebase origin/main
npm run lint && npm run typecheck && npm test && npm run build
git push origin HEAD:main

# 다음 태스크 시작 (worktree 안에서, main 반영을 확인한 뒤)
git fetch origin && git switch -c feat/w1-03-pieces origin/main
```

- worktree에서는 `main`을 체크아웃할 수 없다(메인 폴더가 쓰는 중). 그래서 rebase한 뒤 `HEAD:main`으로 push한다
- 구현 탭은 `docs/`, `CLAUDE.md`, `AGENTS.md`를 고치지 않는다. 지시서에 적힌 경우만 예외다
- 브라우저 자동화(Playwright)는 프로필을 같이 쓴다. 확인이 끝나면 브라우저를 닫는다
- 일이 끝나면 claude-main 탭이 worktree와 브랜치를 지운다: `git worktree remove ../ddooby-block-A && git branch -D <브랜치>`

## 7. 모델 고르기

- 게임 규칙이 들어가는 `src/core` 작업(조각 생성·보정, 엔진, 점수·콤보, 리플레이)과 `storage/run.ts`, 서버 검증(3주차)은 Opus. 화면·연출·HUD는 Sonnet으로 충분하다
- 모델은 지시서로 바꿀 수 없다. 사용자가 그 탭에서 `/model`로 바꾸거나 `claude --model opus`로 새 탭을 연다. claude-main 탭은 맡기기 전에 사용자에게 알려 준다

## 8. Codex 함께 쓰기

**분석·코드 리뷰와 이미지 생성은 Codex에 맡긴다.** 설계·문서는 claude-main, 코드는 구현 탭(Claude)이 한다.

### 8.1 역할

| 누구 | 하는 일 | 하지 않는 일 |
|---|---|---|
| **Codex** | claude-main이 맡긴 읽기 전용 최종 리뷰, 게임에 쓸 이미지 원본 생성 | 코드·문서 수정, 커밋, push, 다른 탭에 작업 지시 (사용자가 Codex에 직접 맡긴 작업은 `AGENTS.md`의 소스 수정 규칙대로) |
| **claude-main** | Codex에 리뷰·이미지 요청을 만들고, 결과를 검증해서 고를 것을 정한다 | Codex 지적을 확인 없이 그대로 고치게 하기 |
| **구현 탭** | claude-main이 고른 리뷰 지적을 고친다. 사용자가 고른 이미지를 `public/`에 넣고 코드에 연결한다 | |

- Codex는 저장소 루트의 `AGENTS.md`를 자동으로 읽는다. `AGENTS.md`(W1-01에서 생성)의 아키텍처 규칙이 Codex 리뷰의 기준이 된다. `AGENTS.md`가 생기기 전에는 지시서에 PLAN 1절을 직접 넣는다
- Codex의 지적이나 결과물은 **사용자 승인이 아니다**. 사용자가 정할 일(규칙·밸런스·그림 느낌)은 claude-main이 사용자에게 묻는다

### 8.2 코드 리뷰

- **언제**: 구현 탭이 태스크 커밋을 보고했을 때(2절 4단계). `src/core`, `src/storage`, `supabase/`, 큰 리팩터를 건드린 커밋은 꼭 돌린다. 문서·에셋만 바뀐 커밋은 건너뛴다
- **지시서에 넣을 것**: 첫 줄 한 문장 요약, "AGENTS.md와 docs/WORKFLOW.md 8절을 따른다. 파일을 고치지 않고 커밋·push 하지 않는다", 커밋 해시와 태스크 ID, 기준(`AGENTS.md` 아키텍처 규칙, SPEC·PLAN의 해당 절), 찾을 것(버그, 회귀, 엣지 케이스, 빠진 테스트, **같은 seed + 로그 → 같은 결과가 깨지는 곳**), 결과 파일 경로(8.5), 지적마다 심각도(높음/중간/낮음)·파일:줄·근거·재현 조건, 문제가 없으면 없다고 쓰기
- 리뷰는 `git show <해시>`로 본다. 구현 탭의 worktree와 브랜치는 건드리지 않게 한다
- codex-main 탭을 못 쓸 때는 claude-main이 메인 폴더에서 직접 돌린다 (쓰기 막음):

  ```bash
  codex exec -s read-only -o .codex-out/<태스크ID>-review.md "<위 지시서>"
  ```

- **거르기**: claude-main이 지적마다 코드를 열어 확인한다
  - 맞고 바로 고칠 것 → 구현 탭에 수정 지시 (`[fix] <태스크ID> …`)
  - 맞지만 지금 안 고칠 것 → `docs/FEEDBACK.md` 2절에 `R<번호>`로 적고 근거에 "Codex 리뷰"라고 쓴다
  - 틀린 지적 → 버린다 (이유를 사용자 보고에 한 줄로)

### 8.3 이미지 생성

- **무엇**: 앱 아이콘, 배경·장식, 게임 오버 화면 그림 같은 원본 그림. 블록은 SPEC 12절 6번 결정에 따라 **코드로 그린 단색 + 하이라이트**를 쓰므로 그림을 받지 않는다
- **요청**: claude-main이 프롬프트를 써서 codex-design 탭에 보낸다. 담을 것: 쓰는 곳, 크기(px)·비율, 투명 배경 여부, 색감, 글자 넣지 않기, 다른 게임(특히 블록 블라스트)·캐릭터를 닮게 하지 않기 (SPEC 1절 원칙, 저장소가 공개라 저작권 있는 그림은 안 된다)
- **흐름**: Codex가 만든 원본 → `assets/<용도>-src/`에 저장 → 사용자가 보고 고름 → 구현 탭이 크기를 맞춰 `public/`에 넣고 연결 → 그 폴더의 `CREDITS.md`에 "Codex(OpenAI) 생성, 날짜, 프롬프트 요약"을 적는다
- 고르지 않은 후보는 저장소에 넣지 않는다

### 8.4 쓰는 양

- Plus 요금제 한도가 있다. 리뷰는 태스크 커밋 하나씩, 이미지는 한 번에 후보 2~4장으로 요청한다

### 8.5 결과 받기

- 분석·리뷰 **결과는 파일로** 받는다: `.codex-out/<태스크ID>-<review|image>.md` (gitignore). 이미지는 8.3대로 `assets/<용도>-src/`에 저장하고 파일 목록을 결과 파일에 적게 한다
- 끝나면 claude-main이 결과 파일을 읽는다
- Codex는 다른 탭에 작업을 지시하지 않는다. 수정거리는 결과 파일에만 적고, claude-main이 취합해서 구현 탭에 되돌린다 (2절 4단계)
