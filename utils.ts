export type Expand<T> = T extends infer O ? { [K in keyof O]: O[K] } : never;

export type ExpandRecursively<T> = T extends object
  ? T extends infer O
    ? { [K in keyof O]: ExpandRecursively<O[K]> }
    : never
  : T;

export type Typed<T extends Record<string, any>> = {
  [K in keyof T]: { type: K } & T[K];
}[keyof T];

export type SyncResult<T, E = Error> =
  | {
      ok: true;
      data: T;
    }
  | {
      ok: false;
      status: number;
      error: E;
      detail?: string;
    };

export interface FlatPromise<T = any, E = any> {
  resolve: (value?: T) => void;
  reject: (reason?: E) => void;
  promise: Promise<T>;
}

/**
 * Creates a promise with the resolve and reject function outside of it, useful for tasks that may complete at any time.
 * Based on MIT licensed https://github.com/arikw/flat-promise, with typings added by gzuidhof.
 * @param executor
 */
export function flatPromise<T = any, E = any>(
  executor?: (
    resolve: (value?: T) => void,
    reject: (reason?: E) => void,
  ) => void | Promise<void>,
): FlatPromise<T, E> {
  let resolve!: (value?: T) => void;
  let reject!: (reason?: E) => void;

  const promise: Promise<T> = new Promise((res, rej) => {
    // Is this any cast necessary?
    (resolve as any) = res;
    reject = rej;
  });

  if (executor) {
    // This is actually valid.. as in the spec the function above the Promise gets executed immediately.
    executor(resolve, reject);
  }

  return { promise, resolve, reject };
}

export type Callback<T extends any[] = []> = (...args: T) => any;
export type Maybe<T> = T | undefined | null;

export const join = (...parts: (string | undefined | null)[]): string =>
  parts
    .filter((part) => part !== undefined && part !== null)
    .map((part) => part!.replace(/(^\/+|\/+$)/g, ""))
    .join("/");
