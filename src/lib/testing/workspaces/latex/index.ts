import type { Workspace } from "../../workspace";
import { resultsIn } from "../../outputs";

/** Sympy hands back latex, which the kernel renders to html on the way out. */
export const after: Workspace.After = ({ outputs, expect }) =>
  expect(resultsIn(outputs).at(0)?.html).toContain("katex");
