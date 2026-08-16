import type { Workspace } from "../../workspace";
import { resultsIn } from "../../outputs";

export const after: Workspace.After = ({ outputs, expect }) =>
  expect(resultsIn(outputs).at(0)?.html).toContain("Alice");
