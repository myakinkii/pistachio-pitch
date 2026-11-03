import { test } from "node:test";
import assert from "node:assert/strict";
import { HEXES, hexAt, hexByNum, hexSegs, segName, parseSeg, CENTER, GOAL, KEEPER_HEX, PENALTY_SPOT, segNbrs, segExists } from "../src/engine/index.ts";

const num = (q: number, r: number) => HEXES[hexAt(q, r)!].num;
const letters = (n: number) => hexSegs(hexByNum(n)!).map(segName).map(x => x.replace(/\d+/, "")).sort().join("");

test("the pitch has 121 spots numbered in rows of 9 from the corner flag", () => {
  assert.equal(HEXES.length, 121);
  assert.deepEqual(HEXES.map(h => h.num).sort((a, b) => a - b), Array.from({ length: 121 }, (_, i) => i + 1));
  assert.equal(num(-1, -1), 1);
  assert.equal(letters(1), "abcd");               // corner flag 1a
  assert.equal(letters(9), "adef");
  assert.equal(letters(2), "cde");                // half hex on the goal line
});

test("landmarks", () => {
  assert.equal(HEXES[CENTER].num, 59);
  assert.equal(HEXES[KEEPER_HEX.K].num, 5);
  assert.equal(HEXES[KEEPER_HEX.S].num, 113);
  assert.equal(HEXES[PENALTY_SPOT.K].num, 23);
  assert.equal(HEXES[PENALTY_SPOT.S].num, 95);
  assert.deepEqual(GOAL.K.map(h => HEXES[h].num).sort((a, b) => a - b), [4, 5, 6]);
  assert.deepEqual(GOAL.S.map(h => HEXES[h].num).sort((a, b) => a - b), [113, 119, 120]);
});

test("segment names round-trip and neighbours are symmetric", () => {
  for (let s = 0; s < HEXES.length * 6; s++) {
    if (!segExists(s)) continue;
    assert.equal(parseSeg(segName(s)), s);
    for (const n of segNbrs(s)) assert.ok(segNbrs(n).includes(s), `${segName(s)} <-> ${segName(n)}`);
  }
  assert.equal(parseSeg("1e"), null);             // cut off by the touchline
});
