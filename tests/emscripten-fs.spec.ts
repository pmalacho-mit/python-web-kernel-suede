import { beforeEach, describe, expect, it } from "vitest";
import {
  answering,
  EMFS,
  type Entry,
  type SyncFileSystem,
} from "../release/worker/emscripten-fs";
import { contents, type Contents } from "../release/contents";
import type { SyncResult } from "../release/utils";

const DIR_MODE = 16895;
const FILE_MODE = 33206;
const O_TRUNC = 512;
const SEEK_SET = 0;
const SEEK_CUR = 1;
const SEEK_END = 2;

class ErrnoError extends Error {
  constructor(readonly errno: number) {
    super(`errno ${errno}`);
  }
}

/**
 * Just enough of emscripten's FS for the mount to run against: node creation,
 * the two mode predicates, and the error type it throws.
 */
const emscripten = () => ({
  FS: {
    ErrnoError,
    isFile: (mode: number) => mode === FILE_MODE,
    isDir: (mode: number) => mode === DIR_MODE,
    createNode: (parent: any, name: string, mode: number) => {
      const node: any = { id: 1, name, mode, rdev: 1, parent, mount: { opts: { root: "" } } };
      node.parent ??= node;
      node.mount = parent?.mount ?? node.mount;
      return node;
    },
  },
  ERRNO_CODES: { ENOENT: 44, EINVAL: 28, EPERM: 63 } as any,
});

const ok = <T>(data: T): SyncResult<T> => ({ ok: true, data });
const missing = (): SyncResult<never> => ({
  ok: false,
  status: 404,
  error: new Error("not found"),
});

const entryOf = (value: Contents | null): Entry =>
  value === null
    ? { size: 0, directory: true }
    : { size: contents.byteLength(value), directory: false };

