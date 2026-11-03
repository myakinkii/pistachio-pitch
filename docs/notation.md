# Pistachio Pitch Notation (PPN)

A match file is a start position (headers) plus the commands played. The engine
is deterministic for a seed, so the commands alone rebuild every state; the
results in braces are for people, and for checking a replay is in sync.

```
[Game "Pistachio Pitch"]
[Rules "0.1"]
[Seed "demo"]
[AP "7"]
[Turns "40"]
[FirstKick "K"]
[Kernels "Bot"]
[Shells "Claude"]
[Result "1-0"]

1K. #11-67a #10>#11{=K11} #11-68f #11>#10{=K10} /
2S. #10-68e #10x#11{tackle S10vK11 4:6 lose} #11-68c #10+
3K. #11-76a{S10^67d; press K11vS10 5:7 lose; turnover}
```

Each line is one turn: the turn number and side (`12K.`), then its commands.
`;;` starts a comment. Commands are explained in [rules.md](rules.md).

## Results

| Mark | Meaning |
|---|---|
| `=K7` | received by Kernel #7 |
| `*S4 3:5` | cut out by Shell #4 (rolls: passer 3, defender 5); `r` = from a reserve |
| `S4 6:2 missed` | Shell #4 in the lane, didn't get it |
| `~58` | the ball is loose on spot 58 |
| `!S4` | lost to Shell #4 on arrival |
| `@K7` | Kernel #7 picks up the loose ball |
| `drib K10vS4 6:4 win` | a duel: kind, who, rolls, result for the first player |
| `stopped` | the dribble ended in a tie |
| `S10^67d` | Shell #10 springs from reserve to 67d |
| `$S1 5:6` | saved by the keeper; `parried ~111` when it squirms loose |
| `S1 10:6 beaten`, `GOAL` | the keeper was beaten; a goal |
| `turnover`, `HT`, `FT` | the turn ended by losing the ball; half-time; full time |

Spot-only moves (`#10-50`) are recorded with the segment the engine chose
(`#10-50d`). `T/` is an end of turn by timeout.
