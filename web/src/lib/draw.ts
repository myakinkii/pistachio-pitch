// draw.ts: the board as SVG markup. Pure functions of the state and the view
// (rot = 0 upright, 90 sideways); used by the match pitch and the formation lab.

import {
  HEXES, NSEG, segExists, segIsGoal, segZone, segHex, pixelOf, LETTERS, PENALTY_SPOT, control, influence, carrier, hexOf,
  type State, type Player, type TeamId, type Zone,
} from "../../../src/engine/index.ts";

export const R = 40, HH = Math.sqrt(3) * R;
const DEG = Math.PI / 180, HEX_GAP = 2.6, SEG_CUT = .34, SEG_GAP = 1.6;
export const ZONE_COL: Record<Zone, string> = { goal: "#e0412e", sixyard: "#f2881c", box: "#f5d22b", flank: "#22409a", centre: "#17663e", circle: "#2a9a5e", mid: "#3b7fcf" };
/** Team kits: first colour is the shirt, second the hoop (Kernels) or stripe (Shells). Keepers wear them reversed. */
export const KIT = { K1: "#9fcb3a", K2: "#9c2e6b", S1: "#ecdfbf", S2: "#6b4426" };
export const TEAM: Record<TeamId, { name: string; one: string; chip: string }> = {
  K: { name: "Kernels", one: "Kernel", chip: "#9fcb3a" }, S: { name: "Shells", one: "Shell", chip: "#6b4426" },
};
export const playerName = (p: Player) => `${TEAM[p.team].one} #${p.num}${p.role === "GK" ? " (keeper)" : ""}`;

export const centre = (h: number) => pixelOf(h, R);
const corner = (h: number, k: number): [number, number] => { const c = centre(h), a = 60 * k * DEG, r = R - HEX_GAP; return [c.x + r * Math.cos(a), c.y + r * Math.sin(a)]; };
export const pts = (a: [number, number][]) => a.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
/** A segment drawn as a trimmed tile: apex cut off near the spot, a small gap all round. */
export function segPts(s: number) {
  const h = segHex(s), k = s % 6, c = centre(h), A = corner(h, k), B = corner(h, (k + 1) % 6);
  const lerp = (P: [number, number], t: number): [number, number] => [c.x + (P[0] - c.x) * t, c.y + (P[1] - c.y) * t];
  let poly = [lerp(A, SEG_CUT), A, B, lerp(B, SEG_CUT)];
  const mx = poly.reduce((a, p) => a + p[0], 0) / 4, my = poly.reduce((a, p) => a + p[1], 0) / 4;
  poly = poly.map(([x, y]) => { const d = Math.hypot(x - mx, y - my), f = Math.max(0, (d - SEG_GAP) / d); return [mx + (x - mx) * f, my + (y - my) * f] as [number, number]; });
  return pts(poly);
}
export const segCentroid = (s: number) => { const c = centre(segHex(s)), a = (30 + 60 * (s % 6)) * DEG; return { x: c.x + HH / 3 * Math.cos(a), y: c.y + HH / 3 * Math.sin(a) }; };
function outline(h: number) {
  const x = HEXES[h], c = centre(h);
  const ks = x.cut === "top" ? [0, 1, 2, 3] : x.cut === "bottom" ? [3, 4, 5, 0] : x.cut === "left" ? [4, 5, 0, 1, 2] : x.cut === "right" ? [1, 2, 3, 4, 5] : [0, 1, 2, 3, 4, 5];
  const p = ks.map(k => corner(h, k));
  if (x.cut === "left" || x.cut === "right") p.push([c.x, c.y]);
  return pts(p);
}
const spotPts = (r: number) => pts([0, 1, 2, 3, 4, 5].map(k => [r * Math.cos(60 * k * DEG), r * Math.sin(60 * k * DEG)]));
/** Keep text upright when the board is turned sideways. */
export const upright = (rot: number, x?: number, y?: number) =>
  (rot ? (x === undefined ? ` transform="rotate(${rot})"` : ` transform="rotate(${rot} ${x.toFixed(1)} ${y!.toFixed(1)})"`) : "");

const minX = -2 * R - 18, maxX = 11 * R + 18, minY = -HH - 18, maxY = 12 * HH + 18;
/** Sideways turns the board 90 degrees anticlockwise: 1a ends up bottom left. */
export const viewBox = (rot: number) => rot
  ? `${minY.toFixed(1)} ${-maxX} ${(maxY - minY).toFixed(1)} ${maxX - minX}`
  : `${minX} ${minY.toFixed(1)} ${maxX - minX} ${(maxY - minY).toFixed(1)}`;

export const DEFS = `<clipPath id="clipK"><ellipse rx="9" ry="13"/></clipPath>
  <clipPath id="clipS"><ellipse rx="9.4" ry="13.4"/></clipPath>
  <clipPath id="ballClip"><circle r="12"/></clipPath>
  <filter id="drop" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="1.2" stdDeviation="1.1" flood-opacity=".45"/></filter>`;

