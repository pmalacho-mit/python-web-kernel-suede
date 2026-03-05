<script lang="ts" module>
  import "@codingame/monaco-vscode-python-default-extension";
  import {
    RegisteredFileSystemProvider,
    registerFileSystemOverlay,
    RegisteredMemoryFile,
  } from "@codingame/monaco-vscode-files-service-override";
  import {
    LanguageClientWrapper,
    MonacoEditorLanguageClientWrapper,
    type CodePlusUri,
  } from "monaco-editor-wrapper";
  import {
    BrowserMessageReader,
    BrowserMessageWriter,
  } from "vscode-languageserver-protocol/browser.js";
  import { CloseAction, ErrorAction } from "vscode-languageclient";
  import { useWorkerFactory } from "monaco-editor-wrapper/workerFactory";
  import * as monaco from "monaco-editor";
  import { MonacoBinding } from "y-monaco";
  import { untrack } from "svelte";
  import type { EditableFile } from "./models.svelte";
  import { join, singletonify } from "./utils";
  import { EditorWorker, getPyrightWorker } from "./workers";
  import { types } from "./typeshed";

  const initServices = async () => {
    const editor = new MonacoEditorLanguageClientWrapper();
    await editor.init({
      wrapperConfig: {
        editorAppConfig: {
          $type: "extended",
          codeResources: {},
          useDiffEditor: false,
        },
      },
    });
    await editor.dispose();
  };

  type Diagnostic = {
    code: { value: string };
    range: { start: { line: number } };
  };
  const filterUnusedClosingStatement = (
    uri: monaco.Uri,
    diagnostics: Diagnostic[],
    model?: monaco.editor.ITextModel,
    lines?: string[],
  ) => {
    model ??= monaco.editor.getModel(uri)!;
    lines ??= model.getLinesContent();
    let lineCount = lines.length;
    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i].trim() === "") lineCount--;
      else break;
    }
    return diagnostics.filter((diagnostic) => {
      // TODO: These should likely all be configurable based on path / extension
      if (!diagnostic.code || !diagnostic.code.value) return true;
      if (diagnostic.code.value === "reportUnusedExpression")
        return diagnostic.range.start.line + 1 !== lineCount;
      if (diagnostic.code.value === "reportUndefinedVariable") return false;
      return true;
    });
  };

  const createLanguageClient = async (workspaceUri: monaco.Uri) => {
    await initServices();
    const pyrightWorker = getPyrightWorker();
    pyrightWorker.postMessage({ type: "browser/boot", mode: "foreground" });

    const reader = new BrowserMessageReader(pyrightWorker);
    const writer = new BrowserMessageWriter(pyrightWorker);
    const wrapper = new LanguageClientWrapper();

    await wrapper.init({
      languageClientConfig: {
        name: "Pyright Language Client",
        languageId: "python",
        options: {
          $type: "WorkerDirect",
          worker: pyrightWorker,
        },
        clientOptions: {
          documentSelector: ["python"],
          middleware: {
            handleDiagnostics: (uri, diagnostics, next) => {
              const model = monaco.editor.getModel(uri);
              if (!model) return next(uri, diagnostics);
              const lines = model.getLinesContent();
              diagnostics = filterUnusedClosingStatement(
                uri,
                diagnostics,
                model,
                lines,
              );
              next(uri, diagnostics);
            },
          },
          workspaceFolder: {
            index: 0,
            name: "workspace",
            uri: workspaceUri,
          },
          initializationOptions: {
            files: await types(),
          },
          errorHandler: {
            error: () => ({ action: ErrorAction.Continue }),
            closed: () => ({ action: CloseAction.DoNotRestart }),
          },
        },
        connectionProvider: {
          get: () => Promise.resolve({ reader, writer }),
        },
      },
    });
    await wrapper.start();
    const client = wrapper.getLanguageClient();
    if (!client) throw new Error("Language client not found");

    return client;
  };

  const createWorkspace = () => {
    useWorkerFactory({
      ignoreMapping: true,
      workerLoaders: { editorWorkerService: () => new EditorWorker() },
    });
    const uri = monaco.Uri.parse("/workspace");
    const filesystem = new RegisteredFileSystemProvider(false);
    registerFileSystemOverlay(1, filesystem);
    return { uri, filesystem };
  };

  class FileRegistry {
    private map = new Map<string, CodePlusUri>();

    async register({
      path,
      source: text,
    }: Pick<EditableFile, "path" | "source">) {
      const registered = this.map.get(path);
      if (registered) {
        registered.text = text;
        return registered;
      }

      const { workspace, languageClientPromise } = singleton;
      const file = new RegisteredMemoryFile(uri(path), text);
      workspace.filesystem.registerFile(file);
      const resource = { uri: file.uri.toString(), text };
      const languageClient = await languageClientPromise;
      await languageClient.sendNotification("pyright/createFile", resource);
      this.map.set(path, resource);
      return resource;
    }

    async unregister(path: string) {
      if (!path) return;
      const registration = this.map.get(path);
      if (!registration) return;
      const { workspace, languageClientPromise } = singleton;
      const languageClient = await languageClientPromise;
      const _uri = uri(path);
      const payload = { uri: _uri.toString() };
      await Promise.all([
        languageClient.sendNotification("pyright/deleteFile", payload),
        workspace.filesystem.delete(_uri),
      ]);
      this.map.delete(path);
    }

    async rename(file: EditableFile, oldPath: string) {
      return Promise.all([this.register(file), this.unregister(oldPath)]);
    }
  }

  export const singleton = singletonify({
    registry: () => new FileRegistry(),
    workspace: createWorkspace,
    languageClientPromise: () => createLanguageClient(singleton.workspace.uri),
  });

  const uri = (path: string) =>
    monaco.Uri.parse(join(singleton.workspace.uri.path, path));

  export type OnEditor = (
    editor: monaco.editor.IStandaloneCodeEditor,
  ) => monaco.IDisposable;

  const attachEditor = async (
    target: HTMLElement,
    file: Pick<EditableFile, "path" | "source" | "sourceSync">,
    onEditor?: OnEditor,
  ) => {
    const wrapper = new MonacoEditorLanguageClientWrapper();

    await wrapper.initAndStart(
      {
        wrapperConfig: {
          editorAppConfig: {
            $type: "extended",
            useDiffEditor: false,
            codeResources: { main: await singleton.registry.register(file) },
          },
        },
      },
      target,
    );

    const editor = wrapper.getEditor();
    if (!editor) throw new Error("Editor not found");

    const onEditorDisposable = onEditor?.(editor);

    const model = editor.getModel();

    if (!model) throw new Error("Model not found");

    const onChangeContentDisposable = model.onDidChangeContent(() => {
      if (file.sourceSync) return;
      file.source = model.getValue();
    });

    const dispose = () => {
      onEditorDisposable?.dispose();
      onChangeContentDisposable.dispose();
      wrapper.dispose();
    };

    return { model, editor, dispose };
  };

  export type Props = {
    file: EditableFile;
    size?: number;
    readonlyOverride?: boolean;
    onEditor?: OnEditor;
  };
