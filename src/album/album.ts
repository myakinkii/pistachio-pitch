// album.ts: the season sticker album, as pure functions of plain data.
//
// A season (data/seasons/<id>.json) is a fixed list of numbered stickers in three
// tiers. Packs are drawn with the engine's seeded generator, whose state is kept
// in the album, so an album replays exactly from its seed: the same code can roll
// packs in the page now and on a server later. Nothing here touches the match
// rules: stickers fill album slots and can be placed in a roster, nothing more.

import { seedState, next } from "../engine/rng.ts";

export const TIERS = ["common", "rare", "legendary"] as const;
export type Tier = (typeof TIERS)[number];

/** Face traits. Keep in step with TRAITS and ADDONS in tools/art/faces.py. */
export const TRAITS = {
  shell: ["plain", "roasted", "pale"],
  crack: ["left", "right", "wide", "none"],
  eyes: ["dots", "wide", "sleepy", "wink", "squint"],
  brows: ["none", "angry", "bushy", "raised"],
  mouth: ["smile", "grin", "gap", "oh", "smirk", "flat", "tongue"],
  hair: ["bald", "shiny", "buzz", "mohawk", "afro", "ponytail", "long", "spikes", "side", "mullet", "bun", "curtains", "topknot"],
  hairColor: ["dark", "blond", "red", "blue"],
  facial: ["none", "moustache", "beard", "goatee", "stubble", "sideburns"],
  marks: ["scar", "freckles", "blush"],
} as const;
export const ADDONS = ["goggles", "specs", "shades", "sweatband", "plaster", "armband", "earring"] as const;

export type Face = { [K in Exclude<keyof typeof TRAITS, "marks">]?: (typeof TRAITS)[K][number] } &
  { marks?: (typeof TRAITS)["marks"][number][]; salted?: boolean };
export type Bonus =
  | { type: "slot"; line: string; text: string }
  | { type: "perk"; name: string; text: string; cost: number | null };

/**
 * A sticker. Season one only has faces: a pistachio with a look, optionally with
 * add-ons drawn in and a bonus (rares and legendaries). Add-on stickers
 * ({kind: "addon", addon}) are planned and accepted by the loader, but not used yet.
 */
export interface Sticker {
  no: number;
  id: string;
  tier: Tier;
  kind: "face" | "addon";
  name: string;
  pos?: string;
  face?: Face;
  addon?: string;
  addons?: string[];
  bonus?: Bonus;
}
export interface PackSettings { cards: number; rates: Record<Tier, number> }
export interface Season { season: string; title: string; pack: PackSettings; stickers: Sticker[] }

export interface Roster { team: "K" | "S"; formation: string; spots: (string | null)[] }
export interface AlbumState {
  v: 1;
  season: string;
  seed: string;
  rng: number;
  packs: number;
  owned: Record<string, number>;   // sticker id -> copies
  roster: Roster;
  settings: PackSettings;
}
/** One pack as it came out: sticker ids in order, and whether each was new. */
export interface Pack { ids: string[]; fresh: boolean[] }

export class SeasonError extends Error {}
const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const oneOf = <T extends readonly string[]>(list: T, x: unknown): x is T[number] => typeof x === "string" && list.includes(x);

