# Plan: Migrate the kernel filesystem to `Uint8Array` as canonical storage

## 1. Goal

Replace the current "binary string" convention (one JS char = one byte, codepoints 0x00–0xFF) at every FS interface in the kernel with `Uint8Array`. Strings become an explicit, opt-in view via an `encoding` parameter (default `"utf-8"`).

This is a clean **breaking change** in a single release. Downstream consumers in this repo are updated in the same PR; external consumers who pull the update will migrate at that point.

### Why

- **Correctness.** The binary-string convention silently corrupts UTF-8 input. A single char `°` (U+00B0) becomes byte `0xB0` instead of UTF-8 `c2 b0`, and Python rejects the file. This affects every source file with em-dashes, degree signs, arrows, Greek letters, etc.
- **Honesty.** The current "string is sometimes text, sometimes bytes" interface obscures the encoding question. Forcing callers to choose surfaces the decision.
- **Performance.** The worker proxy serializes strings through `TextEncoder` ([release/worker/object-proxy.ts:178](release/worker/object-proxy.ts#L178)). Every binary-string byte ≥ 0x80 gets re-encoded as 2 UTF-8 bytes over the shared-memory boundary, doubling bandwidth for image transport. `Uint8Array` ships as-is.
- **Symmetry with web/Node norms.** Browser FS APIs (`File`, `Blob.arrayBuffer()`) and Node's `fs.readFile` both yield bytes by default with an optional `encoding`. Aligning makes the kernel API less surprising.

## 2. New API surface

### 2.1 Core types ([release/fs.ts](release/fs.ts))

```ts
export namespace FileSystem {
  export type Encoding = "utf-8" | "utf-16le" | "utf-16be" | "ascii" | "latin1";

  /** File contents are bytes. Directory marker and not-found are distinct. */
  export type Get = (path: string) =>
    | Uint8Array
    | { directory: true }
    | null
    | undefined;

  export type Put = (path: string, value: Uint8Array | null) => void;

  export type ListDirectory = (path: string) => string[];
  export type Move = (request: { from: string; to: string }) => void;
  export type Delete = (path: string) => void;

  export type CreationOptions = Partial<SanitizeOptions> & {
    log?: boolean;
  };
}
```

No more `string` anywhere in the contract. No `defaultEncoding` option — text handling lives one layer up.

### 2.2 Kernel ergonomics ([release/Kernel.ts](release/Kernel.ts))

Four new instance methods cover 95% of caller intent:

```ts
class PythonKernel {
  readFile(path: string): Uint8Array | null;
  readFileText(path: string, encoding?: FileSystem.Encoding): string | null;
  writeFile(path: string, bytes: Uint8Array): void;
  writeFileText(path: string, text: string, encoding?: FileSystem.Encoding): void;
}
```

Plus four static helpers (replace the current `TextToBinaryString` / `BinaryStringToText` / `toBase64`):

```ts
PythonKernel.TextToBytes(text: string, encoding?: FileSystem.Encoding): Uint8Array
PythonKernel.BytesToText(bytes: Uint8Array, encoding?: FileSystem.Encoding): string
PythonKernel.BytesToBase64(bytes: Uint8Array): string
PythonKernel.Base64ToBytes(base64: string): Uint8Array
```

### 2.3 Asset URLs

`assetURL` no longer takes a `value: string`. New shape:

```ts
kernel.assetURL({ path }): string | null                 // reads from FS
PythonKernel.AssetUrl({ bytes, mimeType }): string       // direct
PythonKernel.AssetUrl({ bytes, path }): string           // mime inferred from path
```

## 3. File-by-file change list

### Layer A — FS contract & utilities

| File | Lines | Change |
|---|---|---|
| [release/fs.ts](release/fs.ts) | 1-59 | Replace every `string` payload in `Get`/`Put`/`Read`/`Write` with `Uint8Array`. Add `Encoding` type. |
| [release/fs.ts](release/fs.ts) | 69-96 | `empty()` returns `Uint8Array`-shaped methods. |
| [release/fs.ts](release/fs.ts) | 121-186 | `readOnly`/`writeOnly`/`readWrite` propagate `Uint8Array`. |
| [release/utils.ts](release/utils.ts) | 68-78 | Delete `toBase64(string)`. Add `bytesToBase64(Uint8Array)` and `base64ToBytes(string)`. |

### Layer B — Emscripten bridge ([release/worker/emscripten-fs.ts](release/worker/emscripten-fs.ts))

| Lines | Change |
|---|---|
| 13-40 | `SyncFileSystem` payloads become `Uint8Array`. |
| 95-118 | **Delete** `bytesToBinaryString`, `binaryStringToBytes`, `resizeBinaryString`. Add `resizeBytes(Uint8Array, n)` (allocate fresh `Uint8Array(n)`, `.set(old)`). |
| 148-194 | `nodeOps.getattr` measures `result.byteLength`. `nodeOps.setattr` calls `resizeBytes`. |
| 268-287 | `streamOps.open` stores `custom.get` result directly as `fileData`. `streamOps.close` passes `fileData` directly to `custom.put`. No conversion. |
| 289-346 | `streamOps.read`/`write` unchanged. |

### Layer C — Worker proxy

| File | Lines | Change |
|---|---|---|
| [release/worker/object-proxy.ts](release/worker/object-proxy.ts) | top | Add `SERIALIZATION.UINT8ARRAY` constant. |
| [release/worker/object-proxy.ts](release/worker/object-proxy.ts) | 140-227 | `serializeMemory` — add `value instanceof Uint8Array` branch before the `OBJECT` fallback. Write tag, byte length via `writeSize`, then the bytes directly (chunked the same way as `STRING`, but skipping `TextEncoder`). |
| [release/worker/object-proxy.ts](release/worker/object-proxy.ts) | 351-416 | `deserializeMemory` — add `UINT8ARRAY` branch returning a fresh `Uint8Array` slice (the existing copy-out-of-shared-memory chunking applies as-is). |
| [release/worker/object-proxy.ts](release/worker/object-proxy.ts) | 326-345 | `serializePostMessage` — add `Uint8Array` branch returning `{ value: <copy of bytes> }`. Structured clone handles `Uint8Array` natively, so this is just routing. |
| [release/worker/kernel-worker.ts](release/worker/kernel-worker.ts) | 82-90 | Type the `syncFs` shape against the new `SyncFileSystem`; `proxy.thenSync` already infers correctly. |

### Layer D — Public Kernel API ([release/Kernel.ts](release/Kernel.ts))

| Lines | Change |
|---|---|
| 7-24 | `Environment.fs` typed against new `SyncFileSystem`. |
| 296-311 | `assetURL({ path })` reads `Uint8Array`, calls new `AssetUrl({ bytes, path })`. |
| 340-351 | `AssetUrl` accepts `{ bytes, mimeType \| path }`. Internal: `bytesToBase64(bytes)`. Old string overloads deleted. |
| 353-376 | Replace `TextToBinaryString` / `BinaryStringToText` with `TextToBytes` / `BytesToText` / `BytesToBase64` / `Base64ToBytes`. |
| new methods | Add `readFile`, `readFileText`, `writeFile`, `writeFileText` instance methods. |

### Layer E — Pyodide integration

| File | Change |
|---|---|
| [release/pyodide/instance.ts:108](release/pyodide/instance.ts#L108) | No source change. `EMFS` just sees byte-shaped `syncFs`. |
| [release/pyodide/modules.ts](release/pyodide/modules.ts) | Audit for any `pyodide.FS.readFile` / `writeFile` calls. Currently none. |

### Layer F — In-repo consumers

| File | Change |
|---|---|
| [src/lib/CodeTest.svelte](src/lib/CodeTest.svelte) | Rewrite get/put. `Editor.Model` keeps `source: string` (text editors need real text). For text-managed paths, `get` returns `new TextEncoder().encode(model.source)`; `put` decodes the incoming `Uint8Array` and stores on `model.source`. For binary-managed paths (images), add `model.bytes?: Uint8Array` and route directly. Delete `BINARY_EXT` / `isTextPath` if the editor uses a model-type discriminant instead. |
| [src/routes/arc-line-vectorization/+page.svelte](src/routes/arc-line-vectorization/+page.svelte) | No change. Vite `?raw` still returns strings; the editor still consumes strings. |
| Future routes building a `Filesystem` | Same shape as `arc-line-vectorization`. |

### Layer G — Types & exports

| File | Change |
|---|---|
| [release/index.ts](release/index.ts) | No change to exports — the change rides under `Kernel`. |
| [release/Kernel.ts](release/Kernel.ts) JSDoc | Rewrite the encoding-related comments to document UTF-8 default and explicit encoding override. |

## 4. Testing strategy

Test infrastructure: Vitest is already configured ([package.json:18](package.json#L18)). Add `jsdom` or `happy-dom` as a dev dependency for the worker-proxy tests that need `TextEncoder`/`TextDecoder` and shared-memory primitives (both ship in Node 22+ but happy-dom gives a clean `window` for Svelte component tests). Pyodide tests use Vitest's `browser` mode against Chromium (Vitest 4 supports this natively via Playwright).

### 4.1 Unit tests — pure utilities (`release/utils.test.ts`)

Fast, no browser. Required cases:

| Function | Cases |
|---|---|
| `bytesToBase64` | empty array; ASCII only; multi-byte UTF-8 input (em-dash `c2 80 94`, degree `c2 b0`, CJK 3-byte sequences); a full PNG header `89 50 4e 47 0d 0a 1a 0a`; bytes ≥ 1 MB (verifies the chunked loop doesn't blow the `String.fromCharCode` argument limit); confirms output matches Node's `Buffer.from(bytes).toString('base64')` for parity. |
| `base64ToBytes` | round-trips every case above; rejects malformed base64; handles padding (`==`, `=`, none). |
| `PythonKernel.TextToBytes` | ASCII; all 24 codepoints found in the arc-line-vectorization sources (the regression catalog: U+00B0, U+2014, U+2192, U+2248, U+03C0, U+1D62, U+2016, U+2208, U+03A3, U+2026, U+2264, U+00B7, U+2265, U+2015, U+00D7, U+2212, U+03BC, U+00E5, U+00BD, U+221D, U+2074, U+00B1, U+03BB, U+03B8); empty string; explicit `latin1` for legacy CSVs. |
| `PythonKernel.BytesToText` | inverse of all above; lossy decode of invalid UTF-8 (replacement char vs throw — codify the chosen behavior). |

### 4.2 Unit tests — FS factories (`release/fs.test.ts`)

| Adapter | Cases |
|---|---|
| `empty()` | `get` returns `{ ok: false, status: 404 }` for any path; `put`/`delete`/`move`/`listDirectory` no-op with `ok: true`. |
| `readOnly()` | `get` dispatches the user callback when it returns `Uint8Array`; passes through to base when the callback returns `undefined`; recognizes `{ directory: true }`. |
| `writeOnly()` | `put` dispatches; sanitize options (root strip, leading slash) applied before user callback. |
| `readWrite()` | Composed behavior. |
| `sanitizePath` | All combinations of `removeRoot`/`removeLeadingSlash`/`root` edge cases (root match, empty result, no match). |

### 4.3 Unit tests — Emscripten bridge (`release/worker/emscripten-fs.test.ts`)

Mock the `FS` and `ERRNO_CODES` shapes Pyodide provides (small helper that records calls). Test the `nodeOps` / `streamOps` against a fake `SyncFileSystem` whose backing store is a `Map<string, Uint8Array>`. Required cases:

- **Open existing file → read → close** round-trips bytes exactly. Use a 1 KB random `Uint8Array` (`crypto.getRandomValues`) — any encoding bug shows up as a byte mismatch.
- **Open with `O_TRUNC`** yields an empty `fileData`.
- **Sequential writes at offsets** that extend the file produce the right total length and content (`new Uint8Array(position + length)` allocation path at line 332).
- **`setattr({ size: n })` truncate and grow** — verify the grow path zero-fills.
- **`getattr` size** equals `byteLength` of the stored bytes, not `length` of any intermediate string.
- **Round-trip arbitrary bytes including 0x00 and 0xFF** — easy to regress because string conversions silently drop nulls.

### 4.4 Unit tests — worker proxy serialization (`release/worker/object-proxy.test.ts`)

This is the highest-risk layer because the shared-memory chunking is intricate. Set up an in-thread harness: instantiate one `ObjectProxyHost` and one `ObjectProxyClient` sharing a `SharedArrayBuffer`-backed `AsyncMemory`. Round-trip values through `serializeMemory` → `deserializeMemory` and assert equality.

Required cases for the new `UINT8ARRAY` tag:

| Size | What it exercises |
|---|---|
| 0 bytes | Empty payload, type byte only. |
| 1 byte | Smallest non-empty. |
| `memorySize - 2` bytes | Fits in first chunk with type byte. |
| `memorySize - 1` bytes | Exactly fills first chunk. |
| `memorySize` bytes | Boundary: one byte overflows. |
| `memorySize * 2 - 1` bytes | Two chunks, second is short. |
| `memorySize * 2` bytes | Two chunks, second exactly fills. |
| `memorySize * 3 + 17` bytes | Multi-chunk arbitrary tail. |
| 4 MB | Stress test, real PNG-scale. |

Each case fills the source `Uint8Array` with `crypto.getRandomValues` and asserts byte-for-byte equality after round-trip. Repeat all sizes for the existing `STRING` path as a control to confirm we didn't break it.

Also test:
- `serializePostMessage` round-trip of a `Uint8Array` (structured-clone path) — verify it doesn't get coerced to plain object.
- A `Uint8Array` returned from a proxied method (the actual usage pattern in `kernel-worker.ts`).

### 4.5 Integration tests — full kernel via Pyodide (Vitest browser mode)

These are slow (Pyodide cold start ≈ 4–10 s) but irreplaceable. Run them headless in Chromium via `@vitest/browser` + Playwright. Each test starts one kernel and reuses it across cases.

Required scenarios in `release/__tests__/kernel.browser.test.ts`:

1. **The regression that started this work.** Write `arc_line_vectorization_suede/graph/__init__.py` (the actual file content with `°`, `—`, `→`, `π`, etc.) into the kernel FS via `writeFileText`. Run `import arc_line_vectorization_suede.graph`. Expect no `SyntaxError`. Assert the parsed `__doc__` string contains `°`.

2. **All 24 problem codepoints.** Programmatically generate a `.py` file whose docstring includes every codepoint from the catalog in §4.1. Import and read back `module.__doc__` — assert codepoint-for-codepoint equality.

3. **Python writes PNG → JS reads via assetURL.** Run Python that uses PIL to save a small known image (e.g. a 4×4 gradient) to `/home/pyodide/test.png`. Call `kernel.assetURL({ path: "/home/pyodide/test.png" })`. Fetch the resulting `data:` URL, decode, and compare pixels.

4. **JS uploads bytes → Python reads.** `kernel.writeFile("/home/pyodide/data.bin", new Uint8Array([0, 1, 2, ..., 255]))`. Run Python: `open("data.bin","rb").read()` → return as `bytes`. Assert exact byte match. This catches null-byte handling and the 0xFF edge.

5. **Round-trip a Latin-1 CSV.** Write a CSV with `latin1`-encoded bytes that aren't valid UTF-8. Confirm `readFile` returns the raw bytes, `readFileText(path, "latin1")` decodes correctly, and `readFileText(path, "utf-8")` either replaces or throws per the documented behavior.

6. **Editor save-and-reimport loop.** Mirrors the IDE flow: write a `.py` via `writeFileText`, `import`, then `writeFileText` again with a modified docstring, then `importlib.reload()`. Confirms the put→model→get→Python path round-trips even after edits.

### 4.6 Component test — `CodeTest.svelte` (Vitest + Svelte testing)

Mount the component with a `Filesystem` containing a string with each problem codepoint. Assert:
- The model exposed to the editor is the original string (text, not binary string).
- The `get` callback handed to the kernel returns a `Uint8Array` whose UTF-8 decoding matches the original.
- After simulating a kernel `put` with new bytes, the editor model updates to the decoded text.

Doesn't need Pyodide — uses a stub kernel that captures `get` / `put` calls.

### 4.7 Manual / smoke tests

Document in `PLAN.md` (this file) the manual checks to run before tagging:
- Open `/arc-line-vectorization` route in `npm run dev`, click Run, verify no `SyntaxError`, verify any `print` output renders.
- Open the IDE, edit a docstring to add `λ²`, save, re-run. Confirms editor → FS → Python round-trip in a real browser worker.
- Run a route that loads a PNG asset; visually confirm.

### 4.8 CI

- Add `npm test` to a GitHub Actions workflow that runs the unit and component tests on every PR.
- Browser-mode tests (Pyodide integration) run on a nightly schedule and on release tags — too slow for per-commit, but they are the most load-bearing for confidence.
- Coverage gate: 90%+ on the FS layer (`release/fs.ts`, `release/utils.ts`, `release/worker/emscripten-fs.ts`, the new `UINT8ARRAY` branches in `release/worker/object-proxy.ts`). The proxy chunking math benefits especially from branch coverage.

## 5. Examples

### 5.1 Loading a Python file from a Vite `?raw` import

```ts
import source from "./main.py?raw";
kernel.writeFileText("/home/pyodide/main.py", source);   // utf-8 by default
```

### 5.2 Displaying a PNG that Python wrote

```ts
const bytes = kernel.readFile("/home/pyodide/out.png");
const url = PythonKernel.AssetUrl({ bytes, mimeType: "image/png" });
imgEl.src = url;
```

### 5.3 Uploading a user-selected image

```ts
input.addEventListener("change", async () => {
  const file = input.files![0];
  const bytes = new Uint8Array(await file.arrayBuffer());
  kernel.writeFile(`/home/pyodide/${file.name}`, bytes);
});
```

### 5.4 Reading a Latin-1 CSV

```ts
const bytes = kernel.readFile("/home/pyodide/legacy.csv");
const text = PythonKernel.BytesToText(bytes!, "latin1");
// Or hand the bytes straight to Python, untouched:
kernel.writeFile("/home/pyodide/clone.csv", bytes!);
```

### 5.5 The thing that's not broken anymore

```py
"""Deflection (degrees) above which an interior junction point is …"""
# `°` is 0xC2 0xB0 in UTF-8. The Uint8Array round-trip is identity. No drift.
```

## 6. Rollout checklist

In order, each item lands in a single PR:

1. Land the FS contract + utilities + Emscripten bridge (Layers A, B). Update the worker proxy `UINT8ARRAY` tag (Layer C). Update Kernel API (Layer D). Update in-repo consumers (Layer F).
2. Land the test suite (§4.1 – §4.6). Tests are written against the new API; the old API is already gone in step 1.
3. Run §4.7 smoke checks against `npm run dev`.
4. Tag a release.

## 7. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Worker proxy `UINT8ARRAY` chunking has off-by-one bugs at the shared-memory boundary | The exhaustive size matrix in §4.4 covers every boundary case; this is the highest-priority test file. |
| `Editor.Model` doesn't have a clean way to hold binary content; current shape assumes string `source` | Add a discriminated `Editor.Model.type` (already exists in `CodeTest.svelte`'s `walk`) and a `bytes?: Uint8Array` field. Editor never sees `bytes`. |
| `assetURL` signature change breaks downstream | This is a deliberate breaking change. The IDE preview path in [src/lib/CodeTest.svelte:147](src/lib/CodeTest.svelte#L147) is the only known consumer; update it in the same PR. |
| `TextDecoder("utf-8")` default is **lossy** (replaces invalid bytes with U+FFFD); some callers expect a throw | Document the default behavior. Offer `{ fatal: true }` as an option on `BytesToText` for callers that want strict decoding. Default to lossy because Python source files should always be valid UTF-8 and a `SyntaxError` from Python is the right place to learn they aren't. |
| Pyodide tests are slow and flaky | Gate them to nightly + release tags. Unit + component tests in §4.1–§4.6 provide the per-PR signal. |

## 8. Out of scope

- Async filesystem support (currently sync-only via `AsyncMemory`).
- Compression / streaming of large files across the worker boundary. Multi-MB payloads will work but copy twice (host→shared→client).
- A general-purpose virtual FS abstraction beyond what Pyodide needs.
