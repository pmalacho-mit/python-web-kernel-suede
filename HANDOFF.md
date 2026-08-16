# Handoff

Disposable. Delete once the open item below is closed.

## Where things are

Everything is committed on `main`. Working tree is clean apart from the review
files (`pr-6-*.md`, untracked, the user's).

```
3c55c22  Test the two paths that were only reasoned about, and re-enable interrupts  ← last
0dbca88  Make the worker harness version-independent, and run it in CI
16a5950  Fix root object identity and late answers from a slow host
59d458d  (user's)
fa12b8c  Address PR #6 review: proxy identity, reference lifetimes, blocked waits
d4bc39c  Forward the dev server onto the browser's loopback address
```

## The one open item

**The browser suite has not run since `3c55c22`.** It was mid-run when the
container stack wedged. Everything else is verified; this is the only gap.

```bash
npm run dev                       # must be on 5173, check the banner
npm run test:browser              # expect 33 passed (5 binary, 7 host, 6 text, 15 workspaces)
```

It was **32 passing** at `0dbca88`. `3c55c22` adds one browser test — "interrupts
a run that would otherwise never end" in `src/lib/kernel-host.test.svelte` — so
33 is the number to expect.

### Suspect that test if the stack wedges again

It is the only new thing that runs unbounded Python. If `interrupt()` still does
not reach Pyodide, it spins a worker for 20 seconds (it self-terminates; that was
made safe in `3c55c22`, and before that it was `while True: pass` — which is the
likeliest cause of the wedge you just hit).

If it misbehaves, cut it out and run the rest:

```bash
npm run test:browser -- --test "^(?!interrupts)"   # or just delete that one <Sweater>
```

A cleaner check of the same fix, without the browser:

```bash
grep -n "setInterruptBuffer" release/pyodide/instance.ts
# expect three: init sets it, whileUninterruptible clears it, and the finally restores it
```

## Verified, do not redo

- `npm test` → **204 passing**. Also verified on Node **22.22.2**, 22.23.2 and
  24.19.0 in containers (`docker run --rm -v "$PWD":/w -w /w node:22.22.2-bookworm-slim npx vitest run --root . tests/`).
- `npx svelte-check --tsconfig ./tsconfig.json` → clean, apart from pre-existing
  warnings in the vendored `src/suede/dockview-svelte-suede`.
- `npx prettier --check .` → clean.
- Browser suite **32 passing at `0dbca88`**.
- The GC-release test is non-vacuous: suppressing the `proxy_release` postMessage
  in `object-proxy.ts` makes it fail. Stable over 5 runs.
- The worker harness fails loudly: breaking `tests/bridge.worker.mjs` exits
  non-zero in about a second with the module error, not 180s of timeouts.

## Environment gotchas that cost time

- **The dev server may land on 5174** if 5173 is taken. `npm run test:browser`
  defaults to 5173, so it will silently drive whatever else is there. Always
  check the Vite banner.
- **`pkill -f "vite dev"` kills the calling shell too** (the pattern matches the
  shell's own command line), so anything chained after it with `&&` never runs.
  Kill it in its own command.
- **Docker is inside this devcontainer** (DinD). The browser container is
  `chromium-sweater-vest-$(hostname)`; the report removes it on exit, so a stale
  one usually means a crashed run: `docker rm -f chromium-sweater-vest-$(hostname)`.
- **Source `/etc/profile.d/desolate-ca.sh`** before anything that fetches over
  HTTPS (npm, docker builds), or you get certificate errors that look like hangs.
- A full `npm run test:browser` takes **3–6 minutes** — the workspaces run 15
  Pyodide kernels. Run it in the background and poll the output file.

## What this PR is

Rewrote the worker↔main-thread bridge so binary and text both survive it, and so
the main-thread filesystem can answer with promises.

- `release/worker/codec.ts` — structured binary codec (bytes, text, structures,
  references). `channel.ts` — framing over shared memory. `sync-call.ts` — the
  worker blocking on host functions. `settled.ts` — errors as data.
- `release/fs.ts` — host filesystem, every method may return a promise.
- Demo routes and Monaco are gone; Python now lives as real files under
  `src/lib/testing/workspaces/`, run by `Workspace.test.svelte`.
- `release/CHANGELOG.md` lists the breaking changes for subrepo consumers.

Three rounds of external review are closed; findings and the reasoning behind
what was declined are in `pr-6-*.md` and summarised in `release/CHANGELOG.md`.

## Known-not-done

Named to the user already; none block the PR.

- **Firefox certificate trust** is unresolved in
  `sweater-vest-suede.browser-control-container-suede`. Its README has the
  measurements and four ordered leads. The user has an agent for it.
- **WebKit trust has no negative control** — that image's base already trusted
  the CA, so "it works" is consistent with but not proof of the system-store
  path.
- **`src/suede/dockview-svelte-suede`** is now unused by `src/` but is a tracked
  subrepo, so it was left alone.
- **Workspaces have no per-workspace timeout.** A genuinely infinite Python loop
  in a workspace would hang that test; bridge calls are bounded, Python loops are
  not.
