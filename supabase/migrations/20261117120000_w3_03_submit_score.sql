-- W3-03 점수 제출 확정 (SPEC 8.1, PLAN 7절)
--
-- submit-score는 리플레이 판정을 Edge Function에서 하고, "run을 한 번만 확정하고 주간 최고 점수를 올리는" 일을
-- 이 함수 하나(한 트랜잭션)에 맡긴다. PostgREST는 요청 하나가 트랜잭션 하나라서 REST 호출을 여러 개 이어 붙이면
-- 중간에 끊겼을 때 "확정은 됐는데 점수는 안 올라간" 상태가 남는다. 함수 안에서는 전부 되거나 전부 안 된다.
--
-- 소유자·주는 호출 인자가 아니라 runs 행에서 읽는다: 인자로 받은 user·week를 믿으면 service_role 연결이라도
-- 다른 사람의 run·다른 주에 점수를 쓰는 호출이 가능하다 (weekly_scores.run_id FK는 run이 있는지만 본다).
-- 클라이언트는 부를 수 없다: execute는 service_role(Edge Function)에만 준다.
--
-- 이 파일에 없는 것(뒤 태스크): 주간 랭킹 조회 함수 (W3-04)

-- ---------------------------------------------------------------------------
-- 무결성 제약: 주 형식, 제출 필드는 함께 채워지거나 함께 비어 있다
-- ---------------------------------------------------------------------------

alter table public.runs
  add constraint runs_week_key_format
  check (week_key ~ '^[0-9]{4}-W(0[1-9]|[1-4][0-9]|5[0-3])$');

alter table public.weekly_scores
  add constraint weekly_scores_week_key_format
  check (week_key ~ '^[0-9]{4}-W(0[1-9]|[1-4][0-9]|5[0-3])$');

-- 확정(submitted_at·submission_hash·result)은 한 번에 함께 쓰므로 일부만 채워진 run은 없어야 한다
alter table public.runs
  add constraint runs_submission_consistent
  check (
    (submitted_at is null and submission_hash is null and result is null)
    or (submitted_at is not null and submission_hash is not null and result is not null)
  );

-- ---------------------------------------------------------------------------
-- commit_submission: run 확정 + (통과한 판이면) 주간 최고 점수
--
-- p_result: 판정 결과 JSON. 통과는 {"ok": true, "score": n}, 거부는 {"ok": false, "code": "...", ...}.
--   통과 결과는 확정 시점의 그 주 최고 점수(best, isNewBest)를 더해 runs.result에 저장하고 그대로 돌려준다.
-- 반환 out_status:
--   'not-found'  이 사용자의 run이 아니거나 없다 (남의 run과 없는 run을 구분하지 않는다)
--   'existing'   이미 확정된 run이다. 저장된 해시·결과를 돌려주고 아무것도 바꾸지 않는다
--                (같은 내용인지는 Edge Function이 해시로 본다: 멱등 재시도 / 충돌)
--   'committed'  이번 호출이 확정했다
-- 동시에 같은 run이 들어오면 run 행 잠금(for update)으로 한 줄로 서고, 먼저 확정한 쪽만 'committed'다.
-- is_new_best는 "이 호출이 행을 바꿨는지"가 아니라 "확정 뒤 그 주 최고 기록이 이 run의 것인지"다.
-- 같은 점수의 다른 run은 run_id를 바꾸지 않으므로 false다.
-- ---------------------------------------------------------------------------

create function public.commit_submission(
  p_run uuid,
  p_user uuid,
  p_hash text,
  p_result jsonb,
  p_submitted_at timestamptz
)
returns table (out_status text, out_hash text, out_result jsonb)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  r public.runs%rowtype;
  v_score int;
  v_best int;
  v_new boolean;
  v_result jsonb;
begin
  if p_hash is null or p_hash = '' then
    raise exception 'commit_submission: 해시가 없다' using errcode = '22023';
  end if;
  if p_result is null or jsonb_typeof(p_result) <> 'object' then
    raise exception 'commit_submission: 결과가 객체가 아니다' using errcode = '22023';
  end if;
  if p_submitted_at is null then
    raise exception 'commit_submission: 제출 시각이 없다' using errcode = '22023';
  end if;

  select * into r from public.runs where id = p_run and user_id = p_user for update;
  if not found then
    return query select 'not-found'::text, null::text, null::jsonb;
    return;
  end if;

  if r.submission_hash is not null then
    return query select 'existing'::text, r.submission_hash, r.result;
    return;
  end if;

  if p_submitted_at < r.created_at then
    raise exception 'commit_submission: 제출 시각이 발급 시각보다 앞선다' using errcode = '22023';
  end if;

  if p_result -> 'ok' = 'true'::jsonb then
    if jsonb_typeof(p_result -> 'score') <> 'number' then
      raise exception 'commit_submission: score가 숫자가 아니다' using errcode = '22023';
    end if;
    -- int 범위를 넘으면 22003 (잘라내거나 되감지 않고 트랜잭션 전체가 취소된다)
    v_score := (p_result ->> 'score')::int;
    if v_score < 0 then
      raise exception 'commit_submission: score가 음수다' using errcode = '22023';
    end if;

    -- 사용자·주는 run에서 읽는다. 더 높은 점수일 때만 바꾼다 (같거나 낮으면 기존 행 유지)
    insert into public.weekly_scores as w (user_id, week_key, best_score, run_id)
    values (r.user_id, r.week_key, v_score, r.id)
    on conflict (user_id, week_key) do update
      set best_score = excluded.best_score, run_id = excluded.run_id
      where excluded.best_score > w.best_score;

    select w.best_score, w.run_id = r.id
      into v_best, v_new
      from public.weekly_scores as w
      where w.user_id = r.user_id and w.week_key = r.week_key;

    v_result := jsonb_build_object('ok', true, 'score', v_score, 'best', v_best, 'isNewBest', v_new);
  elsif p_result -> 'ok' = 'false'::jsonb then
    -- 내용 거부: 확정만 하고 주간 점수는 건드리지 않는다
    v_result := p_result;
  else
    raise exception 'commit_submission: ok가 true/false가 아니다' using errcode = '22023';
  end if;

  update public.runs
    set submission_hash = p_hash, submitted_at = p_submitted_at, result = v_result
    where id = r.id;

  return query select 'committed'::text, p_hash, v_result;
end;
$$;

revoke all on function public.commit_submission(uuid, uuid, text, jsonb, timestamptz)
  from public, anon, authenticated;
grant execute on function public.commit_submission(uuid, uuid, text, jsonb, timestamptz)
  to service_role;
