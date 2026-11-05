<script lang="ts">
  // The place for the commute flow map (desire lines from the selected area to where its workers live or work). Filled in when the
  // map is built; until then it holds the panel so the layout of the tab does not change.
  let { style = "" }: { style?: string } = $props();
</script>

<section class="pn" aria-label="Commute flow map" {style}>
  <div class="pn-head"><h3>Commute flow map</h3></div>
  <div class="pn-body"><div class="empty">The flow map will go here: lines from the selected area to the places where its workers live and work.</div></div>
</section>
