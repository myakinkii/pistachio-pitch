# Working on pistachio-pitch as an agent

For AI agents (and people) collaborating from a chat session with a sandbox:
clone, change, test, deliver a patch, and optionally publish the page as a
claude.ai artifact. README.md says what the project is; this file is about how
to work on it.

## The loop

1. Clone fresh each session: `git clone https://github.com/myakinkii/pistachio-pitch.git`
2. `npm ci`, then `npm test` and `npm run typecheck`. All green before you start.
3. Make the change, with tests.
4. `npm test`, `npm run typecheck` and `npm run build` again.
5. Commit and deliver a patch on top of the user's `main`:
   `git format-patch -1 --stdout > NAME.patch` (or `origin/main..HEAD` for
   several commits). Before handing it over, apply it to a second fresh clone
   with `git am`, and run `npm ci`, `npm test`, `npm run build` there. The user
   applies it with `git am < NAME.patch` and pushes.

## Rules for the code

- `src/engine/` has **no dependencies** and runs unchanged in Node and browsers.
  Keep the rules deterministic: all randomness through the `Dice` in `rng.ts`,
  whose state lives in the game state; no `Math.random`, no dates, no
  iteration order that depends on object identity. Geometry the rules use is
  integer maths (see `geometry.ts`); floats are for drawing only.
- **Any change that makes existing matches play out differently** (a rule, a
  stat, a formation, dice order) must bump `RULES_VERSION` in `rules.ts`, and
  `docs/rules.md` must say what changed. Old files are then refused rather than
  replayed wrong.
- Notation changes go in `notation.ts` and `docs/notation.md` together, and
  keep old files readable.
- The coach prompt (`src/ai/coach.ts`) explains the rules to the model, and
  `src/ai/odds.ts` repeats the dice formulas from `rules.ts` to compute exact
  chances: update both when the rules change. The test "following the advice
  attacks" checks the analysis still leads somewhere (the advisor must outscore
  the bot).
- `web/` is Vue 3 + Vite and must stay one self-contained file after `npm run build`
  (vite-plugin-singlefile): no CDN at run time except Google Fonts (allowed in
  artifacts), no network calls. Keep logic in `web/src/lib/` (plain TypeScript);
  components only present it. The engine never imports anything from `web/`.
- Formations and builds live in `data/*.json`. Changing them changes how matches
  play out: the `[Squads "…"]` fingerprint in match files catches that, so old
  files are refused rather than replayed wrong. Mention data changes in
  `docs/rules.md`.

## Tests

`test/*.test.ts` run with `node --test`: geometry landmarks, notation round
trips, rules, determinism and replay verification, and the coach loop against a
fake model. For UI changes, drive `dist/index.html` in a headless browser
(Playwright works in the sandbox) and click through a turn.

## Publishing the artifact

Build, then publish `dist/index.html` with the capabilities
`{"sample": {}, "downloads": true}`. If the user already has the Pistachio Pitch
artifact, update that one (pass its URL).
