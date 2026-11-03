import { test } from "node:test";
import assert from "node:assert/strict";
import { Match } from "../src/engine/index.ts";
import { coachTurn, coachPrompt, parsePlan } from "../src/ai/coach.ts";

test("parsePlan reads plain JSON, fenced JSON and JSON with a sentence around it", () => {
  const want = { commands: ["#10-59d", "/"], note: "go" };
  assert.deepEqual(parsePlan(JSON.stringify(want)), want);
  assert.deepEqual(parsePlan("```json\n" + JSON.stringify(want) + "\n```"), want);
  assert.deepEqual(parsePlan("Here you go: " + JSON.stringify(want)), want);
  assert.deepEqual(parsePlan(want), want);
  assert.throws(() => parsePlan("no idea"));
});

test("the prompt shows the position and the options", () => {
  const p = coachPrompt(new Match({ seed: "p" }));
  assert.match(p, /Kernels \(K\)/);
  assert.match(p, /#10 has the ball on spot 59/);
  assert.match(p, /pass #10>#11/);
});

test("an illegal command gets one repair round, and the turn always ends", async () => {
  const m = new Match({ seed: "coach" });
  const prompts: string[] = [];
  const replies = [
    { commands: ["#10-59d", "#10>5", "#4+"], note: "oops" },       // #10>5 is our own goal
    { commands: ["#4+", "#4+"], note: "fixed" },
  ];
  const r = await coachTurn({ match: m, ask: async p => { prompts.push(p); return replies.shift()!; } });
  assert.equal(prompts.length, 2);
  assert.match(prompts[1], /YOUR LAST PLAN STOPPED/);
  assert.match(prompts[1], /own goal/);
  assert.deepEqual(r.played, ["#10-59d", "#4+", "#4+", "/"]);
  assert.equal(r.errors.length, 1);
  assert.equal(m.state.turn, "S");
});
