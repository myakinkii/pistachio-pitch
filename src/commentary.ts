// commentary.ts: turn what the engine reports into short commentary lines.

import { HEXES, type State, type Ev, type TeamId } from "./engine/index.ts";

const TEAM: Record<TeamId, { name: string; one: string }> = { K: { name: "Kernels", one: "Kernel" }, S: { name: "Shells", one: "Shell" } };
const who = (pid: string) => `${TEAM[pid[0] as TeamId].one} #${pid.slice(1)}`;

export function isPrime(n: number): boolean {
  if (n < 2) return false;
  for (let d = 2; d * d <= n; d++) if (n % d === 0) return false;
  return true;
}

export interface Line { text: string; big?: boolean }

/** Commentary for one played command. `before` is the state the command was played in. */
export function commentary(events: Ev[], before: State, after: State): Line[] {
  const out: Line[] = [];
  const shooter = before.ball.owner;
  for (const e of events) {
    switch (e.e) {
      case "goal": {
        const spot = HEXES[before.ball.hex].num, p = before.players.find(x => x.id === e.pid);
        let text = `GOAL! ${who(e.pid)} scores from spot ${spot}. ${TEAM.K.name} ${after.score.K}, ${TEAM.S.name} ${after.score.S}.`;
        if (isPrime(spot)) text += p?.role === "F" ? " The striker scores from a prime position!" : " A goal from a prime position!";
        out.push({ text, big: true });
        break;
      }
      case "saved": out.push({ text: `${who(e.pid)} gathers the shot${shooter ? ` from ${who(shooter)}` : ""}.` }); break;
      case "parried": out.push({ text: `${who(e.pid)} parries it! The ball runs loose on spot ${HEXES[e.hex].num}.` }); break;
      case "beaten": out.push({ text: `${who(e.pid)} is beaten…` }); break;
      case "intercept": out.push({ text: e.react ? `${who(e.pid)} stretches and cuts it out!` : `${who(e.pid)} reads it and intercepts.` }); break;
      case "react": out.push({ text: `${who(e.pid)} springs from reserve.` }); break;
      case "duel":
        if (e.kind === "dribble" || e.kind === "press") {
          out.push({ text: e.out === "win" ? `${who(e.att)} skips past ${who(e.def)}.` : e.out === "tie" ? `${who(e.def)} holds ${who(e.att)} up.` : `${who(e.def)} wins it off ${who(e.att)}.` });
        } else if (e.kind === "tackle") {
          out.push({ text: e.out === "win" ? `Strong tackle by ${who(e.att)}!` : e.out === "tie" ? `${who(e.att)} gets a toe in, it breaks loose!` : `${who(e.def)} rides the challenge from ${who(e.att)}.` });
        } else {
          out.push({ text: e.out === "win" ? `${who(e.att)} controls it under pressure.` : e.out === "tie" ? `It squirms loose between ${who(e.att)} and ${who(e.def)}.` : `${who(e.def)} nips in ahead of ${who(e.att)}.` });
        }
        break;
      case "halftime": out.push({ text: "Half-time.", big: true }); break;
      case "fulltime": out.push({ text: `Full time: ${TEAM.K.name} ${after.score.K}, ${TEAM.S.name} ${after.score.S}.`, big: true }); break;
      case "kickoff": if (before.turnNo !== 1) out.push({ text: `${TEAM[e.team].name} kick off.` }); break;
    }
  }
  return out;
}
