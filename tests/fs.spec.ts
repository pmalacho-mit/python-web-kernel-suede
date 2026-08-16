import { describe, expect, it, vi } from "vitest";
import {
  empty,
  readOnly,
  readWrite,
  sanitizePath,
  writeOnly,
} from "../release/fs";
import type { Contents } from "../release/contents";

const utf8 = new TextEncoder();
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const options = {
  root: "/home/pyodide",
  removeRoot: true,
  removeLeadingSlash: true,
};

const later = <T>(value: T) =>
  new Promise<T>((resolve) => setTimeout(() => resolve(value), 1));

describe("path sanitizing", () => {
  it("strips the mount root", () => {
    expect(sanitizePath("/home/pyodide/main.py", options)).toBe("main.py");
  });

  it("keeps paths that are not under the root", () => {
    expect(sanitizePath("/elsewhere/main.py", options)).toBe(
      "elsewhere/main.py",
    );
  });

  it("turns the root itself into the empty path", () => {
    expect(sanitizePath("/home/pyodide", options)).toBe("");
  });

  it("names the root when leading slashes are kept", () => {
    expect(
      sanitizePath("/home/pyodide", { ...options, removeLeadingSlash: false }),
    ).toBe("/");
  });

  it("leaves the root in place when asked to", () => {
    expect(
      sanitizePath("/home/pyodide/a.py", { ...options, removeRoot: false }),
    ).toBe("home/pyodide/a.py");
  });
});

describe("the empty filesystem", () => {
  it("finds nothing", async () => {
    expect(await empty().get({ path: "/home/pyodide/a.py" })).toMatchObject({
      ok: false,
      status: 404,
    });
  });

  it("accepts writes without keeping them", async () => {
    expect(await empty().put({ path: "a.py", value: "x" })).toEqual({
      ok: true,
      data: undefined,
    });
  });
});

describe("reading", () => {
  const reader = (get: (path: string) => any) =>
    readOnly({ ...options, get, listDirectory: () => undefined });

  it("returns text", async () => {
    expect(
      await reader(() => "print(1)").get({ path: "/home/pyodide/a.py" }),
    ).toEqual({
      ok: true,
      data: "print(1)",
    });
  });

  it("returns bytes", async () => {
    expect(
      await reader(() => png).get({ path: "/home/pyodide/logo.png" }),
    ).toEqual({
      ok: true,
      data: png,
    });
  });

  it("returns text a promise produced", async () => {
    expect(await reader(() => later("async")).get({ path: "a.py" })).toEqual({
      ok: true,
      data: "async",
    });
  });

  it("returns bytes a promise produced", async () => {
    expect(await reader(() => later(png)).get({ path: "logo.png" })).toEqual({
      ok: true,
      data: png,
    });
  });

  it("reports a directory as null contents", async () => {
    expect(
      await reader(() => ({ directory: true })).get({ path: "pkg" }),
    ).toEqual({
      ok: true,
      data: null,
    });
  });

  it("falls through to the base when nothing was found", async () => {
    expect(
      await reader(() => undefined).get({ path: "ghost.py" }),
    ).toMatchObject({
      ok: false,
      status: 404,
    });
  });

  it("hands the callback a path relative to the root", async () => {
    const get = vi.fn(() => "x");
    await reader(get).get({ path: "/home/pyodide/pkg/mod.py" });
    expect(get).toHaveBeenCalledWith("pkg/mod.py");
  });

  it("stays synchronous when the callback is synchronous", () => {
    expect(reader(() => "x").get({ path: "a.py" })).not.toBeInstanceOf(Promise);
  });

  it("lists directories", async () => {
    const fs = readOnly({
      ...options,
      get: () => undefined,
      listDirectory: (path) => (path === "" ? ["a.py"] : undefined),
    });
    expect(await fs.listDirectory({ path: "/home/pyodide" })).toEqual({
      ok: true,
      data: ["a.py"],
    });
    expect(await fs.listDirectory({ path: "/home/pyodide/ghost" })).toEqual({
      ok: true,
      data: [],
    });
  });
});

