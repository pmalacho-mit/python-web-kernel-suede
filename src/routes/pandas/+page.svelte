<script lang="ts">
  import CodeTest from "$lib/CodeTest.svelte";
</script>

<CodeTest
  fs={{
    "main.py": `
import pandas as pd
df = pd.DataFrame({
    'Name': ['Alice', 'Bob', 'Charlie'],
    'Age': [25, 30, 35]
})
df
`,
  }}
/>
