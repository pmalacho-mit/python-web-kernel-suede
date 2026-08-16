import type { Workspace } from "../../workspace";

export const after: Workspace.After = ({ stdout, expect }) =>
  expect(stdout.trim()).toBe("Hello world");
