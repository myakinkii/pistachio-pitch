import { test } from "node:test";
import assert from "node:assert/strict";
import { FORMATION_NAMES, FORMATIONS, BUILDS, hexAt, hexDist, segHex, PASS_RANGE } from "../src/engine/index.ts";
import { development, chain, coverage, shapes } from "../src/ai/tempo.ts";

test("development: AP is the spots moved, turns respect both the AP pool and each player's pace", () => {
  for (const n of FORMATION_NAMES) {
    const f = FORMATIONS[n], d = development(n, 7);
    const spots = f.slots.map(([, q, r], i) => hexDist(hexAt(q, r)!, hexAt(...f.target[i])!));
    assert.equal(d.ap, spots.reduce((a, b) => a + b, 0), n);
    assert.ok(d.turns >= Math.ceil(d.ap / 7), n);
    f.slots.forEach(([pos], i) => assert.ok(d.turns >= Math.ceil(spots[i] / (1 + BUILDS[pos].pac)), `${n} #${i + 1}`));
  }
});

test("tempo target: every formation reaches its target shape within 4 turns", () => {
  for (const n of FORMATION_NAMES) assert.ok(development(n, 7).turns <= 4, `${n}: ${development(n, 7).turns} turns`);
});

test("the shapes keep their lines: defence behind midfield behind attack, defence across the width", () => {
  for (const n of FORMATION_NAMES) {
    const c = coverage(shapes(n, n), "K");
    assert.deepEqual(c.lines.map(l => l.line), ["D", "M", "F"], n);
    assert.ok(c.gaps.every(g => g > 0), `${n} gaps ${c.gaps}`);
    assert.ok(c.lines[0].width >= 4, `${n} defence width ${c.lines[0].width}`);
  }
});

test("a chain starts with the keeper, every pass is in range, and both sides measure alike in a mirror match", () => {
  for (const a of FORMATION_NAMES) for (const b of FORMATION_NAMES) {
    const s = shapes(a, b), c = chain(s, "K");
    assert.equal(c.path[0], 1);
    assert.equal(c.passes, c.path.length - 1);
    for (let i = 1; i < c.path.length; i++) {
      const h = (n: number) => segHex(s.players.find(p => p.team === "K" && p.num === n)!.seg);
      assert.ok(hexDist(h(c.path[i - 1]), h(c.path[i])) <= PASS_RANGE);
    }
  }
  for (const n of FORMATION_NAMES) {
    const s = shapes(n, n), k = chain(s, "K"), sh = chain(s, "S");
    assert.equal(k.passes, sh.passes, n);
    assert.ok(Math.abs(k.safe - sh.safe) < 1e-9, n);
  }
});

import { passOdds, analyze } from "../src/ai/odds.ts";

test("a chain can start from the player with the ball", () => {
  const s = shapes("4-4-2", "5-4-1");
  const c = chain(s, "K", 9);
  assert.equal(c.path[0], 9);
});

test("passOdds agrees with the coach's analysis of the same pass", () => {
  const s = shapes("4-4-2", "5-4-1");
  const p = s.players.find(x => x.team === "K" && x.num === 9)!;
  s.ball = { hex: segHex(p.seg), owner: p.id }; s.turn = "K"; s.ap = 7;
  const opt = analyze(s).options.find(o => o.kind === "pass" && o.cmd === "#9>#10")!;
  const mate = s.players.find(x => x.team === "K" && x.num === 10)!;
  const o = passOdds(s, p, segHex(mate.seg));
  assert.match(opt.text, new RegExp(`arrives ${Math.round(o.arrive * 100)}%`));
});
