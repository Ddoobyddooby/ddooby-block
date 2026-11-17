// 온라인 시험용 가짜 백엔드 (supabase-js 없이 account·profile을 시험한다)
import type { FunctionResult, OnlineBackend, RpcResult } from '../../src/online/client';

export interface FakeBackend extends OnlineBackend {
  calls: {
    getSession: number;
    signIn: number;
    fetchProfile: number;
    callFunction: number;
    callRpc: number;
  };
  lastRpc: string | null;
  lastFunction: { name: string; body: Record<string, unknown> } | null;
  /** SDK 세션의 사용자 (로그인하면 바뀐다) */
  sessionUser(): string | null;
  signOut(): void;
  /** SDK 세션 이벤트를 직접 보낸다 (같은 사용자 ID의 TOKEN_REFRESHED 흉내 등) */
  emit(userId: string | null): void;
}

export interface FakeOptions {
  session?: string | null;
  signInId?: string;
  getSession?: () => Promise<string | null>;
  signIn?: () => Promise<string>;
  fetchProfile?: (userId: string) => Promise<unknown>;
  callFunction?: (name: string, body: Record<string, unknown>) => Promise<FunctionResult>;
  callRpc?: (name: string) => Promise<RpcResult>;
}

export function fakeBackend(opts: FakeOptions = {}): FakeBackend {
  const listeners: ((id: string | null) => void)[] = [];
  // 진짜 SDK처럼 로그인이 성공하면 세션이 저장되고 이벤트가 나간다
  let current: string | null = opts.session ?? null;
  const backend: FakeBackend = {
    calls: { getSession: 0, signIn: 0, fetchProfile: 0, callFunction: 0, callRpc: 0 },
    lastFunction: null,
    lastRpc: null,
    async getSessionUserId() {
      backend.calls.getSession += 1;
      return opts.getSession ? opts.getSession() : current;
    },
    async signInAnonymously() {
      backend.calls.signIn += 1;
      const id = await (opts.signIn ? opts.signIn() : Promise.resolve(opts.signInId ?? 'user-a'));
      current = id;
      for (const l of listeners) l(id);
      return id;
    },
    onSessionChange(listener) {
      listeners.push(listener);
    },
    sessionUser: () => current,
    async fetchProfile(userId) {
      backend.calls.fetchProfile += 1;
      return opts.fetchProfile ? opts.fetchProfile(userId) : null;
    },
    async callFunction(name, body) {
      backend.calls.callFunction += 1;
      backend.lastFunction = { name, body };
      return opts.callFunction ? opts.callFunction(name, body) : { status: 200, body: {} };
    },
    async callRpc(name) {
      backend.calls.callRpc += 1;
      backend.lastRpc = name;
      return opts.callRpc ? opts.callRpc(name) : { status: 200, data: [] };
    },
    emit(userId) {
      for (const l of listeners) l(userId);
    },
    signOut() {
      current = null;
      for (const l of listeners) l(null);
    },
  };
  return backend;
}

/** 나중에 직접 끝내는 Promise */
export function deferred<T>(): {
  promise: Promise<T>;
  resolve(v: T): void;
  reject(e: unknown): void;
} {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
