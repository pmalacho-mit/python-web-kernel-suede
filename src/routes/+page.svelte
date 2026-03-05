<script lang="ts">
  import { base } from "$app/paths";

  export const routes = Object.keys(
    import.meta.glob("/src/routes/**/+page.svelte"),
  ).map(
    (path) =>
      path.replace("/src/routes", "").replace("/+page.svelte", "") || "/",
  );
</script>

<main class="mx-auto max-w-2xl px-4 py-10">
  <h1 class="mb-6 text-2xl font-semibold tracking-tight text-slate-900">
    Pages
  </h1>

  <ul class="space-y-3">
    {#each routes as route}
      <li>
        <a
          href={route === "/" ? `${base}/` : `${base}${route}`}
          class="group flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3 text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
        >
          <span class="font-medium">{route}</span>
          <span
            class="text-sm text-slate-400 transition group-hover:text-slate-600"
            >→</span
          >
        </a>
      </li>
    {/each}
  </ul>
</main>
