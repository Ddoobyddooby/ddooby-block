// 원격 시험의 Edge Function 호출. 요청마다 새 연결(keep-alive 끔)을 쓰고, 소켓 유휴 제한과 별도로 **요청 전체 deadline**을 둔다.
// 어느 쪽이든 만료되면 요청을 끊고 status 0(시험 불가)을 돌려준다. 판정은 느슨하게 하지 않는다: 응답이 없으면 PASS가 아니다.
// 로컬 http 서버에도 쓸 수 있다 (tests/supabase/callFunction.test.ts가 응답 없는 서버·느리게 보내는 서버로 deadline을 지킨다)
import { Agent as HttpAgent, request as httpRequest } from 'node:http';
import { Agent as HttpsAgent, request as httpsRequest } from 'node:https';
import { REQUIRED_REQUEST_HEADERS, type FnRes } from './nicknameJudge.ts';
import type { CallInit, FnName } from './scores.ts';

/** 요청 전체(연결~응답 끝) 제한 */
export const FN_DEADLINE_MS = 15_000;
/** 소켓이 아무 입출력 없이 있을 수 있는 시간 */
export const FN_IDLE_MS = 15_000;

export interface CallEnv {
  url: string;
  key: string;
}

export interface CallLimits {
  deadlineMs?: number;
  idleMs?: number;
}

export function callFunction(
  env: CallEnv,
  init: CallInit,
  fn: 'set-nickname' | FnName = 'set-nickname',
  limits: CallLimits = {},
): Promise<FnRes> {
  const deadlineMs = limits.deadlineMs ?? FN_DEADLINE_MS;
  const idleMs = limits.idleMs ?? FN_IDLE_MS;
  const headers: Record<string, string> = { apikey: env.key, 'Content-Type': 'application/json' };
  if (init.origin !== null) headers.Origin = init.origin;
  if (init.token !== null) headers.Authorization = `Bearer ${init.token}`;
  if (init.method === 'OPTIONS') {
    // 브라우저의 preflight 모양: 이어서 보낼 메서드와 헤더를 알린다
    headers['Access-Control-Request-Method'] = 'POST';
    headers['Access-Control-Request-Headers'] = REQUIRED_REQUEST_HEADERS.join(', ');
  }
  const payload =
    init.rawBody !== undefined
      ? init.rawBody
      : init.body === undefined
        ? undefined
        : JSON.stringify(init.body);
  if (payload !== undefined)
    headers['Content-Length'] = String(new TextEncoder().encode(payload).length);
  // 요청마다 새 연결을 쓴다 (keep-alive 끔). Node 내장 fetch는 연결을 재사용하는데, 원격 게이트웨이가 재사용한 연결에서
  // 응답 없이 멈추는 일이 드물게 있어 순서 안에서만 "시험 불가(status 0)"가 났다 (W3-03 원격 확인)
  return new Promise<FnRes>((resolve) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let req: ReturnType<typeof httpsRequest> | undefined;
    const finish = (res: FnRes): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer); // 성공·종료·오류 모두 타이머를 정리한다
      resolve(res);
    };
    const fail = (): void => {
      // 연결 실패·시간 초과 → 시험 불가. 요청도 끊는다
      finish({ status: 0, body: null, header: () => null });
      req?.destroy();
    };
    try {
      const url = new URL(`${env.url}/functions/v1/${fn}`);
      const secure = url.protocol === 'https:';
      const make = secure ? httpsRequest : httpRequest;
      const agent = secure
        ? new HttpsAgent({ keepAlive: false })
        : new HttpAgent({ keepAlive: false });
      timer = setTimeout(fail, deadlineMs);
      req = make(
        {
          hostname: url.hostname,
          port: url.port === '' ? undefined : url.port,
          path: url.pathname,
          method: init.method,
          agent,
          headers: { ...headers, Connection: 'close' },
          timeout: idleMs,
        },
        (res) => {
          let text = '';
          res.setEncoding('utf8');
          res.on('data', (chunk: string) => (text += chunk));
          res.on('end', () => {
            let body: unknown = null;
            try {
              body = JSON.parse(text);
            } catch {
              // JSON이 아닌 본문
            }
            const value = (name: string): string | null => {
              const v = res.headers[name.toLowerCase()];
              return Array.isArray(v) ? v.join(', ') : (v ?? null);
            };
            finish({ status: res.statusCode ?? 0, body, header: value });
          });
          res.on('error', fail);
          res.on('aborted', fail);
        },
      );
      req.on('timeout', fail);
      req.on('error', fail);
      req.end(payload);
    } catch {
      fail();
    }
  });
}
