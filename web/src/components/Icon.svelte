<script lang="ts">
  // Icons are Lucide (@lucide/svelte); this maps the names the app uses to them.
  import type { Component } from "svelte";
  import Download from "@lucide/svelte/icons/download";
  import GraduationCap from "@lucide/svelte/icons/graduation-cap";
  import House from "@lucide/svelte/icons/house";
  import Info from "@lucide/svelte/icons/info";
  import LayoutDashboard from "@lucide/svelte/icons/layout-dashboard";
  import Maximize from "@lucide/svelte/icons/maximize-2";
  import Minimize from "@lucide/svelte/icons/minimize-2";
  import Monitor from "@lucide/svelte/icons/monitor";
  import Moon from "@lucide/svelte/icons/moon";
  import Pause from "@lucide/svelte/icons/pause";
  import Play from "@lucide/svelte/icons/play";
  import Plus from "@lucide/svelte/icons/plus";
  import Briefcase from "@lucide/svelte/icons/briefcase-business";
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import Route from "@lucide/svelte/icons/route";
  import Search from "@lucide/svelte/icons/search";
  import Sliders from "@lucide/svelte/icons/sliders-horizontal";
  import Sun from "@lucide/svelte/icons/sun";
  import Table from "@lucide/svelte/icons/table";
  import Users from "@lucide/svelte/icons/users";
  import Wallet from "@lucide/svelte/icons/wallet";
  import X from "@lucide/svelte/icons/x";

  let { name, size = 18 }: { name: string; size?: number } = $props();
  const ICONS: Record<string, Component<{ size?: number; "aria-hidden"?: boolean | "true" | "false"; style?: string }>> = {
    search: Search, sun: Sun, moon: Moon, monitor: Monitor, layout: LayoutDashboard, users: Users, house: House,
    wallet: Wallet, cap: GraduationCap, briefcase: Briefcase, route: Route, table: Table, play: Play, pause: Pause,
    maximize: Maximize, minimize: Minimize, info: Info, download: Download, chevron: ChevronDown, x: X, plus: Plus, sliders: Sliders,
  };
  const Glyph = $derived(ICONS[name] ?? Info);
  // Households: the Lucide house outline with a person inside (no single Lucide icon is both).
  const HOME_USERS = ["M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z", "M12 10a2 2 0 1 0 0 4 2 2 0 1 0 0-4z", "M8.5 18a3.5 3.5 0 0 1 7 0"];
  // Lucide has no brand icons, so GitHub is its own mark (the Octicons path).
  const GITHUB = "M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z";
</script>

{#if name === "home-users"}
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="display:block;flex:none">
    {#each HOME_USERS as d}<path {d} />{/each}
  </svg>
{:else if name === "github"}
  <svg viewBox="0 0 16 16" width={size} height={size} fill="currentColor" aria-hidden="true" style="display:block;flex:none"><path d={GITHUB} /></svg>
{:else}
  <Glyph {size} aria-hidden="true" style="display:block;flex:none" />
{/if}
