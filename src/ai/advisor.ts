// advisor.ts: a coach with no model that always plays the top-rated option from
// odds.ts. It shows the analysis the LLM coach gets is enough to attack and
// score, and it's a stronger sparring partner than the bot. Deterministic.

import { apply, parseCommand, formatCommand, RuleError, NotationError, type State } from "../engine/index.ts";
import { analyze } from "./odds.ts";

/** Anything that can play notation commands: a Match, or a Sim. */
export interface Playable { state: State; play(c: string): { text: string } }

export function advisorTurn(m: Playable, limit = 30): string[] {
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

/**
 * A scratch copy of a position to try commands on. Its dice are deliberately
 * different from the real ones, so a simulated plan says nothing about how the
 * real rolls will fall.
 */
export class Sim implements Playable {
  state: State;
  constructor(s: State) { this.state = structuredClone(s); this.state.rng = (s.rng ^ 0x5bd1e995) >>> 0; }
  play(c: string) { const cmd = parseCommand(c); this.state = apply(this.state, cmd).state; return { text: formatCommand(cmd) }; }
}

/** What the advisor would try this turn (assuming it's played out on unknown dice). */
export function suggestTurn(s: State): string[] {
  return advisorTurn(new Sim(s)).filter(c => c !== "/");
}
