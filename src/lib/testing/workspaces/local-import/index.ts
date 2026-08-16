import type { Workspace } from "../../workspace";

/** Each entry imports a sibling from a different level of the tree. */
export const entries = [
  "fromchild.py",
  "parentlevel.py",
  "child/fromparent.py",
  "child/childlevel.py",
];

const imported = { "fromchild.py": "child", "parentlevel.py": "parent", "child/fromparent.py": "parent", "child/childlevel.py": "child" };

export const after: Workspace.After = ({ runs, expect }) =>
  expect(Object.fromEntries(runs.map(({ entry, stdout }) => [entry, stdout.trim()]))).toEqual(imported);
