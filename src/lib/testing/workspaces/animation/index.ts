import type { Workspace } from "../../workspace";
import { MAGIC, startsWith } from "../../outputs";

export const after: Workspace.After = ({ stdout, files, expect }) => {
  expect(stdout).toContain("Saved animation to simple_animation.gif");
  expect(startsWith(files.get("simple_animation.gif"), MAGIC.gif)).toBe(true);
};
