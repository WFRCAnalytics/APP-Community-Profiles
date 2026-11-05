<script lang="ts">
  // The source for the year being shown. Each panel also names its own source (ACS, LODES8, QCEW, population estimates).
  import { app } from "../lib/app.svelte";
  import Icon from "./Icon.svelte";
</script>

<footer class="foot"><Icon name="info" size={13} /><span><b>{app.v}:</b> {app.v - 4}–{app.v} American Community Survey 5-year estimates. Each panel names its own source.</span></footer>
