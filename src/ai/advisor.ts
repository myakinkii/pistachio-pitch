// advisor.ts: a coach with no model that always plays the top-rated option from
// odds.ts. It shows the analysis the LLM coach gets is enough to attack and
// score, and it's a stronger sparring partner than the bot. Deterministic.

import { RuleError, NotationError, type Match } from "../engine/index.ts";
import { analyze } from "./odds.ts";

export function advisorTurn(m: Match, limit = 30): string[] {
  const team = m.state.turn, no = m.state.turnNo, out: string[] = [];
  const live = () => !m.state.over && m.state.turn === team && m.state.turnNo === no;
  for (let i = 0; i < limit && live(); i++) {
    const best = analyze(m.state).options.slice().sort((a, b) => b.score - a.score || a.cmd.localeCompare(b.cmd))[0];
    if (!best) break;
    try { for (const c of best.cmd.split(/ then | /)) { if (!live()) break; out.push(m.play(c).text); } }
    catch (e) { if (e instanceof RuleError || e instanceof NotationError) break; throw e; }
  }
  if (live()) out.push(m.play("/").text);
  return out;
}
