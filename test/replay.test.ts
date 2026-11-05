import { test } from "node:test";
import assert from "node:assert/strict";
import { Match, NotationError } from "../src/engine/index.ts";
import { botTurn } from "../src/ai/bot.ts";

function selfplay(seed: string, opts = {}) {
  const m = new Match({ seed, ...opts });
  while (!m.state.over) botTurn(m);
  return m;
}

test("bot-vs-bot is deterministic for a seed", () => {
  const a = selfplay("det"), b = selfplay("det"), c = selfplay("other");
  assert.equal(a.toText(), b.toText());
  assert.notEqual(a.toText(), c.toText());
  assert.ok(a.state.over);
});

test("replaying a match file rebuilds every state and verifies results", () => {
  const m = selfplay("replay", { ap: 8, turns: 20 });
  const r = Match.fromText(m.toText(), { verify: true });
  assert.equal(JSON.stringify(r.state), JSON.stringify(m.state));
  assert.equal(r.entries.length, m.entries.length);
  for (let i = 0; i <= m.entries.length; i += 7) assert.deepEqual(r.stateAt(i), m.stateAt(i));
});

test("a tampered result is caught", () => {
  const text = selfplay("tamper", { turns: 10 }).toText();
  const bad = text.replace(/\{[^}]+\}/, "{=K99}");   // tamper with the first recorded result
  assert.notEqual(bad, text);
  assert.throws(() => Match.fromText(bad, { verify: true }), NotationError);
  assert.doesNotThrow(() => Match.fromText(bad));        // without verify, results are just comments
});

test("undo restores the previous state", () => {
  const m = new Match({ seed: "undo" });
  const s0 = JSON.stringify(m.state);
  m.play("#10-59d"); m.play("#10>#7");
  m.undo(); m.undo();
  assert.equal(JSON.stringify(m.state), s0);
});
