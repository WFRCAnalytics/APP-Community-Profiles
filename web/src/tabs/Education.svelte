<script lang="ts">
  import ShareCard from "../components/ShareCard.svelte";
  import Tiles from "../components/Tiles.svelte";
  import TrendCard from "../components/TrendCard.svelte";
  import { SPECS } from "../lib/specs";
</script>

<div class="tab">
  <Tiles ids={["bachelors", "grad", "no_hs", "enrolled", "college"]} />
  <div class="g c3r2">
    <ShareCard title="Educational attainment (25 and over)" spec={SPECS.education} note="Published from 2012." />
    <ShareCard title="School enrollment (3 and over)" spec={SPECS.enrollment} />
    <TrendCard title="Adults with a bachelor's degree or more" id="bachelors" />
    <TrendCard title="Adults with a graduate degree" id="grad" />
    <TrendCard title="Adults without a high school diploma" id="no_hs" />
    <TrendCard title="People in college or graduate school" id="college" />
  </div>
</div>
