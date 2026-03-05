<script lang="ts">
  import { base } from "$app/paths";
  import "../app.css";
  let { children } = $props();
</script>

<a
  href={`${base}/`}
  class="fixed bottom-4 left-4 z-50 rounded-md border border-slate-300 bg-white/90 px-3 py-1.5 text-sm font-medium text-slate-700 opacity-35 shadow-sm backdrop-blur transition-opacity hover:opacity-100"
>
  Home
</a>

{@render children()}
