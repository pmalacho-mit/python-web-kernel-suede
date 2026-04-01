<script lang="ts">
  import CodeTest from "$lib/CodeTest.svelte";
  import main from "./main.py?raw";
</script>

<CodeTest fs={{ main }} />
