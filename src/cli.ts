#!/usr/bin/env node
// cli.ts: replay and check matches, and play bot or Claude self-play.
//
//   node src/cli.ts replay match.ppn [--verify] [--board] [--to N]
//   node src/cli.ts selfplay [--seed S] [--ap 7] [--turns 40] [-o out.ppn] [--k bot|claude] [--s bot|claude]
//
// Claude self-play calls the Anthropic API: set ANTHROPIC_API_KEY (and optionally
// --model, default claude-sonnet-5-5).

import { readFileSync, writeFileSync } from "node:fs";
import { Match } from "./engine/index.ts";
import { botTurn } from "./ai/bot.ts";
import { coachTurn, describe } from "./ai/coach.ts";

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
        if (!opts.quiet) console.error(`${t} ${r.played.join(" ")}${r.note ? "  // " + r.note : ""}`);
      } else botTurn(m);
    }
    const text = m.toText();
    if (typeof opts.o === "string") writeFileSync(opts.o, text);
    else process.stdout.write(text);
    console.error(`${m.headers.Kernels} ${m.result} ${m.headers.Shells}`);
    return;
  }
  console.log("usage:\n  pp replay file.ppn [--verify] [--board] [--to N]\n  pp selfplay [--seed S] [--ap 7] [--turns 40] [-o out.ppn] [--k bot|claude] [--s bot|claude] [--model id]");
}

const label = (k: string) => (k === "claude" ? "Claude" : "Bot");

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
