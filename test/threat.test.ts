import { test } from "node:test";
import assert from "node:assert/strict";
import { FORMATION_NAMES, HEXES, mirror, hexAt, segHex } from "../src/engine/index.ts";
import { shapes } from "../src/ai/tempo.ts";
import { danger, ballThreat, teamThreat, counterThreat, focal, threatText } from "../src/ai/threat.ts";

test("danger grows towards goal and is zero far away", () => {
  const s = shapes("4-4-2", "4-4-2");
  const far = danger(s, "K", hexAt(3, 2)!, 5), close = danger(s, "K", hexAt(3, 9)!, 5);
  assert.ok(close > 0.2 && far < 0.05, `${close} ${far}`);
});

test("ball threat needs someone on the ball; with it, its focal points are where his options end", () => {
  const s = shapes("4-4-2", "5-4-1");
  assert.equal(ballThreat(s).size, 0);
  const p = s.players.find(x => x.team === "K" && x.num === 9)!;
  s.ball = { hex: segHex(p.seg), owner: p.id }; s.turn = "K"; s.ap = 7;
  const f = focal(ballThreat(s), 3);
  assert.equal(f.length, 3);
  assert.ok(f.every(x => x.v > 0 && x.why.length > 0));
  assert.match(threatText(s), /Ball threat: spot \d+/);
});

test("team threat is mirrored exactly in a mirror match", () => {
  for (const n of FORMATION_NAMES) {
    const s = shapes(n, n), k = teamThreat(s, "K"), sh = teamThreat(s, "S");
    assert.equal(k.size, sh.size, n);
    for (const [h, v] of k) {
      const [q, r] = mirror("S", HEXES[h].q, HEXES[h].r);
      assert.ok(Math.abs(sh.get(hexAt(q, r)!)!.v - v.v) < 1e-9, `${n} spot ${HEXES[h].num}`);
    }
  }
});

test("counter-threat is the other side's team threat", () => {
  const s = shapes("4-3-3", "3-5-2");
  const p = s.players.find(x => x.team === "K" && x.num === 10)!;
  s.ball = { hex: segHex(p.seg), owner: p.id }; s.turn = "K";
  assert.deepEqual([...counterThreat(s).keys()].sort(), [...teamThreat(s, "S").keys()].sort());
});
