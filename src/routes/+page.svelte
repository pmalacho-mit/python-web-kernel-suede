<script lang="ts">
  import { snippets, Kernel, type Output } from "../../release";
  import ps2 from "./mit-6100B-ps2";
  import simpleAnimation from "./simple-animation/main.py?raw";

  const files = new Map<string, string>();

  const ps2Populate = ps2.populate.bind(null, files);

  const kernel = new Kernel(
    Kernel.DefaultEnvironment({
      fs: Kernel.ReadWriteFileSystem({
        log: true,
        get: (path) => files.get(path),
        put: (path, value) => {
          console.log("fs.put invoked with:", { path, value });
          if (value !== null && path.toLowerCase().endsWith(".gif")) {
            let url: string;
            if (value.startsWith("data:image/gif")) {
              url = value;
            } else {
              const bytes = Uint8Array.from(value, (char) =>
                char.charCodeAt(0),
              );
              const chunkSize = 0x8000;
              let binary = "";
              for (let i = 0; i < bytes.length; i += chunkSize) {
                const chunk = bytes.subarray(i, i + chunkSize);
                binary += String.fromCharCode(...chunk);
              }
              url = `data:image/gif;base64,${btoa(binary)}`;
            }
            window.open(url, "_blank", "noopener,noreferrer");
          }
          value === null ? files.delete(path) : files.set(path, value);
        },
        listDirectory: (path) => {
          console.log("Listing directory:", path);
          return Array.from(files.keys());
        },
      }),
    }),
  );

  const tests = {
    "Hello world": "print('Hello world')",
    Fibonacci: `
def fib(n):
    if n <= 1:
        return n
    else:
        return fib(n-1) + fib(n-2)
print(fib(10))
`,
    Matplotlib: `
import matplotlib.pyplot as plt
plt.plot([1, 2, 3], [4, 5, 6])
plt.show()
`,
    pandas: `
import pandas as pd
df = pd.DataFrame({
    'Name': ['Alice', 'Bob', 'Charlie'],
    'Age': [25, 30, 35]
})
df
`,
    animation: simpleAnimation,
    animation2: `import matplotlib.pyplot as plt
from matplotlib.animation import FuncAnimation
import random
from itertools import count
import pandas as pd
import numpy as np

fig, ax = plt.subplots()
t = np.linspace(0, 3, 40)
g = -9.81
v0 = 12
z = g * t**2 / 2 + v0 * t

v02 = 5
z2 = g * t**2 / 2 + v02 * t

scat = ax.scatter(t[0], z[0], c="b", s=5, label=f'v0 = {v0} m/s')
line2 = ax.plot(t[0], z2[0], label=f'v0 = {v02} m/s')[0]
ax.set(xlim=[0, 3], ylim=[-4, 10], xlabel='Time [s]', ylabel='Z [m]')
ax.legend()


def update(frame):
    # for each frame, update the data stored on each artist.
    x = t[:frame]
    y = z[:frame]
    # update the scatter plot:
    data = np.stack([x, y]).T
    scat.set_offsets(data)
    # update the line plot:
    line2.set_xdata(t[:frame])
    line2.set_ydata(z2[:frame])
    return (scat, line2)

ani = FuncAnimation(fig=fig, func=update, frames=40, interval=30)
plt.show()`,
    latex: `
# import symbolic capability to Python
from sympy import *
# print things all pretty
from sympy.abc import *
init_printing()
# Need to define variables as symbolic for sympy to use them. 
x, y= symbols("x, y", real = True)
diff((3*x**4+5)**3,x)
`,
    "Matplotlib from web dataset": `
import matplotlib.pyplot as plt
import pandas as pd
from pyodide.http import open_url
url = 'https://raw.githubusercontent.com/mwaskom/seaborn-data/master/iris.csv'
df = pd.read_csv(open_url(url))
df.head()
plt.scatter(df['sepal_length'], df['sepal_width'])
plt.xlabel('Sepal Length')
plt.ylabel('Sepal Width')
plt.title('Iris Dataset - Sepal Length vs Width')
plt.show()
`,
    writefile: `
with open('example.txt', 'w') as f:
    f.write('Hello, world!')
`,
    readfile: `
with open('example.txt', 'r') as f:
    content = f.read()
print(content)
`,
    "(mit 6100B ps2) ps2": ps2["ps2.py"],
    "(mit 6100B ps2) mbta_helpers": ps2["mbta_helpers.py"],
    "(mit 6100B ps2) test_constants": ps2["test_constants.py"],
    "(mit 6100B ps2) test_ps2_student": ps2["test_ps2_student.py"],
  };

  type TestRecord<T> = Partial<Record<keyof typeof tests, T>>;

  const before: TestRecord<() => void | Promise<void>> = {
    writefile: () => {
      files.set("example.txt", "Hello, pyodide!");
    },
    readfile: () => {
      files.set("example.txt", "Hello, pyodide!");
    },
    "(mit 6100B ps2) ps2": ps2Populate,
    "(mit 6100B ps2) mbta_helpers": ps2Populate,
    "(mit 6100B ps2) test_constants": ps2Populate,
    "(mit 6100B ps2) test_ps2_student": ps2Populate,
  };

  const verify: TestRecord<(outputs: Output.Any[]) => boolean> = {};

  let selection = $state<keyof typeof tests>("Hello world");

  let code = $state<HTMLTextAreaElement>();

  const outputs = $state<Output.Any[]>([]);

  const run = async (key: keyof typeof tests) => {
    await before[key]?.();
    const job = kernel.run({
      code: code!.value,
      path: `${key}.py`,
      on: { output: (output) => outputs.push(output) },
    });

    const result = await job.result;
    verify[key]?.(result);
  };

  const clearOutputs = () => {
    outputs.splice(0, outputs.length);
  };
