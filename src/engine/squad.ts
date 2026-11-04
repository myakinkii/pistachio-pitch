// squad.ts: formations and player builds.
//
// Stats run 1 to 5 and every player's add up to 18 (three on average), so every
// build is a trade-off. Outfield players have six stats; keepers also have KEE
// (saves) inside the same 18. A formation is a fixed, mirrored set of kick-off
// positions with a build for each position: choosing one picks a style, not an
// advantage.

import type { TeamId } from "./geometry.ts";

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

/** Builds by position. Each adds up to 18. */
export const BUILDS: Record<string, Stats> = {
  GK: { pac: 2, sho: 1, pas: 3, dri: 1, def: 2, phy: 4, kee: 5 },
  CB: { pac: 2, sho: 1, pas: 3, dri: 2, def: 5, phy: 5, kee: 0 },
  FB: { pac: 4, sho: 1, pas: 3, dri: 3, def: 4, phy: 3, kee: 0 },
  WB: { pac: 5, sho: 1, pas: 3, dri: 3, def: 3, phy: 3, kee: 0 },
  DM: { pac: 2, sho: 1, pas: 4, dri: 2, def: 5, phy: 4, kee: 0 },
  CM: { pac: 3, sho: 2, pas: 5, dri: 3, def: 3, phy: 2, kee: 0 },
  WM: { pac: 4, sho: 2, pas: 4, dri: 4, def: 2, phy: 2, kee: 0 },
  W: { pac: 5, sho: 3, pas: 3, dri: 5, def: 1, phy: 1, kee: 0 },
  ST: { pac: 4, sho: 5, pas: 2, dri: 4, def: 1, phy: 2, kee: 0 },
  TS: { pac: 2, sho: 5, pas: 3, dri: 3, def: 1, phy: 4, kee: 0 }, // target striker
};
export const POSITION_NAMES: Record<string, string> = {
  GK: "keeper", CB: "centre-back", FB: "full-back", WB: "wing-back", DM: "holding midfielder",
  CM: "central midfielder", WM: "wide midfielder", W: "winger", ST: "striker", TS: "target striker",
};

/**
 * Kick-off positions for the Kernels (top half), as [position, q, r] in hex
 * coordinates, numbers 1 to 11 in order. The Shells' are the mirror image.
 * #10 takes the kick-off on the centre spot and #11 joins him in the circle.
 */
export const FORMATIONS: Record<string, { style: string; slots: [string, number, number][] }> = {
  "4-4-2": {
    style: "balanced",
    slots: [["GK", 3, -1], ["FB", 0, 2], ["CB", 2, 2], ["CB", 4, 2], ["FB", 6, 2],
      ["WM", 0, 3], ["CM", 2, 3], ["CM", 4, 3], ["WM", 6, 3], ["ST", 2, 4], ["ST", 4, 4]],
  },
  "4-3-3": {
    style: "attacking",
    slots: [["GK", 3, -1], ["FB", 0, 2], ["CB", 2, 2], ["CB", 4, 2], ["FB", 6, 2],
      ["DM", 3, 2], ["CM", 1, 3], ["CM", 5, 3], ["W", 0, 4], ["ST", 3, 3], ["W", 6, 4]],
  },
  "5-4-1": {
    style: "defensive",
    slots: [["GK", 3, -1], ["WB", 0, 2], ["CB", 1, 1], ["CB", 3, 1], ["CB", 5, 1], ["WB", 6, 2],
      ["WM", 0, 3], ["CM", 2, 3], ["CM", 4, 3], ["WM", 6, 3], ["TS", 3, 3]],
  },
  "3-5-2": {
    style: "midfield control",
    slots: [["GK", 3, -1], ["CB", 1, 1], ["CB", 3, 1], ["CB", 5, 1], ["WB", 0, 3],
      ["DM", 3, 2], ["CM", 2, 3], ["CM", 4, 3], ["WB", 6, 3], ["ST", 2, 4], ["ST", 4, 4]],
  },
};
export const FORMATION_NAMES = Object.keys(FORMATIONS);
export const DEFAULT_FORMATION = "4-4-2";

/** The Shells' mirror of a Kernels position. */
export function mirror(team: TeamId, q: number, r: number): [number, number] {
  if (team === "K") return [q, r];
  return [q, q & 1 ? 10 - r : 11 - r];
}

export const statTotal = (s: Stats) => STAT_KEYS.reduce((a, k) => a + s[k], 0);