describe("describing a path", () => {
  it("measures contents when no stat callback was given", async () => {
    const fs = readOnly({
      ...options,
      get: () => "🐍",
      listDirectory: () => undefined,
    });
    expect(await fs.stat({ path: "a.txt" })).toEqual({
      ok: true,
      data: { size: 4, directory: false },
    });
  });

  it("measures bytes rather than characters", async () => {
    const fs = readOnly({
      ...options,
      get: () => png,
      listDirectory: () => undefined,
    });
    expect(await fs.stat({ path: "logo.png" })).toMatchObject({
      data: { size: 8, directory: false },
    });
  });

  it("describes a directory", async () => {
    const fs = readOnly({
      ...options,
      get: () => ({ directory: true }),
      listDirectory: () => undefined,
    });
    expect(await fs.stat({ path: "pkg" })).toEqual({
      ok: true,
      data: { size: 0, directory: true },
    });
  });

  it("prefers a stat callback over reading", async () => {
    const get = vi.fn(() => png);
    const fs = readOnly({
      ...options,
      get,
      listDirectory: () => undefined,
      stat: () => ({ size: 4096, directory: false }),
    });
    expect(await fs.stat({ path: "big.bin" })).toEqual({
      ok: true,
      data: { size: 4096, directory: false },
    });
    expect(get).not.toHaveBeenCalled();
  });

  it("falls back to reading when the stat callback declines", async () => {
    const fs = readOnly({
      ...options,
      get: () => "abc",
      listDirectory: () => undefined,
      stat: () => undefined,
    });
    expect(await fs.stat({ path: "a.txt" })).toMatchObject({
      data: { size: 3, directory: false },
    });
  });

  it("reports a missing path as not found", async () => {
    const fs = readOnly({
      ...options,
      get: () => undefined,
      listDirectory: () => undefined,
    });
    expect(await fs.stat({ path: "ghost" })).toMatchObject({
      ok: false,
      status: 404,
    });
  });
});

describe("writing", () => {
  const collect = (extra: Record<string, unknown> = {}) => {
    const written: [string, Contents | null][] = [];
    const fs = writeOnly({
      ...options,
      ...extra,
      put: (path, value) => void written.push([path, value]),
    });
    return { written, fs };
  };

  it("hands text through as text", async () => {
    const { written, fs } = collect();
    await fs.put({
      path: "/home/pyodide/a.py",
      value: utf8.encode("print(1)"),
    });
    expect(written).toEqual([["a.py", "print(1)"]]);
  });

  it("hands bytes that are not text through as bytes", async () => {
    const { written, fs } = collect();
    await fs.put({ path: "logo.png", value: png });
    expect(written).toEqual([["logo.png", png]]);
  });

  it("hands everything through as bytes when asked to", async () => {
    const { written, fs } = collect({ binary: true });
    await fs.put({ path: "a.py", value: utf8.encode("print(1)") });
    expect(written).toEqual([["a.py", utf8.encode("print(1)")]]);
  });

  it("passes a directory through as null", async () => {
    const { written, fs } = collect();
    await fs.put({ path: "pkg", value: null });
    expect(written).toEqual([["pkg", null]]);
  });

  it("waits for a callback that answers with a promise", async () => {
    const order: string[] = [];
    const fs = writeOnly({
      ...options,
      put: async () => {
        await later(null);
        order.push("written");
      },
    });
    await fs.put({ path: "a.py", value: "x" });
    expect(order).toEqual(["written"]);
  });

  it("sanitizes both ends of a move", async () => {
    const moves: unknown[] = [];
    const fs = writeOnly({
      ...options,
      put: () => {},
      move: (request) => void moves.push(request),
    });
    await fs.move({
      path: "/home/pyodide/a.py",
      newPath: "/home/pyodide/b.py",
    });
    expect(moves).toEqual([{ from: "a.py", to: "b.py" }]);
  });

  it("keeps the base behaviour when no delete callback was given", async () => {
    const fs = writeOnly({ ...options, put: () => {} });
    expect(await fs.delete({ path: "a.py" })).toEqual({
      ok: true,
      data: undefined,
    });
  });
});

describe("reading and writing together", () => {
  const store = () => {
    const files = new Map<string, Contents>();
    const fs = readWrite({
      ...options,
      get: (path) => (files.has(path) ? files.get(path) : undefined),
      listDirectory: (path) => (path === "" ? [...files.keys()] : undefined),
      put: (path, value) => {
        if (value === null) files.delete(path);
        else files.set(path, value);
      },
      delete: (path) => void files.delete(path),
    });
    return { files, fs };
  };

  it("reads back what was written", async () => {
    const { fs } = store();
    await fs.put({
      path: "/home/pyodide/a.py",
      value: utf8.encode("print(1)"),
    });
    expect(await fs.get({ path: "/home/pyodide/a.py" })).toEqual({
      ok: true,
      data: "print(1)",
    });
  });

  it("reads back bytes that are not text", async () => {
    const { fs } = store();
    await fs.put({ path: "logo.png", value: png });
    expect(await fs.get({ path: "logo.png" })).toEqual({ ok: true, data: png });
  });

  it("forgets what was deleted", async () => {
    const { fs } = store();
    await fs.put({ path: "a.py", value: "x" });
    await fs.delete({ path: "a.py" });
    expect(await fs.get({ path: "a.py" })).toMatchObject({
      ok: false,
      status: 404,
    });
  });
});
