<script lang="ts">
  // Hosts a chart built by a plain function. It redraws when the container resizes or when the theme changes.
  import { palette, theme, type Palette } from "../lib/theme.svelte";

  let { draw, label }: { draw: (width: number, pal: Palette) => Element; label: string } = $props();
  let box: HTMLDivElement | undefined = $state();
  let width = $state(0);

  $effect(() => {
    if (!box || width < 120) return;
    theme.resolved; // redraw on theme change
    try {
      box.replaceChildren(draw(Math.floor(width), palette()));
      // The wrapper is the one labelled image; the drawing inside is presentational (the numbers are in the table view).
      for (const svg of box.querySelectorAll("svg")) svg.setAttribute("aria-hidden", "true");
      for (const n of box.querySelectorAll("[aria-label]")) n.removeAttribute("aria-label");
    } catch (e) {
      box.textContent = `Could not draw this chart: ${e instanceof Error ? e.message : e}`;
      console.error(e);
    }
  });
</script>

<div class="chart" role="img" aria-label="{label}. The numbers are in the table view." bind:this={box} bind:clientWidth={width}></div>
