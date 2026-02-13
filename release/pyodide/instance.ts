import type { Kernel } from "../worker/kernel-worker";
import { EMFS } from "../worker/emscripten-fs";
import { patchMatplotlib, is as image } from "./matplotlib";
import { loadPyodide, version, type PyodideAPI } from "pyodide";
import { make, type Output } from "../output";

const Char = {
  NewLine: 10,
} as const;

const io = (
  manager: Kernel,
): {
  [k in "stdin" | "stdout" | "stderr"]: Parameters<
    PyodideAPI[`set${Capitalize<k>}`]
  >[0];
} => {
  let acc = "";

  const encoder = new TextEncoder();
  let input = new Uint8Array();
  let inputIndex = -1; // -1 means that we just returned null
  const stdin = () => {
    if (inputIndex === -1) {
      const text = manager.input(acc);
      input = encoder.encode(text + (text.endsWith("\n") ? "" : "\n"));
      inputIndex = 0;
    }

    if (inputIndex < input.length) {
      let character = input[inputIndex];
      inputIndex++;
      return character;
    } else {
      inputIndex = -1;
      return null;
    }
  };

  const raw = (charCode: number) => {
    if (charCode === Char.NewLine) {
      console.log(acc);
      manager.output(make("stream", "out", acc));
      acc = "";
    } else acc += String.fromCharCode(charCode);
  };

  const batched = (output: string) => {
    console.error(output);
    manager.output(make("stream", "err", output));
  };

  return { stdin: { stdin }, stdout: { raw }, stderr: { batched } };
};

export class PyodideInstance {
  readonly globalThisId: string;
  readonly interruptBuffer: Uint8Array<ArrayBufferLike>;

  proxiedGlobalThis: undefined | any;

  pyodide: PyodideAPI | undefined = undefined;

  constructor(options: {
    globalThisId: string;
    interruptBuffer: Uint8Array<ArrayBufferLike>;
  }) {
    this.globalThisId = options.globalThisId;
    this.interruptBuffer = options.interruptBuffer;
  }

  async init(manager: Kernel, root: string): Promise<any> {
    this.proxiedGlobalThis = this.proxyGlobalThis(manager, this.globalThisId);

    const indexURL = `https://cdn.jsdelivr.net/pyodide/v${version}/full/`;

    this.pyodide = await loadPyodide({
      indexURL,
      fullStdLib: false,
    });

    const { stdin, stdout, stderr } = io(manager);

    this.pyodide.setStdin(stdin);
    this.pyodide.setStdout(stdout);
    this.pyodide.setStderr(stderr);

    await patchMatplotlib(this.pyodide);

    this.pyodide.setInterruptBuffer(this.interruptBuffer);

    try {
      this.pyodide.FS.mkdirTree(root);
    } catch (e) {
      console.error("Error creating mount directory in FS", e, root);
    }

    this.pyodide.FS.mount(new EMFS(this.pyodide, manager.syncFs), {}, root);
    this.pyodide.registerJsModule("js", this.proxiedGlobalThis);
  }

  async load(code: string): Promise<void> {
    if (!this.pyodide) {
      console.warn("Worker has not yet been initialized");
      return;
    }

    // We prevent some spam, otherwise every time you run a cell with an import it will show
    // "Loading bla", "Bla was already loaded from default channel", "Loaded bla"
    let wasAlreadyLoaded: boolean | undefined = undefined;
    let msgBuffer: string[] = [];

    this.pyodide.setInterruptBuffer(undefined as any); // Disable interrupts while loading packages

    await this.pyodide.loadPackagesFromImports(code, {
      messageCallback: (msg) => {
        if (wasAlreadyLoaded === true) return;

        if (msg.match(/Loaded.*\smatplotlib/)) {
          console.debug("Hooking matplotlib output to Starboard");
          patchMatplotlib(this.pyodide!);
        }

        if (wasAlreadyLoaded === false) {
          if (msg.match(/already loaded from default channel$/)) {
            return; // This is not the main package being loaded but another dependency that is
            // already loaded - no need to list it.
          }
          console.debug(msg);
        }

        if (wasAlreadyLoaded === undefined) {
          if (msg.match(/already loaded from default channel$/)) {
            wasAlreadyLoaded = true;
            return;
          }
          if (msg.match(/^Loading [a-z\-, ]*/)) {
            wasAlreadyLoaded = false;
            msgBuffer.forEach((m) => console.debug(m));
            console.debug(msg);
          }
        }
      },
    });
  }

