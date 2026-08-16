<script lang="ts" module>
  import { Sweater } from "../../sweater-vest-suede";
  import { inMemoryKernel, run } from "./testing/kernel";

  const asked: string[] = [];

  const answerLater = async (prompt: string) => {
    asked.push(prompt);
    await new Promise((resolve) => setTimeout(resolve, 25));
    return "42";
  };

  let shared: ReturnType<typeof inMemoryKernel> | undefined;

  /** Every answer arrives in a promise, so nothing here can succeed by racing. */
  const environment = () =>
    (shared ??= inMemoryKernel({
      delayed: true,
      input: answerLater,
      refuses: (path) => path === "forbidden.txt",
      files: {
        "notes/today.txt": "written before the kernel started",
        "notes/yesterday.txt": "older",
      },
    }));
</script>

<script lang="ts">
  class Pocket {
    detail = $state("");
  }
</script>

<Sweater config category="promises" orientation="vertical" mode="serial" />

<Sweater
  name="waits for a filesystem that answers with promises"
  body={async (harness) => {
    const pocket = harness.set(new Pocket());
    const { kernel } = environment();

    const result = await run(
      kernel,
      ['with open("notes/today.txt") as f:', "    print(f.read())"].join("\n"),
    );

    pocket.detail = result.failure || result.stdout;
    harness.note(pocket.detail);
    harness.expect(result.failure).toBe("");
    harness
      .expect(result.stdout.trim())
      .toBe("written before the kernel started");
  }}
>
  {#snippet vest(pocket: Pocket)}
    <pre>{pocket.detail}</pre>
  {/snippet}
</Sweater>

<Sweater
  name="waits for a write before reading it back"
  body={async (harness) => {
    harness.set(new Pocket());
    const { kernel, store } = environment();

    const result = await run(
      kernel,
      [
        'with open("notes/new.txt", "w") as f:',
        '    f.write("written from Python")',
        'with open("notes/new.txt") as f:',
        "    print(f.read())",
      ].join("\n"),
    );

    harness.expect(result.failure).toBe("");
    harness.expect(result.stdout.trim()).toBe("written from Python");
    harness.expect(store.get("notes/new.txt")).toBe("written from Python");
  }}
>
  {#snippet vest(pocket: Pocket)}
    <p>a promised write completes before the next read</p>
  {/snippet}
</Sweater>

<Sweater
  name="lists a directory answered by a promise"
  body={async (harness) => {
    const pocket = harness.set(new Pocket());
    const { kernel } = environment();

    const result = await run(
      kernel,
      ["import os", 'print(sorted(os.listdir("notes")))'].join("\n"),
    );

    pocket.detail = result.failure || result.stdout;
    harness.expect(result.failure).toBe("");
    harness.expect(result.stdout).toContain("today.txt");
    harness.expect(result.stdout).toContain("yesterday.txt");
  }}
>
  {#snippet vest(pocket: Pocket)}
    <pre>{pocket.detail}</pre>
  {/snippet}
</Sweater>

<Sweater
  name="waits for input that resolves later"
  body={async (harness) => {
    harness.set(new Pocket());
    const { kernel } = environment();

    const result = await run(
      kernel,
      ['answer = input("how many?")', 'print("doubled", int(answer) * 2)'].join(
        "\n",
      ),
    );

    harness.expect(result.failure).toBe("");
    harness.expect(result.stdout).toContain("doubled 84");
    harness.expect(asked.at(-1)).toContain("how many?");
  }}
>
  {#snippet vest(pocket: Pocket)}
    <p>input() blocks Python until the page answers</p>
  {/snippet}
</Sweater>

<Sweater
  name="raises an OSError when the host refuses a read"
  body={async (harness) => {
    const pocket = harness.set(new Pocket());
    const { kernel } = environment();

    const result = await run(
      kernel,
      [
        "try:",
        '    open("forbidden.txt").read()',
        "except OSError as error:",
        '    print("raised", type(error).__name__)',
      ].join("\n"),
    );

    pocket.detail = result.failure || result.stdout;
    harness.note(pocket.detail);
    harness.expect(result.failure).toBe("");
    harness.expect(result.stdout).toContain("raised");
  }}
>
  {#snippet vest(pocket: Pocket)}
    <pre>{pocket.detail}</pre>
  {/snippet}
</Sweater>

<Sweater
  name="keeps working after the host refused"
  body={async (harness) => {
    harness.set(new Pocket());
    const { kernel } = environment();

    const result = await run(
      kernel,
      ['with open("notes/yesterday.txt") as f:', "    print(f.read())"].join(
        "\n",
      ),
    );

    harness.expect(result.failure).toBe("");
    harness.expect(result.stdout.trim()).toBe("older");
  }}
>
  {#snippet vest(pocket: Pocket)}
    <p>a refused read does not poison the bridge</p>
  {/snippet}
</Sweater>
