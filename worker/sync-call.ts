import type { ChannelHost, ChannelWorker } from "./channel";
import { codec, type References } from "./codec";

/**
 * Functions the worker may call on the host, grouped by the object they belong
 * to. Implementations may return promises: the worker stays blocked until they
 * settle.
 */
export type SyncCallTargets = Record<string, object>;

export type SyncCallMessages = {
  sync_call: {
    target: string;
    method: string;
    args: unknown[];
  };
};

type Settled = { ok: true; value: unknown } | { ok: false; error: Error };

const asError = (thrown: unknown) =>
  thrown instanceof Error ? thrown : new Error(String(thrown));

/**
 * Serves the worker's blocking calls. Runs on the thread that owns the
 * implementations, usually the main thread.
 */
export class SyncCallHost {
  constructor(
    private readonly targets: SyncCallTargets,
    private readonly channel: ChannelHost,
    private readonly references: References,
  ) {}

  async respond(message: SyncCallMessages["sync_call"]) {
    this.channel.send(this.encode(await this.settle(message)));
  }

  private async settle(message: SyncCallMessages["sync_call"]): Promise<Settled> {
    try {
      return { ok: true, value: await this.invoke(message) };
    } catch (error) {
      return { ok: false, error: asError(error) };
    }
  }

  private invoke({ target, method, args }: SyncCallMessages["sync_call"]) {
    const owner = this.targets[target] as Record<string, any> | undefined;
    const implementation = owner?.[method];
    if (typeof implementation !== "function")
      throw new Error(`The host has no "${target}.${method}" implementation`);
    return implementation.apply(owner, args);
  }

  /** A result that cannot be encoded still has to reach the blocked worker. */
  private encode(settled: Settled) {
    try {
      return codec.encode(settled, this.references);
    } catch (error) {
      return codec.encode({ ok: false, error: asError(error) } satisfies Settled);
    }
  }
}

/**
 * Calls host functions and blocks until they settle. Must run on a worker
 * thread.
 */
export class SyncCallClient {
  constructor(
    private readonly channel: ChannelWorker,
    private readonly post: (message: { type: "sync_call" } & SyncCallMessages["sync_call"]) => void,
    private readonly references: References,
  ) {}

  call<T = any>(target: string, method: string, ...args: unknown[]): T {
    const payload = this.channel.request(() =>
      this.post({ type: "sync_call", target, method, args }),
    );
    const settled = codec.decode(payload, this.references) as Settled;
    if (!settled.ok) throw settled.error;
    return settled.value as T;
  }

  /** Binds every method of a host target into a blocking local facade. */
  facade<T extends object>(target: string, methods: (keyof T & string)[]): T {
    const bound = methods.map(
      (method) =>
        [method, (...args: unknown[]) => this.call(target, method, ...args)] as const,
    );
    return Object.fromEntries(bound) as T;
  }
}
