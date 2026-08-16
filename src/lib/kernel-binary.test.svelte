<script lang="ts" module>
  import { Sweater } from "../../sweater-vest-suede";
  import { Kernel } from "../../release";
  import { bytes, inMemoryKernel, loadImage, run } from "./testing/kernel";

  let shared: ReturnType<typeof inMemoryKernel> | undefined;

  /** One kernel for the whole file: loading Pyodide is the slow part. */
  const environment = () =>
    (shared ??= inMemoryKernel({ files: { "data.bin": bytes.all } }));

  const asBytes = (value: unknown) =>
    value instanceof Uint8Array ? value : undefined;

  const PNG_WRITER = `
import struct, zlib

def chunk(tag, data):
    crc = zlib.crc32(tag + data) & 0xFFFFFFFF
    return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", crc)

def png(width, height, pixel):
    rows = b"".join(
        b"\\x00" + b"".join(bytes(pixel(x, y)) for x in range(width))
        for y in range(height)
    )
    header = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    return (
        b"\\x89PNG\\r\\n\\x1a\\n"
        + chunk(b"IHDR", header)
        + chunk(b"IDAT", zlib.compress(rows))
        + chunk(b"IEND", b"")
    )

with open("gradient.png", "wb") as f:
    f.write(png(64, 64, lambda x, y: (x * 4, y * 4, 128)))
print("written")
`;

  const THREE_MEGABYTES = 3_000_000;

  const repeatingBytes = (length: number) =>
    Uint8Array.from({ length }, (_, index) => index % 256);
</script>

<script lang="ts">
  class Pocket {
    src = $state<string | null>(null);
    caption = $state("");
  }
</script>

<Sweater config category="binary" orientation="vertical" mode="serial" />

<Sweater
  name="reads every byte value the host provided"
  body={async (harness) => {
    harness.set(new Pocket());
    const { kernel } = environment();

    const result = await run(
      kernel,
      [
        'with open("data.bin", "rb") as f:',
        "    data = f.read()",
        "print(len(data), sum(data), data[:4].hex(), data[-1])",
      ].join("\n"),
    );

    harness.note(result.failure || result.stdout);
    harness.expect(result.failure).toBe("");
    harness.expect(result.stdout.trim()).toBe("256 32640 00010203 255");
  }}
>
  {#snippet vest(pocket: Pocket)}
    <p>every byte value reaches Python</p>
  {/snippet}
</Sweater>

<Sweater
  name="reports a file's size in bytes without reading it"
  body={async (harness) => {
    harness.set(new Pocket());
    const { kernel } = environment();

    const result = await run(
      kernel,
      ["import os", 'print(os.path.getsize("data.bin"))'].join("\n"),
    );

    harness.expect(result.failure).toBe("");
    harness.expect(result.stdout.trim()).toBe("256");
  }}
>
  {#snippet vest(pocket: Pocket)}
    <p>os.path.getsize sees the real byte count</p>
  {/snippet}
</Sweater>

<Sweater
  name="writes a png the browser can decode"
  body={async (harness) => {
    const pocket = harness.set(new Pocket());
    const { kernel, store } = environment();

    const result = await run(kernel, PNG_WRITER);
    harness.note(result.failure || result.stdout);
    harness.expect(result.failure).toBe("");

    const written = asBytes(store.get("gradient.png"));
    harness.expect(written).toBeInstanceOf(Uint8Array);
    harness
      .expect([...written!.subarray(0, 8)])
      .toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

    pocket.src = Kernel.AssetUrl({ value: written!, path: "gradient.png" });
    pocket.caption = `${written!.byteLength} bytes`;
    const decoded = await loadImage(pocket.src!);
    harness.expect(decoded).toEqual({ width: 64, height: 64 });

    harness.capture("png");
  }}
>
  {#snippet vest(pocket: Pocket)}
    <figure style="margin: 0; text-align: center">
      {#if pocket.src}
        <img src={pocket.src} alt="gradient written by Python" width="128" />
      {/if}
      <figcaption>{pocket.caption}</figcaption>
    </figure>
  {/snippet}
</Sweater>

<Sweater
  name="reads back the bytes it wrote, reversed"
  body={async (harness) => {
    harness.set(new Pocket());
    const { kernel, store } = environment();

    const result = await run(
      kernel,
      [
        'with open("data.bin", "rb") as source:',
        "    data = source.read()",
        'with open("reversed.bin", "wb") as target:',
        "    target.write(data[::-1])",
      ].join("\n"),
    );

    harness.expect(result.failure).toBe("");
    harness
      .expect(bytes.digest(asBytes(store.get("reversed.bin"))))
      .toEqual(bytes.digest(bytes.all.slice().reverse()));
  }}
>
  {#snippet vest(pocket: Pocket)}
    <p>bytes survive a trip in both directions</p>
  {/snippet}
</Sweater>

<Sweater
  name="carries payloads far larger than the shared memory"
  body={async (harness) => {
    harness.set(new Pocket());
    const { kernel, store } = environment();

    const result = await run(
      kernel,
      [
        'with open("large.bin", "wb") as f:',
        `    f.write((bytes(range(256)) * 12000)[:${THREE_MEGABYTES}])`,
        'with open("large.bin", "rb") as f:',
        "    print(len(f.read()))",
      ].join("\n"),
    );

    harness.note(result.failure || `python read back ${result.stdout.trim()}`);
    harness.expect(result.failure).toBe("");
    harness.expect(result.stdout.trim()).toBe(`${THREE_MEGABYTES}`);
    harness
      .expect(bytes.digest(asBytes(store.get("large.bin"))))
      .toEqual(bytes.digest(repeatingBytes(THREE_MEGABYTES)));
  }}
>
  {#snippet vest(pocket: Pocket)}
    <p>three megabytes cross the bridge intact</p>
  {/snippet}
</Sweater>
