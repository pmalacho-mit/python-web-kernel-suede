/// <reference types="vite/client" />

import KernelWorker from "./worker/kernel-worker?worker";
import { AsyncMemory } from "./worker/async-memory";
import { ObjectProxyHost } from "./worker/object-proxy";
import type { Kernel } from "./worker/kernel-worker";
import type { SyncFileSystem } from "./worker/emscripten-fs";
import { flatPromise, toBase64, type Expand } from "./utils";
import { type Output, make } from "./output";
import fs from "./fs";

export type Environment = {
  /**
   * Synchronous filesystem bridge exposed to the Python worker, including its mount root.
   */
  fs: SyncFileSystem & {
    /**
     * The root path that the filesystem is mounted at in the Python environment.
     */
    root: string;
  };
  /** Prompt handler used when Python requests user input. */
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

/** Resolve a path relative to the configured filesystem root. */
const fromRoot = ({ fs: { root } }: Environment, path: string) =>
  root.endsWith("/")
    ? root + path.replace(/^\/+/, "")
    : root + "/" + path.replace(/^\/+/, "");

/** Default filename used when code is executed without an explicit path. */
const defaultPath = (env: Environment) => fromRoot(env, "temp.py");

/** Attach worker message handling for proxy traffic and kernel lifecycle events. */
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

  private operationChain = Promise.resolve();

  /**
   * Reserve a turn in the serialized operation queue and return both the
   * previous operation and the completion handle for this operation.
   */
  private queueOperation() {
    const done = flatPromise<void>();
    const previous = this.operationChain.catch((_) => 0);
    this.operationChain = done.promise;
    return { previous, done };
  }

  /** Wait for a one-shot worker lifecycle signal. */
  private signal(signal: "loaded" | "finished") {
    return new Promise<void>((resolve) => (this.callbacks[signal] = resolve));
  }

  /** Post a typed kernel request to the worker. */
  private post<T extends keyof Kernel.Requests>(request: Kernel.Request<T>) {
    this.worker.postMessage(request);
  }

  /** Create a kernel instance and initialize worker wiring. */
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
      this.post(payload);
    });
  }

  /** Interrupt the currently executing Python code, if any. */
  interrupt() {
    this.asyncMemory.interrupt();
  }

  /** Clear the interrupt flag before a new operation starts. */
  clearInterrupt() {
    this.asyncMemory.clearInterrupt();
  }

  /**
   * Optimistically preload Python package dependencies for the provided code.
   *
   * This only resolves imports; it does not execute the code body.
   */
  load(code: string, filename?: string): Promise<void> {
    const { previous, done } = this.queueOperation();
    return new Promise<void>(async (resolve) => {
      try {
        await this.ready;
        await previous;
        const loaded = this.signal("loaded");
        const file = filename ?? defaultPath(this.environment);
        this.post({ type: "load", code, file });
        await loaded;
      } finally {
        done.resolve();
        resolve();
      }
    });
  }

  /**
   * Execute Python code, optionally with lifecycle and output callbacks.
   */
  run(code: string, on?: Run.On): Run.Job;
  /**
   * Execute Python code with optional path override and module unload behavior.
   */
  run(request: {
    code: string;
    path?: string;
    on?: Run.On;
    /**
     * Whether to unload local modules before executing the code.
     *
     * This can allow using the kernel to execute local files in a 'fresh' state without having to restart the kernel and/or reload external modules.
     *
     * In this way, the kernel can be used more like a traditional Python execution environment, where executing a file will re-import it and reflect changes to it and its dependencies
     * (while still maintaining the performance benefits of using an already initialized Pyodide instance and preserving already loaded external modules).
     */
    unloadLocalModules?: boolean;
  }): Run.Job;
  /** Run request implementation shared by both overload signatures. */
  run(
    arg:
      | string
      | {
          code: string;
          path?: string;
          on?: Run.On;
          unloadLocalModules?: boolean;
        },
    on?: Run.On,
  ): Run.Job {
    const code = typeof arg === "string" ? arg : arg.code;
    on ??= typeof arg !== "string" ? arg.on : undefined;

    const path =
      typeof arg === "string"
        ? defaultPath(this.environment)
        : (fromRoot(this.environment, arg.path ?? "temp.py") ??
          defaultPath(this.environment));

    const { previous, done } = this.queueOperation();

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
        await this.ready;
        await previous;

        if (!doExecute) return resolve(outputs);

        this.callbacks.output = (output) => {
          outputs.push(output);
          on?.output?.(output);
        };

        this.clearInterrupt();
        on?.start?.();

        const loaded = this.signal("loaded");
        const finished = this.signal("finished");

        this.post({
          type: "run",
          code,
          file: path,
          unloadLocalModules:
            typeof arg === "string" ? false : arg.unloadLocalModules,
        } satisfies Kernel.Request<"run">);

        await loaded;
        if (!doExecute) return resolve(outputs);
        await finished;

        executing = true;
      } catch (e: any) {
        this.callbacks.output?.(
          make("error", {
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

  /** Terminate worker resources and shared memory handles. */
  dispose() {
    this.worker.terminate();
    this.asyncMemory.dispose();
  }

  assetURL(request: { path: string }): string | null;
  assetURL(request: { value: string; path: string }): string | null;
  assetURL(request: { value: string; mimeType: string }): string | null;
  assetURL(request: { path: string } | { value: string; mimeType: string }) {
    if ("value" in request) return PythonKernel.AssetUrl(request);
    else {
      const value = this.environment.fs.get(request);
      const { path } = request;
      if (typeof value !== "string") {
        console.warn(`Asset at path "${path}" not found or is a directory`);
        return null;
      }
      const mimeType = fs.inferMimeType(path);
      return PythonKernel.AssetUrl({ value, mimeType });
    }
  }

  static readonly DefaultFileSystemRoot = fs.defaultRoot;

  /** Default prompt implementation used by the kernel environment. */
  static readonly DefaultInput = (prompt: string) =>
    window.prompt(prompt) ?? "";

  /**
   * In-memory filesystem adapter that returns not-found for reads and no-ops
   * for writes.
   */
  static readonly EmptyFileSystem = fs.empty;

  /**
   * Create a read-only filesystem facade layered on top of an optional base
   * filesystem implementation.
   */
  static readonly ReadOnlyFileSystem = fs.readOnly;

  /**
   * Create a write-only filesystem facade layered on top of an optional base
   * filesystem implementation.
   */
  static readonly WriteOnlyFileSystem = fs.writeOnly;

  /** Create a read-write filesystem facade by composing read-only and write-only adapters. */
  static readonly ReadWriteFileSystem = fs.readWrite;

  static AssetUrl({
    value,
    ...rest
  }: {
    value: string;
  } & ({ path: string } | { mimeType: string })) {
    if (value === null) return null;
    if (value.startsWith("data:")) return value;
    const mimeType =
      "mimeType" in rest ? rest.mimeType : fs.inferMimeType(rest.path);
    return `data:${mimeType};base64,${toBase64(value)}`;
  }

  /** Build an environment with default filesystem and input handlers. */
  static readonly Environment = ({
    fs = PythonKernel.EmptyFileSystem(),
    input = PythonKernel.DefaultInput,
  }: Partial<Environment> = {}): Environment => ({ input, fs });

  /** Construct a kernel with the default environment configuration. */
  static readonly Default = () => new PythonKernel(PythonKernel.Environment());
}
