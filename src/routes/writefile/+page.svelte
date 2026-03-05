<script lang="ts">
  import CodeTest from "$lib/CodeTest.svelte";
</script>

<CodeTest
  fs={{
    "main.py": `
with open('example.txt', 'w') as f:
    f.write('Hello, world!')
`,
  }}
/>
