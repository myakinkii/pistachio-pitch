# pistachio-pitch

Turn-based football game but with pistachios. 100% vibe-coded.

Eleven pistachios a side on a hand-drawn hex pitch: each hexagon is a ball spot
with six segments where players stand. Sides spend a pool of action points per
turn; dribbles, tackles, passes and shots are resolved with dice and player
stats; reserves let the defending side react during the opponent's turn. Every
match is a short text file that replays exactly, in the browser and on the
command line.

```
1K. #11-67a #10>#11{=K11} #11-68f #11>#10{=K10} /
2S. #10-68e #10x#11{tackle S10vK11 4:6 lose} #11-68c #10+
3K. #11-76a{S10^67d; press K11vS10 5:7 lose; turnover}
```

## Quick start

Node 22.18+ (it runs the TypeScript directly, no build step for the engine).

```sh
npm ci
npm test             # engine, notation, replays, the coach loop
npm run build        # one self-contained file: dist/index.html
npm run typecheck
```

Open `dist/index.html` straight from disk to play: you against the bot, two
humans on one screen, or any mix of bot, advisor and Claude. It's also what gets published as the
claude.ai artifact, where Claude can coach either side.

### Command line

```sh
node src/cli.ts selfplay --seed demo -o matches/demo.ppn       # bot vs bot
node src/cli.ts replay matches/demo.ppn --verify               # rebuild it and check every result
node src/cli.ts replay matches/demo.ppn --to 30                # the position after 30 actions
node src/cli.ts selfplay --k advisor --s bot                   # the advisor against the bot
ANTHROPIC_API_KEY=... node src/cli.ts selfplay --k claude --s bot -o matches/claude.ppn
```

Matches saved from the page (Save file, or Copy) replay the same way, because
the page and the CLI run the same engine with the same seeded dice.

## Layout

- `src/engine/`: the game, no dependencies. `geometry.ts` (the pitch, spots and
  segments, all integer maths so replays never drift between JavaScript
  engines), `rng.ts` (seeded dice), `rules.ts` (state and commands),
  `notation.ts` (PPN), `match.ts` (recording, replay, verification).
- `src/ai/`: `bot.ts`, a deterministic heuristic coach; `odds.ts`, exact
  chances from the dice and an analysis of the side to move's real options;
  `advisor.ts`, a coach that always plays the top-rated option; and `coach.ts`,
  the model-agnostic LLM coach: give it an `ask(prompt)` function.
- `src/commentary.ts`: commentary lines from match events.
- `src/cli.ts`: replay, verify and self-play.
- `web/`: the page; `scripts/build-web.mjs` bundles it into `dist/index.html`.
- `docs/rules.md`, `docs/notation.md`: the rules and the notation.

## Claude as a coach

In the claude.ai artifact (with the `sample` capability), set either side to
Claude and press "Ask Claude to play" on its turn. Claude gets the rules, a
short playbook (with the ball, progress every turn and shoot when the odds are
decent; without it, press and tackle, then reserves), the position, and its
options worked out with exact odds from the dice: shots with the chance of a
goal, passes and through balls with the chance they arrive, dribbles with the
chance of keeping the ball, runs into space, tackles. It answers with a plan for
the whole turn as commands, plus a one-line idea shown after its turn.
The engine plays them in order and resolves every contest with dice; if a
command turns out illegal, Claude gets the error and one chance to re-plan.
It runs on the viewer's own Claude account and asks for permission the first
time. Calls only happen when you press the button.

The logic is in `src/ai/coach.ts` and doesn't depend on the page or a model:
the CLI uses the same code with the Anthropic API.
