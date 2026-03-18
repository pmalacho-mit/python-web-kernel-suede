import type { PyodideAPI } from "pyodide";
import { code } from "./python";

const Key = {
  MatplotLibEmit: "__python_web_kernel_emit_matplotlib",
} as const;

export type ImagePayload = {
  base64: string;
  format: "png" | "gif";
  width: number;
  height: number;
};

export const isImage = (query: any): query is ImagePayload =>
  typeof query === "object" &&
  query !== null &&
  typeof query.base64 === "string" &&
  typeof query.width === "number" &&
  typeof query.height === "number";

export const asImage = (payload: any) => {
  const image = payload.toJs({ dict_converter: Object.fromEntries });
  if (!isImage(image)) return;
  payload.destroy();
  return image;
};

export const patchMatplotlib = async (
  pyodide: PyodideAPI,
  onImage: (payload: ImagePayload) => void,
) => {
  pyodide.globals.set(Key.MatplotLibEmit, (payload: unknown) => {
    const image = asImage(payload);
    if (image) onImage(image);
  });
  await pyodide.loadPackage("matplotlib");
  await pyodide.runPythonAsync(code.patchMatplotlib);
};

export const unloadLocalModules = async (pyodide: PyodideAPI, root: string) => {
  const unloaded = await pyodide.runPythonAsync(code.unloadLocalModules(root));
  const report: string = unloaded.__str__();
  if (unloaded instanceof pyodide.ffi.PyProxy) unloaded.destroy();
  return report;
};

export const tryResolveProblematicDependencies = async (
  pyodide: PyodideAPI,
  loadedPackages: Set<string>,
) => {
  if (loadedPackages.has("networkx")) await pyodide.loadPackage("scipy");
};
