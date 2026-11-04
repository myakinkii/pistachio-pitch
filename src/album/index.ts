// The album and its seasons. Season data lives in data/seasons/.
import { loadSeason } from "./album.ts";
import { BUILDS } from "../engine/squad.ts";
import s1 from "../../data/seasons/s1.json" with { type: "json" };

export * from "./album.ts";
export const SEASON = loadSeason(s1, Object.keys(BUILDS));
