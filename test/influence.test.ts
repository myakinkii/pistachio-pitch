import { test } from "node:test";
import assert from "node:assert/strict";
import { newState, influence, territory, playerOf, parseSeg, hexByNum, segHex, FORMATION_NAMES } from "../src/engine/index.ts";
import { shapes } from "../src/ai/tempo.ts";

test("influence covers the empty field spots, and a lone fast player owns his surroundings", () => {
  const s = newState({ seed: "i" });
  const m = influence(s);
  const occupied = new Set(s.players.map(p => segHex(p.seg)));
  for (const h of m.keys()) assert.ok(!occupied.has(h));
  // at kick-off, spot 50 (next to Kernel #10, far from the Shells' forwards) is the Kernels'
  assert.equal(m.get(hexByNum(50)!)!.owner, "K");
  assert.equal(m.get(hexByNum(50)!)!.K!.by, "K10");
  // the spots between the two front lines are contested: both sides are one step away
  assert.equal(m.get(hexByNum(68)!)!.owner, null);
});

test("pace matters: a quicker player wins a spot at equal distance", () => {
  const s = newState({ seed: "pace" });
  // put a Kernels winger-speed player and a Shells centre-back the same distance from spot 59
  const k = playerOf(s, "K", 2)!, sh = playerOf(s, "S", 3)!;   // FB pace 4, CB pace 2
  k.seg = parseSeg("41d")!; sh.seg = parseSeg("77a")!;
  for (const p of s.players) if (p !== k && p !== sh) p.seg = parseSeg(p.team === "K" ? "5d" : "113a")!;
  const v = influence(s).get(hexByNum(59)!)!;
  assert.equal(v.K!.spots, v.S!.spots);
  assert.equal(v.owner, "K");
});

test("mirror matches split the pitch evenly", () => {
  for (const n of FORMATION_NAMES) {
    const t = territory(shapes(n, n));
    assert.equal(t.K, t.S, n);
  }
});
