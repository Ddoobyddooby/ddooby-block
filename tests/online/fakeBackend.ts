// 온라인 시험용 가짜 백엔드 (supabase-js 없이 account·profile을 시험한다)
import type { FunctionResult, OnlineBackend } from '../../src/online/client';

export interface FakeBackend extends OnlineBackend {
  calls: { getSession: number; signIn: number; fetchProfile: number; callFunction: number };
  lastFunction: { name: string; body: Record<string, unknown> } | null;
  signOut(): void;
}

export interface FakeOptions {
  session?: string | null;
  signInId?: string;
  getSession?: () => Promise<string | null>;
  signIn?: () => Promise<string>;
  fetchProfile?: (userId: string) => Promise<unknown>;
  callFunction?: (name: string, body: Record<string, unknown>) => Promise<FunctionResult>;
}

export function fakeBackend(opts: FakeOptions = {}): FakeBackend {
  const listeners: (() => void)[] = [];
  const backend: FakeBackend = {
    calls: { getSession: 0, signIn: 0, fetchProfile: 0, callFunction: 0 },
    lastFunction: null,
    async getSessionUserId() {
      backend.calls.getSession += 1;
      return opts.getSession ? opts.getSession() : (opts.session ?? null);
    },
    async signInAnonymously() {
      backend.calls.signIn += 1;
      return opts.signIn ? opts.signIn() : (opts.signInId ?? 'user-a');
    },
    onSignedOut(listener) {
      listeners.push(listener);
    },
    async fetchProfile(userId) {
      backend.calls.fetchProfile += 1;
      return opts.fetchProfile ? opts.fetchProfile(userId) : null;
    },
    async callFunction(name, body) {
      backend.calls.callFunction += 1;
      backend.lastFunction = { name, body };
      return opts.callFunction ? opts.callFunction(name, body) : { status: 200, body: {} };
    },
    signOut() {
      for (const l of listeners) l();
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
