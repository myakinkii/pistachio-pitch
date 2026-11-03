// coach.ts: let a language model play a side. Model-agnostic: pass an
// `ask(prompt)` that resolves with the model's reply (text, or already-parsed
// JSON). The page uses the claude.ai artifact `sample` capability; the CLI uses
// the Anthropic API. The coach sees the position plus its legal options, answers
// with a plan for the whole turn as commands, and the engine plays them in order,
// resolving every contest with dice. If a command is illegal, the coach gets the
// error and the new position and may answer once more.

import {
  segName, hexName, hexOf, PASS_RANGE, MAX_RESERVE,
  RuleError, NotationError, type State, type Match, type TeamId,
} from "../engine/index.ts";
import { analyze, goalDist } from "./odds.ts";

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
forwards at dribbling and shooting. Rolls are d6 + stat (+ bonuses); higher wins.

Direction: spot numbers grow by 9 per row going down the pitch. Kernels attack downwards (towards
higher numbers), Shells upwards (towards lower numbers). "N from goal" in the options counts spots
to the goal you attack.

=== PLAYBOOK ===
You win by scoring. A 0-0 is a failure for both coaches. Every turn with the ball should move it
clearly closer to goal or end in a shot; a turn spent only on reserves while you have the ball is wasted.
With the ball:
- Progress first. Prefer, in this order: a shot with a good chance (30%+ is worth it inside 4 spots,
  taking it beats keeping the ball near goal); a forward pass that arrives 70%+; a dribble into an
  empty spot closer to goal; a run by a teammate into space ahead, then a pass to him.
- Chain actions: move or dribble, then pass, then the receiver moves on. Several short safe steps
  beat one long risky one, but don't pass backwards and sideways all turn.
- Avoid passing or dribbling into spots with opponents unless the odds say it's fine. Losing the ball
  ends your turn, so play the risky action last, after the safe progress.
- Use forwards (#10, #11) as targets near the goal, midfielders to carry and pass. Keep 1-2 AP for
  reserves on defenders near the ball only if you're at risk of losing it.
Without the ball:
- Press: send the nearest one or two players into the carrier's spot and tackle (the more of the
  spot's segments you hold, the better your odds). A tie knocks it loose; walk onto it to win it.
- Then put leftover AP on reserves for players next to the ball and in front of your goal: they press
  his next dribble and pounce on loose balls.
- Late in the match, if you're behind, attack with more players; if you're ahead, keep it safe.`;

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

/** The side to move's options, worked out with exact odds (see odds.ts), best first in each group. */
export function options(s: State): string {
  const team = s.turn, { summary, options: opts } = analyze(s);
  const roster = s.players.filter(p => p.team === team)
    .map(p => `#${p.num} ${p.role} ${segName(p.seg)} (${goalDist(team, hexOf(p))} from goal)${p.reserve ? ` +${p.reserve}` : ""}${s.beaten.includes(p.id) ? " beaten" : ""}`).join("; ");
  const head: Record<string, string> = {
    shot: "Shots", pass: "Passes to feet", through: "Through balls into space", dribble: "Dribbles forward",
    run: "Runs into space (to receive a pass next)", press: "Win the ball back", reserve: "Reserves", loose: "Loose ball",
  };
  const lines = [summary, `Your players: ${roster}`];
  let last = "";
  for (const o of opts) {
    if (o.kind !== last) { lines.push(`${head[o.kind]}:`); last = o.kind; }
    lines.push(`  ${o.text}`);
  }
  if (!opts.length) lines.push("No obvious options: reposition players towards the ball, or end the turn.");
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
Plan this turn following the playbook. Options marked "then" are two commands. The odds are for
the position as it is now; after your first commands the picture changes, so order them well.
Reply with ONLY a JSON object, no other text:
{"idea": "<one sentence: what you're going for>", "commands": ["#7-50d", "#7>#10", "#10-59a", "#10>>113"], "note": "<a short line for the commentary>"}`;
}

/** Read a reply into commands and a note. Accepts text (JSON inside) or parsed JSON. */
export function parsePlan(reply: unknown): { commands: string[]; note: string; idea: string } {
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
  const o = v as { commands?: unknown; note?: unknown; idea?: unknown } | undefined;
  if (!o || !Array.isArray(o.commands)) throw new Error("the coach's answer had no commands list");
  return {
    commands: o.commands.map(String).map(x => x.trim()).filter(Boolean),
    note: typeof o.note === "string" ? o.note : "", idea: typeof o.idea === "string" ? o.idea : "",
  };
}

/**
 * Play the side to move's turn with a model. Returns the commands played, the
 * coach's note and any errors it made. Ends the turn itself if the plan runs out.
 */
export async function coachTurn({ match, ask, repairs = 1 }: { match: Match; ask: Ask; repairs?: number }):
  Promise<{ played: string[]; note: string; idea: string; errors: string[] }> {
  const team = match.state.turn, no = match.state.turnNo;
  const live = () => !match.state.over && match.state.turn === team && match.state.turnNo === no;
  const played: string[] = [], errors: string[] = [];
  let note = "", idea = "", extra = "";
  for (let round = 0; round <= repairs && live(); round++) {
    const plan = parsePlan(await ask(coachPrompt(match, extra)));
    note = note || plan.note; idea = idea || plan.idea;
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
  return { played, note, idea, errors };
}
