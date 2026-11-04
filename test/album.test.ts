import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  SEASON, TIERS, loadSeason, newAlbum, openPack, completion, expected, simulate, checkAlbum, placeInRoster, checkSettings,
  SeasonError, type AlbumState,
} from "../src/album/index.ts";
import { BUILDS, FORMATION_NAMES } from "../src/engine/index.ts";

const portraits = JSON.parse(readFileSync(new URL("../data/seasons/s1-portraits.json", import.meta.url), "utf8"));
const raw = JSON.parse(readFileSync(new URL("../data/seasons/s1.json", import.meta.url), "utf8"));
const POS = Object.keys(BUILDS);
const open = (a: AlbumState, n: number) => { for (let i = 0; i < n; i++) a = openPack(a, SEASON).state; return a; };

test("season one: 50 stickers, 32 commons, 12 rares, 6 legendaries, numbered 1 to 50", () => {
  assert.equal(SEASON.stickers.length, 50);
  const n = (t: string) => SEASON.stickers.filter(s => s.tier === t).length;
  assert.deepEqual([n("common"), n("rare"), n("legendary")], [32, 12, 6]);
  assert.deepEqual(SEASON.stickers.map(s => s.no), Array.from({ length: 50 }, (_, i) => i + 1));
  for (const s of SEASON.stickers) {
    assert.ok(POS.includes(s.pos!), `${s.id} position`);
    assert.ok(portraits[s.id]?.rows?.length === 32 && portraits[s.id].rows.every((r: string) => r.length === 32), `${s.id} has a 32x32 portrait`);
    if (s.tier === "rare") assert.equal(s.bonus?.type, "slot");
    if (s.tier === "legendary") assert.equal(s.bonus?.type, "perk");
    if (s.tier !== "common") assert.ok(s.addons?.length, `${s.id} has an add-on drawn in`);
  }
  assert.ok(portraits.placeholder, "a placeholder portrait");
  // every colour a portrait uses is in its palette, or a kit digit the page fills in
  for (const [id, p] of Object.entries(portraits) as [string, { pal: Record<string, string>; rows: string[] }][])
    for (const ch of new Set(p.rows.join(""))) assert.ok(ch === "." || /[1-9]/.test(ch) || p.pal[ch], `${id}: no colour for ${ch}`);
});

test("the loader refuses bad seasons and accepts add-on stickers", () => {
  const bad = (f: (s: any) => void, msg: RegExp) => {
    const s = structuredClone(raw); f(s);
    assert.throws(() => loadSeason(s, POS), (e: unknown) => e instanceof SeasonError && msg.test(e.message));
  };
  bad(s => { s.stickers[1].id = s.stickers[0].id; }, /id/);
  bad(s => { s.stickers[1].no = 1; }, /number/);
  bad(s => { s.stickers[0].pos = "LIBERO"; }, /position/);
  bad(s => { s.stickers[0].face.hair = "beehive"; }, /trait hair/);
  bad(s => { s.stickers[40].addons = ["monocle"]; }, /add-ons/);
  bad(s => { s.stickers[0].tier = "epic"; }, /tier/);
  bad(s => { s.pack.rates = { common: 0, rare: 0, legendary: 0 }; }, /pack/);
  const s = structuredClone(raw);
  s.stickers.push({ no: 51, id: "s1-051", tier: "common", kind: "addon", name: "Sports goggles", addon: "goggles" });
  assert.equal(loadSeason(s, POS).stickers.length, 51);
});

test("the same seed gives the same packs; packs don't change the album they came from", () => {
  const a = newAlbum(SEASON, "same"), b = newAlbum(SEASON, "same");
  const x = openPack(a, SEASON), y = openPack(b, SEASON);
  assert.deepEqual(x.pack, y.pack);
  assert.equal(x.pack.ids.length, 4);
  assert.deepEqual(a.owned, {}); assert.equal(a.packs, 0);
  assert.equal(x.state.packs, 1);
  assert.deepEqual(open(a, 30), open(b, 30));
  assert.notDeepEqual(open(newAlbum(SEASON, "other"), 30).owned, open(a, 30).owned);
  // new/duplicate flags follow what was owned before each sticker
  let s = newAlbum(SEASON, "flags");
  for (let i = 0; i < 20; i++) {
    const seen = new Set(Object.keys(s.owned)), r = openPack(s, SEASON);
    r.pack.ids.forEach((id, k) => { assert.equal(r.pack.fresh[k], !seen.has(id)); seen.add(id); });
    s = r.state;
  }
});

