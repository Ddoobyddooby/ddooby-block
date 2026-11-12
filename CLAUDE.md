# ddooby-block — Claude 개발 지침

> 프로젝트: Ddooby-block (v0.1 MVP, 기획/초기 구현 단계). 8×8 보드에 조각 3개를 배치하여 줄을 지우는 캐주얼 블록 퍼즐. 2026-11-11 기획 결정 기준.
> 이 문서는 Claude 개발팀의 코드·검증 규칙을 정의한다. 협업 탭과 위임의 상세 절차는 [`docs/WORKFLOW.md`](docs/WORKFLOW.md)를 따른다.

## 1. 문서와 우선순위

- `docs/SPEC.md`: 제품 목표·범위·게임 규칙·수용 기준(**최우선**)
- `docs/PLAN.md`: 아키텍처·알고리즘·데이터 흐름·검증 방법
- `docs/TASKS.md`: 태스크 ID, 의존 관계, 완료 기준
- `docs/WORKFLOW.md`: 팀 역할, 위임·리뷰·worktree·반영 절차
- `docs/DEVELOPMENT.md`: 사용자가 직접 실행·확인하는 방법과 **Study for App**
- `AGENTS.md`: Codex 역할과 공통 아키텍처 규칙

문서가 충돌하면 **SPEC > PLAN > TASKS** 순서로 판단한다. 충돌을 임의로 해소해 구현하지 말고 사용자에게 알린다. 실제 저장소 문서가 이 지침보다 최신인 경우 변경 이력과 사용자 승인을 확인한다.

## 2. 제품 목표와 범위

- v0.1은 장르 공통 메커니즘을 참고해 **기본 게임의 완성도와 재미를 검증**한다. Block Blast의 그래픽·UI·사운드·브랜드를 복제하지 않는다.
- 8×8 보드, 29종 조각, 트레이 3개, 회전 불가, 드래그·스냅·고스트, 가로/세로 동시 제거, 점수·콤보·게임 오버, 로컬 최고 점수·이어하기, 전용 Supabase 주간 랭킹, 웹·Android가 v0.1 범위다.
- **v0.1 생성기**: Seed 기반 가중치 추첨 + 최소 1개 배치 가능한 조각 보정(PLAN 4.4). 전략형 3수 탐색 보정은 **후속 버전 후보**이며 v0.1에서 구현하지 않는다. 세 조각 모두 배치 가능한 경로의 보장은 후속 보정에서도 요구하지 않는다.
- `ddooby-pang`과 레포·Supabase 프로젝트·계정·데이터는 완전히 분리한다. 재사용은 검증된 코드·설계 패턴의 복사로 처리한다.
- SPEC 1.1의 착수 조건과 TASKS의 의존 관계를 확인하고 진행한다. 착수 조건 충족 여부가 불명확하면 `확인 필요`로 보고한다.

## 3. 역할과 작업 위임

- **사용자**: 제품 범위·우선순위·위험 수용 결정과 최종 승인.
- **Claude-main(PM·개발 PL)**: SPEC·PLAN·TASKS 관리, 설계·일정·구현 우선순위 조정, 구현 작업 배분, 통합 검증·배포 조정, 제품 결정과 주요 위험 보고.
- **claude-1 / claude-2**: 할당된 파일의 구현·테스트·화면 검증, 자기 worktree와 작업 브랜치에서 커밋.
- **Codex-main(QA PL)**: 독립적인 코드·아키텍처 검증과 테스트 전략·수용 기준 검토, 데이터 무결성·보안·성능·경계 조건·핵심 경로 회귀 및 테스트 누락을 평가하고 품질 위험을 판단한다. 필요하면 재검증 및 반영 보류를 선언한다. 상시 QA 조정과 별개로 개별 요청에서는 테스트 전략 / 실패 트리아지 / 독립 리뷰 / 디자인 중 한 역할을 수행한다.

Codex-main은 담당 구현 탭에 결함 재현·추가 테스트·수정·재검증을 직접 요청할 수 있으며 모든 직접 요청과 결과를 Claude-main에 공유한다. Claude-main은 신규 기능, 담당 파일, 구현 우선순위와 통합 일정을 조정한다. 기술적 판단이 다르면 근거와 대안을 기록하고 제품 범위·우선순위·위험 수용의 최종 결정은 사용자가 한다.

역할은 Orca 탭 제목(`claude-main`, `claude-1`, `claude-2`, `codex-main`, `codex-design`)으로 구분한다. 탭 찾는 법, Orca CLI, worktree·포트와 **분석 → 사용자 승인 → 구현 → 리뷰 → 반영·보고** 흐름은 `docs/WORKFLOW.md` 1~2, 5~8절을 따른다. 탭 ID·handle은 PC·세션마다 달라지므로 문서에 적지 않는다. 다른 탭으로 메시지를 실제로 보내지 못했다면 위임한 것으로 보고하지 않는다.

