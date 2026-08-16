import {
  Kernel,
  type Awaitable,
  type Contents,
  type Output,
} from "../../../release";

export type Files = Map<string, Contents>;

export type HarnessOptions = {
  /** Files the kernel starts with, keyed by their path under the mount root. */
  files?: Record<string, Contents>;
  /**
   * Answer every filesystem question with a promise, so tests prove Python
   * waits for the main thread rather than racing it.
   */
  delayed?: boolean;
  input?: (prompt: string) => Awaitable<string>;
  /** Paths the host refuses to read, so failures can be observed from Python. */
  refuses?: (path: string) => boolean;
  /**
   * Where Pyodide comes from. The bundled copy starts instantly but ships no
   * packages; the CDN copy has everything and is what production uses.
   */
  pyodide?: "bundled" | "cdn";
};

/** The copy Vite already serves, so tests need not wait on a CDN. */
const bundledPyodide = new URL("/node_modules/pyodide/", location.origin).href;

const delay = <T>(value: T, milliseconds = 10) =>
  new Promise<T>((resolve) => setTimeout(() => resolve(value), milliseconds));

const segmentsUnder = (paths: string[], directory: string) => {
  const prefix = directory === "" ? "" : `${directory}/`;
  return paths
    .filter((path) => path.startsWith(prefix))
    .map((path) => path.slice(prefix.length).split("/")[0]);
};

/** A kernel backed by a plain map, which the test can read and write directly. */
export const inMemoryKernel = ({
  files = {},
  delayed = false,
  input = () => "",
  refuses = () => false,
  pyodide = "bundled",
}: HarnessOptions = {}) => {
  const store: Files = new Map(Object.entries(files));
  const answer = <T>(value: T): Awaitable<T> =>
    delayed ? delay(value) : value;

  const isDirectory = (path: string) =>
    path === "" || [...store.keys()].some((key) => key.startsWith(`${path}/`));

  const fs = Kernel.ReadWriteFileSystem({
    get: (path) =>
      refuses(path)
        ? Promise.reject(new Error(`the host refuses to read ${path}`))
        : answer(
            store.get(path) ??
              (isDirectory(path) ? { directory: true } : undefined),
          ),
    listDirectory: (path) =>
      answer(
        isDirectory(path)
          ? [...new Set(segmentsUnder([...store.keys()], path))]
          : undefined,
      ),
    put: (path, value) =>
      answer(
        value === null ? void store.delete(path) : void store.set(path, value),
      ),
    delete: (path) => answer(void store.delete(path)),
  });

  const indexURL = pyodide === "bundled" ? bundledPyodide : undefined;

  return {
    store,
    kernel: new Kernel(Kernel.Environment({ fs, input, indexURL })),
  };
};

const streamed = (outputs: Output.Specific[], name: "stdout" | "stderr") =>
  outputs
    .filter(
      (output): output is Output.Stream =>
        output.output_type === "stream" && output.name === name,
    )
    .map((output) => output.text)
    .join("\n");

/** Runs code and separates what Python printed from how it failed. */
export const run = async (
  kernel: Kernel,
  code: string,
  path = "main.py",
  options: { unloadLocalModules?: boolean } = {},
) => {
  const outputs = await kernel.run({ code, path, ...options }).result;
  const errors = outputs.filter(
    (output): output is Output.Error => output.output_type === "error",
  );
  return {
    outputs,
    errors,
    stdout: streamed(outputs, "stdout"),
    stderr: streamed(outputs, "stderr"),
    /** The failure Python reported, so a broken test says why it broke. */
    failure: errors.map((e) => `${e.ename}: ${e.evalue}`).join("\n"),
  };
};

/** Fails with a message rather than hanging the suite when nothing settles. */
export const within = <T>(
  milliseconds: number,
  work: Promise<T>,
  what: string,
) =>
  Promise.race([
    work,
    new Promise<never>((_, reject) =>
      setTimeout(
        () =>
          reject(new Error(`${what} did not finish within ${milliseconds}ms`)),
        milliseconds,
      ),
    ),
  ]);

export const textOf = (output: Output.Specific) =>
  output.output_type === "stream" ? String(output.text) : "";

export const bytes = {
  all: Uint8Array.from({ length: 256 }, (_, index) => index),
  pattern: (length: number) =>
    Uint8Array.from({ length }, (_, index) => (index * 13 + 7) % 256),
  digest: (value: Uint8Array | undefined) => ({
    length: value?.byteLength,
    checksum: value?.reduce(
      (sum, byte, i) => (sum + byte * (i + 1)) % 2 ** 32,
      0,
    ),
  }),
};

export const loadImage = (src: string) =>
  new Promise<{ width: number; height: number }>((resolve, reject) => {
    const image = new Image();
    image.onload = () =>
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error("the browser could not decode it"));
    image.src = src;
  });
