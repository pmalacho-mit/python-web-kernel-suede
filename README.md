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
- **`stat` is optional.** Provide it when a path's size is cheaper to answer
  than its contents; without it, sizes are measured by reading the file.

`Kernel.assetURL({ path })` reads a file out of that filesystem and returns a
`data:` URL for it, and `Kernel.AssetUrl({ value, path })` builds one from
contents already in hand.

By default Pyodide itself is fetched from jsDelivr. Pass `indexURL` to
`Kernel.Environment` to serve it from somewhere else.

## Development

```bash
npm run dev       # the demo routes, plus /tests
npm test          # unit tests for the bridge, codec, and filesystem
./scripts/browser-tests.sh   # the same bridge, in a real browser
```

The browser tests are [sweater-vest](./sweater-vest-suede) tests under
`src/lib/*.test.svelte`, driven through a containerized Chromium. They need
`npm run dev` running and Docker available. The script exists because the kernel
needs `SharedArrayBuffer`, which a browser only exposes to a cross-origin
isolated page on an origin it trusts — it forwards the dev server onto the
browser's own loopback address so that holds.
