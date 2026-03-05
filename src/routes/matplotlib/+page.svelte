<script lang="ts">
  import CodeTest from "$lib/CodeTest.svelte";
</script>

<CodeTest
  fs={{
    main: `
import matplotlib.pyplot as plt
plt.plot([1, 2, 3], [4, 5, 6])
plt.show()
`,
  }}
/>
