#!/usr/bin/env node
// cli.ts: replay and check matches, and play bot or Claude self-play.
//
//   node src/cli.ts replay match.ppn [--verify] [--board] [--to N]
//   node src/cli.ts selfplay [--seed S] [--ap 7] [--turns 40] [-o out.ppn] [--k bot|advisor|claude] [--s bot|advisor|claude]
//
// Claude self-play calls the Anthropic API: set ANTHROPIC_API_KEY (and optionally
// --model, default claude-sonnet-5-5).

import { readFileSync, writeFileSync } from "node:fs";
import { Match, FORMATION_NAMES } from "./engine/index.ts";
import { botTurn } from "./ai/bot.ts";
import { coachTurn, describe } from "./ai/coach.ts";
import { advisorTurn } from "./ai/advisor.ts";
import { development, chain, coverage, shapes } from "./ai/tempo.ts";

function args(argv: string[]) {
  const out: Record<string, string | boolean> = {}, pos: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("-")) {
      const k = a.replace(/^-+/, "");
      const v = argv[i + 1];
      if (v !== undefined && !v.startsWith("-")) { out[k] = v; i++; } else out[k] = true;
    } else pos.push(a);
  }
  return { opts: out, pos };
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const { opts, pos } = args(rest);
  if (cmd === "replay") {
    if (!pos[0]) throw new Error("usage: replay file.ppn [--verify] [--board] [--to N]");
    const text = readFileSync(pos[0], "utf8");
    const m = Match.fromText(text, { verify: !!opts.verify });
    const to = opts.to !== undefined ? Number(opts.to) : m.entries.length;
    const s = m.stateAt(to);
    console.log(`${m.headers.Kernels ?? "Kernels"} ${m.result} ${m.headers.Shells ?? "Shells"}  (${m.entries.length} actions${opts.verify ? ", results verified" : ""})`);
    if (opts.board || opts.to !== undefined) console.log(describe(s));
    return;
  }
  if (cmd === "selfplay") {
    const ap = opts.ap ? Number(opts.ap) : 7, turns = opts.turns ? Number(opts.turns) : 40;
    const seed = typeof opts.seed === "string" ? opts.seed : `pp-${Date.now()}`;
    const kinds = { K: String(opts.k ?? "bot"), S: String(opts.s ?? "bot") };
    const m = new Match({ seed, ap, turns, headers: { Kernels: label(kinds.K), Shells: label(kinds.S) } });
    const ask = makeAsk(String(opts.model ?? "claude-sonnet-5-5"));
    while (!m.state.over) {
      const t = m.state.turn;
      if (kinds[t] === "claude") {
        const r = await coachTurn({ match: m, ask });
        if (!opts.quiet) console.error(`${m.state.turnNo - 1}${t}. ${r.played.join(" ")}${r.idea ? "  // " + r.idea : ""}${r.errors.length ? `  [fixed: ${r.errors.join("; ")}]` : ""}`);
      } else if (kinds[t] === "advisor") advisorTurn(m);
      else botTurn(m);
    }
    const text = m.toText();
    if (typeof opts.o === "string") writeFileSync(opts.o, text);
    else process.stdout.write(text);
    console.error(`${m.headers.Kernels} ${m.result} ${m.headers.Shells}`);
    return;
  }
  if (cmd === "tempo") {
    // development of every formation, and the keeper-to-box chain of every matchup (target shapes)
    const ap = opts.ap ? Number(opts.ap) : 7;
    const names = FORMATION_NAMES;
    console.log(`Development, kick-off to target shape (${ap} AP a turn):`);
    for (const n of names) {
      const d = development(n, ap);
      console.log(`  ${n.padEnd(6)} ${String(d.ap).padStart(3)} AP, ${d.turns} turns (slowest: ${d.slowest})`);
    }
    console.log("\nKeeper to the opponent's penalty spot, target shapes against each other (passes, chance all get through):");
    console.log("  " + "".padEnd(8) + names.map(n => ("v " + n).padEnd(14)).join(""));
    for (const a of names) {
      const row = names.map(b => {
        const c = chain(shapes(a, b), "K");
        return (c.passes === Infinity ? "no chain" : `${c.passes}${c.reached ? "" : "*"} ${Math.round(c.safe * 100)}%`).padEnd(14);
      });
      console.log("  " + a.padEnd(8) + row.join(""));
    }
    console.log("  (* nobody next to the penalty spot: the chain ends at the closest player)");
    console.log("\nCoverage of each target shape (spots from the own goal line):");
    for (const n of names) {
      const c = coverage(shapes(n, n), "K");
      console.log(`  ${n.padEnd(6)} width ${c.width}, depth ${c.depth}; lines ${c.lines.map(l => `${l.line} at ${l.at} (width ${l.width})`).join(", ")}; gaps ${c.gaps.join(", ")}`);
    }
    return;
  }
  console.log("usage:\n  pp replay file.ppn [--verify] [--board] [--to N]\n  pp tempo [--ap 7]\n  pp selfplay [--seed S] [--ap 7] [--turns 40] [-o out.ppn] [--k bot|advisor|claude] [--s bot|advisor|claude] [--model id]");
}

const label = (k: string) => (k === "claude" ? "Claude" : k === "advisor" ? "Advisor" : "Bot");

function makeAsk(model: string) {
  return async (prompt: string): Promise<string> => {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw new Error("set ANTHROPIC_API_KEY to let Claude coach");
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model, max_tokens: 1500, messages: [{ role: "user", content: prompt }] }),
    });
    if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${await res.text()}`);
    const data = await res.json() as { content: { type: string; text?: string }[] };
    return data.content.map(c => c.text ?? "").join("");
  };
}

main().catch(e => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
