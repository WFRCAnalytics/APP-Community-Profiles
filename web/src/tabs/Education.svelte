<script lang="ts">
  import ShareCard from "../components/ShareCard.svelte";
  import Tiles from "../components/Tiles.svelte";
  import TrendCard from "../components/TrendCard.svelte";
  import { SPECS } from "../lib/specs";
</script>

<div style="display:flex;flex-direction:column;gap:12px;height:100%">
  <Tiles ids={["bachelors"]} cols={1} style="max-width:260px" />
  <div class="g" style="flex:1;grid-template-columns:repeat(3,minmax(0,1fr));grid-template-rows:minmax(0,1fr)">
    <ShareCard title="Educational attainment (25 and over)" spec={SPECS.education} note="Published from 2012." />
    <ShareCard title="School enrollment (3 and over)" spec={SPECS.enrollment} />
    <TrendCard title="Adults with a bachelor's degree or more" id="bachelors" />
  </div>
</div>