test("drop rates hold over many packs", () => {
  const a = open(newAlbum(SEASON, "rates"), 5000);
  const tier = new Map(SEASON.stickers.map(s => [s.id, s.tier]));
  const n = { common: 0, rare: 0, legendary: 0 } as Record<string, number>;
  for (const [id, c] of Object.entries(a.owned)) n[tier.get(id)!] += c;
  const total = 5000 * 4;
  for (const t of TIERS) assert.ok(Math.abs(n[t] / total - SEASON.pack.rates[t]) < 0.01, `${t}: ${n[t] / total}`);
  // a tier with rate 0 never drops
  const none = open({ ...newAlbum(SEASON, "z"), settings: { cards: 4, rates: { common: 1, rare: 1, legendary: 0 } } }, 500);
  assert.ok(Object.keys(none.owned).every(id => tier.get(id) !== "legendary"));
});

test("expected() agrees with a simulation, and gives the numbers we designed for", () => {
  const e = expected(SEASON, SEASON.pack, 20);
  assert.ok(Math.abs(e.all - 38.3) < 0.1, `expected ${e.all}`);
  const r = simulate(SEASON, SEASON.pack, 20, 400, "check");
  assert.ok(Math.abs(r.mean - e.all) < 0.8, `simulated ${r.mean} vs expected ${e.all}`);
  const c = completion(open(newAlbum(SEASON, "c"), 20), SEASON);
  assert.equal(c.all.total, 50);
  assert.equal(c.all.owned, c.common.owned + c.rare.owned + c.legendary.owned);
  assert.equal(c.dupes, 80 - c.all.owned);
});

test("albums from storage are checked; the roster only holds owned stickers, each once", () => {
  let a = open(newAlbum(SEASON, "store"), 10);
  const [first, second] = Object.keys(a.owned);
  a = placeInRoster(a, 0, first);
  a = placeInRoster(a, 3, first);                       // moves, never in two spots
  assert.deepEqual([a.roster.spots[0], a.roster.spots[3]], [null, first]);
  a = placeInRoster(a, 1, second);
  assert.equal(placeInRoster(a, 2, "s1-999"), a);       // not owned: unchanged
  const back = checkAlbum(JSON.parse(JSON.stringify(a)), SEASON, FORMATION_NAMES);
  assert.deepEqual(back, a);
  assert.equal(checkAlbum(null, SEASON, FORMATION_NAMES), null);
  assert.equal(checkAlbum({ ...a, v: 2 }, SEASON, FORMATION_NAMES), null);
  assert.equal(checkAlbum({ ...a, season: "s0" }, SEASON, FORMATION_NAMES), null);
  assert.equal(checkAlbum({ ...a, settings: { cards: 0, rates: a.settings.rates } }, SEASON, FORMATION_NAMES), null);
  const dirty = checkAlbum({ ...a, owned: { ...a.owned, "s1-999": 3, [first]: -1 }, roster: { team: "X", formation: "9-0-1", spots: [first, second, 42] } }, SEASON, FORMATION_NAMES)!;
  assert.equal(dirty.owned["s1-999"], undefined);
  assert.equal(dirty.owned[first], undefined);
  assert.deepEqual(dirty.roster.spots.slice(0, 3), [null, second, null]);
  assert.equal(dirty.roster.team, "K");
  assert.ok(FORMATION_NAMES.includes(dirty.roster.formation));
  assert.equal(checkSettings({ cards: 4, rates: { common: 1, rare: -1, legendary: 0 } }), null);
});
