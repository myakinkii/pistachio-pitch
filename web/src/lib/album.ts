// album.ts (web): the sticker album in the page. The rules of the album are in
// src/album/; this keeps the player's album in localStorage (pp-album-<season>),
// and draws the pixel portraits as SVG in the right kit.

import { reactive, watch } from "vue";
import {
  SEASON, TIERS, newAlbum, openPack, checkAlbum, checkSettings, placeInRoster, completion, expected,
  type AlbumState, type Pack, type Sticker, type Tier, type PackSettings,
} from "../../../src/album/index.ts";
import { FORMATION_NAMES, DEFAULT_FORMATION } from "../../../src/engine/index.ts";
import { KIT } from "./draw.ts";
import portraitData from "../../../data/seasons/s1-portraits.json" with { type: "json" };

export { SEASON, TIERS, completion, expected, type Sticker, type Tier };
export const TIER_NAME: Record<Tier, string> = { common: "Commons", rare: "Rares", legendary: "Legendaries" };
export const STICKER = new Map(SEASON.stickers.map(s => [s.id, s]));

const KEY = `pp-album-${SEASON.season}`;
const randomSeed = () => Math.random().toString(36).slice(2, 8);

function load(): AlbumState {
  try {
    const a = checkAlbum(JSON.parse(localStorage.getItem(KEY) ?? "null"), SEASON, FORMATION_NAMES);
    if (a) return a;
  } catch { /* storage unavailable or unreadable: start fresh */ }
  return newAlbum(SEASON, randomSeed(), DEFAULT_FORMATION);
}

export const album = reactive({
  open: false,
  tab: "album" as "album" | "packs" | "roster" | "lab",
  state: load(),
  last: null as Pack | null,          // the pack being revealed
  lastBatch: 0,                       // packs opened at once by the lab
  pick: null as number | null,        // roster spot being filled
});
watch(() => album.state, s => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage unavailable */ } });

export function openPacks(n = 1) {
  let s = album.state, pack: Pack | null = null;
  for (let i = 0; i < n; i++) ({ state: s, pack } = openPack(s, SEASON));
  album.state = s;
  album.last = n === 1 ? pack : null;
  album.lastBatch = n === 1 ? 0 : n;
}
export function place(spot: number, id: string | null) { album.state = placeInRoster(album.state, spot, id); album.pick = null; }
export function setRoster(p: Partial<Pick<AlbumState["roster"], "team" | "formation">>) { album.state = { ...album.state, roster: { ...album.state.roster, ...p } }; }
export function setSettings(x: PackSettings) { const s = checkSettings(x); if (s) album.state = { ...album.state, settings: s }; return !!s; }
export function resetSettings() { album.state = { ...album.state, settings: { cards: SEASON.pack.cards, rates: { ...SEASON.pack.rates } } }; }
/** Throw the album away and start a new one (optionally with a given seed); the settings stay. */
export function restart(seed?: string) {
  const s = album.state.settings;
  album.state = { ...newAlbum(SEASON, seed?.trim() || randomSeed(), album.state.roster.formation), settings: s };
  album.last = null; album.lastBatch = 0; album.pick = null;
}

// ---------- portraits ----------
type Portrait = { pal: Record<string, string>; rows: string[] };
const PORTRAITS = portraitData as Record<string, Portrait>;

const shade = (hex: string, f = .8) => "#" + [1, 3, 5].map(i => Math.round(parseInt(hex.slice(i, i + 2), 16) * f).toString(16).padStart(2, "0")).join("");
/**
 * The shirt digits in a portrait (see tools/art/faces.py) in a team's kit. Kernels
 * wear hoops, Shells stripes; keepers wear their kit reversed.
 */
function kit(team: "K" | "S", gk: boolean): Record<string, string> {
  const [one, two] = team === "K" ? [KIT.K1, KIT.K2] : [KIT.S1, KIT.S2];
  const shirt = gk ? two : one, mark = gk ? one : two;
  const hoop = team === "K", stripe = team === "S";
  const pick = (h: boolean, s: boolean) => ((h && hoop) || (s && stripe) ? mark : shirt);
  const out: Record<string, string> = { 9: mark };
  [[1, false, false], [3, true, false], [5, false, true], [7, true, true]].forEach(([d, h, s]) => {
    const c = pick(h as boolean, s as boolean);
    out[String(d)] = c; out[String((d as number) + 1)] = shade(c);
  });
  return out;
}

/** A portrait as SVG markup: one path per colour, made of horizontal runs. silhouette: one flat colour. */
export function portraitSvg(id: string, o: { team: "K" | "S"; gk?: boolean; silhouette?: boolean; label?: string }): string {
  const p = PORTRAITS[id] ?? PORTRAITS.placeholder;
  const pal: Record<string, string> = { ...p.pal, ...kit(o.team, !!o.gk) };
  const paths = new Map<string, string>();
  p.rows.forEach((row, y) => {
    for (let x = 0; x < row.length;) {
      const ch = row[x];
      let n = 1;
      while (row[x + n] === ch) n++;
      if (ch !== ".") {
        const col = o.silhouette ? "currentColor" : pal[ch] ?? "#ff00ff";
        paths.set(col, (paths.get(col) ?? "") + `M${x} ${y}h${n}v1h${-n}z`);
      }
      x += n;
    }
  });
  const body = [...paths].map(([c, d]) => `<path fill="${c}" d="${d}"/>`).join("");
  const a11y = o.label ? `role="img" aria-label="${o.label.replace(/"/g, "&quot;")}"` : `aria-hidden="true"`;
  return `<svg viewBox="0 0 32 32" shape-rendering="crispEdges" ${a11y}>${body}</svg>`;
}
