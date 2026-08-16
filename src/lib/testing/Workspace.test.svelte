<script lang="ts" module>
  import { Sweater } from "../../../sweater-vest-suede";
  import { snippets } from "../../../release";
  import { capacity, discover, execute, type Workspace } from "./workspace";

  const workspaces = discover();
</script>

<script lang="ts">
  class Pocket {
    runs = $state<Workspace.Run[]>([]);
  }
</script>

<Sweater config category="workspaces" orientation="horizontal" />

{#each workspaces as workspace (workspace.name)}
  <Sweater
    name={workspace.name}
    id={`workspace-${workspace.name}`}
    body={async (harness) => {
      const pocket = harness.set(new Pocket());

      const session = await execute(workspace, (run) => pocket.runs.push(run));

      harness.note(
        `${session.runs.length} entry point(s) in one of ${capacity} workers`,
      );
      harness.capture("png");
      harness.expect(session.failure).toBe("");

      await workspace.module.after?.({ ...session, expect: harness.expect });
    }}
  >
    {#snippet vest(pocket: Pocket)}
      <div class="workspace">
        {#each pocket.runs as run (run.entry)}
          <section>
            <h4>{run.entry}</h4>
            {#if run.outputs.length === 0}
              <p class="quiet">no output</p>
            {/if}
            {#each run.outputs as output}
              {@render snippets.output.any(output)}
            {/each}
          </section>
        {:else}
          <p class="quiet">running…</p>
        {/each}
      </div>
    {/snippet}
  </Sweater>
{/each}

<style>
  .workspace {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 0.75rem;
    overflow: auto;
    font-size: 0.85rem;
  }

  h4 {
    margin: 0 0 0.25rem;
    font-family: ui-monospace, monospace;
    font-size: 0.75rem;
    opacity: 0.6;
  }

  .quiet {
    margin: 0;
    opacity: 0.5;
  }
</style>
