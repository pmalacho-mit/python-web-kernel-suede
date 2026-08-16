<script lang="ts">
  import { base } from "$app/paths";
</script>

<main class="mx-auto max-w-2xl px-4 py-10">
  <h1 class="mb-2 text-2xl font-semibold tracking-tight text-slate-900">
    python-web-kernel-suede
  </h1>
  <p class="mb-6 text-slate-600">
    Python source lives in <code class="rounded bg-slate-100 px-1 py-0.5"
      >src/lib/testing/workspaces</code
    >. This page exists to run it.
  </p>

  <a
    href={`${base}/tests`}
    class="group flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3 text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
  >
    <span class="font-medium">Tests</span>
    <span class="text-sm text-slate-400 transition group-hover:text-slate-600"
      >→</span
    >
  </a>
</main>
