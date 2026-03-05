/// <reference types="vite/client" />
/// <reference path="./globals.d.ts" />

export { default as EditorWorker } from "monaco-editor/esm/vs/editor/editor.worker?worker";
import type PyrightWorker from "@typefox/pyright-browser/dist/pyright.worker?worker";

/** @see vite.config.ts for how the pyright.worker.js source is copied to the static assets folder */
export const getPyrightWorker = (): InstanceType<typeof PyrightWorker> =>
  new Worker(
    new URL(PYTHON_MONACO_BASE + "pyright.worker.js", window.location.href),
  );
