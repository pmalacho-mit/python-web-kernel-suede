/// <reference types="emscripten" />

// see
// https://github.com/jvilk/BrowserFS/blob/master/src/generic/emscripten_fs.ts
// https://github.com/emscripten-core/emscripten/blob/main/src/library_nodefs.js
// https://github.com/emscripten-core/emscripten/blob/main/src/library_memfs.js
// https://github.com/emscripten-core/emscripten/blob/main/src/library_workerfs.js
// https://github.com/curiousdannii/emglken/blob/master/src/emglkenfs.js

import type { PyodideAPI } from "pyodide";
import type { SyncResult } from "../utils";

export interface SyncFileSystem {
  /**
   * Get a file or directory at a given path.
   * @returns The contents of the file. `null` corresponds to a directory
   */
  get(opts: { path: string }): SyncResult<string | null>;

  /**
   * Creates or replaces a file or directory at a given path.
   * @param opts.value The contents of the file. `null` corresponds to a directory
   */
  put(opts: { path: string; value: string | null }): SyncResult<undefined>;

  /**
   * Deletes a file or directory at a given path
   */
  delete(opts: { path: string }): SyncResult<undefined>;

  /**
   * Move a file or directory to a new path. Can be used for renaming
   */
  move(opts: { path: string; newPath: string }): SyncResult<undefined>;

  /**
   * List the files in a directory
   */
  listDirectory(opts: { path: string }): SyncResult<string[]>;
}

const convertSyncResult = <T, E>(
  FS: PyodideAPI["FS"],
  ERRNO_CODES: PyodideAPI["ERRNO_CODES"],
  result: SyncResult<T, E>,
): T => {
  if (result.ok) return result.data;
  else {
    const error =
      result.status === 404
        ? new FS.ErrnoError(ERRNO_CODES["ENOENT"])
        : result.status === 400
          ? new FS.ErrnoError(ERRNO_CODES["EINVAL"])
          : new FS.ErrnoError(ERRNO_CODES["EPERM"]);

    error.cause = result.error;

    throw error;
  }
};

type Opts = {
  root?: string;
};

const realPath = (node: FS.FSNode, fileName?: string) => {
  const parts = [];
  while (node.parent !== node) {
    parts.push(node.name);
    node = node.parent;
  }
  parts.push((node.mount.opts as Opts).root);
  parts.reverse();
  if (fileName !== undefined && fileName !== null) {
    parts.push(fileName);
  }
  return parts.join("/");
};

type AdvancedEmscriptenFS = {
  createNode(
    parent: FS.FSNode | null,
    name: string,
    mode: number,
    dev?: number,
  ): FS.FSNode;
};

const DIR_MODE = 16895; // 040777
const FILE_MODE = 33206; // 100666
const SEEK_CUR = 1;
const SEEK_END = 2;
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8");

