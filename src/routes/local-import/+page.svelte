<script lang="ts">
  import CodeTest from "$lib/CodeTest.svelte";
</script>

<CodeTest
  fs={{
    fromchild: `from child.childdata import x
print(x)`,
    parentdata: `x = "parent"`,
    parentlevel: `from parentdata import x
print(x)
    `,
    child: {
      fromparent: `from parentdata import x
print(x)
# child
`,
      childlevel: `from childdata import x
print(x)
# child`,
      childdata: `x = "child"`,
    },
  }}
/>
