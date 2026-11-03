import { test } from "node:test";
import assert from "node:assert/strict";
import { Match } from "../src/engine/index.ts";
import { coachTurn, coachPrompt, parsePlan } from "../src/ai/coach.ts";

test("parsePlan reads plain JSON, fenced JSON and JSON with a sentence around it", () => {
  const want = { commands: ["#10-59d", "/"], note: "go" };
  assert.deepEqual(parsePlan(JSON.stringify(want)), { ...want, idea: "" });
  assert.deepEqual(parsePlan("```json\n" + JSON.stringify(want) + "\n```"), { ...want, idea: "" });
  assert.deepEqual(parsePlan("Here you go: " + JSON.stringify(want)), { ...want, idea: "" });
  assert.deepEqual(parsePlan(want), { ...want, idea: "" });
  assert.throws(() => parsePlan("no idea"));
});

test("the prompt shows the position and the options", () => {
  const p = coachPrompt(new Match({ seed: "p" }));
  assert.match(p, /Kernels \(K\)/);
  assert.match(p, /You have the ball: #10 on spot 59/);
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

import { duelOdds, analyze } from "../src/ai/odds.ts";
import { advisorTurn } from "../src/ai/advisor.ts";
import { botTurn } from "../src/ai/bot.ts";

test("duel odds are exact", () => {
  assert.deepEqual(duelOdds(3, 3), { win: 15 / 36, tie: 6 / 36 });
  assert.equal(duelOdds(9, 0).win, 1);
});

test("the analysis offers forward options at kick-off", () => {
  const { options } = analyze(new Match({ seed: "a" }).state);
  const kinds = new Set(options.map(o => o.kind));
  for (const k of ["pass", "dribble", "run"]) assert.ok(kinds.has(k), k);
  assert.match(coachPrompt(new Match({ seed: "a" })), /PLAYBOOK/);
});

test("following the advice attacks: the advisor outscores the bot", () => {
  let mine = 0, theirs = 0;
  for (let i = 0; i < 6; i++) {
    const m = new Match({ seed: "adv" + i });
    while (!m.state.over) (m.state.turn === "K" ? advisorTurn : botTurn)(m);
    mine += m.state.score.K; theirs += m.state.score.S;
  }
  assert.ok(mine > theirs && mine >= 3, `advisor ${mine} : ${theirs} bot`);
});
