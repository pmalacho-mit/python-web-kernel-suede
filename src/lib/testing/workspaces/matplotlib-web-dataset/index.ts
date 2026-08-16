import type { Workspace } from "../../workspace";
import { imagesIn } from "../../outputs";

export const after: Workspace.After = ({ outputs, expect }) =>
  expect(imagesIn(outputs).length).toBeGreaterThan(0);
