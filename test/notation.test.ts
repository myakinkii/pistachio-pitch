import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCommand, formatCommand, readMatch, writeMatch, NotationError } from "../src/engine/index.ts";

test("every command form round-trips", () => {
  for (const t of ["#10-50d", "#10-50", "#10>#7", "#10>58", "#10>>113", "#4x#9", "#4+", "/", "T/"]) {
    assert.equal(formatCommand(parseCommand(t)), t);
  }
});

test("bad commands are refused", () => {
  assert.throws(() => parseCommand("#10-1e"), NotationError);   // no such segment
  assert.throws(() => parseCommand("#10>999"), NotationError);
  assert.throws(() => parseCommand("pass to 7"), NotationError);
});

test("match files keep headers, turns and results", () => {
  const text = `[Game "Pistachio Pitch"]\n[Seed "x \\"y\\""]\n\n1K. #10>#11{=K11} #11-68f /\n2S. #10-68e #10x#11{tackle S10vK11 4:6 lose} /{HT}\n`;
  const f = readMatch(text);
  assert.equal(f.headers.Seed, 'x "y"');
  assert.equal(f.turns.length, 2);
  assert.deepEqual(f.turns[1].entries.map(e => e.cmd), ["#10-68e", "#10x#11", "/"]);
  assert.equal(f.turns[1].entries[2].result, "HT");
  assert.deepEqual(readMatch(writeMatch(f)), f);
});
