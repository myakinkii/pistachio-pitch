import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FORMATIONS, FORMATION_NAMES, BUILDS, BUDGET, statTotal, mirror, Match, newState, apply, hexAt, HEXES, CENTER,
  CENTRE_RING, hexOf, playerOf, paceLeft, reach, segHex, parseSeg, RuleError, type State,
} from "../src/engine/index.ts";

test("every build adds up to the budget, within 1-5", () => {
  for (const [pos, b] of Object.entries(BUILDS)) {
    assert.equal(statTotal(b), BUDGET, pos);
    for (const [k, v] of Object.entries(b)) if (k !== "kee" || pos === "GK") assert.ok(v >= 1 && v <= 5, `${pos} ${k}`);
  }
});

test("formations: 11 players, a keeper first, distinct field spots, nobody in the centre circle", () => {
  for (const name of FORMATION_NAMES) {
    const f = FORMATIONS[name];
    assert.equal(f.slots.length, 11, name);
    assert.equal(f.slots[0][0], "GK");
    for (const team of ["K", "S"] as const) {
      const hexes = f.slots.map(([, q, r]) => hexAt(...mirror(team, q, r)));
      assert.ok(hexes.every(h => h !== undefined), name);
      assert.equal(new Set(hexes).size, 11, name);
      for (const h of hexes.slice(1)) assert.ok(h !== CENTER && !CENTRE_RING.has(h!) && !HEXES[h!].cut, `${name} ${team}`);
    }
    for (const [pos] of f.slots) assert.ok(BUILDS[pos], pos);
  }
});

test("the Shells line up as the mirror image of the Kernels", () => {
  const s = newState({ seed: "m", formation: { K: "4-3-3", S: "4-3-3" }, firstKick: "K" });
  const y = (h: number) => HEXES[h].r + (HEXES[h].q & 1 ? 0.5 : 0);
  for (let n = 2; n <= 9; n++) {
    const k = hexOf(playerOf(s, "K", n)!), sh = hexOf(playerOf(s, "S", n)!);
    assert.equal(HEXES[k].q, HEXES[sh].q);
    assert.equal(y(k) + y(sh), 11);
  }
});

test("pace: at most 1 + PAC spots per turn, reset next turn", () => {
  const m = new Match({ seed: "pace", ap: 10 });
  const cb = playerOf(m.state, "K", 3)!;                    // a centre-back, PAC 2: 3 spots
  assert.equal(paceLeft(m.state, cb), 3);
  const far = [...reach(m.state, cb).cost.keys()].map(segHex);
  assert.ok(Math.max(...far.map(h => Math.abs(HEXES[h].r - HEXES[hexOf(cb)].r))) <= 3);
  m.play("#3-21"); m.play("#3-30"); m.play("#3-39");        // three spots straight down
  assert.equal(paceLeft(m.state, playerOf(m.state, "K", 3)!), 0);
  assert.throws(() => m.play("#3-48"), RuleError);
  m.play("#3-39a");                                          // changing segment in the same spot is fine
  m.play("/"); m.play("/");
  assert.equal(paceLeft(m.state, playerOf(m.state, "K", 3)!), 3);
});

test("formations are recorded in the match file and replayed", () => {
  const m = new Match({ seed: "f", formation: { K: "5-4-1", S: "3-5-2" } });
  m.play("#7-31"); m.play("/");
  const text = m.toText();
  assert.match(text, /\[FormationK "5-4-1"\]/);
  const r = Match.fromText(text, { verify: true });
  assert.equal(JSON.stringify(r.state), JSON.stringify(m.state));
  assert.throws(() => newState({ formation: { K: "2-2-6" } }), RuleError);
});

test("match files record the formation data they were played with", async () => {
  const { SQUAD_DATA, NotationError } = await import("../src/engine/index.ts");
  const m = new Match({ seed: "data" });
  m.play("/");
  const text = m.toText();
  assert.match(text, new RegExp(`\\[Squads "${SQUAD_DATA}"\\]`));
  assert.doesNotThrow(() => Match.fromText(text, { verify: true }));
  assert.throws(() => Match.fromText(text.replace(SQUAD_DATA, "00000000")), NotationError);
  assert.doesNotThrow(() => Match.fromText(text.replace(/\[Squads "[^"]*"\]\n/, "")));   // older files without it still load
});

test("formation targets are on the pitch and distinct", () => {
  for (const name of FORMATION_NAMES) {
    const t = FORMATIONS[name].target.map(([q, r]) => hexAt(q, r));
    assert.ok(t.every(h => h !== undefined), name);
    assert.equal(new Set(t).size, 11, name);
  }
});