/** The pitch itself: paper, coloured tiles, lines, spots, penalty spots, and spot numbers (hidden with no-coords). */
export function staticBoard(rot: number, withNumbers = true): string {
  let h = `<rect x="${minX + 6}" y="${(minY + 6).toFixed(1)}" width="${maxX - minX - 12}" height="${(maxY - minY - 12).toFixed(1)}" rx="6" class="sheet"/>`;
  for (let s = 0; s < NSEG; s++) if (segExists(s)) h += `<polygon points="${segPts(s)}" fill="${ZONE_COL[segIsGoal(s) ? "goal" : segZone(s)]}" class="seg"/>`;
  h += `<line class="halfway" x1="${-2 * R}" y1="${(5.5 * HH).toFixed(1)}" x2="${11 * R}" y2="${(5.5 * HH).toFixed(1)}"/>`;
  for (const x of HEXES) h += `<polygon points="${outline(x.id)}" class="hexline"/>`;
  for (const y of [-HH, 12 * HH]) h += `<line class="goalline" x1="${-2 * R}" y1="${y.toFixed(1)}" x2="${11 * R}" y2="${y.toFixed(1)}"/>`;
  const sp = spotPts(8);
  for (const x of HEXES) { const c = centre(x.id); h += `<g transform="translate(${c.x.toFixed(1)} ${c.y.toFixed(1)})"><polygon points="${sp}" class="spot"/><circle r="2.2" class="dot"/></g>`; }
  for (const id of Object.values(PENALTY_SPOT)) { const c = centre(id); h += `<circle cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="4.6" fill="#161616"/>`; }
  if (withNumbers) {
    const big = spotPts(9.5);
    h += `<g class="coord-nums">` + HEXES.map(x => { const c = centre(x.id); return `<g transform="translate(${c.x.toFixed(1)} ${c.y.toFixed(1)})"><polygon points="${big}" class="spot"/><text class="hexnum" y="2.8"${upright(rot, 0, 0)}>${x.num}</text></g>`; }).join("") + `</g>`;
  }
  return h;
}
/** Segment letters a-f (hidden with no-coords). */
export function letters(rot: number): string {
  let h = "";
  for (let s = 0; s < NSEG; s++) {
    if (!segExists(s)) continue;
    const c = centre(segHex(s)), a = (30 + 60 * (s % 6)) * DEG;
    const lx = c.x + 30 * Math.cos(a), ly = c.y + 30 * Math.sin(a);
    h += `<text class="seglet" x="${lx.toFixed(1)}" y="${(ly + 2.5).toFixed(1)}"${upright(rot, lx, ly)}>${LETTERS[s % 6]}</text>`;
  }
  return h;
}
const pent = (cx: number, cy: number, r: number, rot: number) => pts([0, 1, 2, 3, 4].map(k => { const a = (rot + 72 * k) * DEG; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; }));
const BR = 12.5;
/** A classic ball: black centre pentagon, five clipped pentagons round the edge, seams between. */
export const BALL = `<g filter="url(#drop)"><circle r="${BR}" fill="#fff"/><g clip-path="url(#ballClip)">
  <polygon points="${pent(0, 0, 4.9, -90)}" fill="#111"/>
  ${[0, 1, 2, 3, 4].map(k => { const d = -90 + 36 + 72 * k, a = d * DEG; return `<polygon points="${pent(13.6 * Math.cos(a), 13.6 * Math.sin(a), 4.6, d + 180)}" fill="#111"/>`; }).join("")}
  ${[0, 1, 2, 3, 4].map(k => { const a = (-90 + 72 * k) * DEG; return `<line x1="${(4.9 * Math.cos(a)).toFixed(2)}" y1="${(4.9 * Math.sin(a)).toFixed(2)}" x2="${(BR * Math.cos(a)).toFixed(2)}" y2="${(BR * Math.sin(a)).toFixed(2)}" stroke="#111" stroke-width="0.9"/>`; }).join("")}
  </g><circle r="${BR}" fill="none" stroke="#111" stroke-width="1.8"/></g>`;
