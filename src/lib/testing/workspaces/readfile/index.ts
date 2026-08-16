import type { Workspace } from "../../workspace";

export const after: Workspace.After = ({ stdout, files, expect }) =>
  expect(stdout.trim()).toBe(files.get("example.txt"));
