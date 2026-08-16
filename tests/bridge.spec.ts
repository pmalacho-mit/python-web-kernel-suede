import { Worker } from "node:worker_threads";
import { afterEach, describe, expect, it } from "vitest";
import { HostBridge } from "../release/worker/bridge";
import type { Outcome, Task } from "./bridge.fixture";
import type { SyncCallTargets } from "../release/worker/sync-call";
import { contents, type Contents } from "../release/contents";
import { readWrite } from "../release/fs";

const SMALL_CAPACITY = 1024;

/** Omitting a key from a union has to happen member by member. */
type Unidentified<T> = T extends unknown ? Omit<T, "id"> : never;
type Request = Unidentified<Task>;

/** A worker running the real blocking protocol against a host on this thread. */
const start = (
  targets: SyncCallTargets,
  root: object = {},
  patience?: { interval: number; limit: number },
) => {
  const bridge = new HostBridge(targets, SMALL_CAPACITY);
  const rootId = bridge.objects.registerRootObject(root);
  const worker = new Worker(new URL("./bridge.worker.mjs", import.meta.url), {
    workerData: { buffers: bridge.buffers, rootId, patience },
  });

  const pending = new Map<number, (outcome: Outcome) => void>();
  let nextId = 0;

  worker.on("message", (message: any) => {
    if (bridge.handle(message)) return;
    pending.get(message.id)?.(message as Outcome);
  });

  /**
   * A worker that cannot start answers nothing, which would otherwise show up
   * as every test in the file waiting out its timeout.
   */
  worker.on("error", (error: Error) => {
    for (const answer of pending.values())
      answer({
        type: "outcome",
        id: -1,
        ok: false,
        error: `worker failed to start: ${error.message}`,
      });
    pending.clear();
  });

  const run = (task: Request) =>
    new Promise<Outcome>((resolve) => {
      const id = nextId++;
      pending.set(id, resolve);
      worker.postMessage({ ...task, id } as Task);
    });

  const value = async (task: Request) => {
    const outcome = await run(task);
    if (!outcome.ok) throw new Error(outcome.error);
    return outcome.value;
  };

  return { bridge, worker, run, value, stop: () => worker.terminate() };
};

let running: { stop: () => Promise<number> } | undefined;

const harness = (
  targets: SyncCallTargets,
  root?: object,
  patience?: { interval: number; limit: number },
) => {
  const started = start(targets, root, patience);
  running = started;
  return started;
};

afterEach(async () => {
  await running?.stop();
  running = undefined;
});

const pattern = (length: number) =>
  Uint8Array.from({ length }, (_, index) => (index * 13 + 7) % 256);

/** Comparing megabytes element by element is slower than the bridge itself. */
const digest = (bytes: unknown) => {
  const view = bytes as Uint8Array;
  return {
    length: view?.byteLength,
    checksum: view?.reduce(
      (sum, byte, i) => (sum + byte * (i + 1)) % 2 ** 32,
      0,
    ),
  };
};

