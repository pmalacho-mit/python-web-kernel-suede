/// <reference types="vite/client" />

import KernelWorker from "./worker/kernel-worker?worker";
import { AsyncMemory } from "./worker/async-memory";
import { ObjectProxyHost } from "./worker/object-proxy";
import type { Kernel } from "./worker/kernel-worker";
import type { NotebookFilesystemSync } from "./worker/emscripten-fs";
import { flatPromise, type Expand } from "./utils";
import { type Output, form } from "./output";

export type Environment = {
  fs: NotebookFilesystemSync & { root: string };
  input: (prompt: string) => string;
};

export namespace Run {
  type Callback<T extends any[] = []> = (...args: T) => any;

  export type Events = {
    start: [];
    complete: [outputs: Output.Specific[]];
    output: [output: Output.Specific];
  };

  export type On = Partial<{
    [K in keyof Events]: Callback<Events[K]>;
  }>;

  export type Job = Expand<{
    interrupt: () => void;
    result: Promise<Output.Specific[]>;
  }>;
}

const fromRoot = ({ fs: { root } }: Environment, path: string) =>
  root.endsWith("/")
    ? root + path.replace(/^\/+/, "")
    : root + "/" + path.replace(/^\/+/, "");

const defaultPath = (env: Environment) => fromRoot(env, "temp.py");

const handleMessages = ({
  worker,
  objectProxyHost,
  asyncMemory,
  callbacks,
}: PythonKernel) =>
  worker.addEventListener("message", (ev: MessageEvent) => {
    if (!ev.data) {
      console.warn("Unexpected message from kernel manager", ev);
      return;
    }
    const data = ev.data as Kernel.Response;

    if (
      data.type === "proxy_reflect" ||
      data.type === "proxy_shared_memory" ||
      data.type === "proxy_print_object" ||
      data.type === "proxy_promise"
    )
      objectProxyHost.handleProxyMessage(data, asyncMemory);
    else if (data.type === "output") callbacks.output?.(data);
    else if (data.type === "finished" || data.type === "loaded")
      callbacks[data.type]?.();
  });

export default class PythonKernel {
  readonly worker = new KernelWorker();
  readonly asyncMemory = new AsyncMemory();
  readonly objectProxyHost = new ObjectProxyHost(this.asyncMemory);
  readonly environment: Environment;

  readonly callbacks = {
    loaded: undefined as (() => void) | undefined,
    output: undefined as ((output: Output.Specific) => void) | undefined,
    finished: undefined as (() => void) | undefined,
  };

  readonly ready: Promise<void>;

  private runChain = Promise.resolve();

  constructor(environment: Environment) {
    this.environment = environment;
    const { fs, input } = environment;

    handleMessages(this);
    const { worker, objectProxyHost } = this;

    const payload: Kernel.Request = {
      type: "initialize",
      root: fs.root,
      asyncMemory: {
        lockBuffer: this.asyncMemory.sharedLock,
        dataBuffer: this.asyncMemory.sharedMemory,
        interruptBuffer: this.asyncMemory.interruptBuffer,
      },
      ids: {
        getInput: objectProxyHost.registerRootObject(input),
        filesystem: objectProxyHost.registerRootObject(fs),
        globalThis: objectProxyHost.registerRootObject(globalThis),
      },
    };

    this.ready = new Promise((resolve) => {
      const onInitialized = (ev: MessageEvent) => {
        if (!ev.data) return;
        const data = ev.data as Kernel.Response;
        if (data.type === "initialized") {
          worker.removeEventListener("message", onInitialized);
          resolve();
        }
      };
      worker.addEventListener("message", onInitialized);
      worker.postMessage(payload);
    });
  }

  interrupt() {
    this.asyncMemory.interrupt();
  }

  clearInterrupt() {
    this.asyncMemory.clearInterrupt();
  }

  run(code: string, on?: Run.On): Run.Job;
  run(request: { code: string; path?: string; on?: Run.On }): Run.Job;
  run(
    arg: string | { code: string; path?: string; on?: Run.On },
    on?: Run.On,
  ): Run.Job {
    const code = typeof arg === "string" ? arg : arg.code;
    on ??= typeof arg !== "string" ? arg.on : undefined;

    const path =
      typeof arg === "string"
        ? defaultPath(this.environment)
        : (fromRoot(this.environment, arg.path ?? "temp.py") ??
          defaultPath(this.environment));

    const { worker, ready, runChain, callbacks } = this;

    const done = flatPromise();

    const alreadyRunning = runChain.catch((_) => 0);
    this.runChain = done.promise;

    let executing = false;
    let doExecute = true;

    const interrupt = () => {
      if (executing) {
        this.interrupt();
        done.resolve();
      } else doExecute = false;
    };

    const result = new Promise<Output.Specific[]>(async (resolve) => {
      const outputs = new Array<Output.Specific>();
      try {
        await ready;
        await alreadyRunning;

        if (!doExecute) return resolve(outputs);

        callbacks.output = (output) => {
          outputs.push(output);
          on?.output?.(output);
        };

        this.clearInterrupt();
        on?.start?.();
        const loaded = new Promise<void>(
          (resolve) => (callbacks.loaded = resolve),
        );

        const finished = new Promise<void>(
          (resolve) => (callbacks.finished = resolve),
        );

        worker.postMessage({
          code,
          type: "run",
          file: path,
        } satisfies Kernel.Request);

        await loaded;
        if (!doExecute) return resolve(outputs);
        await finished;

        executing = true;
      } catch (e: any) {
        callbacks.output?.(
          form("error", {
            ename: e.name,
            evalue: e.message,
            traceback: e.stack ? e.stack.split("\n") : [],
          }),
        );
      } finally {
        done.resolve();
        on?.complete?.(outputs);
        resolve(outputs);
      }
    });

    return { interrupt, result };
  }

  dispose() {
    this.worker.terminate();
    this.asyncMemory.dispose();
  }

  static DefaultEnvironment = ({
    log = false,
    root = "/home/pyodide",
    input = (prompt: string) => window.prompt(prompt) ?? "",
  }: {
    log?: boolean;
    root?: string;
    input?: (prompt: string) => string;
  } = {}): Environment => ({
    input,
    fs: {
      root,
      get(opts: { path: string }) {
        if (log) console.log("fs.get invoked with:", opts);
        return { ok: true as const, data: null };
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
    },
  });

  static Default = () => new PythonKernel(PythonKernel.DefaultEnvironment());
}
