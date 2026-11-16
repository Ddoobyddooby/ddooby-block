-- W3-01 주간 랭킹·플레이 기록 스키마와 권한 (SPEC 8절, PLAN 7절)
--
-- 권한은 두 겹으로 막는다: 테이블 GRANT(역할이 테이블에 닿는지) + RLS(어느 행인지).
-- 클라이언트 역할: anon(비로그인), authenticated(로그인. 익명 로그인 사용자도 이 역할이다).
-- 서버 쓰기는 Edge Function의 service_role 연결로만 한다 (RLS 우회, W3-02·03).
--
-- 이 파일에 없는 것(뒤 태스크): 주간 최고 점수 upsert 함수(W3-03), 주간 랭킹 조회 함수(W3-04)

-- ---------------------------------------------------------------------------
-- updated_at 자동 갱신
-- ---------------------------------------------------------------------------

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- 트리거 전용 함수: Data API(rpc)로 부를 일이 없다
revoke all on function public.set_updated_at() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- profiles: 닉네임 표시용. 쓰기는 Edge Function set-nickname만 (W3-02, 금칙어 검사)
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nickname text check (char_length(nickname) between 2 and 10),
  tag int check (tag between 0 and 9999),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (nickname, tag)
);

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- runs: 서버가 발급한 한 판 (start-run 생성, submit-score 사용 처리)
--
-- seed: core의 seed는 uint32(0~4294967295)다. Postgres int는 부호 있는 32비트(최대 2147483647)라
--   절반을 담지 못하므로 bigint로 두고 범위를 check로 막는다.
-- rules_version: 이 판을 발급한 때의 RULES_VERSION(src/config.ts). submit-score가 현재 값과 비교한다.
-- week_key: start-run이 created_at 기준 월요일 00:00 KST 주로 정한다. 며칠에 걸친 판도 시작한 주로 등록한다.
-- submitted_at: 제출 완료 시각. null이면 아직 제출하지 않은 run이라 재사용 거부에 쓴다.
-- ---------------------------------------------------------------------------

create table public.runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  seed bigint not null check (seed between 0 and 4294967295),
  rules_version int not null check (rules_version >= 1),
  week_key text not null,
  created_at timestamptz not null default now(),
  submitted_at timestamptz,
  submission_hash text,
  result jsonb
);

create index runs_user_id_idx on public.runs (user_id);

-- ---------------------------------------------------------------------------
-- weekly_scores: 사용자별 주간 최고 점수. 쓰기는 submit-score만 (W3-03)
-- ---------------------------------------------------------------------------

create table public.weekly_scores (
  user_id uuid not null references auth.users (id) on delete cascade,
  week_key text not null,
  best_score int not null check (best_score >= 0),
  run_id uuid not null references public.runs (id),
  updated_at timestamptz not null default now(),
  primary key (user_id, week_key)
);

-- 주간 순위 조회용: 한 주의 점수를 높은 순으로
create index weekly_scores_week_rank_idx on public.weekly_scores (week_key, best_score desc);

create trigger weekly_scores_set_updated_at
before update on public.weekly_scores
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.runs enable row level security;
alter table public.weekly_scores enable row level security;

create policy "profiles: 전체 읽기"
on public.profiles for select
to anon, authenticated
using (true);

create policy "runs: 본인 읽기"
on public.runs for select
to authenticated
using (user_id = (select auth.uid()));

create policy "weekly_scores: 전체 읽기"
on public.weekly_scores for select
to anon, authenticated
using (true);

-- insert·update·delete 정책은 만들지 않는다: 클라이언트 쓰기는 RLS가 막고, 아래 GRANT도 주지 않는다

-- ---------------------------------------------------------------------------
-- 테이블 권한: 프로젝트 기본 권한(자동 노출)에 기대지 않고 모두 걷은 뒤 필요한 것만 준다
-- ---------------------------------------------------------------------------

revoke all on table public.profiles, public.runs, public.weekly_scores
from anon, authenticated;

grant select on table public.profiles to anon, authenticated;
grant select on table public.runs to authenticated;
grant select on table public.weekly_scores to anon, authenticated;

-- Edge Function(service_role)용. 새 프로젝트는 자동 노출이 꺼져 있을 수 있어 명시한다
grant select, insert, update, delete on table
  public.profiles, public.runs, public.weekly_scores
to service_role;