describe("calls into the host", () => {
  it("answers a synchronous host function", async () => {
    const { value } = harness({ math: { double: (n: number) => n * 2 } });
    expect(
      await value({
        kind: "call",
        target: "math",
        method: "double",
        args: [21],
      }),
    ).toBe(42);
  });

  it("answers a host function that resolves later", async () => {
    const { value } = harness({
      slow: {
        answer: async (question: string) => {
          await new Promise((resolve) => setTimeout(resolve, 50));
          return `${question}: 42`;
        },
      },
    });
    expect(
      await value({
        kind: "call",
        target: "slow",
        method: "answer",
        args: ["life"],
      }),
    ).toBe("life: 42");
  });

  it("raises what a host function threw", async () => {
    const { run } = harness({
      broken: {
        boom: () => {
          throw new Error("host exploded");
        },
      },
    });
    expect(
      await run({ kind: "call", target: "broken", method: "boom", args: [] }),
    ).toMatchObject({
      ok: false,
      error: "host exploded",
    });
  });

  it("raises what a host promise rejected with", async () => {
    const { run } = harness({
      broken: { boom: async () => Promise.reject(new Error("rejected later")) },
    });
    expect(
      await run({ kind: "call", target: "broken", method: "boom", args: [] }),
    ).toMatchObject({
      ok: false,
      error: "rejected later",
    });
  });

  it("names a method the host does not have", async () => {
    const { run } = harness({ math: {} });
    const outcome = await run({
      kind: "call",
      target: "math",
      method: "double",
      args: [1],
    });
    expect(outcome.error).toContain("math.double");
  });

  it("gives up on a host that never answers", async () => {
    const { run } = harness(
      { slow: { forever: () => new Promise(() => {}) } },
      {},
      { interval: 25, limit: 300 },
    );
    const outcome = await run({
      kind: "call",
      target: "slow",
      method: "forever",
      args: [],
    });
    expect(outcome.error).toContain("did not answer");
  });

  it("keeps working after giving up on one", async () => {
    const { run, value } = harness(
      {
        slow: { forever: () => new Promise(() => {}) },
        math: { double: (n: number) => n * 2 },
      },
      {},
      { interval: 25, limit: 300 },
    );
    await run({ kind: "call", target: "slow", method: "forever", args: [] });
    expect(
      await value({
        kind: "call",
        target: "math",
        method: "double",
        args: [4],
      }),
    ).toBe(8);
  });

  it("keeps answering after a failure", async () => {
    const { value, run } = harness({
      math: {
        double: (n: number) => n * 2,
        boom: () => {
          throw new Error("nope");
        },
      },
    });
    await run({ kind: "call", target: "math", method: "boom", args: [] });
    expect(
      await value({
        kind: "call",
        target: "math",
        method: "double",
        args: [4],
      }),
    ).toBe(8);
  });
});

describe("payloads", () => {
  it.each([0, 1, 1023, 1024, 1025, 40_000, 1_000_000])(
    "returns %i bytes intact",
    async (length) => {
      const bytes = pattern(length);
      const { value } = harness({ assets: { read: () => bytes } });
      const received = await value({
        kind: "call",
        target: "assets",
        method: "read",
        args: [],
      });
      expect(digest(received)).toEqual(digest(bytes));
    },
  );

  it("receives bytes the worker sends as arguments", async () => {
    const received: Uint8Array[] = [];
    const { value } = harness({
      assets: {
        write: (bytes: Uint8Array) => {
          received.push(bytes);
          return bytes.byteLength;
        },
      },
    });
    const bytes = pattern(70_000);
    expect(
      await value({
        kind: "call",
        target: "assets",
        method: "write",
        args: [bytes],
      }),
    ).toBe(70_000);
    expect(digest(received[0])).toEqual(digest(bytes));
  });

  it("returns text of every shape intact", async () => {
    const text = `🐍 emoji, 日本語, café, ${"padding ".repeat(5000)}`;
    const { value } = harness({ assets: { read: () => text } });
    expect(
      await value({ kind: "call", target: "assets", method: "read", args: [] }),
    ).toBe(text);
  });

  it("returns structures holding bytes and text together", async () => {
    const answer = { ok: true, data: pattern(5000), name: "sprite.png" };
    const { value } = harness({ assets: { read: () => answer } });
    expect(
      await value({ kind: "call", target: "assets", method: "read", args: [] }),
    ).toEqual(answer);
  });
});