/** Check a season file and return it typed. positions: the build names (data/builds.json). */
export function loadSeason(raw: unknown, positions: string[]): Season {
  const fail = (m: string): never => { throw new SeasonError(m); };
  if (!isObj(raw) || typeof raw.season !== "string" || typeof raw.title !== "string") fail("a season needs season and title");
  const r = raw as Record<string, unknown>;
  const pack = checkSettings(r.pack) ?? fail(`${r.season}: bad pack settings`);
  if (!Array.isArray(r.stickers) || !r.stickers.length) fail(`${r.season}: no stickers`);
  const ids = new Set<string>(), nos = new Set<number>();
  for (const s of r.stickers as unknown[]) {
    if (!isObj(s)) fail(`${r.season}: a sticker is not an object`);
    const st = s as Record<string, unknown>, at = `${r.season} #${String(st.no)}`;
    if (!Number.isInteger(st.no) || (st.no as number) < 1 || nos.has(st.no as number)) fail(`${at}: number missing or repeated`);
    if (typeof st.id !== "string" || ids.has(st.id)) fail(`${at}: id missing or repeated`);
    if (!oneOf(TIERS, st.tier)) fail(`${at}: unknown tier ${String(st.tier)}`);
    if (typeof st.name !== "string" || !st.name) fail(`${at}: no name`);
    if (st.kind === "face") {
      if (!oneOf(positions, st.pos)) fail(`${at}: unknown position ${String(st.pos)}`);
      if (!isObj(st.face)) fail(`${at}: no face`);
      for (const [k, v] of Object.entries(st.face as object)) {
        if (k === "salted") { if (typeof v !== "boolean") fail(`${at}: salted must be true or false`); continue; }
        if (k === "marks") { if (!Array.isArray(v) || !v.every(m => oneOf(TRAITS.marks, m))) fail(`${at}: bad marks`); continue; }
        const allowed = (TRAITS as Record<string, readonly string[]>)[k];
        if (!allowed || !oneOf(allowed, v)) fail(`${at}: unknown trait ${k}: ${String(v)}`);
      }
    } else if (st.kind === "addon") {
      if (!oneOf(ADDONS, st.addon)) fail(`${at}: unknown add-on ${String(st.addon)}`);
    } else fail(`${at}: unknown kind ${String(st.kind)}`);
    if (st.addons !== undefined && (!Array.isArray(st.addons) || !st.addons.every(a => oneOf(ADDONS, a)))) fail(`${at}: bad add-ons`);
    if (st.bonus !== undefined) {
      const b = st.bonus as Record<string, unknown>;
      const ok = isObj(b) && typeof b.text === "string" &&
        ((b.type === "slot" && typeof b.line === "string") ||
         (b.type === "perk" && typeof b.name === "string" && (b.cost === null || typeof b.cost === "number")));
      if (!ok) fail(`${at}: bad bonus`);
    }
    ids.add(st.id as string); nos.add(st.no as number);
  }
  for (const t of TIERS) if (!(r.stickers as Sticker[]).some(s => s.tier === t)) fail(`${r.season}: no ${t} stickers`);
  return { season: r.season as string, title: r.title as string, pack, stickers: (r.stickers as Sticker[]).slice().sort((a, b) => a.no - b.no) };
}

/** Pack settings, or null when they don't make sense (cards 1..20, rates >= 0 with a positive sum). */
export function checkSettings(x: unknown): PackSettings | null {
  if (!isObj(x) || !Number.isInteger(x.cards) || (x.cards as number) < 1 || (x.cards as number) > 20 || !isObj(x.rates)) return null;
  const rates = {} as Record<Tier, number>;
  for (const t of TIERS) {
    const v = (x.rates as Record<string, unknown>)[t];
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0) return null;
    rates[t] = v;
  }
  return TIERS.some(t => rates[t] > 0) ? { cards: x.cards as number, rates } : null;
}

export const ROSTER_SIZE = 11;
export function newAlbum(season: Season, seed: string, formation = "4-4-2"): AlbumState {
  return {
    v: 1, season: season.season, seed, rng: seedState(seed), packs: 0, owned: {},
    roster: { team: "K", formation, spots: Array(ROSTER_SIZE).fill(null) },
    settings: { cards: season.pack.cards, rates: { ...season.pack.rates } },
  };
}

const byTier = (season: Season) => Object.fromEntries(TIERS.map(t => [t, season.stickers.filter(s => s.tier === t)])) as Record<Tier, Sticker[]>;

/** Rates as probabilities, leaving out tiers the season has no stickers in. */
function probabilities(season: Season, settings: PackSettings): Record<Tier, number> {
  const tiers = byTier(season);
  const w = Object.fromEntries(TIERS.map(t => [t, tiers[t].length ? settings.rates[t] : 0])) as Record<Tier, number>;
  const sum = TIERS.reduce((a, t) => a + w[t], 0);
  return Object.fromEntries(TIERS.map(t => [t, sum ? w[t] / sum : 0])) as Record<Tier, number>;
}

/** Draw one sticker: a tier by the rates, then a sticker of that tier, uniformly. */
function draw(rng: number, tiers: Record<Tier, Sticker[]>, p: Record<Tier, number>): [number, string] {
  let v: number;
  [rng, v] = next(rng);
  let u = v / 2 ** 32, tier: Tier = TIERS[0];
  for (const t of TIERS) { if (p[t] > 0) tier = t; if (u < p[t]) { tier = t; break; } u -= p[t]; }
  [rng, v] = next(rng);
  const list = tiers[tier];
  return [rng, list[v % list.length].id];
}

