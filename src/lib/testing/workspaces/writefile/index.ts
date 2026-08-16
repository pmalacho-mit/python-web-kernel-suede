import type { Workspace } from "../../workspace";

export const before: Workspace.Before = ({ files }) => {
  files.delete("example.txt");
};

export const after: Workspace.After = ({ files, expect }) =>
  expect(files.get("example.txt")).toBe("Hello, world!");
