import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  SEASON, TIERS, loadSeason, newAlbum, openPack, completion, expected, simulate, checkAlbum, placeInRoster, checkSettings,
  useBuild, usePerk, squadBudget, POOL, SeasonError, type AlbumState,
} from "../src/album/index.ts";
import { BUILDS, BUDGET, FORMATIONS, FORMATION_NAMES, STAT_KEYS, statTotal } from "../src/engine/index.ts";

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
    if (s.tier === "rare") assert.equal(s.bonus?.type, "unlock");
    if (s.tier === "legendary") assert.equal(s.bonus?.type, "perk");
    if (s.tier !== "common") assert.ok(s.addons?.length, `${s.id} has an add-on drawn in`);
  }
  assert.ok(portraits.placeholder, "a placeholder portrait");
  // every colour a portrait uses is in its palette, or a kit digit the page fills in
  for (const [id, p] of Object.entries(portraits) as [string, { pal: Record<string, string>; rows: string[] }][])
    for (const ch of new Set(p.rows.join(""))) assert.ok(ch === "." || /[1-9]/.test(ch) || p.pal[ch], `${id}: no colour for ${ch}`);
});

test("every sticker has an archetype: commons spend exactly the budget, the others more", () => {
  const sum = statTotal;
  for (const s of SEASON.stickers) {
    assert.ok(s.style && s.build, `${s.id} has a style and a build`);
    if (s.tier === "common") assert.equal(sum(s.build!), BUDGET, s.id);
    else assert.ok(sum(s.build!) > BUDGET, `${s.id} costs more than ${BUDGET}`);
    if (s.tier !== "rare") assert.ok(STAT_KEYS.every(k => s.build![k] <= 5), `${s.id}: only rares go above 5`);
  }
  // archetypes differ: no two stickers of a position share a build
  const seen = new Set(SEASON.stickers.map(s => s.pos + JSON.stringify(s.build)));
  assert.equal(seen.size, SEASON.stickers.length);
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
  bad(s => { s.stickers[3].build.pac++; }, /adds up to 18/);                       // a common must spend exactly 18
  bad(s => { s.stickers[3].build.kee = 1; }, /only keepers/);
  bad(s => { s.stickers[3].build = { ...s.stickers[3].build, def: 6, phy: 4 }; }, /outside 1 to 5/);
  bad(s => { s.stickers[48].build.sho = 6; }, /outside 1 to 5/);                    // legendaries have no unlock
  bad(s => { Object.assign(s.stickers[33].build, { def: 6, phy: 6 }); }, /one stat only/);
  bad(s => { s.stickers[40].build.pac = 1; s.stickers[40].build.sho = 1; s.stickers[40].build.pas = 1; }, /less than 18/);
  bad(s => { s.stickers[33].bonus = { type: "slot", line: "defence", text: "x" }; }, /bonus/);
  bad(s => { s.squad.pool = 0; }, /squad.pool/);
  const noPool = structuredClone(raw); delete noPool.squad;
  assert.equal(loadSeason(noPool, POS).squad.pool, POOL, "without squad.pool, 18 a player");
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

test("the squad budget: templates spend 18 a player, builds, unlocks and perks cost more", () => {
  const pool = SEASON.squad.pool, extra = pool - POOL;
  assert.equal(POOL, BUDGET * 11);
  assert.equal(pool, 208, "season one gives 10 points over the templates");
  for (const f of FORMATION_NAMES) {
    const b = squadBudget({ ...newAlbum(SEASON, "b").roster, formation: f }, SEASON);
    assert.deepEqual([b.pool, b.spent, b.left], [pool, POOL, extra], f);
    assert.ok(b.spots.every(x => x.source === "template"));
  }
  for (const s of SEASON.stickers) {
    if (s.tier === "rare") assert.deepEqual([s.bonus?.type, s.bonus?.type === "unlock" && s.bonus.cost], ["unlock", 1], s.id);
    if (s.tier === "legendary") assert.deepEqual([s.bonus?.type, s.bonus?.type === "perk" && s.bonus.cost], ["perk", 2], s.id);
  }
  // own every sticker, then play with the roster of a 4-4-2
  let a: AlbumState = { ...newAlbum(SEASON, "own"), owned: Object.fromEntries(SEASON.stickers.map(s => [s.id, 1])) };
  const roles = FORMATIONS["4-4-2"].slots.map(([r]) => r);
  const st = (id: string) => SEASON.stickers.find(s => s.id === id)!;
  const brick = "s1-034", sweeper = "s1-002", maestro = "s1-047";   // a rare CB with DEF 6, a common GK, a legendary CM
  const cb = roles.indexOf("CB"), cm = roles.indexOf("CM");
  a = placeInRoster(a, 0, sweeper);
  a = placeInRoster(a, cb, brick);
  a = placeInRoster(a, cm, maestro);
  assert.equal(squadBudget(a.roster, SEASON).left, extra, "placing alone changes nothing: templates");
  a = useBuild(a, 0, true);
  assert.equal(squadBudget(a.roster, SEASON).left, extra, "a common's build is a different spend of the same 18");
  a = useBuild(a, cb, true);
  let b = squadBudget(a.roster, SEASON);
  assert.equal(b.spots[cb].source, "card");
  assert.equal(b.spots[cb].unlock, 1);
  assert.equal(b.spots[cb].cost, 19 + 1, "DEF 6: 19 points of stats and 1 for the unlock");
  assert.equal(b.left, extra - 2);
  a = useBuild(a, cm, true);
  b = squadBudget(a.roster, SEASON);
  assert.equal(b.spots[cm].cost, 21, "the perk isn't applied yet");
  a = usePerk(a, cm, true);
  b = squadBudget(a.roster, SEASON);
  assert.deepEqual([b.spots[cm].perk, b.spots[cm].cost], [2, 23]);
  assert.equal(b.left, extra - 7);
  a = usePerk(useBuild(a, cm, false), cm, true);
  assert.equal(squadBudget(a.roster, SEASON).spots[cm].cost, 18 + 2, "the perk on the template build");
  a = useBuild(a, cm, true);
  // over the pool is allowed, and shown
  const over = { ...a.roster, spots: a.roster.spots.slice(), builds: a.roster.builds.slice(), perks: a.roster.perks.slice() };
  const rich = squadBudget({ ...over }, { ...SEASON, squad: { pool: POOL } });
  assert.equal(rich.left, -7);
  // a build only fits its own position: on another spot he plays the template
  a = placeInRoster(a, roles.indexOf("ST"), brick);
  b = squadBudget(a.roster, SEASON);
  assert.equal(b.spots[cb].sticker, null);
  const stSpot = roles.indexOf("ST");
  assert.equal(b.spots[stSpot].canUse, false);
  a = useBuild(a, stSpot, true);
  assert.equal(squadBudget(a.roster, SEASON).spots[stSpot].source, "template");
  assert.equal(squadBudget(a.roster, SEASON).spots[stSpot].cost, 18);
  // moving a sticker resets the spot to the template; an empty spot can't use a build
  a = placeInRoster(a, cb, brick);
  assert.equal(a.roster.builds[cb], false);
  assert.equal(a.roster.spots[3], null);
  assert.equal(useBuild(a, 3, true), a, "an empty spot has no build to use");
  assert.equal(st(brick).build!.def, 6);
  // saved and read back, and albums saved before builds existed
  a = useBuild(a, cb, true);
  assert.deepEqual(checkAlbum(JSON.parse(JSON.stringify(a)), SEASON, FORMATION_NAMES), a);
  const old = JSON.parse(JSON.stringify(a)); delete old.roster.builds; delete old.roster.perks;
  assert.deepEqual(checkAlbum(old, SEASON, FORMATION_NAMES)!.roster.builds, Array(11).fill(false));
  assert.deepEqual(checkAlbum(old, SEASON, FORMATION_NAMES)!.roster.perks, Array(11).fill(false));
  // moving a legendary drops his perk with his build
  a = placeInRoster(a, roles.indexOf("ST"), maestro);
  assert.deepEqual([a.roster.perks[cm], a.roster.builds[cm]], [false, false]);
});