describe("proxied objects", () => {
  const root = {
    title: "kernel",
    secret: 42,
    /** Reads `this`, so it only answers when the real receiver crosses back. */
    get answer() {
      return this.secret;
    },
    nested: { deep: { count: 3 } },
    /** Not a plain object, so it crosses by reference rather than by copy. */
    clock: new (class Clock {
      readonly ticks = 7;
    })(),
    describes: (value: unknown) =>
      value === root.clock
        ? "the same object"
        : `a copy: ${JSON.stringify(value)}`,
    greet: (name: string) => `hello ${name}`,
    bytes: () => pattern(3000),
    later: async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      return "eventually";
    },
    explode: () => {
      throw new Error("proxy exploded");
    },
  };

  it("reads a property", async () => {
    const { value } = harness({}, root);
    expect(await value({ kind: "read", path: ["title"] })).toBe("kernel");
  });

  it("gives a getter the object it was read from", async () => {
    const { value } = harness({}, root);
    expect(await value({ kind: "read", path: ["answer"] })).toBe(42);
  });

  it("hands a proxied object back to the host as itself", async () => {
    const { value } = harness({}, root);
    expect(
      await value({
        kind: "reflect",
        path: ["describes"],
        argument: ["clock"],
      }),
    ).toBe("the same object");
  });

  it("copies a plain object rather than proxying it", async () => {
    const { value } = harness({}, root);
    expect(
      await value({
        kind: "reflect",
        path: ["describes"],
        argument: ["nested"],
      }),
    ).toContain("a copy");
  });

  it("reads through nested objects", async () => {
    const { value } = harness({}, root);
    expect(
      await value({ kind: "read", path: ["nested", "deep", "count"] }),
    ).toBe(3);
  });

  it("calls a function", async () => {
    const { value } = harness({}, root);
    expect(
      await value({ kind: "apply", path: ["greet"], args: ["world"] }),
    ).toBe("hello world");
  });

  it("carries bytes back from a call", async () => {
    const { value } = harness({}, root);
    expect(await value({ kind: "apply", path: ["bytes"], args: [] })).toEqual(
      pattern(3000),
    );
  });

  it("blocks on a returned promise", async () => {
    const { value } = harness({}, root);
    expect(await value({ kind: "awaited", path: ["later"], args: [] })).toBe(
      "eventually",
    );
  });

  it("raises what the host threw instead of hanging", async () => {
    const { run } = harness({}, root);
    expect(
      await run({ kind: "apply", path: ["explode"], args: [] }),
    ).toMatchObject({
      ok: false,
      error: "proxy exploded",
    });
  });
});

describe("a filesystem answering with promises", () => {
  const store = () => {
    const files = new Map<string, Contents>([
      ["main.py", "print('hi')"],
      ["logo.png", pattern(9000)],
    ]);
    const later = <T>(value: T) =>
      new Promise<T>((resolve) => setTimeout(() => resolve(value), 5));
    return {
      files,
      fs: readWrite({
        root: "/home/pyodide",
        get: (path) =>
          later(
            files.get(path) ?? (path === "" ? { directory: true } : undefined),
          ),
        listDirectory: (path) =>
          later(path === "" ? [...files.keys()] : undefined),
        put: async (path, value) => {
          if (value === null) files.delete(path);
          else files.set(path, value);
        },
        delete: async (path) => void files.delete(path),
      }),
    };
  };

  const fileSystem = (
    task: Omit<Extract<Task, { kind: "fileSystem" }>, "id" | "kind">,
  ) => ({
    kind: "fileSystem" as const,
    ...task,
  });

  it("reads text a promise produced", async () => {
    const { fs } = store();
    const { value } = harness({ fs });
    expect(
      await value(
        fileSystem({
          method: "get",
          args: [{ path: "/home/pyodide/main.py" }],
        }),
      ),
    ).toEqual({ ok: true, data: "print('hi')" });
  });

  it("reads bytes larger than the shared memory", async () => {
    const { fs } = store();
    const { value } = harness({ fs });
    expect(
      await value(
        fileSystem({
          method: "get",
          args: [{ path: "/home/pyodide/logo.png" }],
        }),
      ),
    ).toEqual({ ok: true, data: pattern(9000) });
  });

  it("reports a missing file rather than throwing", async () => {
    const { fs } = store();
    const { value } = harness({ fs });
    expect(
      await value(
        fileSystem({
          method: "get",
          args: [{ path: "/home/pyodide/nope.py" }],
        }),
      ),
    ).toMatchObject({ ok: false, status: 404 });
  });

  it("measures a file without transferring it", async () => {
    const { fs } = store();
    const { value } = harness({ fs });
    expect(
      await value(
        fileSystem({
          method: "stat",
          args: [{ path: "/home/pyodide/logo.png" }],
        }),
      ),
    ).toEqual({ ok: true, data: { size: 9000, directory: false } });
  });

  it("writes bytes through to the host", async () => {
    const { fs, files } = store();
    const { value } = harness({ fs });
    const bytes = pattern(12_345);
    await value(
      fileSystem({
        method: "put",
        args: [{ path: "/home/pyodide/out.bin", value: bytes }],
      }),
    );
    expect(contents.equal(files.get("out.bin")!, bytes)).toBe(true);
  });

  it("lists a directory", async () => {
    const { fs } = store();
    const { value } = harness({ fs });
    expect(
      await value(
        fileSystem({
          method: "listDirectory",
          args: [{ path: "/home/pyodide" }],
        }),
      ),
    ).toEqual({ ok: true, data: ["main.py", "logo.png"] });
  });
});

