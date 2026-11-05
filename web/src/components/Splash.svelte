<script lang="ts">
  import { onMount } from "svelte";
  import { app } from "../lib/app.svelte";

  // The status line follows the real load; each entry is shown while that step is under way.
  const STEPS = [
    { id: "engine", text: "Starting the data engine" },
    { id: "site", text: "Reading the site settings" },
    { id: "areas", text: "Finding counties, cities and neighborhoods" },
    { id: "census", text: "Counting people" },
    { id: "jobs", text: "Following the commute" },
    { id: "wages", text: "Adding up jobs and wages" },
  ];

  const WORDS = [
    { w: "communities", s: "font-weight:700" },
    { w: "neighborhoods", s: "font-style:italic;font-weight:500" },
    { w: "places", s: "font-weight:300" },
    { w: "people", s: "font-weight:700;font-style:italic" },
  ];

  let i = $state(0);
  onMount(() => {
    const t = setInterval(() => (i = (i + 1) % WORDS.length), 1800);
    return () => clearInterval(t);
  });

  const done = $derived(Math.min(app.loaded.length, STEPS.length));
  const step = $derived(STEPS.find((s) => !app.loaded.includes(s.id)) ?? STEPS.at(-1)!);
</script>

<div class="splash-in" role="status" aria-live="polite">
  <h1>
    Getting to know your<br />
    {#key i}<span class="word" style={WORDS[i].s}>{WORDS[i].w}</span>{/key}
  </h1>
  <p class="step">{step.text}…</p>
  <div class="track" aria-hidden="true"><i style="width:{Math.max((done / STEPS.length) * 100, 8)}%"></i></div>
</div>

<style>
  .splash-in { display: grid; justify-items: center; gap: 14px; }
  h1 { font-size: clamp(1.5rem, 4vw, 2.2rem); line-height: 1.2; font-weight: 400; font-family: var(--f-body); color: var(--text); }
  .word { display: inline-block; color: var(--accent); animation: pop 0.4s ease-out; }
  .step { margin: 0; font-size: 1rem; color: var(--muted); }
  .track { width: 220px; height: 4px; border-radius: 2px; background: var(--raised); overflow: hidden; }
  .track i { display: block; height: 100%; background: var(--sel); transition: width 0.4s ease; }
  @keyframes pop { from { opacity: 0; transform: translateY(0.3em); } to { opacity: 1; transform: none; } }
  @media (prefers-reduced-motion: reduce) { .word { animation: none; } }
</style>
