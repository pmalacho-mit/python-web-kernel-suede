import { Worker } from "node:worker_threads";
import { afterEach, describe, expect, it } from "vitest";
import { HostBridge } from "./bridge";
import type { Outcome, Task } from "./bridge.fixture";
import type { SyncCallTargets } from "./sync-call";
import { contents, type Contents } from "../contents";
import { readWrite } from "../fs";

const SMALL_CAPACITY = 1024;

/** A worker running the real blocking protocol against a host on this thread. */
const start = (targets: SyncCallTargets, root: object = {}) => {
  const bridge = new HostBridge(targets, SMALL_CAPACITY);
  const rootId = bridge.objects.registerRootObject(root);
  const worker = new Worker(new URL("./bridge.fixture.ts", import.meta.url), {
    workerData: { buffers: bridge.buffers, rootId },
    execArgv: ["--import", "tsx"],
  });

  const pending = new Map<number, (outcome: Outcome) => void>();
  let nextId = 0;

  worker.on("message", (message: any) => {
    if (bridge.handle(message)) return;
    pending.get(message.id)?.(message as Outcome);
  });

  const run = (task: Omit<Task, "id">) =>
    new Promise<Outcome>((resolve) => {
      const id = nextId++;
      pending.set(id, resolve);
      worker.postMessage({ ...task, id } as Task);
    });

  const value = async (task: Omit<Task, "id">) => {
    const outcome = await run(task);
    if (!outcome.ok) throw new Error(outcome.error);
    return outcome.value;
  };

  return { bridge, worker, run, value, stop: () => worker.terminate() };
};

let running: { stop: () => Promise<number> } | undefined;

const harness = (targets: SyncCallTargets, root?: object) => {
  const started = start(targets, root);
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
    checksum: view?.reduce((sum, byte, i) => (sum + byte * (i + 1)) % 2 ** 32, 0),
  };
};

describe("calls into the host", () => {
  it("answers a synchronous host function", async () => {
    const { value } = harness({ math: { double: (n: number) => n * 2 } });
    expect(await value({ kind: "call", target: "math", method: "double", args: [21] })).toBe(42);
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
      await value({ kind: "call", target: "slow", method: "answer", args: ["life"] }),
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
    expect(await run({ kind: "call", target: "broken", method: "boom", args: [] })).toMatchObject({
      ok: false,
      error: "host exploded",
    });
  });

  it("raises what a host promise rejected with", async () => {
    const { run } = harness({
      broken: { boom: async () => Promise.reject(new Error("rejected later")) },
    });
    expect(await run({ kind: "call", target: "broken", method: "boom", args: [] })).toMatchObject({
      ok: false,
      error: "rejected later",
    });
  });

  it("names a method the host does not have", async () => {
    const { run } = harness({ math: {} });
    const outcome = await run({ kind: "call", target: "math", method: "double", args: [1] });
    expect(outcome.error).toContain("math.double");
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
    expect(await value({ kind: "call", target: "math", method: "double", args: [4] })).toBe(8);
  });
});

describe("payloads", () => {
  it.each([0, 1, 1023, 1024, 1025, 40_000, 1_000_000])(
    "returns %i bytes intact",
    async (length) => {
      const bytes = pattern(length);
      const { value } = harness({ assets: { read: () => bytes } });
      const received = await value({ kind: "call", target: "assets", method: "read", args: [] });
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
      await value({ kind: "call", target: "assets", method: "write", args: [bytes] }),
    ).toBe(70_000);
    expect(digest(received[0])).toEqual(digest(bytes));
  });

  it("returns text of every shape intact", async () => {
    const text = `🐍 emoji, 日本語, café, ${"padding ".repeat(5000)}`;
    const { value } = harness({ assets: { read: () => text } });
    expect(await value({ kind: "call", target: "assets", method: "read", args: [] })).toBe(text);
  });

  it("returns structures holding bytes and text together", async () => {
    const answer = { ok: true, data: pattern(5000), name: "sprite.png" };
    const { value } = harness({ assets: { read: () => answer } });
    expect(await value({ kind: "call", target: "assets", method: "read", args: [] })).toEqual(
      answer,
    );
  });
});

describe("proxied objects", () => {
  const root = {
    title: "kernel",
    nested: { deep: { count: 3 } },
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

  it("reads through nested objects", async () => {
    const { value } = harness({}, root);
    expect(await value({ kind: "read", path: ["nested", "deep", "count"] })).toBe(3);
  });

  it("calls a function", async () => {
    const { value } = harness({}, root);
    expect(await value({ kind: "apply", path: ["greet"], args: ["world"] })).toBe("hello world");
  });

  it("carries bytes back from a call", async () => {
    const { value } = harness({}, root);
    expect(await value({ kind: "apply", path: ["bytes"], args: [] })).toEqual(pattern(3000));
  });

  it("blocks on a returned promise", async () => {
    const { value } = harness({}, root);
    expect(await value({ kind: "awaited", path: ["later"], args: [] })).toBe("eventually");
  });

  it("raises what the host threw instead of hanging", async () => {
    const { run } = harness({}, root);
    expect(await run({ kind: "apply", path: ["explode"], args: [] })).toMatchObject({
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
        get: (path) => later(files.get(path) ?? (path === "" ? { directory: true } : undefined)),
        listDirectory: (path) => later(path === "" ? [...files.keys()] : undefined),
        put: async (path, value) => {
          if (value === null) files.delete(path);
          else files.set(path, value);
        },
        delete: async (path) => void files.delete(path),
      }),
    };
  };

  const fileSystem = (task: Omit<Task & { kind: "fileSystem" }, "id" | "kind">) => ({
    kind: "fileSystem" as const,
    ...task,
  });

  it("reads text a promise produced", async () => {
    const { fs } = store();
    const { value } = harness({ fs });
    expect(await value(fileSystem({ method: "get", args: [{ path: "/home/pyodide/main.py" }] })))
      .toEqual({ ok: true, data: "print('hi')" });
  });

  it("reads bytes larger than the shared memory", async () => {
    const { fs } = store();
    const { value } = harness({ fs });
    expect(await value(fileSystem({ method: "get", args: [{ path: "/home/pyodide/logo.png" }] })))
      .toEqual({ ok: true, data: pattern(9000) });
  });

  it("reports a missing file rather than throwing", async () => {
    const { fs } = store();
    const { value } = harness({ fs });
    expect(await value(fileSystem({ method: "get", args: [{ path: "/home/pyodide/nope.py" }] })))
      .toMatchObject({ ok: false, status: 404 });
  });

  it("measures a file without transferring it", async () => {
    const { fs } = store();
    const { value } = harness({ fs });
    expect(await value(fileSystem({ method: "stat", args: [{ path: "/home/pyodide/logo.png" }] })))
      .toEqual({ ok: true, data: { size: 9000, directory: false } });
  });

  it("writes bytes through to the host", async () => {
    const { fs, files } = store();
    const { value } = harness({ fs });
    const bytes = pattern(12_345);
    await value(
      fileSystem({ method: "put", args: [{ path: "/home/pyodide/out.bin", value: bytes }] }),
    );
    expect(contents.equal(files.get("out.bin")!, bytes)).toBe(true);
  });

  it("lists a directory", async () => {
    const { fs } = store();
    const { value } = harness({ fs });
    expect(await value(fileSystem({ method: "listDirectory", args: [{ path: "/home/pyodide" }] })))
      .toEqual({ ok: true, data: ["main.py", "logo.png"] });
  });
});
