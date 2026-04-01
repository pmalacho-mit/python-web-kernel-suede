<script lang="ts">
  import ps4 from "./ps4.py?raw";
  import test from "./test/test.py?raw";
  import helpers from "./test/helpers.py?raw";
  import sample_temperature_data from "./test/sample_temperature_data.csv?raw";
  import sample_disaster_data from "./test/sample_disaster_data.json?raw";
  import disasters from "./data/disasters.csv?raw";
  import population from "./data/population.json?raw";
  import temp_change from "./data/temp_change.csv?raw";
  import CodeTest from "$lib/CodeTest.svelte";
</script>

<CodeTest
  fs={{
    "__init__.py": "",
    ps4,
    test: {
      "__init__.py": "",
      test,
      helpers,
      ["sample_temperature_data.csv"]: sample_temperature_data,
      ["sample_disaster_data.json"]: sample_disaster_data,
    },
    data: {
      ["disasters.csv"]: disasters,
      ["population.json"]: population,
      ["temp_change.csv"]: temp_change,
    },
  }}
/>
