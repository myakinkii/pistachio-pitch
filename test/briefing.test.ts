import { test } from "node:test";
import assert from "node:assert/strict";
import { Match, apply, parseCommand, HEXES } from "../src/engine/index.ts";
import { botTurn } from "../src/ai/bot.ts";
import { briefing, targetHex } from "../src/ai/briefing.ts";
import { coachPrompt } from "../src/ai/coach.ts";

test("every command the briefing suggests is legal where it's suggested", () => {
  const m = new Match({ seed: "brief", formation: { K: "4-3-3", S: "3-5-2" }, turns: 16 });
  let checked = 0;
  while (!m.state.over) {
    const text = briefing(m.state);
    for (const cmd of text.match(/#\d+-\d+[a-f]/g) ?? []) {
      assert.doesNotThrow(() => apply(m.state, parseCommand(cmd)), `${cmd} at turn ${m.state.turnNo}`);
      checked++;
    }
    botTurn(m);
  }
  assert.ok(checked > 20, `only ${checked} commands checked`);
});

test("the coach prompt carries the briefing, and targets match the formation", () => {
  const m = new Match({ seed: "p", formation: { K: "5-4-1", S: "4-4-2" } });
  const p = coachPrompt(m);
  for (const s of ["=== SHAPE ===", "=== THREATS ===", "=== TERRITORY ===", "Formation 5-4-1"]) assert.ok(p.includes(s), s);
  const ts = m.state.players.find(x => x.team === "K" && x.num === 11)!;
  assert.equal(HEXES[targetHex(m.state, ts)].num, 95);   // the lone striker aims for their penalty spot
});

import { analyze } from "../src/ai/odds.ts";

test("shape moves are offered to the side with the ball, legal, and towards the target", async () => {
  const { shapeOff } = await import("../src/ai/shape.ts");
  const m = new Match({ seed: "shape", formation: { K: "4-3-3", S: "5-4-1" } });
  const opts = analyze(m.state).options.filter(o => o.kind === "shape");
  assert.ok(opts.length > 0);
  const before = shapeOff(m.state, "K");
  for (const o of opts) {
    const after = apply(m.state, parseCommand(o.cmd)).state;
    assert.ok(shapeOff(after, "K") < before, o.cmd);
  }
  m.play("/");   // now the Shells are to move, without the ball
  assert.equal(analyze(m.state).options.filter(o => o.kind === "shape").length, 0);
});
