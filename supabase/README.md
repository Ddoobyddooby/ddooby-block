# supabase/

ddooby-block **전용** Supabase 프로젝트의 설정과 DB 마이그레이션 (SPEC 8절, PLAN 7절). ddooby-pang과 프로젝트·계정·데이터를 공유하지 않는다 (SPEC 1.1). 키·비밀번호·프로젝트 ref는 이 폴더 어디에도 적지 않는다 (`<ref>`는 자리표시).

- `config.toml`: `supabase init`으로 만든 CLI 설정. 로컬 Docker 스택은 쓰지 않으므로 원격 적용에는 영향이 없다 (`enable_anonymous_sign_ins = true`는 의도 기록용)
- `migrations/`: 스키마·RLS·GRANT. 파일명 타임스탬프 순서로 적용된다
- `.temp/`·`.branches/`: CLI가 만드는 링크 정보. 커밋하지 않는다 (`supabase/.gitignore`)
- Edge Function(`functions/`)과 `[functions.*]` 설정은 W3-02·03에서 추가한다

## 원격 적용 (PL이 사용자 확인을 받은 뒤에만)

키·비밀번호는 파일이나 채팅에 남기지 않고 사용자가 터미널에 직접 입력한다.

```sh
supabase login                                   # 브라우저 인증
supabase link --project-ref <ref>                # DB 비밀번호 입력
supabase db push --dry-run                       # 올라갈 마이그레이션 확인
supabase db push
```

worktree에서 실행할 때는 `--workdir <worktree 경로>`를 붙인다 (그 아래 `supabase/`를 쓴다). `link`도 같은 `--workdir`로 해야 `.temp/`에 링크가 남는다.

적용 전 대시보드에서 켜 둘 것: **Authentication → Sign In / Providers → Anonymous Sign-Ins** (권한 시험과 W3-02 익명 로그인에 필요).

## 권한 시험

```sh
npm run supabase:check                           # 기본 .env.local
npm run supabase:check -- <env 파일 경로>         # 예: 메인 저장소의 .env.local
```

`.env.local`(또는 인자로 준 파일)에 `VITE_SUPABASE_URL`·`VITE_SUPABASE_PUBLISHABLE_KEY`가 있어야 한다. publishable key만 쓴다. 익명 사용자 A·B와 비로그인 anon으로 아래를 표로 출력한다.

| # | 확인 |
|---|---|
| ① | A의 `weekly_scores` INSERT·UPDATE·DELETE 실패, SELECT 성공 |
| ② | A의 `profiles` INSERT·UPDATE·DELETE 실패, SELECT 성공 |
| ③ | A의 본인 `runs`·B가 본 A의 `runs` SELECT는 오류 없이 0행, A의 `runs` INSERT·UPDATE·DELETE 실패 |
| anon | anon의 세 표 INSERT·UPDATE·DELETE 모두 실패, `profiles`·`weekly_scores` SELECT 성공, `runs` SELECT 실패 |

- 종료 코드: 모두 PASS **0**, FAIL 있음 **1**, 설정·로그인 오류 **2** (설정이 없으면 안내 문구를 출력한다)
- "실패"는 권한 오류가 나거나, 오류 없이 반영 행이 0개인 경우를 모두 통과로 본다 (RLS가 행을 걸러 오류 없이 0행이 될 수 있다)
- `runs`는 클라이언트가 만들 수 없어 지금은 "오류 없이 0행"만 본다. 실제 교차 시험(B가 A의 run을 못 읽음)은 `start-run`이 생기는 W3-03에서 추가한다
- **시험이 원격에 남기는 것**: 실행마다 **익명 계정 2개**(A·B)가 새로 생긴다. 시험은 쓰기가 막혀 있는지만 보므로 `profiles`·`runs`·`weekly_scores`에는 행이 남지 않는다 (남으면 그 자체가 FAIL). 익명 계정은 대시보드 Authentication → Users에서 지울 수 있다
- 판정·표·종료 코드 로직은 `scripts/supabase-check/report.ts`에 있고 `npm test`가 시험한다. 원격에 접속하는 `rls-check.ts`는 `npm test`에 넣지 않는다

## SPEC 8절 ↔ 마이그레이션 대조 (`20261116100000_w3_01_schema_rls.sql`)

| SPEC 8절 | 마이그레이션 | 비고 |
|---|---|---|
| `profiles (id → auth.users, nickname, tag, created_at)` | 같음 + `updated_at`, `unique (nickname, tag)`, 닉네임 2~10자·tag 0~9999 check | `updated_at`은 트리거로 갱신 |
| `runs (id, user_id, seed int, created_at, submitted bool)` | `seed bigint` + `check (seed between 0 and 4294967295)`, `rules_version int`, `week_key text`, `submitted_at timestamptz`, `submission_hash`, `result jsonb` | 아래 "SPEC과 다른 점" |
| `weekly_scores (user_id, week_key, best_score, run_id, updated_at, PK (user_id, week_key))` | 같음 + `best_score >= 0` check, `(week_key, best_score desc)` 인덱스 | |
| RLS: `weekly_scores` 전체 읽기, 클라이언트 쓰기 금지 | 같음 (insert·update·delete 정책 없음 + GRANT도 select만) | `profiles` 전체 읽기, `runs` 본인만 읽기 |

SPEC과 다른 점 (사용자 승인 후 SPEC 8절을 맞춘다):

- `seed int` → `bigint` + 범위 check: core의 seed는 uint32(0~4294967295)인데 Postgres `int`는 부호 있는 32비트(최대 2147483647)라 절반을 담지 못한다
- `submitted bool` → `submitted_at timestamptz` (null이면 미제출): 제출 시각까지 남고 `submitted_at is not null`로 같은 판정을 한다
- `rules_version int` 추가 (PLAN 7절): `submit-score`가 현재 `RULES_VERSION`과 비교한다
- `week_key`를 `runs`에 둔다: `start-run`이 시작 시각으로 정한 주를 기록해 며칠에 걸친 판도 시작한 주로 등록한다 (SPEC 8.1)

## 뒤 태스크로 미룬 것

- **주간 최고 점수 upsert 함수**(W3-03): `submit-score`와 함께 만든다. 이 함수의 권한은 service_role 전용이어야 하고 권한 시험도 같이 늘린다
- **주간 랭킹 조회 함수**(W3-04): 랭킹 화면과 함께 만든다. 닉네임 없는 사용자 제외·내 순위·공동 순위 규칙은 화면 설계가 정한다
- Edge Function `start-run`·`submit-score`·`set-nickname`, `config.toml`의 `[functions.*]` (W3-02·03)
- `week_key` 형식 check: 주 계산(월요일 00:00 KST)이 구현되는 W3-03에서 형식을 정하며 맞춘다
