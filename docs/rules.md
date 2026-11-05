# Rules (version 0.4)

The rules version is written into every match file (`[Rules "0.4"]`). Change it
whenever a change makes old matches play out differently, so old files are
refused instead of silently replaying wrong.

## The pitch

121 spots (hexagons), numbered 1 to 121 in zigzag rows of 9 from the top-left
corner flag (1a). Each spot has six segments, lettered clockwise from the top:
a, b, c, d, e, f. A player stands on one segment, so `50d` is spot 50, bottom
segment. Spots cut by a goal line or touchline only have the segments inside.

- Kernels (K) defend the top goal (4, 5, 6), keeper on 5, and attack downwards.
- Shells (S) defend the bottom goal (113, 119, 120), keeper on 113.
- Kick-off spot 59; penalty spots 23 and 95 (penalties aren't in the rules yet).
- Only a side's own keeper may step into its goal's segments.

## Turns

Sides take turns. A turn is a pool of action points (AP, 7 by default, 5 to 10
in the match header) to spend on any players, in any order. A match is 40 turns
by default (20 each); the second half starts at turn 21 with the other side
kicking off. After a goal, the side that conceded kicks off, as a new turn.

| Command | AP | |
|---|---|---|
| `#10-50d` / `#10-50` | see below | move to a segment (or a free segment of a spot) |
| `#10>#7` | 1 | pass to a teammate's feet |
| `#10>58` | 1 | pass into space |
| `#10>>113` | 1 | shoot at a goal spot |
| `#4x#9` | 1 | tackle the opponent who has the ball |
| `#4+` | 1 | put a reserve on a player (max 2 per player) |
| `/` | | end the turn |

Moving goes spot by spot. Stepping into a neighbouring spot costs **1 AP, +1 per
opponent standing in it, +1 if the player carries the ball**, and needs a free
segment to arrive on (any free one; the path is the cheapest, ties broken by
spot order). Changing segment within your own spot costs 1 AP. The ball is
faster than legs: a pass covers up to 5 spots for 1 AP, a dribbler 1 spot for 2.

**Losing the ball through your own action ends your turn** (turnover).

## Contests

All rolls are d6 + a stat (1 to 5); higher wins.

## Players and formations

Every player has six stats from 1 to 5 that add up to **18**; keepers also have
KEE inside the same 18. Every build is a trade-off.

| Stat | |
|---|---|
| PAC | pace: a player moves at most **1 + PAC spots per turn** (changing segment within a spot doesn't count) |
| SHO | shooting |
| PAS | passing: beating interceptions |
| DRI | dribbling, and receiving under pressure |
| DEF | tackling, intercepting, pressing |
| PHY | physical: **+1 in a duel** (dribble, press, tackle, reception) against a weaker opponent |
| KEE | keeping: saves |

Builds by position (`data/builds.json`):

| | PAC | SHO | PAS | DRI | DEF | PHY | KEE |
|---|---|---|---|---|---|---|---|
| GK keeper | 2 | 1 | 3 | 1 | 2 | 4 | 5 |
| CB centre-back | 2 | 1 | 3 | 2 | 5 | 5 | |
| FB full-back | 4 | 1 | 3 | 3 | 4 | 3 | |
| WB wing-back | 5 | 1 | 3 | 3 | 3 | 3 | |
| DM holding midfielder | 2 | 1 | 4 | 2 | 5 | 4 | |
| CM central midfielder | 3 | 2 | 5 | 3 | 3 | 2 | |
| WM wide midfielder | 4 | 2 | 4 | 4 | 2 | 2 | |
| W winger | 5 | 3 | 3 | 5 | 1 | 1 | |
| ST striker | 4 | 5 | 2 | 4 | 1 | 2 | |
| TS target striker | 2 | 5 | 3 | 3 | 1 | 4 | |

Each side picks a formation before the match: **4-4-2** (balanced), **4-3-3**
(attacking), **5-4-1** (defensive) or **3-5-2** (midfield control). A formation is
a fixed set of kick-off positions, mirrored for the Shells, with a build for each
position, plus a target shape it aims for in mid-game (`data/formations.json`). #10 takes the kick-off and #11 joins him in the centre circle. The match
file records both (`[FormationK "4-3-3"]`).

*Majority*: +1 to the side holding more of the six segments of the spot where
the contest happens.

- **Dribble**: the carrier stepping into a spot with opponents duels each of
  them in turn: DRI + d6 against DEF + d6 + majority. Win: carry on. Tie:
  he stops there with the ball. Lose: dispossessed.
- **Tackle** (`x`): tackler in the ball's spot: DEF + d6 + majority against
  DRI + d6. Win: takes the ball. Tie: the ball is loose in that spot. Lose:
  that player can't tackle again this turn.
- **Accuracy** (passes, not shots): PAS + d6 against 2 + the pass's length in
  spots. Reach it and the ball goes where it was aimed. Miss, and roll a d6 for
  the direction, read as the segment letters (1 = a, the top, clockwise to
  6 = f): the ball lands one spot that way, or two if it missed by 3 or more.
  It stops at the edge of the pitch (it never runs into a goal). The rest of
  the pass is then played to where it really lands.
- **Pass and shot**: every opponent in the lane (standing close to the line from
  the ball's spot to the target, past the first twentieth of it), nearest first:
  DEF + d6 (keepers use KEE against shots) against PAS (or SHO) + d6 + 1,
  -1 for 4 spots or more. Higher defender cuts it out.
  Then, for a pass: teammates only on the target receive it; teammates and
  opponents mean a reception duel (DRI + d6 against DEF + d6 + majority:
  win keeps it, tie leaves it loose, lose loses it); opponents only win it; an
  empty target leaves the ball loose. Range: 5 spots.
- **Shot at a goal spot**: if the keeper is on that spot or next to it:
  KEE + d6 (+1 on that spot) against SHO + d6 - 1 per spot past 2.
  Keeper higher: saved and held. Tie: parried loose to a random spot next to the
  goal. Shooter higher (or keeper too far): goal.
- Walking onto a loose ball picks it up.

## Reserves

A reserve is 1 AP left on a player for the opponent's next turn. Reserves fire
automatically, each one once, when the opponent contests the ball within reach:

- **Press**: the carrier dribbles into a spot next to a player with a reserve:
  he steps into a free segment of that spot and duels with +1.
- **Stretch**: a pass passing near him (wider than the lane): he tries to cut it
  out at -1.
- **Pounce**: the ball goes loose within one spot: the nearest player with a
  reserve steps in and takes it.

Unused reserves expire when your own next turn starts.

## Not yet

Fouls, free kicks, penalties and corners; offside; stamina; skills and perks;
substitutions; live reactions (quick-time decisions).

## Changes

- **0.4**: pass accuracy. Every pass rolls PAS + d6 against 2 + its length;
  a miss scatters it one or two spots in a d6 direction (a to f). Short passes
  between well-placed teammates are reliable, long balls are a gamble, and PAS
  matters beyond beating interceptions. Measured over advisor matches against
  0.3: passes received per attack doubled (0.73 to 1.53), passes of 4+ spots
  fell from 75% to about 40%, about 16% of passes go astray, 2.8 goals a match.
  (3 + length was also tried: 25% astray, 1.9 goals a match, shorter attacks.)
- **0.3**: player stats (PAC SHO PAS DRI DEF PHY, plus KEE for keepers; 18
  points each), formations (4-4-2, 4-3-3, 5-4-1, 3-5-2) with builds by position,
  the pace cap (1 + PAC spots per turn) and the PHY edge in duels.
- **0.2**: movement by spot instead of by segment (1 AP per spot, +1 per
  opponent in it, +1 carrying the ball; 1 AP to change segment in your own spot).
  Shots got harder: -1 per spot past 2 (was 3), and the keeper no longer takes
  -1 when he's next to the target spot. Measured over bot and advisor matches:
  about 3 goals a match and a quarter of shots scored (rules 0.1 with spot
  movement alone gave 14 goals a match).
- **0.1**: first version.
