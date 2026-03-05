declare const PYTHON_MONACO_BASE: string;

export const base = (() => {
  let base = PYTHON_MONACO_BASE ?? "";
  if (!base.endsWith("/")) base += "/";
  return base;
})();

export const fromConfiguredBase = (path: string) => base + path;