구현 전 Claude 메인은 수정 파일, 변경 이유, 영향 범위, 검증 방법과 `RULES_VERSION` 영향 여부를 사용자에게 제시한다. 사용자 승인 없이 제품 결정이나 주요 설계를 확정하지 않는다. 사용자가 직접 명시한 작업 범위와 Git 작업 권한을 우선한다.

## 4. 작업 규칙

1. `docs/TASKS.md`에서 선행 조건이 충족된 첫 번째 미완료 태스크를 확인하고 한 번에 하나만 진행한다.
2. 관련 SPEC·PLAN 절과 기존 코드를 먼저 읽는다. 필요 없는 파일을 조사하거나 수정하지 않는다.
3. 게임 규칙·저장 형식·API 계약을 바꿔야 하면 먼저 SPEC·PLAN의 변경 필요성을 사용자에게 보고하고 승인에 따라 반영한다.
4. 구현 탭은 파일별로 소유권을 나누고 `src/config.ts`, `src/core/types.ts` 같은 공용 파일을 동시에 수정하지 않는다.
5. 테스트와 수동 검증이 실제 통과하기 전에는 `TASKS.md`를 체크하지 않는다.
6. 완료 시 `docs/DEVELOPMENT.md` **4절 작업별 확인 방법**과 **6절 Study for App**에 해당 태스크의 검증 절차와 학습 개념(관련 파일)을 추가한다. 2·3절의 예정 명령·URL이 구현되면 상태를 갱신한다. 문서 갱신은 Claude 메인 담당이며 구현 탭은 필요한 내용을 보고한다.
7. 규칙 변경에 따른 `RULES_VERSION` 증가는 PLAN에 따라 처리하고 기존 리플레이·이어하기 호환성에 미치는 영향을 검증한다.
8. 코드 수정·커밋·push·원격 변경은 사용자의 직접 지시나 해당 작업의 명시적 승인 범위에서만 수행한다. 리뷰/검토 요청은 읽기 전용이다.

## 5. 아키텍처 불변 규칙

- `src/core/`는 **순수 TypeScript**. Phaser, DOM, `Math.random()`, `@capacitor/*`, `view`·`scenes`·`storage`·`online`에 의존하지 않는다. ESLint 규칙으로 강제한다: core에서는 브라우저·Node 전역을 전부 끄고 ES 내장만 허용하며, `Date`·`globalThis`·동적 import도 막는다. 이 차단은 `tests/lint/coreGuard.test.ts`가 지킨다.
- 의존 흐름은 `scenes/view → core`, `storage/online → core`이며 core가 이들 상위 계층을 import하지 않는다. core에서 `config.ts`로의 의존은 허용한다.
- `core/rng.ts`의 Seed 기반 mulberry32만으로 게임 랜덤을 생성한다. **동일 seed + 동일 배치 로그 + 동일 규칙 버전 = 동일 상태와 점수**가 보장되어야 한다.
- `core`는 `(state, action) → { state, events }`를 담당하고 Phaser 화면은 결과 이벤트에 따라 입력·연출만 처리한다. 게임 판정 로직을 view에 중복하지 않는다.
- 보드는 불변으로 다룬다. 점수는 정수이며 배율 계산에는 `Math.floor`를 적용한다.
- 조각·가중치·재추첨·점수·콤보·연출 수치는 `src/config.ts`의 상수로 관리한다. 게임 규칙·가중치·결정적 추첨 순서가 바뀌면 `RULES_VERSION` 갱신을 검토한다.
- 클라이언트와 서버는 동일 core 리플레이를 사용한다. 서버는 클라이언트 점수를 신뢰하지 않는다.
- 저장 중인 판은 배치 로그를 기준으로 복원하고 snapshot은 보조 데이터다. 잘못된 저장 데이터는 예외 없이 안전하게 처리한다.
- 웹과 Android 저장 어댑터를 구분하고 `ddooby-pang`의 인증/DB 정보를 공유하거나 저장소에 커밋하지 않는다.
- 세로 화면 기준 720×1280, 모바일 확인 390×844, 터치 드래그와 입력 잠금(일시정지·애니메이션·게임 오버)을 지킨다.
- 사운드 에셋은 `.ogg`와 `.m4a`를 함께 제공한다.

## 6. 주요 개발 명령

> 아래 명령은 W1-01부터 쓸 수 있다. `npm run sim`(W4-02)과 `npm run android:sync`(W4-03)는 아직 없다.

```bash
npm install
npm run dev             # 기본 포트 5180
npm run lint
npm run typecheck
npm test
npm run build
```

