import { AsyncMemory } from "./async-memory";
import type { SyncFileSystem } from "./emscripten-fs";
import {
  ObjectId,
  ObjectProxyClient,
  type ProxyMessages,
} from "./object-proxy";
import { PyodideInstance } from "../pyodide/instance";
import type { Typed } from "../utils";
import { make, type Output } from "../output";

export namespace Kernel {
  export type Requests = {
    initialize: {
      asyncMemory: {
        lockBuffer: SharedArrayBuffer;
        dataBuffer: SharedArrayBuffer;
        interruptBuffer: SharedArrayBuffer;
      };
      ids: {
        filesystem: string;
        getInput: string;
        globalThis: string;
      };
      /**
       * The workspace root path for this kernel
       * (assumed to be where all executed files are located)
       * @example /home/pyodide
       */
      root: string;
    };
    run: {
      code: string;
      /**
       * The filename to associate with this code execution
       *
       * Relative paths will be resolved against the kernel's workspace root.
       *
       * @example /home/pyodide/main.py
       */
      file: string;
    };
  };

  export type Responses = {
    initialized: {};
    kernel_initialized: {
      kernelId: string;
    };
    loaded: {};
    output: Output.Specific;
    finished: {};
  } & ProxyMessages;

  export type Request<T extends keyof Requests = keyof Requests> =
    Typed<Requests> & { type: T };
  export type Response<T extends keyof Responses = keyof Responses> =
    Typed<Responses> & { type: T };

  export type RequestHandler = {
    [k in keyof Requests as `on${Capitalize<k>}`]: (
      manager: Kernel,
      data: Requests[k],
    ) => any;
  };
}

const handler = {
  onInitialize: async (manager, data) => {
    const asyncMemory = new AsyncMemory(
      data.asyncMemory.lockBuffer,
      data.asyncMemory.dataBuffer,
      data.asyncMemory.interruptBuffer,
    );
    const proxy = new ObjectProxyClient(asyncMemory, (msg) =>
      manager.postMessage(msg),
    );
    const input = proxy.getObjectProxy<() => string>(data.ids.getInput);
    const asyncFs = proxy.getObjectProxy(data.ids.filesystem);
    const syncFs: SyncFileSystem = {
      get: (opts) => proxy.thenSync(asyncFs.get(opts)),
      put: (opts) => proxy.thenSync(asyncFs.put(opts)),
      delete: (opts) => proxy.thenSync(asyncFs.delete(opts)),
      move: (opts) => proxy.thenSync(asyncFs.move(opts)),
      listDirectory: (opts) => proxy.thenSync(asyncFs.listDirectory(opts)),
    };

    manager.proxy = proxy;
    manager.input = input;
    manager.syncFs = syncFs;
    manager.pyodide = new PyodideInstance({
      globalThisId: data.ids.globalThis,
      interruptBuffer: asyncMemory.interrupter,
    });

    await manager.pyodide.init(manager, data.root);
    manager.postMessage({ type: "initialized" });
  },
  onRun: async (manager, { code, file: filename }) => {
    try {
      await manager.pyodide.load(code);
      manager.postMessage({ type: "loaded" });
      const value = await manager.pyodide.runCode(code, filename);
      if (value) manager.output(value);
    } catch (e) {
      manager.output(
        make("error", {
          ename: "ExecutionError",
          evalue: (e as Error).message,
          traceback: (e as Error).stack ? (e as Error).stack!.split("\n") : [],
        }),
      );
    } finally {
      manager.postMessage({ type: "finished" });
    }
  },
} satisfies Kernel.RequestHandler;

const handle = (manager: Kernel, msg: Kernel.Request) => {
  const { type } = msg;
  const methodName =
    `on${type.charAt(0).toUpperCase()}${type.slice(1)}` as keyof Kernel.RequestHandler;
  if (!(methodName in handler))
    throw new Error(`No handler for message type ${type}`);
  handler[methodName](manager, msg as any);
};

/**
 * Manages all the kernels in this worker.
 */
export class Kernel {
  /** BEGIN: Properties set by the initialize message */
  proxy!: ObjectProxyClient;
  input!: (prompt: string) => string;
  syncFs!: SyncFileSystem;
  pyodide!: PyodideInstance;
  /** END: Properties set by the initialize message */

  constructor() {
    const _handle = handle.bind(null, this);
    self.addEventListener("message", async (e: MessageEvent) => {
      if (!e.data) console.warn("Unexpected kernel worker  message:", e);
      else _handle(e.data);
    });
  }

  output(output: Output.Specific) {
    const casted = output satisfies Omit<
      Kernel.Response<"output">,
      "type"
    > as Kernel.Response<"output">;
    casted.type = "output";
    this.postMessage(casted);
  }

  postMessage(message: Kernel.Response) {
    self.postMessage(message);
  }

  [ObjectId] = "";
}

const singleton = new Kernel();
export default singleton;