const methods = (
  {
    FS,
    ERRNO_CODES,
  }: Pick<PyodideAPI, "FS" | "ERRNO_CODES"> & { FS: AdvancedEmscriptenFS },
  custom: SyncFileSystem,
  log: boolean = false,
) => {
  let createNode: AdvancedEmscriptenFS["createNode"];

  const dev = 1; // dummy device number
  const rdev = 1; // dummy device number for rdev

  const syncResult = convertSyncResult.bind(null, FS, ERRNO_CODES) as <T, E>(
    result: SyncResult<T, E>,
  ) => T;

  const logCall = (name: string, ...args: any[]) => {
    if (log) console.log(`[emscripten-fs] ${name}`, args);
  };

  type CustomNode = FS.FSNode & {
    timestamp?: number;
  };

  const isCustomNode = (node: FS.FSNode): node is CustomNode =>
    (node as CustomNode).timestamp !== undefined;

  const nodeOps: FS.NodeOps = {
    getattr: (node) => {
      logCall("nodeOps.getattr", { node: node.name, id: node.id });
      const { id: ino, mode, rdev } = node;
      const time = new Date(isCustomNode(node) ? node.timestamp! : Date.now());
      return {
        dev,
        rdev,
        ino,
        mode,
        nlink: 1,
        uid: 0,
        gid: 0,
        size: 0,
        atime: time,
        mtime: time,
        ctime: time,
        blksize: 4096,
        blocks: 0,
      };
    },

    setattr: (node, attr) => {
      logCall("nodeOps.setattr", { node: node.name, attr });
      if (!attr) return;
      if (attr.mode !== undefined) node.mode = attr.mode;
      if (attr.timestamp !== undefined)
        (node as any).timestamp = attr.timestamp;
    },

    lookup: (parent, name) => {
      logCall("nodeOps.lookup", { parent: parent.name, name });
      const path = realPath(parent, name);
      const result = custom.get({ path });
      if (!result.ok) throw FS.genericErrors[ERRNO_CODES["ENOENT"]];
      return createNode!(
        parent,
        name,
        result.data === null ? DIR_MODE : FILE_MODE,
        rdev,
      );
    },

    mknod: (parent, name, mode, dev) => {
      logCall("nodeOps.mknod", { parent: parent.name, name, mode, dev });
      const node = createNode!(parent, name, mode, dev as number);
      const path = realPath(node);
      FS.isDir(node.mode)
        ? syncResult(custom.put({ path, value: null }))
        : syncResult(custom.put({ path, value: "" }));
      return node;
    },

    rename: (oldNode, newDir, newName) => {
      logCall("nodeOps.rename", {
        oldNode: oldNode.name,
        newDir: newDir.name,
        newName,
      });
      const path = realPath(oldNode);
      const newPath = realPath(newDir, newName);
      syncResult(custom.move({ path, newPath }));
      oldNode.name = newName;
    },

    unlink: (parent, name) => {
      logCall("nodeOps.unlink", { parent: parent.name, name });
      const path = realPath(parent, name);
      syncResult(custom.delete({ path }));
    },

    rmdir: (parent, name) => {
      logCall("nodeOps.rmdir", { parent: parent.name, name });
      const path = realPath(parent, name);
      syncResult(custom.delete({ path }));
    },

    readdir: (node) => {
      logCall("nodeOps.readdir", { node: node.name });
      const path = realPath(node);
      let result = syncResult(custom.listDirectory({ path }));
      if (!result.includes(".")) result.push(".");
      if (!result.includes("..")) result.push("..");
      return result;
    },

    symlink: (parent, newName, oldPath) => {
      logCall("nodeOps.symlink", { parent: parent.name, newName, oldPath });
      throw new FS.ErrnoError(ERRNO_CODES["EPERM"]);
    },

    readlink: (node) => {
      logCall("nodeOps.readlink", { node: node.name });
      throw new FS.ErrnoError(ERRNO_CODES["EPERM"]);
    },
  };

  type CustomStream = FS.FSStream & { fileData?: Uint8Array };

  const isCustomStream = (stream: FS.FSStream): stream is CustomStream =>
    (stream as CustomStream).fileData !== undefined;

  const streamOps: FS.StreamOps = {
    open: (stream) => {
      const path = realPath(stream.object);
      logCall("streamOps.open", { path });

      if (!FS.isFile(stream.object.mode)) return;
      const result = syncResult(custom.get({ path }));
      if (result === null) return;
      (stream as CustomStream).fileData = encoder.encode(result);
    },
    close: (stream) => {
      const path = realPath(stream.object);
      logCall("streamOps.close", { path });
      if (!FS.isFile(stream.object.mode) || !isCustomStream(stream)) return;
      const value = decoder.decode(stream.fileData);
      stream.fileData = undefined;
      syncResult(custom.put({ path, value }));
    },
    read: (stream, buffer, offset, length, position) => {
      logCall("streamOps.read", {
        path: realPath(stream.object),
        offset,
        length,
        position,
      });
      if (length <= 0) return 0;
      const isStream = isCustomStream(stream);
      const fileLength = isStream ? stream.fileData!.length : 0;
      const size = Math.min(fileLength - position, length);
      if (isStream)
        try {
          buffer.set(
            stream.fileData!.subarray(position, position + size),
            offset,
          );
        } catch (e) {
          console.error("Error during read:", e);
          throw new FS.ErrnoError(ERRNO_CODES["EPERM"]);
        }
      else {
        console.error("Stream is not a custom stream during read");
        throw new FS.ErrnoError(ERRNO_CODES["EPERM"]);
      }
      return size;
    },
    write: (stream, buffer, offset, length, position) => {
      logCall("streamOps.write", {
        path: realPath(stream.object),
        offset,
        length,
        position,
      });
      if (length <= 0) return 0;
      (stream.object as CustomNode).timestamp = Date.now();

      const isStream = isCustomStream(stream);
      const fileLength = isStream ? stream.fileData!.length : 0;

      try {
        if (position + length > fileLength) {
          const oldData = (stream as CustomStream).fileData ?? new Uint8Array();
          (stream as CustomStream).fileData = new Uint8Array(position + length);
          (stream as CustomStream).fileData!.set(oldData);
        }

        (stream as CustomStream).fileData!.set(
          buffer.subarray(offset, offset + length),
          position,
        );

        return length;
      } catch (e) {
        console.error("Error during write:", e);
        throw new FS.ErrnoError(ERRNO_CODES["EPERM"]);
      }
    },
    llseek: (stream, offset, whence) => {
      logCall("streamOps.llseek", {
        path: realPath(stream.object),
        offset,
        whence,
      });
      let position = offset;
      if (whence === SEEK_CUR) {
        position += stream.position;
      } else if (whence === SEEK_END) {
        if (FS.isFile(stream.object.mode)) {
          try {
            if (isCustomStream(stream)) position += stream.fileData!.length;
          } catch (e) {
            console.error("Error during llseek:", e);
            throw new FS.ErrnoError(ERRNO_CODES["EPERM"]);
          }
        }
      }

      if (position < 0) {
        console.error("Error during llseek: position < 0");
        throw new FS.ErrnoError(ERRNO_CODES["EINVAL"]);
      }

      return position;
    },
  };

  type CreatedNode = FS.FSNode & {
    node_ops: FS.NodeOps;
    stream_ops: FS.StreamOps;
  };

  createNode = (
    parent: FS.FSNode | null,
    name: string,
    mode: number,
    dev?: any,
  ) => {
    if (!FS.isDir(mode) && !FS.isFile(mode)) {
      console.error("createNode: Invalid mode", mode);
      throw new FS.ErrnoError(ERRNO_CODES["EINVAL"]);
    }
    const node = FS.createNode(parent, name, mode, dev) as CreatedNode;
    node.node_ops = nodeOps;
    node.stream_ops = streamOps;
    return node;
  };

  return {
    nodeOps,
    streamOps,
    createNode,
  };
};

export class EMFS implements Emscripten.FileSystemType {
  readonly methods: ReturnType<typeof methods>;
  readonly FS: PyodideAPI["FS"];

  constructor(
    pyodide: PyodideAPI,
    custom: SyncFileSystem,
    log: boolean = false,
  ) {
    this.FS = pyodide.FS;
    this.methods = methods(
      pyodide as PyodideAPI & { FS: AdvancedEmscriptenFS },
      custom,
      log,
    );
  }

  mount(_: FS.Mount) {
    return this.methods.createNode(null, "/", DIR_MODE);
  }

  syncfs(
    mount: FS.Mount,
    populate: () => unknown,
    done: (err?: number | null) => unknown,
  ): void {
    console.warn("EMFS syncfs called, but not implemented.");
    return;
  }
}
