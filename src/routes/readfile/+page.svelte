<script lang="ts">
  import CodeTest from "$lib/CodeTest.svelte";
</script>

<CodeTest
  fs={{
    "example.txt": `This is an example file.`,
    "main.py": `
with open('example.txt', 'r') as f:
    content = f.read()
print(content)
`,
  }}
/>
