# Rules (version 0.2)

The rules version is written into every match file (`[Rules "0.2"]`). Change it
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

All rolls are d6 + a stat (1 to 5); higher wins. Stats by role for now:

| | pass | dribble | tackle | shoot | control | keep |
|---|---|---|---|---|---|---|
| GK | 2 | 1 | 2 | 1 | 3 | 4 |
| D | 3 | 2 | 4 | 2 | 3 | |
| M | 4 | 3 | 3 | 3 | 4 | |
| F | 3 | 4 | 2 | 4 | 3 | |

*Majority*: +1 to the side holding more of the six segments of the spot where
the contest happens.

- **Dribble**: the carrier stepping into a spot with opponents duels each of
  them in turn: dribble + d6 against tackle + d6 + majority. Win: carry on. Tie:
  he stops there with the ball. Lose: dispossessed.
- **Tackle** (`x`): tackler in the ball's spot: tackle + d6 + majority against
  dribble + d6. Win: takes the ball. Tie: the ball is loose in that spot. Lose:
  that player can't tackle again this turn.
- **Pass and shot**: every opponent in the lane (standing close to the line from
  the ball's spot to the target, past the first twentieth of it), nearest first:
  tackle + d6 (keepers use keep against shots) against pass (or shoot) + d6 + 1,
  -1 for 4 spots or more. Higher defender cuts it out.
  Then, for a pass: teammates only on the target receive it; teammates and
  opponents mean a reception duel (control + d6 against tackle + d6 + majority:
  win keeps it, tie leaves it loose, lose loses it); opponents only win it; an
  empty target leaves the ball loose. Range: 5 spots.
- **Shot at a goal spot**: if the keeper is on that spot or next to it:
  keep + d6 (+1 on that spot) against shoot + d6 - 1 per spot past 2.
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

- **0.2**: movement by spot instead of by segment (1 AP per spot, +1 per
  opponent in it, +1 carrying the ball; 1 AP to change segment in your own spot).
  Shots got harder: -1 per spot past 2 (was 3), and the keeper no longer takes
  -1 when he's next to the target spot. Measured over bot and advisor matches:
  about 3 goals a match and a quarter of shots scored (rules 0.1 with spot
  movement alone gave 14 goals a match).
- **0.1**: first version.