</script>

<script lang="ts">
  let { file, onEditor, readonlyOverride = false, size = 14 }: Props = $props();

  let container = $state<HTMLElement>();
  let current = $state<ReturnType<typeof attachEditor>>();

  $effect(() => {
    if (!container) return;
    const { path: _ } = file;
    const child = document.createElement("div");
    child.style.width = "100%";
    child.style.height = "100%";
    container.appendChild(child);
    const handle = untrack(() => attachEditor(child, file, onEditor));
    current = handle;
    return () => {
      handle.then(({ dispose }) => dispose());
      container?.removeChild(child);
    };
  });

  $effect(() => {
    const { readonly } = file;
    const readOnly = readonlyOverride || readonly;
    current?.then(({ editor }) => editor.updateOptions({ readOnly }));
  });

  $effect(() => {
    const fontSize = size;
    current?.then(({ editor }) => editor.updateOptions({ fontSize }));
  });

  $effect(() => {
    const { sourceSync } = file;
    if (!sourceSync) return;
    let dispose: (() => void) | null = null;
    current?.then(({ model, editor }) => {
      const binding = new MonacoBinding(sourceSync, model, new Set([editor]));
      dispose = () => binding.destroy();
    });
    return () => dispose?.();
  });
</script>

<div style:width="100%" style:height="100%" bind:this={container}></div>
