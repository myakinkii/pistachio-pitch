// coach.ts: let a language model play a side. Model-agnostic: pass an
// `ask(prompt)` that resolves with the model's reply (text, or already-parsed
// JSON). The page uses the claude.ai artifact `sample` capability; the CLI uses
// the Anthropic API. The coach sees the position plus its legal options, answers
// with a plan for the whole turn as commands, and the engine plays them in order,
// resolving every contest with dice. If a command is illegal, the coach gets the
// error and the new position and may answer once more.

import {
  HEXES, attackGoal, hexDist, segHex, segName, hexName, hexOf,
  reach, passTargets, laneThreats, inHex, carrier, PASS_RANGE, MAX_RESERVE,
  RuleError, NotationError, type State, type Match, type TeamId,
} from "../engine/index.ts";

export type Ask = (prompt: string) => Promise<string | unknown>;

const RULES = `You are the coach of one side in Pistachio Pitch, a turn-based football game on a hex grid.
You play a whole turn at a time by writing commands; the engine resolves every contest with dice.

The pitch: spots (hexagons) are numbered 1-121 in zigzag rows of 9 from the top-left corner.
Each spot has six segments a-f (a top, then clockwise: b top-right, c bottom-right, d bottom,
e bottom-left, f top-left); a player stands on one segment, so "50d" is spot 50, segment d.
Kernels (K) defend the top goal (spots 4, 5, 6; keeper starts on 5) and attack downwards.
Shells (S) defend the bottom goal (spots 113, 119, 120; keeper starts on 113) and attack upwards.

Each turn your side has a pool of action points (AP) to spend on any players:
- #N-50d moves player N to segment 50d (or #N-50 to the cheapest free segment of spot 50).
  One step to a neighbouring segment costs 1 AP. If N has the ball, the ball comes along (dribbling):
  stepping into a spot with opponents starts a duel (dribbling vs tackling); a tie stops him,
  losing means he's dispossessed. Walking into a loose ball picks it up.
- #N>#M passes to teammate M's feet; #N>58 passes into space (spot 58); #N>>113 shoots at a goal spot.
  1 AP. Range ${PASS_RANGE} spots. Each opponent in the lane may cut it out (roll); opponents on the
  target spot contest the reception; an empty target leaves the ball loose there. The keeper saves
  shots aimed at or next to his spot, so aim away from him.
- #Nx#M: player N tackles opponent M, who has the ball. N must stand in the ball's spot. 1 AP. Winning takes the ball; a tie knocks it loose; losing means N can't tackle
  again this turn. Holding more of the spot's six segments than the other side gives +1.
- #N+ puts 1 AP on player N as a reserve (max ${MAX_RESERVE} per player). Reserves act during the
  opponent's turn: they press a dribbler entering a neighbouring spot, stretch for passes near them,
  and grab loose balls within one spot. Unused reserves expire when your next turn starts.
- / ends the turn early. Losing the ball through your own action ends your turn at once.

Stats (1-5): keepers are good at keeping, defenders at tackling, midfielders at passing and control,
forwards at dribbling and shooting. Rolls are d6 + stat (+ bonuses); higher wins.`;

/** The position in text: score, ball, every player with their segment (+ = reserves). */
export function describe(s: State): string {
  const side = (t: TeamId) => s.players.filter(p => p.team === t)
    .map(p => `#${p.num}(${p.role})@${segName(p.seg)}${p.reserve ? "+".repeat(p.reserve) : ""}`).join(" ");
  const owner = s.ball.owner ? `held by ${s.ball.owner}` : "loose";
  return [
    `Turn ${s.turnNo} of ${s.maxTurns}. ${s.turn === "K" ? "Kernels" : "Shells"} to play with ${s.ap} AP. Score: Kernels ${s.score.K} - ${s.score.S} Shells.`,
    `Ball: on spot ${hexName(s.ball.hex)}, ${owner}.`,
    `Kernels: ${side("K")}`,
    `Shells: ${side("S")}`,
  ].join("\n");
}

