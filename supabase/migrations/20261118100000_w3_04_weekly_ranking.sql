-- W3-04 주간 랭킹 조회 (SPEC 6·8절, PLAN 6.3·7절)
--
-- 랭킹 화면·게임 오버 화면이 한 번 부르면 TOP 50·내 위아래 5명·내 상태를 한꺼번에 받는다.
-- ddooby-pang의 v2_w3_04 마이그레이션에서 주간 점수 부분만 복사해 다음을 바꿨다:
-- - **인자가 없다. 서버 시각(Asia/Seoul)의 이번 주만 돌려준다.** 과거 주를 고르는 인자(pang의 p_week)는 공개하지 않는다
--   (시험 편의 인자를 그대로 두면 누구나 과거 주를 조회할 수 있다)
-- - 닉네임·tag가 한쪽만 있는 손상 행은 목록·순위에서 뺀다 (둘 다 있는 행만 공개)
--
-- - 주: 서버 now()의 KST ISO 주. src/replay/weekKey.ts와 같은 규칙·형식('2026-W46')이라 기기 시계와 무관하게
--   월요일 00:00 KST에 바뀐다 (연말·연초에는 ISO 연도 IYYY를 쓴다)
-- - 대상: 그 주 기록 중 닉네임과 tag가 모두 있는 사람만. 닉네임 없는 점수는 목록·순위 계산에서 빠진다
-- - 나열 순번 seq: 점수 내림차순 → 그 주 최고 점수에 먼저 도달한 시각(weekly_scores.updated_at, 최고 점수가 바뀔 때만 갱신된다)
--   오름차순 → user_id. 표시 순위 rank: 점수만 보는 rank()라 공동 순위(100·90·90·80 → 1·2·2·4)
-- - section: 'week' 서버의 이번 주 메타 행 1개(항상 맨 앞. week_key만 있고 나머지는 null, is_me false. 빈 주·anon에도 있다) /
--   'top' seq 1~50 / 'around' 내 seq ±5(나 포함, top과 겹쳐도 준다) /
--   'me' 내 상태 1행 (닉네임·기록 있음 → rank·seq / 기록은 있으나 공개 행이 아님 → rank·seq null + 점수 / 기록 없음·anon → 행 없음)
-- - user_id는 돌려주지 않는다 (is_me로만 구분). 비로그인(anon)은 auth.uid()가 null이라 around·me가 없다
--
-- 표 권한·RLS는 그대로다: security invoker라 호출자 권한으로 읽고, profiles·weekly_scores는 이미 전체 SELECT다 (W3-01).
-- 그래서 이 함수가 user_id를 숨겨도 표를 직접 조회하면 id가 보인다. 이 태스크는 권한을 바꾸지 않는다 (보고서의 한계).

create function public.weekly_ranking()
returns table (
  week_key text,
  section text,
  seq int,
  rank int,
  nickname text,
  tag int,
  best_score int,
  is_me boolean
)
language sql
stable
security invoker
set search_path = ''
as $$
  with params as (
    select
      to_char(now() at time zone 'Asia/Seoul', 'IYYY-"W"IW') as wk,
      auth.uid() as me
  ),
  ranked as (
    select
      w.user_id,
      p.nickname,
      p.tag,
      w.best_score,
      (row_number() over (order by w.best_score desc, w.updated_at asc, w.user_id))::int as seq,
      (rank() over (order by w.best_score desc))::int as rnk
    from public.weekly_scores as w
    join public.profiles as p on p.id = w.user_id
    cross join params
    where w.week_key = params.wk and p.nickname is not null and p.tag is not null
  ),
  my_seq as (
    select r.seq from ranked as r cross join params where r.user_id = params.me
  ),
  sections as (
    select
      'week' as section, 0 as ord, null::uuid as user_id, null::text as nickname, null::int as tag,
      null::int as best_score, null::int as seq, null::int as rnk
    union all
    select 'top', 1, r.user_id, r.nickname, r.tag, r.best_score, r.seq, r.rnk
    from ranked as r where r.seq <= 50
    union all
    select 'around', 2, r.user_id, r.nickname, r.tag, r.best_score, r.seq, r.rnk
    from ranked as r cross join my_seq as m
    where r.seq between m.seq - 5 and m.seq + 5
    union all
    select 'me', 3, r.user_id, r.nickname, r.tag, r.best_score, r.seq, r.rnk
    from ranked as r cross join params
    where r.user_id = params.me
    union all
    -- 기록은 있으나 공개 행이 아니다(닉네임 없음): 순위 없이 점수만
    select 'me', 3, w.user_id, null, null, w.best_score, null, null
    from public.weekly_scores as w cross join params
    where w.week_key = params.wk
      and w.user_id = params.me
      and not exists (select 1 from ranked as r where r.user_id = params.me)
  )
  select
    params.wk,
    s.section,
    s.seq,
    s.rnk,
    s.nickname,
    s.tag,
    s.best_score,
    -- week 행(user_id null)·anon(me null)은 false
    coalesce(s.user_id = params.me, false)
  from sections as s cross join params
  order by s.ord, s.seq;
$$;

-- 기본 권한(public·자동 노출)을 모두 걷고 필요한 역할에만 준다
revoke all on function public.weekly_ranking() from public, anon, authenticated;
grant execute on function public.weekly_ranking() to anon, authenticated;
