import type { Workspace } from "../../workspace";

export const entries = ["test_ps3_student.py"];

/** unittest reports through stderr. */
export const after: Workspace.After = ({ stderr, expect }) =>
  expect(stderr).toContain("Ran ");