/** The options of the side to move, summarised so the model doesn't have to do hex geometry. */
export function options(s: State): string {
  const team = s.turn, c = carrier(s), lines: string[] = [];
  const goal = attackGoal(team);
  const goalDist = (h: number) => Math.min(...goal.map(g => hexDist(h, g)));
  for (const p of s.players.filter(x => x.team === team)) {
    const { cost } = reach(s, p);
    const best = new Map<number, number>();
    for (const [seg, k] of cost) { const h = segHex(seg); if (!best.has(h) || best.get(h)! > k) best.set(h, k); }
    const byCost = new Map<number, number[]>();
    for (const [h, k] of best) { if (!byCost.has(k)) byCost.set(k, []); byCost.get(k)!.push(HEXES[h].num); }
    const reachTxt = [...byCost.keys()].sort((a, b) => a - b).map(k => `${k}AP: ${byCost.get(k)!.sort((a, b) => a - b).join(",")}`).join(" | ");
    const opp = inHex(s, hexOf(p)).filter(x => x.team !== team).map(x => x.id);
    lines.push(`#${p.num} (${p.role}) on ${segName(p.seg)}, ${goalDist(hexOf(p))} spots from goal${opp.length ? `, sharing the spot with ${opp.join(" ")}` : ""}. Can reach spots ${reachTxt || "none"}.`);
  }
  if (c && c.team === team) {
    const bh = s.ball.hex, targets = new Set(passTargets(s, c));
    lines.push(`#${c.num} has the ball on spot ${hexName(bh)}.`);
    for (const m of s.players.filter(x => x.team === team && x !== c)) {
      const h = hexOf(m);
      if (!targets.has(h)) continue;
      const lane = laneThreats(s, team, bh, h).map(t => t.p.id + (t.react ? "(reserve)" : ""));
      const there = inHex(s, h).filter(x => x.team !== team).map(x => x.id);
      lines.push(`  pass #${c.num}>#${m.num} (spot ${hexName(h)}): lane ${lane.length ? "threatened by " + lane.join(" ") : "clear"}${there.length ? `, marked by ${there.join(" ")}` : ""}`);
    }
    for (const g of goal.filter(g => targets.has(g))) {
      const lane = laneThreats(s, team, bh, g).map(t => t.p.id);
      const gk = s.players.find(x => x.team !== team && x.role === "GK")!;
      lines.push(`  shot #${c.num}>>${hexName(g)}: lane ${lane.length ? "threatened by " + lane.join(" ") : "clear"}, keeper ${hexDist(hexOf(gk), g)} spots away`);
    }
  } else if (c) {
    const tacklers = s.players.filter(x => x.team === team && hexOf(x) === s.ball.hex && !s.beaten.includes(x.id));
    lines.push(`${c.id} has the ball on spot ${hexName(s.ball.hex)}.${tacklers.length ? ` You can tackle: ${tacklers.map(x => `#${x.num}x#${c.num}`).join(" ")}` : " Nobody of yours is on that spot yet."}`);
  } else lines.push(`The ball is loose on spot ${hexName(s.ball.hex)}: move a player onto it to pick it up.`);
  return lines.join("\n");
}

export function coachPrompt(m: Match, extra = ""): string {
  const s = m.state;
  const recent = m.toFile().turns.slice(-4).map(t => `${t.no}${t.team}. ` + t.entries.map(e => e.cmd + (e.result ? `{${e.result}}` : "")).join(" ")).join("\n");
  return `${RULES}

You coach the ${s.turn === "K" ? "Kernels (K)" : "Shells (S)"}.

=== RECENT TURNS (results in braces) ===
${recent || "(kick-off)"}

=== POSITION ===
${describe(s)}

=== YOUR OPTIONS ===
${options(s)}
${extra}
Plan this turn. Spend your AP well: build attacks, keep the ball, press when defending, and put leftover AP on reserves near the ball.
Reply with ONLY a JSON object, no other text:
{"commands": ["#10-50d", "#10>#7", "#4+", "/"], "note": "<one short sentence about your idea>"}`;
}

/** Read a reply into commands and a note. Accepts text (JSON inside) or parsed JSON. */
export function parsePlan(reply: unknown): { commands: string[]; note: string } {
  let v: unknown = reply;
  if (typeof v === "string") {
    const t = v.trim(), tries = [t];
    const fence = /```[\w-]*\s*\n([\s\S]*?)\n?```/.exec(t);
    if (fence) tries.push(fence[1]);
    const a = t.indexOf("{"), b = t.lastIndexOf("}");
    if (a >= 0 && b > a) tries.push(t.slice(a, b + 1));
    v = undefined;
    for (const x of tries) { try { v = JSON.parse(x); break; } catch { /* next */ } }
  }
  const o = v as { commands?: unknown; note?: unknown } | undefined;
  if (!o || !Array.isArray(o.commands)) throw new Error("the coach's answer had no commands list");
  return { commands: o.commands.map(String).map(x => x.trim()).filter(Boolean), note: typeof o.note === "string" ? o.note : "" };
}

/**
 * Play the side to move's turn with a model. Returns the commands played, the
 * coach's note and any errors it made. Ends the turn itself if the plan runs out.
 */
export async function coachTurn({ match, ask, repairs = 1 }: { match: Match; ask: Ask; repairs?: number }):
  Promise<{ played: string[]; note: string; errors: string[] }> {
  const team = match.state.turn, no = match.state.turnNo;
  const live = () => !match.state.over && match.state.turn === team && match.state.turnNo === no;
  const played: string[] = [], errors: string[] = [];
  let note = "", extra = "";
  for (let round = 0; round <= repairs && live(); round++) {
    const plan = parsePlan(await ask(coachPrompt(match, extra)));
    note = note || plan.note;
    let failed = "";
    for (const c of plan.commands) {
      if (!live()) break;
      try { played.push(match.play(c).text); }
      catch (e) {
        if (!(e instanceof RuleError || e instanceof NotationError)) throw e;
        failed = `${c}: ${e.message}`; errors.push(failed);
        break;
      }
    }
    if (!failed) break;
    extra = `\n=== YOUR LAST PLAN STOPPED ===\nThese were played: ${played.join(" ") || "(none)"}\nThen "${failed}". Plan the rest of the turn from the position above.\n`;
  }
  if (live()) played.push(match.play("/").text);
  return { played, note, errors };
}
