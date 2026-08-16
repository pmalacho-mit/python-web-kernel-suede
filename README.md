# Python-web-kernel-suede

This repo is a [suede dependency](https://github.com/pmalacho-mit/suede). 

To see the installable source code, please checkout the [release branch](https://github.com/pmalacho-mit/python-web-kernel-suede/tree/release).

## Installation

```bash
bash <(curl https://suede.sh/install-release) --repo pmalacho-mit/python-web-kernel-suede
```

<details>
<summary>
See alternative to using <a href="https://github.com/pmalacho-mit/suede#suedesh">suede.sh</a> script proxy
</summary>

```bash
bash <(curl https://raw.githubusercontent.com/pmalacho-mit/suede/refs/heads/main/scripts/install-release.sh) --repo pmalacho-mit/python-web-kernel-suede
```

</details>

## The filesystem you give the kernel

Python runs in a worker and blocks on the main thread for every file operation,
so the filesystem you hand `Kernel.Environment` is the whole story: whatever it
answers is what Python sees.

```ts
const files = new Map<string, string | Uint8Array>();

const kernel = new Kernel(
  Kernel.Environment({
    fs: Kernel.ReadWriteFileSystem({
      get: async (path) => files.get(path) ?? (await fetchFromServer(path)),
      listDirectory: (path) => entriesUnder(path),
      put: (path, value) => void files.set(path, value),
    }),
  }),
);
```

- **Contents are text or bytes.** `get` may answer with a `string` or a
  `Uint8Array`; strings are UTF-8. What Python writes reaches `put` as a string
  when it is valid UTF-8 and as a `Uint8Array` when it is not, so a `.py` file
  stays text and a `.png` stays bytes. Pass `binary: true` to always receive
  bytes.
- **Every method may return a promise.** Python is blocked on the worker while
  the main thread settles it, so reading from IndexedDB, the network, or a user
  prompt needs no extra machinery. `input` may return a promise too.
- **Provide `stat` if you can.** Every `lookup` and every `getattr` asks for
  one, so `os.path.getsize`, `os.listdir` on a populated directory, and opening
  a file all go through it. Without `stat`, each of those reads the **whole
  file** across the bridge just to learn its size. Files that are large, remote,
  or expensive to produce are the ones that suffer.
- **Writes reach `put` when the file is closed**, not as they happen. An open
  file is held whole in the worker, so `put` is called once per open file rather
  than once per write — but Python's `flush()` does not reach you, and a run
  terminated mid-write never gets to `put` at all.

`Kernel.assetURL({ path })` reads a file out of that filesystem and returns a
`data:` URL for it, and `Kernel.AssetUrl({ value, path })` builds one from
contents already in hand.

By default Pyodide itself is fetched from jsDelivr. Pass `indexURL` to
`Kernel.Environment` to serve it from somewhere else.

## Development

```bash
npm test              # the bridge, codec, and filesystem, in node
npm run dev           # then open /tests
npm run test:browser  # the same page, driven headlessly, as a report
```

`npm test` covers everything that does not need a browser ([tests/](./tests)),
including the blocking protocol itself — that one runs the worker half in a real
`node:worker_threads` worker.

Everything else is a [sweater-vest](./sweater-vest-suede) test served at
`/tests`. `src/lib/kernel-*.test.svelte` exercise the bridge against real
Pyodide; `src/lib/testing/Workspace.test.svelte` runs the workspaces.

### Workspaces

A folder under [src/lib/testing/workspaces/](./src/lib/testing/workspaces) is a
workspace: the files Python starts with, exactly as they sit on disk. Python is
edited in your editor, and the browser only runs it.

```
workspaces/readfile/
  main.py         ← the entry point, unless index.ts says otherwise
  example.txt     ← any file here is on Python's filesystem
  index.ts        ← optional: what to run, and what to expect of it
```

```ts
// workspaces/readfile/index.ts
import type { Workspace } from "../../workspace";

export const after: Workspace.After = ({ stdout, files, expect }) =>
  expect(stdout.trim()).toBe(files.get("example.txt"));
```

A workspace may also export `entries` (files to run, in order — the default is
`main.py`) and `before` (to set the filesystem up first). Each workspace gets a
Pyodide worker of its own, so nothing one workspace does is visible to another,
and no more of them run at once than the machine has cores.

### Running the report

`npm run test:browser` needs `npm run dev` running and Docker available. It
drives the same `/tests` page through a containerized Chromium and writes
`fashion-show.md`.

The kernel needs `SharedArrayBuffer`, which a browser only exposes to a
cross-origin isolated page on an origin it trusts, so sweater-vest forwards the
dev server onto the browser's own loopback address; behind an intercepting proxy
it also installs the CA, without which Pyodide cannot be fetched at all.
