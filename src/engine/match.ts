// match.ts: a match is a start position plus the list of commands. Playing it
// records notation; replaying a .ppn file rebuilds every state exactly
// (same seed, same rules version, same dice).

import { newState, apply, RULES_VERSION, type State, type Command, type Ev, type Options } from "./rules.ts";
import { parseCommand, formatCommand, formatEvents, readMatch, writeMatch, NotationError, type MatchFile } from "./notation.ts";
import type { TeamId } from "./geometry.ts";

export interface Entry { team: TeamId; turnNo: number; cmd: Command; text: string; result: string; events: Ev[] }

export class Match {
  readonly start: State;
  state: State;
  entries: Entry[] = [];
  headers: Record<string, string>;
  private states: State[] = [];   // state before each entry, for undo and replay stepping

  constructor(opts: Options & { headers?: Record<string, string> } = {}) {
    this.start = newState(opts);
    this.state = this.start;
    this.headers = {
      Game: "Pistachio Pitch", Rules: RULES_VERSION, Seed: this.start.seed,
      AP: String(this.start.apPerTurn), Turns: String(this.start.maxTurns), FirstKick: this.start.firstKick,
      FormationK: this.start.formation.K, FormationS: this.start.formation.S,
      Kernels: "Kernels", Shells: "Shells", ...(opts.headers ?? {}),
    };
  }

  /** Play one command, given as notation text or a Command. Throws RuleError / NotationError. */
  play(c: string | Command): Entry {
    const cmd = typeof c === "string" ? parseCommand(c) : { ...c };
    const before = this.state;
    const { state, events } = apply(before, cmd);   // apply() may resolve a spot-only move to a segment
    const entry: Entry = { team: before.turn, turnNo: before.turnNo, cmd, text: formatCommand(cmd), result: formatEvents(events), events };
    this.states.push(before);
    this.entries.push(entry);
    this.state = state;
    return entry;
  }

  undo(): Entry | undefined {
    const e = this.entries.pop();
    if (e) this.state = this.states.pop()!;
    return e;
  }

  /** The state before entry i (i = entries.length gives the current state). */
  stateAt(i: number): State { return i >= this.entries.length ? this.state : this.states[i]; }

  get result() { return `${this.state.score.K}-${this.state.score.S}`; }

  toFile(): MatchFile {
    const turns: MatchFile["turns"] = [];
    for (const e of this.entries) {
      let t = turns[turns.length - 1];
      if (!t || t.no !== e.turnNo) { t = { no: e.turnNo, team: e.team, entries: [] }; turns.push(t); }
      t.entries.push({ cmd: e.text, result: e.result });
    }
    return { headers: { ...this.headers, Result: this.state.over ? this.result : "*" }, turns };
  }
  toText(): string { return writeMatch(this.toFile()); }

  /** Rebuild a match from .ppn text. With verify, results in the file must match the engine's. */
  static fromText(text: string, { verify = false } = {}): Match {
    const f = readMatch(text);
    const h = f.headers;
    if (h.Rules && h.Rules !== RULES_VERSION) throw new NotationError(`this file uses rules ${h.Rules}, the engine has ${RULES_VERSION}`);
    const m = new Match({
      seed: h.Seed ?? "pistachio", ap: h.AP ? +h.AP : undefined, turns: h.Turns ? +h.Turns : undefined,
      firstKick: h.FirstKick === "S" ? "S" : "K", headers: h,
      formation: { K: h.FormationK, S: h.FormationS },
    });
    for (const t of f.turns) {
      for (const e of t.entries) {
        if (m.state.turnNo !== t.no || m.state.turn !== t.team) {
          throw new NotationError(`${e.cmd}: the file says turn ${t.no}${t.team}, the engine is at ${m.state.turnNo}${m.state.turn}`);
        }
        const done = m.play(e.cmd);
        if (verify && e.result !== done.result) {
          throw new NotationError(`${t.no}${t.team}. ${e.cmd}: the file says {${e.result}}, the engine gets {${done.result}}`);
        }
      }
    }
    delete m.headers.Result;
    return m;
  }
}
