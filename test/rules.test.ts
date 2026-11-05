import { test } from "node:test";
import assert from "node:assert/strict";
import { Match, RuleError, newState, apply, hexByNum, parseSeg, playerOf, reach, stepCost, segHex, parseCommand, hexDist, type State } from "../src/engine/index.ts";

const at = (s: State, team: "K" | "S", num: number, seg: string) => { playerOf(s, team, num)!.seg = parseSeg(seg)!; };

test("kick-off: Kernels #10 has the ball on the centre spot, 7 AP", () => {
  const m = new Match({ seed: "t" });
  assert.equal(m.state.ball.owner, "K10");
  assert.equal(m.state.ap, 7);
  assert.equal(m.state.turn, "K");
});

test("illegal commands throw and change nothing", () => {
  const m = new Match({ seed: "t" });
  const before = JSON.stringify(m.state);
  assert.throws(() => m.play("#7>#11"), RuleError);       // #7 hasn't got the ball
  assert.throws(() => m.play("#10>5"), RuleError);         // own goal
  assert.throws(() => m.play("#10x#10"), RuleError);       // own player has the ball
  assert.throws(() => m.play("#2-121"), RuleError);        // far out of reach
  assert.equal(JSON.stringify(m.state), before);
  assert.equal(m.entries.length, 0);
});

test("moving: 1 AP per free spot (+1 with the ball), 1 to change segment within your spot", () => {
  const m = new Match({ seed: "t" });
  m.play("#10-59d");                                       // another segment of the same spot
  assert.equal(m.state.ap, 6);
  m.play("#10-68a");                                       // into the next spot with the ball: 1 + 1 for carrying
  assert.equal(m.state.ap, 4);
  assert.equal(m.state.ball.hex, hexByNum(68));
  m.play("#7-58");                                         // spot only: the engine picks a free segment
  assert.equal(m.entries[2].text, "#7-58c");               // the lowest free segment
  assert.equal(m.state.ap, 2);                             // 40 -> 49 -> 58: two free spots, no ball
});

test("each opponent in a spot adds 1 AP to step into it, and a full spot can't be entered", () => {
  const s = newState({ seed: "cost" });
  at(s, "S", 7, "50a"); at(s, "S", 8, "50b");               // two Shells in spot 50
  const k7 = playerOf(s, "K", 7)!;
  at(s, "K", 7, "41d");                                    // Kernel #7 right next to spot 50
  const r = reach(s, k7, 7);
  assert.equal(r.cost.get(parseSeg("50d")!), 3);           // 1 + 2 opponents
  assert.equal(stepCost(s, k7, hexByNum(50)!), 3);
  const after = apply(s, { t: "move", p: 7, seg: parseSeg("50d")! }).state;
  assert.equal(after.ap, 4);
  ["c", "d", "e", "f"].forEach((l, i) => at(s, "S", i + 2, "50" + l));   // now all six segments are taken
  assert.equal([...reach(s, k7, 7).cost.keys()].some(x => segHex(x) === hexByNum(50)), false);
});

test("reserves: max two per player, expire when the owner's next turn starts", () => {
  const m = new Match({ seed: "t" });
  m.play("#4+"); m.play("#4+");
  assert.throws(() => m.play("#4+"), RuleError);
  m.play("/");
  assert.equal(playerOf(m.state, "K", 4)!.reserve, 2);
  m.play("/");
  assert.equal(playerOf(m.state, "K", 4)!.reserve, 0);
});

test("a beaten tackler can't tackle again that turn", () => {
  // Find a seed where Shell #10's first tackle on Kernel #10 loses.
  for (let i = 0; i < 50; i++) {
    let s = newState({ seed: "beaten" + i });
    s = apply(s, { t: "end" }).state;
    at(s, "S", 10, "59d");
    const r = apply(s, { t: "tackle", p: 10, target: 10 });
    const duel = r.events.find(e => e.e === "duel");
    if (duel && duel.e === "duel" && duel.out === "lose") {
      assert.throws(() => apply(r.state, { t: "tackle", p: 10, target: 10 }), /can't tackle again/);
      return;
    }
  }
  assert.fail("no seed produced a lost tackle");
});

test("losing the ball through your own action ends your turn", () => {
  for (let i = 0; i < 100; i++) {
    const s = newState({ seed: "turnover" + i });
    at(s, "S", 7, "41c");                                  // an opponent right on the target spot
    at(s, "K", 7, "41a");
    const r = apply(s, { t: "pass", p: 10, to: 7 });
    if (r.events.some(e => e.e === "turnover")) {
      assert.equal(r.state.turn, "S");
      assert.equal(r.state.ap, r.state.apPerTurn);
      return;
    }
  }
  assert.fail("no seed produced a turnover");
});

test("0.4 accuracy: a long pass by a poor passer often goes astray, and lands next to where it was aimed", async () => {
  const { accuracy } = await import("../src/ai/odds.ts");
  assert.equal(accuracy(5, 2), 1);
  assert.ok(Math.abs(accuracy(3, 4) - 4 / 6) < 1e-9);
  assert.ok(Math.abs(accuracy(2, 5) - 2 / 6) < 1e-9);
  let astray = 0, n = 0;
  for (let i = 0; i < 300; i++) {
    const s = newState({ seed: `acc${i}` });
    const k10 = playerOf(s, "K", 10)!;                     // striker, PAS 2, on the centre spot with the ball
    const aim = hexByNum(95)!;                             // 4 spots away: PAS 2 + d6 must reach 6
    const r = apply(s, parseCommand("#10>95"));
    const ev = r.events.find(e => e.e === "astray") as { hex: number; a: number; need: number } | undefined;
    n++;
    if (ev) {
      astray++;
      const off = hexDist(ev.hex, aim);
      assert.ok(off >= 1 && off <= 2, `landed ${off} spots off`);
      assert.ok(off <= (ev.need - ev.a >= 3 ? 2 : 1));
    }
    void k10;
  }
  assert.ok(astray / n > 0.4 && astray / n < 0.6, `astray ${astray} of ${n}`);   // needs a 4+ on the d6: half go astray
});

test("0.4 accuracy: a short pass by a good passer always lands", () => {
  for (let i = 0; i < 100; i++) {
    const s = newState({ seed: `sh${i}` });
    const p = playerOf(s, "K", 10)!; p.st = { ...p.st, pas: 5 };
    const r = apply(s, parseCommand("#10>#11"));
    assert.ok(!r.events.some(e => e.e === "astray"));
  }
});
