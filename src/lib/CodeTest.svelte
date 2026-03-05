<script lang="ts" module>
  interface Filesystem {
    [name: string]: string | Filesystem;
  }

  const root = { path: "" } as const;

  const tryAddExtension = (name: string) =>
    /\.[^./]+$/.test(name) ? name : `${name}.py`;

  const walk = (
    fs: Filesystem,
    models?: {
      model: Editor.Model;
      parent: { path: string };
      type: "file" | "directory";
    }[],
    parent?: { path: string },
  ) => {
    models ??= [];
    parent ??= root;
    for (const [name, value] of Object.entries(fs))
      if (typeof value === "string")
        models.push({
          parent,
          model: new Editor.Model({
            name: tryAddExtension(name),
            parent,
            source: value,
          }),
          type: "file",
        });
      else {
        const model = new Editor.Model({ name, parent, source: "" });
        models.push({ parent, model, type: "directory" });
        walk(value, models, model);
      }
    return models;
  };
</script>

<script lang="ts">
  import { type Output, snippets, Kernel } from "../../release";
  import { GridView, type PanelProps } from "../suede/dockview-svelte-suede";
  import { Editor } from "../suede/python-monaco-suede";
  import "dockview-core/dist/styles/dockview.css";

  let { fs }: { fs: Filesystem } = $props();

  const outputs: Output.Any[] = $state([]);
  let runningCount = $state(0);
  const isRunning = $derived(runningCount > 0);
</script>

{#snippet output({ params }: PanelProps<"grid", { outputs: Output.Any[] }>)}
  <div class="flex h-full w-full flex-col gap-3 bg-slate-50 p-3">
    <div class="text-xs font-semibold uppercase tracking-wide text-slate-500">
      Output
    </div>
    <div
      class="relative grow w-full overflow-auto rounded-lg border border-slate-200 bg-white p-2 shadow-sm"
    >
      {#each params.outputs as output}
        {@render snippets.output.any(output)}
      {/each}

      {#if isRunning}
        <div
          class="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-white/60 backdrop-blur-[1px]"
          role="status"
          aria-live="polite"
        >
          <div
            class="flex items-center gap-2 rounded-md border border-slate-200 bg-white/90 px-3 py-2 text-sm text-slate-700 shadow-sm"
          >
            <span
              class="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700"
            ></span>
            <span>Running code...</span>
          </div>
        </div>
      {/if}
    </div>
    <div class="w-full">
      <button
        class="w-full rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
        onclick={() => (params.outputs.length = 0)}
      >
        Clear
      </button>
    </div>
  </div>
{/snippet}

{#snippet code({
  params,
}: PanelProps<
  "grid",
  { file: Editor.Model; run: (file: Editor.Model) => void }
>)}
  <div class="flex h-full w-full flex-col bg-white">
    <div
      class="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-50 p-3"
    >
      <div class="flex min-w-0 grow items-center gap-2">
        <span class="shrink-0 text-xs font-medium text-slate-500">Path:</span>
        <span class="min-w-0 grow truncate text-xs text-slate-700"
          >{params.file.path}</span
        >
        <input
          type="text"
          bind:value={params.file.name}
          class="w-48 min-w-28 max-w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-800 shadow-sm outline-none ring-0 transition focus:border-slate-500"
        />
      </div>
      <button
        class="ml-auto shrink-0 rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-indigo-500"
        onclick={() => params.run(params.file)}
      >
        Run
      </button>
    </div>
    <div class="min-h-0 grow">
      <Editor.Component {...params} />
    </div>
  </div>
{/snippet}

{#snippet image({
  params: { file, kernel },
}: PanelProps<"grid", { file: Editor.Model; kernel: Kernel }>)}
  {@const src = kernel.assetURL({ value: file.source, path: file.path })}
  <div class="flex h-full w-full items-center justify-center bg-slate-50">
    {#if src}
      <img
        {src}
        alt={file.name}
        class="max-h-full max-w-full rounded-lg border border-slate-200 bg-white p-2 shadow-sm"
      />
    {/if}
  </div>
{/snippet}

{#snippet directories({
  params,
}: PanelProps<"grid", { directories: Editor.Model[] }>)}
  <div class="flex h-full w-full flex-col gap-2 overflow-auto bg-slate-50 p-3">
    <div class="text-xs font-semibold uppercase tracking-wide text-slate-500">
      Directories
    </div>
    {#each params.directories as directory}
      <input
        type="text"
        bind:value={directory.name}
        class="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm outline-none transition focus:border-slate-500"
      />
    {/each}
  </div>
{/snippet}

<div class="h-screen w-screen bg-slate-100">
  <GridView
    orientation="HORIZONTAL"
    snippets={{
      code,
      output,
      directories,
      image,
    }}
    onReady={({ api }) => {
      const models = walk(fs);
      const directories = models
        .filter((m) => m.type === "directory")
        .map((m) => m.model);

      if (directories.length > 0)
        api.addSnippetPanel("directories", { directories });

      const run = (file: Editor.Model) => {
        kernel.run({
          code: file.source,
          path: file.path,
          on: {
            start: () => {
              runningCount += 1;
            },
            output: (output) => outputs.push(output),
            complete: () => {
              runningCount = Math.max(0, runningCount - 1);
            },
          },
        });
      };

      const addPanel = (file: Editor.Model) => {
        const details = { id: file.path };
        if (file.name.endsWith(".png"))
          api.addSnippetPanel("image", { file, kernel }, details);
        else if (file.name.endsWith(".gif"))
          api.addSnippetPanel("image", { file, kernel }, details);
        else api.addSnippetPanel("code", { file, run }, details);
      };

      const kernel = new Kernel(
        Kernel.Environment({
          fs: Kernel.ReadWriteFileSystem({
            removeLeadingSlash: false,
            log: true,
            get: (path) =>
              models.find(({ model }) => model.path === path)?.model.source ??
              null,
            put: (path, source) => {
              console.log("Putting file:", path, source);
              if (!path.startsWith("/")) path = "/" + path;
              const existing = models.find(({ model }) => model.path === path);

              if (existing) {
                const panel = api.getPanel(path);
                if (panel) api.removePanel(panel);
                if (source === null) models.splice(models.indexOf(existing), 1);
                else {
                  existing.model.source = source;
                  addPanel(existing.model);
                }
              } else {
                source ??= "";
                const parts = path.split("/");
                const name = parts.pop()!;
                const dirname = parts.join("/");

                const parent =
                  dirname === root.path
                    ? root
                    : (models.find(({ model }) => model.path === dirname)
                        ?.model ?? root);
                const file = new Editor.Model({ name, parent, source });
                models.push({ parent, model: file, type: "file" });
                addPanel(file);
              }
            },
            listDirectory: (path) =>
              path === "/"
                ? models
                    .filter(({ parent }) => parent === root)
                    .map(({ model }) => model.name)
                : models
                    .filter(
                      ({ parent, type }) =>
                        parent.path === path && type === "directory",
                    )
                    .map(({ model }) => model.name),
          }),
        }),
      );

      for (const { model, type } of models)
        if (type === "file") addPanel(model);

      api.addSnippetPanel("output", { outputs });
    }}
  />
</div>

<style>
  :global(body) {
    margin: 0;
    padding: 0;
  }
</style>
