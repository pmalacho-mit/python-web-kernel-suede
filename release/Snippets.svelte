{#snippet unrecognized(identifier: string | Output.Any, detail: string)}
  <div>
    Unrecognized {typeof identifier === "string"
      ? identifier
      : identifier.output_type} ({detail}). Please contact the Pytutor
    maintainers and/or your professor.
  </div>
{/snippet}

{#snippet stream(output: Output.Stream)}
  {@const access = accessor(output)}
  {@const text = access.out ?? access.err}

  {#if Array.isArray(text)}
    {#each text as line}
      {@render row(line)}
    {/each}
  {:else if typeof text === "string"}
    {@render row(text)}
  {:else}
    {@render unrecognized("stream", JSON.stringify(typeof text))}
  {/if}

  {#snippet row(line: string)}
    <div style:white-space="pre-line">
      {line}
    </div>
  {/snippet}
{/snippet}

{#snippet displayData(output: Output.DisplayData)}
  {@const access = accessor(output)}
  {#if access.image}
    <img src={access.image} alt="display output" />
  {:else}
    {@render unrecognized(output, JSON.stringify(Object.keys(output.data)))}
  {/if}
{/snippet}

{#snippet executeResult(output: Output.ExecuteResult)}
  {@const access = accessor(output)}
  {#if access.html}
    <div {@attach evalScriptTagsHack}>
      {@html access.html}
    </div>
  {:else if access.plain}
    <div style:white-space="pre-line">
      {access.plain}
    </div>
  {:else}
    {@render unrecognized(output, JSON.stringify(Object.keys(output.data)))}
  {/if}
{/snippet}

{#snippet errorResult(output: Output.Error)}
  <strong>{output.ename}: {output.evalue}</strong>
  <pre>
    {#each output.traceback as line}
      {line}
    {/each}
  </pre>
{/snippet}
