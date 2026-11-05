<script lang="ts">
  import { marked } from "marked";
  import methodology from "../../../METHODOLOGY.md?raw";

  // METHODOLOGY.md is the single source: it is read in the repository and rendered here.
  const html = marked.parse(methodology, { async: false }) as string;
</script>

<div class="page" id="methods">
  <article class="prose">
    <!-- eslint-disable-next-line svelte/no-at-html-tags -->
    {@html html}
  </article>
</div>
