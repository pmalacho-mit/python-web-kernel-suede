<script lang="ts">
  import CodeTest, { type Filesystem } from "$lib/CodeTest.svelte";
  import main from "./main.py?raw";

  const PREFIX = "/src/routes/arc-line-vectorization/";

  const sources = import.meta.glob(
    "/src/routes/arc-line-vectorization/arc_line_vectorization_suede/**/*.py" satisfies `${typeof PREFIX}${string}`,
    { query: "?raw", import: "default", eager: true },
  ) as Record<string, string>;

  const fs: Filesystem = {
    "main.py": main,
  };
  for (const [path, source] of Object.entries(sources)) {
    console.log(path);
    const segments = path.slice(PREFIX.length).split("/");
    const filename = segments.pop()!;
    console.log(filename, segments);

    let dir = fs;
    for (const segment of segments) {
      if (typeof dir[segment] !== "object") dir[segment] = {};
      dir = dir[segment] as Filesystem;
    }
    dir[filename] = source;
    console.log(dir);
  }
</script>

<CodeTest
  before={async (kernel) => {}}
  {fs}
  editors={["main.py", "arc_line_vectorization_suede/__init__.py"]}
/>
