import type { Workspace } from "../../workspace";

export const entries = ["test/test.py"];

export const after: Workspace.After = ({ stdout, expect }) =>
  expect(stdout).toContain("Problem Set 4 Unit Test Results");