커밋 전 최소 검증: `npm run lint && npm run typecheck && npm test && npm run build`. TASKS의 UI 태스크는 브라우저 390×844에서 수동 확인하고 콘솔 오류·DEV 상태 불일치가 없어야 한다. URL 옵션 `?seed=N`, `?fill=`, `?over`는 관련 태스크가 완료된 후에만 사용한다. 시뮬레이션 `npm run sim` 역시 W4-02 이후에 사용한다.

명령별 상세 (생기는 태스크는 `docs/DEVELOPMENT.md` 2절):

- `npm run dev`: 개발 서버 (http://localhost:5180). 사용자가 띄워 두었을 수 있으므로 5180 포트가 사용 중이면 끄지 않는다. 그 서버가 block 서버(페이지 제목 `Ddooby-Block`)일 때만 그대로 쓰고, 다른 프로그램이면 `npm run dev`로 Vite가 띄운 다른 포트(터미널에 찍힌 주소)를 쓴다
- `npm run typecheck`: `tsc --noEmit` / `npm run build`: 타입체크 + 프로덕션 빌드 (`dist/`)
- `npm test`: Vitest 한 번 실행 (`tests/**/*.test.ts`) / `npm run test:watch`: 감시 모드
- `npm run lint`: ESLint (`src/core/**`의 phaser·view·scenes·storage·online import, `Math.random`, DOM 사용을 에러로 막는다)
- `npm run format`: Prettier (`*.md`는 제외)
- `npm run sim` (W4-02): 자동 플레이 봇으로 seed 1~1000, 평균 점수·배치 수·보정 발생률 (`scripts/sim/`, `npm test`에는 안 들어감)
- `npm run android:sync` (W4-03): 웹 빌드 + `cap sync android`
- 개발 URL 옵션: `?seed=N`(조각 순서 재현), DEV 전용 `?fill=<패턴>`(보드 미리 채우기), DEV 전용 `?over`(게임 오버 화면 미리보기). 옵션이 없으면 메뉴부터. DEV에서는 매 배치 후 view ↔ board 대조

버전 고정 이유 (ddooby-pang과 같음): Phaser는 SPEC대로 3.x(최신은 4.x). TypeScript는 typescript-eslint가 `<6.1`만 지원해서 `~6.0`.

## 7. Git·리뷰·완료 보고

- 메인 폴더는 `main`; 기능 작업은 `feat/<태스크ID>-<요약>` 브랜치와 구현 탭별 worktree를 쓴다. 실제 브랜치 이름은 `docs/WORKFLOW.md` 6절과 TASKS의 태스크 ID를 따른다.
- 메인 폴더 개발 서버 포트 5180, claude-1 5181, claude-2 5182 (`ddooby-pang`의 5173~5175와 구분).
- 커밋 메시지는 `[feat] W1-02 ...`, `[fix] W1-02 ...` 등 `[type] <태스크ID> 설명` 형식. `main`에 직접 커밋하지 않는다.
- 구현 탭은 자기 브랜치에서 검증·커밋해 해시를 보고한다. Claude 메인은 diff·완료 기준을 확인하고, 필요한 경우 Codex 독립 리뷰를 요청한다. 재리뷰는 최대 2회.
- 필요한 리뷰와 품질 보류 해소 후 사용자의 명시적 반영 승인을 받아 rebase → 재검증 → `git push origin HEAD:main`을 수행한다. 품질 보류 중에는 해결·재검증 전까지 main 반영을 하지 않으며, 예외적인 반영에는 사용자의 명시적 승인이 필요하다. 품질 게이트는 운영 규칙이며 GitHub 브랜치 보호 설정을 자동으로 변경하지 않는다.
- 결과 보고: 태스크 ID, 변경 파일, 설계·설정 변경, 테스트 명령과 통과 수, 브라우저 캡처/검증 결과, 커밋 해시(있는 경우), 미확인 사항, 사용자가 직접 확인할 방법, Study for App 학습 포인트.

## 8. Codex 활용

Codex-main은 상주 구현자가 아닌 독립 QA PL이다. 개별 검증의 범위는 작업 복잡도·위험도·독립 검증 필요성으로 정하며 사용량 절약만을 이유로 필요한 검증을 생략하지 않는다. 검증 결과는 `.codex-out/<태스크ID>-*.md`에 기록하고 중대한 품질 문제는 Claude-main에 즉시 공유한다. 제품·테스트 코드 수정, 기능 구현, 커밋·push·main 병합·배포 및 원격 DB·인프라 변경은 사용자의 별도 명시적 지시가 있을 때만 한다. 요청서·품질 게이트·결과 형식과 권한 경계는 `AGENTS.md`와 `docs/WORKFLOW.md` 8절을 따른다.