</script>

<main class="page">
  <header class="hero">
    <div>
      <p class="eyebrow">Python Web Kernel</p>
      <h1>Interactive Test Bench</h1>
      <p class="subhead">
        Run curated snippets, inspect outputs, and iterate quickly with a
        focused layout.
      </p>
    </div>
  </header>

  <div class="grid">
    <section class="panel controls">
      <div class="panel-header">
        <h2>Test Setup</h2>
        <span class="status">Ready</span>
      </div>

      <label class="field">
        <span>Choose a test</span>
        <select bind:value={selection}>
          {#each Object.keys(tests) as key}
            <option value={key}>{key}</option>
          {/each}
        </select>
      </label>

      <label class="field">
        <span>Code preview</span>
        <textarea rows="10" value={tests[selection]} bind:this={code}
        ></textarea>
      </label>

      <div class="actions">
        <button class="primary" onclick={() => run(selection)}>Run test</button>
      </div>
    </section>

    <section class="panel outputs">
      <div class="panel-header">
        <h2>Outputs</h2>
        <div class="panel-actions">
          <span class="count">{outputs.length} items</span>
          <button
            class="ghost"
            onclick={clearOutputs}
            disabled={outputs.length === 0}
          >
            Clear
          </button>
        </div>
      </div>

      <div class="output-list">
        {#if outputs.length === 0}
          <div class="empty">No outputs yet. Run a test to see results.</div>
        {:else}
          {#each outputs as output}
            {@render snippets.output.any(output)}
          {/each}
        {/if}
      </div>
    </section>
  </div>
</main>

<style>
  @import url("https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap");

  :global(body) {
    margin: 0;
    font-family:
      "Space Grotesk",
      system-ui,
      -apple-system,
      sans-serif;
    background: radial-gradient(
      circle at top,
      #fef4d8 0%,
      #f7efe4 45%,
      #f4f7ff 100%
    );
    color: #1b1a1d;
  }

  :global(*) {
    box-sizing: border-box;
  }

  .page {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    padding: 3.5rem clamp(1.25rem, 3vw, 4rem);
    gap: 2.5rem;
  }

  .hero {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    gap: 2rem;
  }

  .eyebrow {
    text-transform: uppercase;
    letter-spacing: 0.2em;
    font-weight: 600;
    font-size: 0.75rem;
    margin: 0 0 0.6rem;
    color: #8a5523;
  }

  h1 {
    font-size: clamp(2.2rem, 4vw, 3.5rem);
    margin: 0 0 0.6rem;
  }

  .subhead {
    max-width: 40rem;
    margin: 0;
    font-size: 1.05rem;
    color: #4a3d33;
  }

  .grid {
    display: grid;
    grid-template-columns: minmax(18rem, 1fr) minmax(22rem, 1.4fr);
    gap: 2rem;
    flex: 1;
  }

  .panel {
    background: rgba(255, 255, 255, 0.8);
    border-radius: 1.5rem;
    padding: 2rem;
    box-shadow: 0 20px 50px rgba(36, 35, 39, 0.12);
    border: 1px solid rgba(136, 92, 45, 0.1);
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    min-height: 0;
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
  }

  .panel-header h2 {
    margin: 0;
    font-size: 1.3rem;
  }

  .status {
    font-size: 0.85rem;
    padding: 0.3rem 0.75rem;
    border-radius: 999px;
    background: #d7f7da;
    color: #216b34;
    font-weight: 600;
  }

  .field {
    display: grid;
    gap: 0.6rem;
    font-weight: 600;
  }

  select,
  textarea {
    width: 100%;
    border-radius: 0.9rem;
    border: 1px solid rgba(98, 71, 45, 0.2);
    background: #fffaf3;
    padding: 0.85rem 1rem;
    font-size: 0.95rem;
    font-family: "DM Mono", "Space Grotesk", ui-monospace, SFMono-Regular,
      monospace;
    color: #2a2018;
  }

  textarea {
    min-height: 12rem;
    resize: vertical;
  }

  .actions {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  button {
    border: none;
    border-radius: 999px;
    padding: 0.75rem 1.8rem;
    font-weight: 600;
    cursor: pointer;
    transition:
      transform 0.2s ease,
      box-shadow 0.2s ease;
  }

  button:disabled {
    cursor: not-allowed;
    opacity: 0.6;
    box-shadow: none;
  }

  .primary {
    background: #2f1d0f;
    color: #fff;
    box-shadow: 0 12px 25px rgba(47, 29, 15, 0.2);
  }

  .primary:hover:not(:disabled) {
    transform: translateY(-1px);
  }

  .panel-actions {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .count {
    font-size: 0.85rem;
    color: #6f6050;
  }

  .ghost {
    background: #fff2e4;
    color: #6b3b14;
    border: 1px solid rgba(107, 59, 20, 0.2);
    padding: 0.5rem 1.2rem;
  }

  .output-list {
    flex: 1;
    overflow: auto;
    display: grid;
    gap: 1rem;
    padding-right: 0.5rem;
  }

  .empty {
    border: 1px dashed rgba(98, 71, 45, 0.3);
    border-radius: 1rem;
    padding: 2rem;
    text-align: center;
    color: #6a5b4a;
    background: rgba(255, 248, 236, 0.6);
  }

  @media (max-width: 900px) {
    .page {
      padding: 2.5rem 1.5rem;
    }

    .grid {
      grid-template-columns: 1fr;
    }

    .hero {
      align-items: flex-start;
    }
  }
</style>
