import { test } from "node:test";
import assert from "node:assert/strict";
import { newState, control, parseSeg, playerOf, hexByNum, hexSegs, type State } from "../src/engine/index.ts";

const at = (s: State, team: "K" | "S", num: number, seg: string) => { playerOf(s, team, num)!.seg = parseSeg(seg)!; };
const who = (m: Map<number, string>, seg: string) => m.get(parseSeg(seg)!) ?? "-";

test("a spot with one side only is all theirs; empty spots are neutral", () => {
  const s = newState({ seed: "c" });
  const m = control(s);
  for (const x of hexSegs(hexByNum(5)!)) assert.equal(m.get(x), "K");    // the Kernels' keeper's spot
  assert.equal(who(m, "77a"), "-");
});

test("a shared spot: own segment, plus empty neighbours nobody else claims", () => {
  const s = newState({ seed: "c" });
  at(s, "K", 7, "50a"); at(s, "S", 7, "50d");                            // opposite sides of spot 50
  const m = control(s);
  assert.deepEqual(["a", "b", "c", "d", "e", "f"].map(l => who(m, "50" + l)), ["K", "K", "S", "S", "S", "K"]);
  at(s, "S", 7, "50c");                                                   // now b is wanted by both
  const m2 = control(s);
  assert.deepEqual(["a", "b", "c", "d", "e", "f"].map(l => who(m2, "50" + l)), ["K", "-", "S", "S", "-", "K"]);
});