/** A filesystem of its own, so the mount can be exercised without a host. */
const store = (initial: [string, Contents | null][] = []) => {
  const files = new Map<string, Contents | null>(initial);
  const calls: string[] = [];
  const fs: SyncFileSystem = {
    get: ({ path }) => {
      calls.push(`get ${path}`);
      return files.has(path) ? ok(files.get(path)!) : missing();
    },
    stat: ({ path }) => {
      calls.push(`stat ${path}`);
      return files.has(path) ? ok(entryOf(files.get(path)!)) : missing();
    },
    put: ({ path, value }) => {
      calls.push(`put ${path}`);
      files.set(path, value);
      return ok(undefined);
    },
    delete: ({ path }) => {
      files.delete(path);
      return ok(undefined);
    },
    move: ({ path, newPath }) => {
      files.set(newPath, files.get(path)!);
      files.delete(path);
      return ok(undefined);
    },
    listDirectory: () => ok([...files.keys()].map((key) => key.replace(/^\//, ""))),
  };
  return { files, calls, fs };
};

const mounted = (initial: [string, Contents | null][] = []) => {
  const backing = store(initial.map(([name, value]) => [`/${name}`, value]));
  const pyodide = emscripten();
  const mount = new EMFS(pyodide as any, backing.fs);
  const root = mount.mount({ opts: { root: "" } } as any);
  const { nodeOps, streamOps } = mount.methods;

  const open = (name: string, flags = 0) => {
    const node = nodeOps.lookup(root, name);
    const stream: any = { object: node, flags, position: 0 };
    streamOps.open!(stream);
    return stream;
  };

  const file = (name: string) => backing.files.get(`/${name}`);

  return { ...backing, root, nodeOps, streamOps, open, file };
};

const readAll = (mount: ReturnType<typeof mounted>, name: string) => {
  const stream = mount.open(name);
  const buffer = new Uint8Array(1024);
  const read = mount.streamOps.read!(stream, buffer, 0, buffer.length, 0);
  mount.streamOps.close!(stream);
  return buffer.subarray(0, read);
};

const write = (mount: ReturnType<typeof mounted>, name: string, bytes: Uint8Array) => {
  const stream = mount.open(name, O_TRUNC);
  mount.streamOps.write!(stream, bytes, 0, bytes.length, 0);
  mount.streamOps.close!(stream);
};

const allByteValues = Uint8Array.from({ length: 256 }, (_, index) => index);
const utf8 = new TextEncoder();

describe("reading", () => {
  it("reads text stored as a string", () => {
    const mount = mounted([["greeting.txt", "héllo 🐍"]]);
    expect(readAll(mount, "greeting.txt")).toEqual(utf8.encode("héllo 🐍"));
  });

  it("reads bytes that are not text", () => {
    const mount = mounted([["logo.png", allByteValues]]);
    expect(readAll(mount, "logo.png")).toEqual(allByteValues);
  });

  it("reads an empty file", () => {
    const mount = mounted([["empty.txt", ""]]);
    expect(readAll(mount, "empty.txt")).toEqual(new Uint8Array());
  });

  it("reads from an offset", () => {
    const mount = mounted([["abc.txt", "abcdef"]]);
    const stream = mount.open("abc.txt");
    const buffer = new Uint8Array(3);
    expect(mount.streamOps.read!(stream, buffer, 0, 3, 2)).toBe(3);
    expect(buffer).toEqual(utf8.encode("cde"));
  });

  it("reports no bytes read past the end", () => {
    const mount = mounted([["abc.txt", "abc"]]);
    const stream = mount.open("abc.txt");
    expect(mount.streamOps.read!(stream, new Uint8Array(4), 0, 4, 10)).toBe(0);
  });

  it("does not write a file back when it was only read", () => {
    const mount = mounted([["abc.txt", "abc"]]);
    readAll(mount, "abc.txt");
    expect(mount.calls.filter((call) => call.startsWith("put"))).toEqual([]);
  });
});

describe("writing", () => {
  it("stores text as text", () => {
    const mount = mounted([["out.txt", ""]]);
    write(mount, "out.txt", utf8.encode("written 🐍"));
    expect(mount.file("out.txt")).toEqual(utf8.encode("written 🐍"));
  });

  it("stores every byte value untouched", () => {
    const mount = mounted([["out.bin", ""]]);
    write(mount, "out.bin", allByteValues);
    expect(mount.file("out.bin")).toEqual(allByteValues);
  });

  it("keeps what was already there when appending past the end", () => {
    const mount = mounted([["out.bin", "ab"]]);
    const stream = mount.open("out.bin");
    mount.streamOps.write!(stream, utf8.encode("cd"), 0, 2, 4);
    mount.streamOps.close!(stream);
    expect(mount.file("out.bin")).toEqual(
      new Uint8Array([0x61, 0x62, 0, 0, 0x63, 0x64]),
    );
  });

  it("empties a file opened for truncation even without a write", () => {
    const mount = mounted([["out.txt", "old contents"]]);
    const stream = mount.open("out.txt", O_TRUNC);
    mount.streamOps.close!(stream);
    expect(mount.file("out.txt")).toEqual(new Uint8Array());
  });

  it("creates a file as empty bytes", () => {
    const mount = mounted();
    mount.nodeOps.mknod!(mount.root, "new.py", FILE_MODE, 0);
    expect(mount.file("new.py")).toEqual(new Uint8Array());
  });

  it("creates a directory as null", () => {
    const mount = mounted();
    mount.nodeOps.mknod!(mount.root, "pkg", DIR_MODE, 0);
    expect(mount.file("pkg")).toBeNull();
  });
});

describe("metadata", () => {
  it("reports size in bytes rather than characters", () => {
    const mount = mounted([["emoji.txt", "🐍🐍"]]);
    const node = mount.nodeOps.lookup(mount.root, "emoji.txt");
    expect(mount.nodeOps.getattr(node).size).toBe(8);
  });

  it("reports size without reading the file", () => {
    const mount = mounted([["logo.png", allByteValues]]);
    const node = mount.nodeOps.lookup(mount.root, "logo.png");
    mount.calls.length = 0;
    mount.nodeOps.getattr(node);
    expect(mount.calls).toEqual(["stat /logo.png"]);
  });

  it("looks a directory up as a directory", () => {
    const mount = mounted([["pkg", null]]);
    expect(mount.nodeOps.lookup(mount.root, "pkg").mode).toBe(DIR_MODE);
  });

  it("raises for a path that is not there", () => {
    const mount = mounted();
    expect(() => mount.nodeOps.lookup(mount.root, "ghost.py")).toThrow(ErrnoError);
  });

  it("truncates a file to a smaller size", () => {
    const mount = mounted([["cut.txt", "abcdef"]]);
    const node = mount.nodeOps.lookup(mount.root, "cut.txt");
    mount.nodeOps.setattr(node, { size: 3 } as any);
    expect(mount.file("cut.txt")).toEqual(utf8.encode("abc"));
  });

  it("pads a file grown by truncation", () => {
    const mount = mounted([["grow.bin", "ab"]]);
    const node = mount.nodeOps.lookup(mount.root, "grow.bin");
    mount.nodeOps.setattr(node, { size: 4 } as any);
    expect(mount.file("grow.bin")).toEqual(new Uint8Array([0x61, 0x62, 0, 0]));
  });

  it("lists a directory with the implicit entries", () => {
    const mount = mounted([["a.py", ""], ["b.py", ""]]);
    expect(mount.nodeOps.readdir!(mount.root)).toEqual(
      expect.arrayContaining([".", "..", "a.py", "b.py"]),
    );
  });
});

describe("a filesystem that throws", () => {
  const broken = (thrown: unknown) =>
    answering({
      get: () => {
        throw thrown;
      },
    } as unknown as SyncFileSystem);

  it("turns a thrown error into a failed result", () => {
    const result = broken(new Error("host is gone")).get({ path: "/a.py" });
    expect(result).toMatchObject({ ok: false, status: 500 });
  });

  it("keeps the thrown message", () => {
    const result = broken(new Error("host is gone")).get({ path: "/a.py" }) as any;
    expect(result.error.message).toBe("host is gone");
  });

  it("turns a thrown non error into a failed result", () => {
    expect(broken("just a string").get({ path: "/a.py" })).toMatchObject({
      ok: false,
      status: 500,
    });
  });

  it("raises ENOENT to Python for a path a broken filesystem cannot answer", () => {
    const mount = mounted();
    expect(() => mount.nodeOps.lookup(mount.root, "ghost.py")).toThrow(ErrnoError);
  });
});

describe("seeking", () => {
  let mount: ReturnType<typeof mounted>;
  beforeEach(() => {
    mount = mounted([["seek.bin", allByteValues]]);
  });

  it("seeks from the start", () => {
    const stream = mount.open("seek.bin");
    expect(mount.streamOps.llseek!(stream, 10, SEEK_SET)).toBe(10);
  });

  it("seeks from the current position", () => {
    const stream = mount.open("seek.bin");
    stream.position = 4;
    expect(mount.streamOps.llseek!(stream, 6, SEEK_CUR)).toBe(10);
  });

  it("seeks from the end of the real byte length", () => {
    const stream = mount.open("seek.bin");
    expect(mount.streamOps.llseek!(stream, 0, SEEK_END)).toBe(256);
  });

  it("refuses to seek before the start", () => {
    const stream = mount.open("seek.bin");
    expect(() => mount.streamOps.llseek!(stream, -1, SEEK_SET)).toThrow(ErrnoError);
  });
});