  async runCode(
    code: string,
    filename: string,
  ): Promise<Output.Specific | undefined | void> {
    if (!this.pyodide)
      return console.warn("Worker has not yet been initialized");

    let result = await this.pyodide
      .runPythonAsync(code, { filename })
      .catch((error) => error);

    if (result === undefined || result === null) return;
    else if (result instanceof this.pyodide.ffi.PyProxy) {
      if (result._repr_html_ !== undefined) {
        const html = result._repr_html_();
        this.destroyToJsResult(result);
        return make("execute_result", "html", html);
      } else if (result._repr_latex_ !== undefined) {
        const latex = result._repr_latex_();
        this.destroyToJsResult(result);
        return make("execute_result", "latex", latex);
      } else if (image(result.toJs({ dict_converter: Object.fromEntries }))) {
        const jsResult = result.toJs({ dict_converter: Object.fromEntries });
        console.log("image result", jsResult);
        result.destroy();
        return make("display_data", "image", jsResult);
      } else {
        const str = result.__str__();
        this.destroyToJsResult(result);
        return make("execute_result", "plain", str);
      }
    } else if (result instanceof this.pyodide.ffi.PythonError) {
      const { message, type } = result;
      const ename = type;
      const evalue = message.split(`${type}: `)[1]?.trim() ?? "";
      const lines = message.split("\n");
      const firstFileLine = lines.findIndex((line) => line.includes(filename))!;
      const traceback = lines.slice(firstFileLine);
      traceback.splice(0, 0, lines[0]); // Add the error type/message at the start
      return make("error", { ename, evalue, traceback });
    } else return make("execute_result", "plain", String(result));
  }

  private proxyGlobalThis(manager: Kernel, id?: string) {
    // Special cases for the globalThis object. We don't need to proxy everything
    const noProxy = new Set<string | symbol>([
      "location",
      // Proxy navigator, however, some navigator properties do not have to be proxied
      // "navigator",
      "self",
      "importScripts",
      "addEventListener",
      "removeEventListener",
      "caches",
      "crypto",
      "indexedDB",
      "isSecureContext",
      "origin",
      "performance",
      "atob",
      "btoa",
      "clearInterval",
      "clearTimeout",
      "createImageBitmap",
      "fetch",
      "queueMicrotask",
      "setInterval",
      "setTimeout",

      // Special cases for the pyodide globalThis
      "$$",
      "pyodide",
      "__name__",
      "__package__",
      "__path__",
      "__loader__",

      // Pyodide likes checking for lots of properties, like the .stack property to check if something is an error
      // https://github.com/pyodide/pyodide/blob/c8436c33a7fbee13e1ded97c0bbdaa7d635f2745/src/core/jsproxy.c#L1631
      "stack",
      "get",
      "set",
      "has",
      "size",
      "length",
      "then",
      "includes",
      "next",
      Symbol.iterator,
    ]);

    return manager.proxy && id
      ? manager.proxy.wrapExcluderProxy(
          manager.proxy.getObjectProxy(id),
          globalThis,
          noProxy,
        )
      : globalThis;
  }

  private destroyToJsResult<T>(x: T): T {
    if (!this.pyodide || !x) return x;
    if (x instanceof this.pyodide.ffi.PyProxy) x.destroy();
    return x;
  }
}
