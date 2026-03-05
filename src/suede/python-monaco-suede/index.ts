import { EditableFile } from "./models.svelte";
import { default as EditorComponent, singleton } from "./Editor.svelte";

export const Editor = {
  Component: EditorComponent,
  Model: EditableFile,
  registerFile: (params: Parameters<typeof singleton.registry.register>[0]) =>
    singleton.registry.register(params),
  unregisterFile: (
    params: Parameters<typeof singleton.registry.unregister>[0],
  ) => singleton.registry.unregister(params),
  renameFile: (...args: Parameters<typeof singleton.registry.rename>) =>
    singleton.registry.rename(...args),
};

export namespace Editor {
  export type Model = EditableFile;
  export type Component = EditorComponent;
}