/** Where the ball sits: at its carrier's feet, or on its spot when loose. */
export function ballTransform(s: State): string {
  const bh = s.ball.hex, bc = centre(bh), c = carrier(s);
  let x = bc.x, y = bc.y;
  if (c && hexOf(c) === bh) { const cc = segCentroid(c.seg); x += (cc.x - bc.x) * .22; y += (cc.y - bc.y) * .22; }
  return `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
}

/** A pistachio in its kit. A contrasting halo keeps it visible on every zone colour. */
export function pieceSvg(p: Player, o: { rot: number; mine?: boolean; selected?: boolean; threat?: boolean; act?: string }): string {
  const c = segCentroid(p.seg), a = 30 + 60 * (p.seg % 6);
  const jit = ((p.num * 37 + (p.team === "K" ? 0 : 13)) % 17) - 8, rot = a - 90 + jit;
  const gk = p.role === "GK";
  const body = p.team === "K"
    ? `<ellipse rx="10" ry="14" class="halo K"/><g clip-path="url(#clipK)"><rect x="-9" y="-13" width="18" height="26" fill="${gk ? KIT.K2 : KIT.K1}"/>` +
      `<rect x="-9" y="-2.8" width="18" height="5.6" fill="${gk ? KIT.K1 : KIT.K2}"/></g>` +
      `<ellipse rx="9" ry="13" fill="none" stroke="#2a1f22" stroke-width="1.5"/>`
    : `<ellipse rx="10.4" ry="14.4" class="halo S"/><g clip-path="url(#clipS)"><rect x="-9.4" y="-13.4" width="18.8" height="26.8" fill="${gk ? KIT.S2 : KIT.S1}"/>` +
      `<rect x="-2.3" y="-13.4" width="4.6" height="26.8" fill="${gk ? KIT.S1 : KIT.S2}"/></g>` +
      `<ellipse rx="9.4" ry="13.4" fill="none" stroke="#4a3018" stroke-width="1.5"/>`;
  const ring = o.selected ? `<ellipse rx="13.5" ry="17.5" class="ring-sel"/>` : o.threat ? `<ellipse rx="13.5" ry="17.5" class="threat"/>` : "";
  const res = p.reserve ? Array.from({ length: p.reserve }, (_, i) => `<circle class="reserve" cx="${(9 + i * 6).toFixed(1)}" cy="-12" r="2.8"/>`).join("") : "";
  return `<g class="piece${o.mine ? " mine" : ""}" data-act="${o.act ?? "piece"}" data-id="${p.id}"${o.mine ? ' tabindex="0"' : ""} aria-label="${playerName(p)}" transform="translate(${c.x.toFixed(1)} ${c.y.toFixed(1)}) rotate(${rot})">${ring}<g filter="url(#drop)">${body}</g>${res}<text y="3.4" class="num ${p.team}${gk ? " gk" : ""}" transform="rotate(${-rot + o.rot})">${p.num}</text></g>`;
}

/** Who controls which segments: magenta for the Kernels, coffee for the Shells. */
export function controlSvg(s: State): string {
  let h = "";
  for (const [seg, t] of control(s)) h += `<polygon class="ctl-seg" points="${segPts(seg)}" fill="${t === "K" ? KIT.K2 : KIT.S2}"/>`;
  return h;
}

/** Influence on the empty spots: a lighter tint of the side that would get there first. */
export function influenceSvg(s: State): string {
  let h = "";
  for (const [hex, v] of influence(s)) {
    if (!v.owner) continue;
    const fill = v.owner === "K" ? KIT.K2 : KIT.S2;
    for (let k = 0; k < 6; k++) { const seg = hex * 6 + k; if (segExists(seg)) h += `<polygon points="${segPts(seg)}" fill="${fill}" fill-opacity="0.32" stroke="none"/>`; }
  }
  return h;
}

/**
 * A heat map as soft glows centred on the spots, in a side's colour: the
 * stronger the heat, the more opaque. The top `rank` spots get a white ring and
 * their rank, matching the focal points listed in words.
 */
export function heatSvg(m: Map<number, { v: number }>, team: TeamId, rot: number, rank = 3): string {
  const col = team === "K" ? KIT.K2 : KIT.S2, id = `heat-${team}`;
  let h = `<defs><radialGradient id="${id}"><stop offset="0" stop-color="${col}" stop-opacity="0.95"/><stop offset="0.55" stop-color="${col}" stop-opacity="0.55"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></radialGradient></defs>`;
  // only the hottest spots glow, so the focal points stand out
  const list = [...m.entries()].filter(([, x]) => x.v >= 0.1).sort((a, b) => b[1].v - a[1].v || a[0] - b[0]).slice(0, 10);
  const top = list.length ? list[0][1].v : 1;
  for (const [hex, x] of list) {
    const c = centre(hex), o = 0.35 + 0.6 * Math.min(1, x.v / top);
    h += `<circle cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="${(R * 1.15).toFixed(1)}" fill="url(#${id})" opacity="${o.toFixed(2)}"/>`;
  }
  list.slice(0, rank).forEach(([hex], i) => {
    const c = centre(hex);
    h += `<circle cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="${(R * .62).toFixed(1)}" fill="none" stroke="#fff" stroke-width="3"/>` +
      `<circle cx="${(c.x + R * .5).toFixed(1)}" cy="${(c.y - R * .5).toFixed(1)}" r="9" fill="#fff" stroke="${col}" stroke-width="2"/>` +
      `<text x="${(c.x + R * .5).toFixed(1)}" y="${(c.y - R * .5 + 4).toFixed(1)}" text-anchor="middle" font-size="11" font-weight="700" fill="${col}"${upright(rot, c.x + R * .5, c.y - R * .5)}>${i + 1}</text>`;
  });
  return h;
}
