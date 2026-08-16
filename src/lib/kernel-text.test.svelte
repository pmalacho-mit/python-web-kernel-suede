<script lang="ts" module>
  import { Sweater } from "../../sweater-vest-suede";
  import { inMemoryKernel, run } from "./testing/kernel";

  const POEM = "héllo 🐍\nsecond líne\n日本語";

  const AWKWARD = [
    "tab\there",
    "windows\r\nlines",
    'quotes "double" \'single\'',
    "backslash \\ and 🐍",
  ].join("\n");

  let shared: ReturnType<typeof inMemoryKernel> | undefined;

  const environment = () =>
    (shared ??= inMemoryKernel({
      files: { "poem.txt": POEM, "awkward.txt": AWKWARD },
    }));

  const LONG_LINE = "π≈3.14159 🎉 ";
  const REPEATS = 40_000;
</script>

<script lang="ts">
  class Pocket {
    detail = $state("");
  }
</script>

<Sweater config category="text" orientation="vertical" mode="serial" />

<Sweater
  name="runs a source file written in unicode"
  body={async (harness) => {
    const pocket = harness.set(new Pocket());
    const { kernel } = environment();

    const result = await run(
      kernel,
      [
        "# -*- coding: utf-8 -*-",
        "def λ(χ):",
        "    return χ * 2",
        'print("emoji 🐍", λ("ü"), "日本語")',
      ].join("\n"),
      "unicode_source.py",
    );

    pocket.detail = result.failure || result.stdout;
    harness.note(pocket.detail);
    harness.expect(result.failure).toBe("");
    harness.expect(result.stdout.trim()).toBe("emoji 🐍 üü 日本語");
  }}
>
  {#snippet vest(pocket: Pocket)}
    <pre>{pocket.detail}</pre>
  {/snippet}
</Sweater>

<Sweater
  name="reads utf-8 text the host provided"
  body={async (harness) => {
    const pocket = harness.set(new Pocket());
    const { kernel } = environment();

    const result = await run(
      kernel,
      [
        'with open("poem.txt", encoding="utf-8") as f:',
        "    text = f.read()",
        "print(len(text), text.count(chr(0x1F40D)), text.splitlines()[2])",
      ].join("\n"),
    );

    pocket.detail = result.failure || result.stdout;
    harness.expect(result.failure).toBe("");
    harness.expect(result.stdout.trim()).toBe(`${[...POEM].length} 1 日本語`);
  }}
>
  {#snippet vest(pocket: Pocket)}
    <pre>{pocket.detail}</pre>
  {/snippet}
</Sweater>

<Sweater
  name="reports text size in bytes rather than characters"
  body={async (harness) => {
    harness.set(new Pocket());
    const { kernel } = environment();

    const result = await run(
      kernel,
      ["import os", 'print(os.path.getsize("poem.txt"))'].join("\n"),
    );

    harness.expect(result.failure).toBe("");
    harness
      .expect(result.stdout.trim())
      .toBe(`${new TextEncoder().encode(POEM).byteLength}`);
  }}
>
  {#snippet vest(pocket: Pocket)}
    <p>getsize counts utf-8 bytes</p>
  {/snippet}
</Sweater>

<Sweater
  name="hands text written by Python back to the host as text"
  body={async (harness) => {
    harness.set(new Pocket());
    const { kernel, store } = environment();
    const written = "written from Python: 🐍 café 日本語";

    const result = await run(
      kernel,
      [
        'with open("written.txt", "w", encoding="utf-8") as f:',
        `    f.write(${JSON.stringify(written)})`,
      ].join("\n"),
    );

    harness.expect(result.failure).toBe("");
    harness.expect(store.get("written.txt")).toBe(written);
  }}
>
  {#snippet vest(pocket: Pocket)}
    <p>valid utf-8 arrives as a string, not bytes</p>
  {/snippet}
</Sweater>

<Sweater
  name="keeps every character a python file may contain"
  body={async (harness) => {
    const pocket = harness.set(new Pocket());
    const { kernel, store } = environment();

    const result = await run(
      kernel,
      [
        'with open("awkward.txt", encoding="utf-8", newline="") as source:',
        "    text = source.read()",
        'with open("copy.txt", "w", encoding="utf-8", newline="") as target:',
        "    target.write(text)",
        "print(repr(text))",
      ].join("\n"),
    );

    pocket.detail = result.failure || result.stdout;
    harness.expect(result.failure).toBe("");
    harness.expect(store.get("copy.txt")).toBe(AWKWARD);
  }}
>
  {#snippet vest(pocket: Pocket)}
    <pre style="white-space: pre-wrap">{pocket.detail}</pre>
  {/snippet}
</Sweater>

<Sweater
  name="carries text larger than the shared memory"
  body={async (harness) => {
    harness.set(new Pocket());
    const { kernel, store } = environment();

    const result = await run(
      kernel,
      [
        'with open("long.txt", "w", encoding="utf-8") as f:',
        `    f.write(${JSON.stringify(LONG_LINE)} * ${REPEATS})`,
        'with open("long.txt", encoding="utf-8") as f:',
        "    print(len(f.read()))",
      ].join("\n"),
    );

    harness.expect(result.failure).toBe("");
    harness
      .expect(result.stdout.trim())
      .toBe(`${[...LONG_LINE].length * REPEATS}`);
    harness.expect(store.get("long.txt")).toBe(LONG_LINE.repeat(REPEATS));
  }}
>
  {#snippet vest(pocket: Pocket)}
    <p>half a megabyte of unicode text</p>
  {/snippet}
</Sweater>
