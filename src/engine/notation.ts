// notation.ts: Pistachio Pitch Notation (PPN).
//
// Commands (players are numbers of the side to move, spots are plain numbers):
//   #10-50d    move or dribble to segment 50d      #10-50   to the cheapest free segment of spot 50
//   #10>#7     pass to #7's feet                   #10>58   pass into space (spot 58)
//   #10>>5     shoot at goal spot 5                #4x#9    #4 tackles the opponent #9
//   #4+        put 1 AP on #4 as a reserve         /        end turn      T/  end turn (timeout)
// The engine appends what happened in braces: #10>41{*S4 3:5} means Shell #4 cut it out.
// Braces are results, not input: a replay ignores them (and can check them).

import { segName, hexName, parseSeg, parseHex } from "./geometry.ts";
import type { Command, Ev } from "./rules.ts";

export function formatCommand(c: Command): string {
  switch (c.t) {
    case "move": return `#${c.p}-${c.seg !== undefined ? segName(c.seg) : hexName(c.hex!)}`;
    case "pass": return c.to !== undefined ? `#${c.p}>#${c.to}` : `#${c.p}>${hexName(c.hex!)}`;
    case "shot": return `#${c.p}>>${hexName(c.hex)}`;
    case "tackle": return `#${c.p}x#${c.target}`;
    case "reserve": return `#${c.p}+`;
    case "end": return c.timeout ? "T/" : "/";
  }
}

export class NotationError extends Error {}

export function parseCommand(text: string): Command {
  const t = text.trim();
  let m: RegExpExecArray | null;
  if (t === "/") return { t: "end" };
  if (t === "T/") return { t: "end", timeout: true };
  if ((m = /^#(\d+)\+$/.exec(t))) return { t: "reserve", p: +m[1] };
  if ((m = /^#(\d+)x#(\d+)$/.exec(t))) return { t: "tackle", p: +m[1], target: +m[2] };
  if ((m = /^#(\d+)>>(\d+)$/.exec(t))) return { t: "shot", p: +m[1], hex: spot(m[2], t) };
  if ((m = /^#(\d+)>#(\d+)$/.exec(t))) return { t: "pass", p: +m[1], to: +m[2] };
  if ((m = /^#(\d+)>(\d+)$/.exec(t))) return { t: "pass", p: +m[1], hex: spot(m[2], t) };
  if ((m = /^#(\d+)-(\d+[a-f])$/.exec(t))) {
    const seg = parseSeg(m[2]);
    if (seg === null) throw new NotationError(`${t}: there is no segment ${m[2]}`);
    return { t: "move", p: +m[1], seg };
  }
  if ((m = /^#(\d+)-(\d+)$/.exec(t))) return { t: "move", p: +m[1], hex: spot(m[2], t) };
  throw new NotationError(`can't read "${t}"`);
}
function spot(n: string, t: string): number {
  const h = parseHex(n);
  if (h === null) throw new NotationError(`${t}: there is no spot ${n}`);
  return h;
}

/** The {...} result text for a command's events ("" when nothing worth noting happened). */
export function formatEvents(ev: Ev[]): string {
  const out: string[] = [];
  for (const e of ev) {
    switch (e.e) {
      case "duel": // e.g. "drib K10vS4 6:4 win": who has the upper hand comes first
        out.push(`${{ dribble: "drib", press: "press", tackle: "tackle", receive: "recv" }[e.kind]} ${e.att}v${e.def} ${e.a}:${e.d} ${e.out}`);
        break;
      case "stopped": out.push("stopped"); break;
      case "pickup": out.push(`@${e.pid}`); break;
      case "intercept": out.push(`*${e.pid} ${e.a}:${e.d}${e.react ? " r" : ""}`); break;
      case "lane": out.push(`${e.pid} ${e.a}:${e.d} missed${e.react ? " r" : ""}`); break;
      case "astray": out.push(`astray ${e.a}:${e.need} ${e.dir}>${hexName(e.hex)}`); break;
      case "received": out.push(`=${e.pid}`); break;
      case "loose": out.push(`~${hexName(e.hex)}`); break;
      case "lost": out.push(`!${e.pid}`); break;
      case "saved": out.push(`$${e.pid} ${e.a}:${e.d}`); break;
      case "parried": out.push(`$${e.pid} ${e.a}:${e.d} parried ~${hexName(e.hex)}`); break;
      case "beaten": out.push(`${e.pid} ${e.a}:${e.d} beaten`); break;
      case "goal": out.push("GOAL"); break;
      case "react": out.push(`${e.pid}^${segName(e.seg)}`); break;
      case "turnover": out.push("turnover"); break;
      case "halftime": out.push("HT"); break;
      case "fulltime": out.push("FT"); break;
      case "kickoff": case "endturn": break;
    }
  }
  return out.join("; ");
}

// ---------- match files ----------

export interface MatchFile {
  headers: Record<string, string>;
  turns: { no: number; team: "K" | "S"; entries: { cmd: string; result: string }[] }[];
}

/** Read a .ppn file: [Key "value"] headers, then turns like `12K. #10-50d{...} #10>41 /`. */
export function readMatch(text: string): MatchFile {
  const headers: Record<string, string> = {};
  const body: string[] = [];
  for (const raw of text.replace(/\r\n/g, "\n").split("\n")) {
    const line = raw.replace(/;;.*$/, "").trim();
    if (!line) continue;
    const hs = [...line.matchAll(/\[(\w+)\s+"((?:[^"\\]|\\.)*)"\]/g)];
    if (hs.length && line.replace(/\[(\w+)\s+"((?:[^"\\]|\\.)*)"\]/g, "").trim() === "") {
      for (const h of hs) headers[h[1]] = h[2].replace(/\\(.)/g, "$1");
      continue;
    }
    body.push(line);
  }
  const turns: MatchFile["turns"] = [];
  const tokens = body.join(" ").match(/\d+[KS]\.|[^\s{]+(?:\{[^}]*\})?|\{[^}]*\}/g) ?? [];
  for (const tok of tokens) {
    const tm = /^(\d+)([KS])\.$/.exec(tok);
    if (tm) { turns.push({ no: +tm[1], team: tm[2] as "K" | "S", entries: [] }); continue; }
    if (!turns.length) throw new NotationError(`"${tok}" comes before the first turn number`);
    const cur = turns[turns.length - 1];
    if (tok.startsWith("{")) { // a result on its own, e.g. after "/": attach to the previous entry
      const last = cur.entries[cur.entries.length - 1];
      if (last) last.result = (last.result ? last.result + "; " : "") + tok.slice(1, -1);
      continue;
    }
    const b = tok.indexOf("{");
    cur.entries.push(b < 0 ? { cmd: tok, result: "" } : { cmd: tok.slice(0, b), result: tok.slice(b + 1, -1) });
  }
  return { headers, turns };
}

export function writeMatch(m: MatchFile): string {
  const head = Object.entries(m.headers).map(([k, v]) => `[${k} "${v.replace(/(["\\])/g, "\\$1")}"]`).join("\n");
  const lines = m.turns.map(t =>
    `${t.no}${t.team}. ` + t.entries.map(e => e.cmd + (e.result ? `{${e.result}}` : "")).join(" "));
  return head + "\n\n" + lines.join("\n") + "\n";
}
