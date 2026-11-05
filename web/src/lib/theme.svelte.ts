// Light, dark or follow the system. The choice is kept per viewer; the resolved mode drives CSS (data-theme) and
// is reactive, so charts and the map redraw when it changes.
export type Pref = "light" | "dark" | "system";
const KEY = "wfrc-profiles-theme";

function stored(): Pref {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch { /* storage blocked: fall back to the system setting */ }
  return "system";
}

const media = typeof matchMedia === "function" ? matchMedia("(prefers-color-scheme: dark)") : null;

class Theme {
  pref = $state<Pref>(stored());
  systemDark = $state(media?.matches ?? false);
  resolved = $derived<"light" | "dark">(this.pref === "system" ? (this.systemDark ? "dark" : "light") : this.pref);

  constructor() {
    media?.addEventListener("change", (e) => { this.systemDark = e.matches; this.apply(); });
    this.apply();
  }
  apply() {
    const mode = this.pref === "system" ? (this.systemDark ? "dark" : "light") : this.pref;
    document.documentElement.dataset.theme = mode;
  }
  set(pref: Pref) {
    this.pref = pref;
    try { localStorage.setItem(KEY, pref); } catch { /* ignore */ }
    this.apply();
  }
  cycle() {
    this.set(this.pref === "system" ? "light" : this.pref === "light" ? "dark" : "system");
  }
}

export const theme = new Theme();

// Colours the charts read from CSS variables, so they follow the theme without a second palette in code.
export function palette() {
  const css = getComputedStyle(document.documentElement);
  const get = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  return {
    selected: get("--sel", "#1479B8"),
    compare: get("--cmp", "#D2582A"),
    c3: get("--c3", "#8A5FB0"),
    c4: get("--c4", "#D6A21E"),
    c5: get("--c5", "#1FA0A6"),
    ink: get("--ink", "#16232C"),
    ink2: get("--ink-2", "#4F5E69"),
    surface: get("--surface", "#FFFFFF"),
    grid: get("--grid", "#D9E0E5"),
  };
}
export type Palette = ReturnType<typeof palette>;
