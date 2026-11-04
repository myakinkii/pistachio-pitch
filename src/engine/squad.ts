// squad.ts: formations and player builds.
//
// Stats run 1 to 5 and every player's add up to 18 (three on average), so every
// build is a trade-off. Outfield players have six stats; keepers also have KEE
// (saves) inside the same 18. A formation is a fixed, mirrored set of kick-off
// positions with a build for each position: choosing one picks a style, not an
// advantage.

import { HEXES, hexByNum, type TeamId } from "./geometry.ts";
import formationsData from "../../data/formations.json" with { type: "json" };
import buildsData from "../../data/builds.json" with { type: "json" };

export interface Stats {
  pac: number; // pace: a player can move at most 1 + PAC spots per turn
  sho: number; // shooting
  pas: number; // passing: beating interceptions
  dri: number; // dribbling and receiving under pressure
  def: number; // tackling, intercepting, pressing
  phy: number; // physical: +1 in duels against a weaker opponent
  kee: number; // keeping (keepers only; 0 for outfield players)
}
export const BUDGET = 18;
export const STAT_KEYS = ["pac", "sho", "pas", "dri", "def", "phy", "kee"] as const;

/** Builds by position (data/builds.json). Each adds up to 18. */
export const BUILDS: Record<string, Stats> = buildsData;
export const POSITION_NAMES: Record<string, string> = {
  GK: "keeper", CB: "centre-back", FB: "full-back", WB: "wing-back", DM: "holding midfielder",
  CM: "central midfielder", WM: "wide midfielder", W: "winger", ST: "striker", TS: "target striker",
};

export interface Formation {
  style: string;
  /** [position, q, r] for numbers 1 to 11, the Kernels' kick-off positions; the Shells' are the mirror image */
  slots: [string, number, number][];
  /** [q, r] for numbers 1 to 11: the mid-game shape the formation aims for (Kernels' view) */
  target: [number, number][];
}

/**
 * Formations come from data/formations.json, written in spot numbers from the
 * Kernels' side (attacking down): for each player his position, his kick-off spot
 * and his target spot in the mid-game shape. #10 takes the kick-off on the centre
 * spot and #11 joins him in the circle.
 */
function qr(spot: number, where: string): [number, number] {
  const h = hexByNum(spot);
  if (h === undefined) throw new Error(`formations.json: ${where}: there is no spot ${spot}`);
  return [HEXES[h].q, HEXES[h].r];
}
export const FORMATIONS: Record<string, Formation> = Object.fromEntries(
  Object.entries(formationsData as Record<string, { style: string; players: { pos: string; kickoff: number; target: number }[] }>).map(([name, f]) => [name, {
    style: f.style,
    slots: f.players.map((p, i) => [p.pos, ...qr(p.kickoff, `${name} #${i + 1} kickoff`)] as [string, number, number]),
    target: f.players.map((p, i) => qr(p.target, `${name} #${i + 1} target`)),
  }]),
);
/** A short fingerprint of the formation and build data, recorded in match files. */
export const SQUAD_DATA = fnv(JSON.stringify(formationsData) + JSON.stringify(buildsData));
function fnv(t: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, "0");
}
export const FORMATION_NAMES = Object.keys(FORMATIONS);
export const DEFAULT_FORMATION = "4-4-2";

/** The Shells' mirror of a Kernels position. */
export function mirror(team: TeamId, q: number, r: number): [number, number] {
  if (team === "K") return [q, r];
  return [q, q & 1 ? 10 - r : 11 - r];
}

export const statTotal = (s: Stats) => STAT_KEYS.reduce((a, k) => a + s[k], 0);