/** Open a pack: a new state (the album is never changed in place) and what came out. */
export function openPack(state: AlbumState, season: Season): { state: AlbumState; pack: Pack } {
  const tiers = byTier(season), p = probabilities(season, state.settings);
  const owned = { ...state.owned }, ids: string[] = [], fresh: boolean[] = [];
  let rng = state.rng;
  for (let i = 0; i < state.settings.cards; i++) {
    let id: string;
    [rng, id] = draw(rng, tiers, p);
    fresh.push(!owned[id]);
    owned[id] = (owned[id] ?? 0) + 1;
    ids.push(id);
  }
  return { state: { ...state, rng, packs: state.packs + 1, owned }, pack: { ids, fresh } };
}

export interface Completion { owned: number; total: number }
/** Stickers collected per tier and overall, and the number of duplicates. */
export function completion(state: AlbumState, season: Season): Record<Tier | "all", Completion> & { dupes: number } {
  const out = { all: { owned: 0, total: 0 }, dupes: 0 } as Record<Tier | "all", Completion> & { dupes: number };
  for (const t of TIERS) out[t] = { owned: 0, total: 0 };
  for (const s of season.stickers) {
    const n = state.owned[s.id] ?? 0;
    out[s.tier].total++; out.all.total++;
    if (n) { out[s.tier].owned++; out.all.owned++; out.dupes += n - 1; }
  }
  return out;
}

/** Expected stickers collected per tier after a number of packs: N(1 - (1 - 1/N)^draws). */
export function expected(season: Season, settings: PackSettings, packs: number): Record<Tier | "all", number> {
  const tiers = byTier(season), p = probabilities(season, settings);
  const out = { all: 0 } as Record<Tier | "all", number>;
  for (const t of TIERS) {
    const n = tiers[t].length;
    out[t] = n ? n * (1 - (1 - 1 / n) ** (packs * settings.cards * p[t])) : 0;
    out.all += out[t];
  }
  return out;
}

/** Many players opening the same number of packs: how many stickers each ends up with. */
export function simulate(season: Season, settings: PackSettings, packs: number, players: number, seed: string) {
  const counts: number[] = [];
  for (let i = 0; i < players; i++) {
    let a = { ...newAlbum(season, `${seed}/${i}`), settings };
    for (let k = 0; k < packs; k++) a = openPack(a, season).state;
    counts.push(Object.keys(a.owned).length);
  }
  const sorted = counts.slice().sort((x, y) => x - y);
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  const mean = counts.reduce((x, y) => x + y, 0) / Math.max(1, counts.length);
  return { counts, mean, p10: at(.1), median: at(.5), p90: at(.9), complete: counts.filter(c => c === season.stickers.length).length };
}

/**
 * An album read from storage, checked against the season, or null if it can't be
 * used. Unknown sticker ids are dropped, and roster spots must hold owned stickers.
 */
export function checkAlbum(raw: unknown, season: Season, formations: string[]): AlbumState | null {
  if (!isObj(raw) || raw.v !== 1 || raw.season !== season.season || typeof raw.seed !== "string") return null;
  if (!Number.isInteger(raw.rng) || (raw.rng as number) < 0 || (raw.rng as number) > 0xffffffff) return null;
  if (!Number.isInteger(raw.packs) || (raw.packs as number) < 0 || !isObj(raw.owned)) return null;
  const settings = checkSettings(raw.settings);
  if (!settings) return null;
  const known = new Set(season.stickers.map(s => s.id)), owned: Record<string, number> = {};
  for (const [id, n] of Object.entries(raw.owned)) if (known.has(id) && Number.isInteger(n) && (n as number) > 0) owned[id] = Math.min(n as number, 9999);
  const r = isObj(raw.roster) ? raw.roster : {};
  const roster: Roster = {
    team: r.team === "S" ? "S" : "K",
    formation: typeof r.formation === "string" && formations.includes(r.formation) ? r.formation : formations[0],
    spots: Array.from({ length: ROSTER_SIZE }, (_, i) => {
      const id = Array.isArray(r.spots) ? r.spots[i] : null;
      return typeof id === "string" && owned[id] ? id : null;
    }),
  };
  return { v: 1, season: season.season, seed: raw.seed, rng: raw.rng as number, packs: raw.packs as number, owned, roster, settings };
}

/** Put an owned sticker in a roster spot (or clear it with null). A sticker sits in one spot at most. */
export function placeInRoster(state: AlbumState, spot: number, id: string | null): AlbumState {
  if (spot < 0 || spot >= ROSTER_SIZE || (id !== null && !state.owned[id])) return state;
  const spots = state.roster.spots.map(x => (x === id ? null : x));
  spots[spot] = id;
  return { ...state, roster: { ...state.roster, spots } };
}
