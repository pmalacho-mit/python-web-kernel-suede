<script lang="ts">
  import CodeTest from "$lib/CodeTest.svelte";
  import ps3 from "./ps3.py?raw";
  import test_ps3_student from "./test_ps3_student.py?raw";
  import helper from "./helper.py?raw";
</script>

<CodeTest fs={{ ps3, test_ps3_student, helper }} />
