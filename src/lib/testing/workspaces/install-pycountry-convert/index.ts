import type { Workspace } from "../../workspace";

/** Install first, then prove the installed package is importable. */
export const entries = ["main.py", "use.py"];

/** micropip narrates the install on stdout, so only the second run is checked. */
export const after: Workspace.After = ({ runs, expect }) =>
  expect(runs.at(-1)?.stdout.trim()).toBe("NA");
