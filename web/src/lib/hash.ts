// The URL hash keeps the chosen area, comparison, period and tab, so a view can be shared:
//   #type=county&id=49035&cmp=49&v=2024&tab=housing
export interface HashState {
  type?: string;
  id?: string;
  cmp?: string;
  v?: number;
  tab?: string;
  page?: string;
}

export function parseHash(hash: string): HashState {
  const p = new URLSearchParams(hash.replace(/^#/, ""));
  const v = Number(p.get("v"));
  return {
    type: p.get("type") || undefined,
    id: p.get("id") || undefined,
    cmp: p.get("cmp") || undefined,
    v: Number.isFinite(v) && v > 0 ? v : undefined,
    tab: p.get("tab") || undefined,
    page: p.get("page") || undefined,
  };
}

export function formatHash(s: HashState): string {
  const p = new URLSearchParams();
  if (s.page) p.set("page", s.page);
  if (s.type) p.set("type", s.type);
  if (s.id) p.set("id", s.id);
  if (s.cmp) p.set("cmp", s.cmp);
  if (s.v) p.set("v", String(s.v));
  if (s.tab && s.tab !== "overview") p.set("tab", s.tab);
  return `#${p}`;
}
