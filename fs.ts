import type { SyncFileSystem } from "./worker/emscripten-fs";

export namespace FileSystem {
  export type SanitizeOptions = {
    /**
     * Location to mount the shared file system at.
     * @default "/home/pyodide"
     */
    root: string;
    /**
     * Remove the configured root prefix from incoming paths.
     * @default true
     */
    removeRoot: boolean;
    /**
     * Strip a leading slash from incoming paths.
     * @default true
     */
    removeLeadingSlash: boolean;
  };

  export type CreationOptions = Partial<SanitizeOptions> & {
    /** Log filesystem calls for debugging. */
    log?: boolean;
  };

  export type Get = (
    path: string,
  ) => string | undefined | null | { directory: true };

  export type Put = (path: string, value: string | null) => void;

  export type ListDirectory = (path: string) => string[];

  export type Move = (request: {
    /** Source path to move from. */
    from: string;
    /** Destination path to move to. */
    to: string;
  }) => void;

  export type Delete = (path: string) => void;

  export type Read = {
    /** Read file contents or directory marker for a path. */
    get: Get;
    /** List entries for a directory path. */
    listDirectory: ListDirectory;
  };

  export type Write = {
    /** Create or update file contents at a path. */
    put: Put;
    /** Move a path from source to destination. */
    move?: Move;
    /** Delete a path from the filesystem. */
    delete?: Delete;
  };
}

type RootedFileSystem = SyncFileSystem & { root: string };

export const defaultRoot = "/home/pyodide";

/**
 * In-memory filesystem adapter that returns not-found for reads and no-ops
 * for writes.
 */
export const empty = (root = defaultRoot, log = false): RootedFileSystem =>
  ({
    root,
    get(opts: { path: string }) {
      if (log) console.log("fs.get invoked with:", opts);
      return {
        ok: false as const,
        status: 404,
        error: new Error("Not found"),
      };
    },
    put(opts: { path: string; value: string | null }) {
      if (log) console.log("fs.put invoked with:", opts);
      return { ok: true as const, data: undefined };
    },
    delete(opts: { path: string }) {
      if (log) console.log("fs.delete invoked with:", opts);
      return { ok: true as const, data: undefined };
    },
    move(opts: { path: string; newPath: string }) {
      if (log) console.log("fs.move invoked with:", opts);
      return { ok: true as const, data: undefined };
    },
    listDirectory(opts: { path: string }) {
      if (log) console.log("fs.listDirectory invoked with:", opts);
      return { ok: true as const, data: [] };
    },
  }) satisfies RootedFileSystem;

/** Normalize file paths according to sanitize options. */
export const sanitizePath = (
  path: string,
  { removeRoot, removeLeadingSlash, root }: FileSystem.SanitizeOptions,
) => {
  if (removeRoot && path.startsWith(root)) path = path.replace(root, "");
  if (removeLeadingSlash && path.startsWith("/")) path = path.slice(1);
  return path;
};

/** Apply default values for filesystem sanitize options. */
export const setDefaults: (
  options: Partial<FileSystem.SanitizeOptions>,
) => asserts options is FileSystem.SanitizeOptions = (options) => {
  options.root ??= defaultRoot;
  options.removeRoot ??= true;
  options.removeLeadingSlash ??= true;
};

/**
 * Create a read-only filesystem facade layered on top of an optional base
 * filesystem implementation.
 */
export const readOnly = (
  options: FileSystem.Read & FileSystem.CreationOptions,
  base?: RootedFileSystem,
): RootedFileSystem => {
  setDefaults(options);
  const { get, listDirectory, root, log } = options;
  base ??= empty(root, log);
  return {
    ...base,
    listDirectory(opts) {
      const data = listDirectory(sanitizePath(opts.path, options));
      if (Array.isArray(data)) return { ok: true as const, data };
      else return base.listDirectory(opts);
    },
    get(opts) {
      const data = get(sanitizePath(opts.path, options));
      if (typeof data === "string") return { ok: true as const, data };
      if (data && typeof data === "object" && "directory" in data)
        return { ok: true as const, data: null };
      else return base.get(opts);
    },
  };
};

/**
 * Create a write-only filesystem facade layered on top of an optional base
 * filesystem implementation.
 */
export const writeOnly = (
  options: FileSystem.Write & FileSystem.CreationOptions,
  base?: RootedFileSystem,
): RootedFileSystem => {
  setDefaults(options);
  const { root, log, put, move, delete: del } = options;
  base ??= empty(root, log);
  return {
    ...base,
    move: move
      ? ({ path, newPath }) => {
          const from = sanitizePath(path, options);
          const to = sanitizePath(newPath, options);
          move({ from, to });
          return { ok: true as const, data: undefined };
        }
      : base.move,
    delete: del
      ? ({ path }) => {
          del(sanitizePath(path, options));
          return { ok: true as const, data: undefined };
        }
      : base.delete,
    put({ path, value }) {
      put(sanitizePath(path, options), value);
      return { ok: true as const, data: undefined };
    },
  };
};

/** Create a read-write filesystem facade by composing read-only and write-only adapters. */
export const readWrite = (
  options: FileSystem.Read & FileSystem.Write & FileSystem.CreationOptions,
  base?: RootedFileSystem,
): RootedFileSystem => {
  setDefaults(options);
  return readOnly(options, writeOnly(options, base));
};

export default {
  defaultRoot,
  empty,
  readOnly,
  writeOnly,
  readWrite,
};
