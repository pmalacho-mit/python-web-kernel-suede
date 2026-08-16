import type { Awaitable, Contents, Kernel, Output } from "../../../release";
import { inMemoryKernel, run, type Files } from "./kernel";

/**
 * A folder under `workspaces/` is a workspace: the files Python starts with,
 * plus an optional `index.ts` saying what to run and what to expect of it.
 */
export namespace Workspace {
  export type Expect = typeof import("@storybook/test")["expect"];

  export type Context = {
    /** The files Python sees. Anything it writes shows up here too. */
    files: Files;
    kernel: Kernel;
  };

  /** What one entry point produced. */
  export type Run = {
    entry: string;
    outputs: Output.Specific[];
    stdout: string;
    stderr: string;
    errors: Output.Error[];
    failure: string;
  };

  export type Session = Context & {
    runs: Run[];
    outputs: Output.Specific[];
    stdout: string;
    stderr: string;
    errors: Output.Error[];
    failure: string;
  };

  /** Runs before the entry points, with the filesystem already in place. */
  export type Before = (context: Context) => Awaitable<void>;

  /** Runs after them, and is where a workspace says what it expected. */
  export type After = (
    session: Session & { expect: Expect },
  ) => Awaitable<void>;

  export type Module = {
    /**
     * The files to execute, in order. Defaults to `main.py`; a workspace
     * without one has to say what to run.
     */
    entries?: string[];
    before?: Before;
    after?: After;
  };

  export type Definition = {
    name: string;
    text: Map<string, string>;
    assets: Map<string, string>;
    module: Module;
  };
}

const text = import.meta.glob("./workspaces/**/*.{py,txt,csv,json,md}", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const assets = import.meta.glob(
  "./workspaces/**/*.{png,gif,jpg,jpeg,webp,bmp,ico,pdf,wav,mp3,zip,bin}",
  { query: "?url", import: "default", eager: true },
) as Record<string, string>;

const modules = import.meta.glob("./workspaces/*/index.ts", {
  eager: true,
}) as Record<string, Workspace.Module>;

const IN_WORKSPACE = /^\.\/workspaces\/([^/]+)\/(.+)$/;

const located = (key: string) => {
  const [, name, path] = key.match(IN_WORKSPACE) ?? [];
  return name ? { name, path } : undefined;
};

const byWorkspace = <T>(sources: Record<string, T>) => {
  const grouped = new Map<string, Map<string, T>>();
  for (const [key, value] of Object.entries(sources)) {
    const at = located(key);
    if (!at) continue;
    if (!grouped.has(at.name)) grouped.set(at.name, new Map());
    grouped.get(at.name)!.set(at.path, value);
  }
  return grouped;
};

const moduleOf = (name: string) => modules[`./workspaces/${name}/index.ts`] ?? {};

/** Every workspace on disk, in a stable order. */
export const discover = (): Workspace.Definition[] => {
  const text_ = byWorkspace(text);
  const assets_ = byWorkspace(assets);
  const names = [...new Set([...text_.keys(), ...assets_.keys()])].sort();
  return names.map((name) => ({
    name,
    text: text_.get(name) ?? new Map(),
    assets: assets_.get(name) ?? new Map(),
    module: moduleOf(name),
  }));
};

const DEFAULT_ENTRY = "main.py";

/** A workspace either has a `main.py` or says what to run instead. */
const entriesOf = ({ name, text, module }: Workspace.Definition) => {
  const entries = module.entries ?? (text.has(DEFAULT_ENTRY) ? [DEFAULT_ENTRY] : []);
  if (entries.length === 0)
    throw new Error(
      `Workspace "${name}" has no ${DEFAULT_ENTRY} and declares no entries`,
    );
  return entries;
};

const fetchBytes = async (url: string) =>
  new Uint8Array(await (await fetch(url)).arrayBuffer());

const startingFiles = async ({ text, assets }: Workspace.Definition) => {
  const files: Record<string, Contents> = { ...Object.fromEntries(text) };
  for (const [path, url] of assets) files[path] = await fetchBytes(url);
  return files;
};

/** Each workspace needs a Pyodide worker of its own; leave the page a core. */
export const capacity = Math.max(1, (navigator.hardwareConcurrency ?? 2) - 1);

const semaphore = (limit: number) => {
  const waiting: (() => void)[] = [];
  let inUse = 0;

  const acquire = () => {
    if (inUse >= limit)
      return new Promise<void>((resolve) => waiting.push(resolve));
    inUse++;
    return Promise.resolve();
  };

  /** Hands the slot straight to whoever is next, rather than freeing it. */
  const release = () => {
    const next = waiting.shift();
    if (next) next();
    else inUse--;
  };

  return async <T>(work: () => Promise<T>) => {
    await acquire();
    try {
      return await work();
    } finally {
      release();
    }
  };
};

const withWorker = semaphore(capacity);

const sourceOf = (files: Files, entry: string) => {
  const source = files.get(entry);
  if (typeof source !== "string")
    throw new Error(`Entry "${entry}" is not a text file`);
  return source;
};

const summarize = (
  context: Workspace.Context,
  runs: Workspace.Run[],
): Workspace.Session => ({
  ...context,
  runs,
  outputs: runs.flatMap(({ outputs }) => outputs),
  errors: runs.flatMap(({ errors }) => errors),
  stdout: runs.map(({ stdout }) => stdout).join("\n"),
  stderr: runs.map(({ stderr }) => stderr).join("\n"),
  failure: runs
    .map(({ failure }) => failure)
    .filter(Boolean)
    .join("\n"),
});

/**
 * Runs a workspace in a kernel of its own, so nothing one workspace does can
 * be seen by another.
 */
export const execute = (
  definition: Workspace.Definition,
  onRun: (run: Workspace.Run) => void,
) =>
  withWorker(async () => {
    const entries = entriesOf(definition);
    const { kernel, store } = inMemoryKernel({
      files: await startingFiles(definition),
      pyodide: "cdn",
    });
    const context = { kernel, files: store };

    try {
      await definition.module.before?.(context);
      const runs: Workspace.Run[] = [];
      for (const entry of entries) {
        const outcome = {
          entry,
          ...(await run(kernel, sourceOf(store, entry), entry, {
            unloadLocalModules: true,
          })),
        };
        runs.push(outcome);
        onRun(outcome);
      }
      return summarize(context, runs);
    } finally {
      kernel.dispose();
    }
  });
