// Development-only page: the map card on its own, at the size it has in the layout (392 by about 640).
import "@fontsource-variable/inter";
import { mount } from "svelte";
import MapCard from "../src/components/MapCard.svelte";
import { app } from "../src/lib/app.svelte";
import "../src/app.css";

const host = document.getElementById("app")!;
host.style.cssText = "padding:24px;display:flex;gap:24px;height:100%;box-sizing:border-box;background:var(--bg)";
const card = document.createElement("div");
card.style.cssText = "width:392px;height:640px;border-radius:16px;overflow:hidden;border:1px solid var(--border)";
host.append(card);
document.body.style.overflow = "auto";
app.init().then(() => mount(MapCard, { target: card }));