/**
 * A throw on the host does not fail the worker's assertion, so the host has to
 * be watched separately or it goes by unnoticed.
 */
const watchingTheHost = async (work: () => Promise<void>) => {
  const raised: string[] = [];
  const record = (error: unknown) => raised.push(String(error));
  process.on("uncaughtException", record);
  process.on("unhandledRejection", record);
  try {
    await work();
    await new Promise((resolve) => setTimeout(resolve, 500));
  } finally {
    process.off("uncaughtException", record);
    process.off("unhandledRejection", record);
  }
  return raised;
};

const SLOWER_THAN_PATIENCE = 300;
const IMPATIENT = { interval: 25, limit: 100 };

describe("a host that answers too late", () => {
  const late = <T>(value: T) =>
    new Promise<T>((resolve) =>
      setTimeout(() => resolve(value), SLOWER_THAN_PATIENCE),
    );

  it("leaves the host unharmed when its call is answered too late", async () => {
    const { run } = harness(
      { slow: { late: () => late("eventually") } },
      {},
      IMPATIENT,
    );
    const raised = await watchingTheHost(async () => {
      const outcome = await run({
        kind: "call",
        target: "slow",
        method: "late",
        args: [],
      });
      expect(outcome.error).toContain("did not answer");
    });
    expect(raised).toEqual([]);
  });

  it("leaves the host unharmed when its promise settles too late", async () => {
    const root = { later: () => late("eventually") };
    const { run } = harness({}, root, IMPATIENT);
    const raised = await watchingTheHost(async () => {
      const outcome = await run({ kind: "awaited", path: ["later"], args: [] });
      expect(outcome.ok).toBe(false);
    });
    expect(raised).toEqual([]);
  });

  it("still answers the next call", async () => {
    const { run, value } = harness(
      {
        slow: { late: () => late("eventually") },
        math: { double: (n: number) => n * 2 },
      },
      {},
      IMPATIENT,
    );
    await run({ kind: "call", target: "slow", method: "late", args: [] });
    await new Promise((resolve) => setTimeout(resolve, SLOWER_THAN_PATIENCE));
    expect(
      await value({
        kind: "call",
        target: "math",
        method: "double",
        args: [4],
      }),
    ).toBe(8);
  });
});

describe("reference lifetimes", () => {
  const host = () => new HostBridge({}, SMALL_CAPACITY).objects;

  it("gives the same object the same id every time", () => {
    const objects = host();
    const value = () => "shared";
    expect(objects.references.encode(value)).toBe(
      objects.references.encode(value),
    );
  });

  it("registers it once, however often it crosses", () => {
    const objects = host();
    const value = () => "shared";
    for (let i = 0; i < 100; i++) objects.references.encode(value);
    expect(objects.temporaryReferences.size).toBe(1);
  });

  it("resolves an id back to the object it stood for", () => {
    const objects = host();
    const value = { kind: "not plain" };
    Object.setPrototypeOf(value, { marker: true });
    expect(objects.references.decode(objects.references.encode(value))).toBe(
      value,
    );
  });

  it("forgets an id once the worker has collected the proxy for it", async () => {
    const clock = new (class Clock {
      readonly ticks = 7;
    })();
    const { bridge, value } = harness({}, { clock });

    const id = (await value({ kind: "collect", path: ["clock"] })) as string;
    expect(bridge.objects.temporaryReferences.has(id)).toBe(false);
  });

  it("forgets an id the worker has finished with", () => {
    const objects = host();
    const value = () => "temporary";
    const id = objects.references.encode(value);
    objects.releaseTempObject(id);
    expect(objects.temporaryReferences.size).toBe(0);
    expect(objects.references.encode(value)).not.toBe(id);
  });

  it("gives a root object the id it was registered with when it crosses", () => {
    const objects = host();
    const value = { root: true };
    const id = objects.registerRootObject(value);
    expect(objects.references.encode(value)).toBe(id);
  });

  it("keeps root objects when a release arrives for them", () => {
    const objects = host();
    const id = objects.registerRootObject({ root: true });
    objects.releaseTempObject(id);
    expect(objects.getObject(id)).toEqual({ root: true });
  });
});
