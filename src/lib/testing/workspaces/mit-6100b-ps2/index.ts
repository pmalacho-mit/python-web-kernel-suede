import type { Workspace } from "../../workspace";

export const entries = ["test_ps2_student.py"];

export const after: Workspace.After = ({ stdout, expect }) =>
  expect(stdout).toContain("Problem Set 2 Unit Test Results");
