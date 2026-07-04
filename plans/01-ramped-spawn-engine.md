# Plan 1 of 2: Intra-level spawn ramping — engine change

**Difficulty: MEDIUM.** Core spawn logic, a config schema migration, and two
normalization edge cases that are easy to get subtly wrong. Read the whole
plan before editing. (Plan 2 — `plans/02-ramp-tuning-and-docs.md` — is the
easy follow-up: default numbers and docs. Do NOT do Plan 2's work here beyond
the placeholder defaults specified below.)

## Project context (self-contained — read this first)

Repo: `C:\Users\iancm\OneDrive\Desktop\Claude\brick-breaker` (git repo,
branch `main`). A framework-free, browser-runnable Ballz-style brick breaker
playtesting prototype. Plain script tags, no build step. Files:

- `config.js` — `window.BB_DEFAULTS`, the single source of truth for ALL
  tunable numbers. Game logic must never hardcode tuning values.
- `state.js` — `BB.State`: live config (defaults deep-merged with
  localStorage overrides under key `bb_cfg_overrides`), run state, meta state.
- `game.js` — `BB.Game`: canvas gameplay. Reads every tunable live from
  `BB.State.cfg` each frame so playtesting-menu edits apply instantly.
- `upgrades.js`, `devmenu.js`, `main.js`, `index.html`, `style.css`.
- `.claude/launch.json` (in the parent dir `C:\Users\iancm\OneDrive\Desktop\Claude`)
  defines a `brick-breaker` static preview server (python http.server :8123).

Key existing mechanics: each shot descends all blocks one row and spawns a
wave of new blocks at the top. A run climbs through five **levels**
(`cfg.levels.defs`, `shotsPerLevel` shots each). Each level def currently has
`healthMin`, `healthMax`, `speedMult`, and a static `weights` map that picks
block types, e.g. `{ standard: 3, double: 1, mini: 1 }`. Type names:
`standard, double, armored, wide, black, mini, armoredMini, blackMini,
armoredWide`. In `game.js`, `healthLevel()` already computes within-level
progress: `frac = (run().shots - idx * shotsPerLevel) / shotsPerLevel`
(deliberately NOT clamped on the final level so health keeps climbing).
`spawnWave()` rolls a spawn count uniformly in
`[cfg.spawn.minPerRow, cfg.spawn.maxPerRow]` (currently 1–4) and calls
`pickType(def.weights)` per spawn. `placeType(...)` falls back to `standard`
when a type doesn't fit.

## Goal

Make spawning ramp **within each level**:

1. **Special-block weights interpolate across the level.** Each block type's
   weight lerps from a `weightsStart` value to a `weightsEnd` value as the
   level progresses (frac 0 → 1). Special blocks start the level rarer than
   today and end slightly more common than today. Applies to all special
   blocks in all levels.
2. **A 5th spawn becomes possible toward level end.** Spawn count stays 1–4
   at level start, but as the level progresses there is a growing chance of
   one extra spawn (making 1–5 near the end). Applies in all levels.

## Design

### Config schema (edit `config.js`)

- In each entry of `levels.defs`, replace `weights` with two maps:
  `weightsStart` and `weightsEnd`. **Placeholder defaults for this plan**
  (Plan 2 tunes them properly): copy each current `weights` map to
  `weightsEnd`; for `weightsStart`, keep `standard` identical and multiply
  every non-standard weight by 0.4. Current values:
  - L1: `{ standard: 3, double: 1, mini: 1 }`
  - L2: `{ standard: 3, double: 1, armored: 1 }`
  - L3: `{ standard: 3, black: 1, wide: 1 }`
  - L4: `{ standard: 2, armoredMini: 1 }`
  - L5: `{ blackMini: 1, armoredWide: 1 }` — **special case, see below.**
- In `spawn`, add `extraSpawnChanceEnd: 0.35` — the probability, AT LEVEL END,
  of one bonus spawn beyond `maxPerRow`; scales linearly from 0 at level
  start (`chance = clampedFrac * extraSpawnChanceEnd`). Keep
  `minPerRow`/`maxPerRow` as-is. Comment all new fields in config.js in the
  same style as the existing comments.

### Engine (edit `game.js`)

- Factor a `levelFrac()` helper out of `healthLevel()`: returns the raw
  (unclamped) frac. `healthLevel()` keeps using it unclamped — health
  extrapolation past level 5 must not change. Weights and spawn-count ramps
  use `Math.min(1, levelFrac())` — they must NOT extrapolate past 1 or the
  final level's weights would drift forever.
- Add `rampedWeights(def, frac)`: for the union of keys in
  `def.weightsStart`/`def.weightsEnd` (missing key = 0), return
  `start + (end - start) * frac` per key, dropping keys that resolve to <= 0
  (pickType would otherwise pick a zero-weight type when `r` lands exactly on
  the boundary; also avoids negative weights corrupting the total).
- `spawnWave()` uses `rampedWeights(levelDef(), clampedFrac)` instead of
  `def.weights`, and after rolling the base count 1–4, adds +1 with
  probability `clampedFrac * cfg().spawn.extraSpawnChanceEnd`.
- Expose two tiny debug accessors on the module for verification and future
  dev-menu display: `G.levelFrac = () => <clamped frac>` and
  `G.weightsNow = () => rampedWeights(levelDef(), <clamped frac>)`.

### Two edge cases that MUST be handled

1. **Normalization cancels uniform ramps (the L5 trap).** `pickType`
   normalizes weights, so if EVERY weight in a level ramps by the same
   factor, the spawn mix does not change at all — the ramp is only
   meaningful relative to an anchor. L1–L4 keep `standard` constant as that
   anchor. L5 has no standard blocks today, so give it one at level start
   that fades out: placeholder `weightsStart: { standard: 1.5, blackMini: 0.5,
   armoredWide: 0.5 }`, `weightsEnd: { standard: 0, blackMini: 1.2,
   armoredWide: 1.1 }`. This also gives level 5's opening a breather beat,
   which is the UX intent. (A key present only in one map interpolates
   to/from 0 — the union logic above covers this.)
2. **Stale saved configs.** `state.js` deep-merges localStorage overrides
   onto defaults, so a player with an old save has `levels.defs[i].weights`
   and no `weightsStart`. In `rampedWeights`, if a def lacks BOTH
   `weightsStart` and `weightsEnd`, fall back to `def.weights` for both ends
   (static behavior, no crash). Do not write a migration; the dev menu's
   "Reset game" wipes overrides.

### What NOT to touch

- `healthLevel()` output values, `placeType`, descend/death logic, the
  dev menu (it auto-generates: `levels.defs` already renders as a JSON
  textarea and `spawn.extraSpawnChanceEnd` will appear as a number input
  automatically), README (Plan 2 covers docs).

## Verification (do all of these)

Start the preview: the `brick-breaker` server from `.claude/launch.json`,
then open the page and clear state
(`localStorage.removeItem('bb_cfg_overrides'); localStorage.removeItem('bb_meta_save'); location.reload()`).

1. No console errors on load; a run plays normally (aim, fire, descend).
2. `BB.State.run.shots = 0` then check `BB.Game.weightsNow()` ≈ weightsStart
   of L1; `BB.State.run.shots = 24` → close to weightsEnd; `shots = 130`
   (past level 5's end) → exactly L5 weightsEnd, not extrapolated beyond.
3. Statistical check of the 5th spawn: set `shots = 24` (L1 end) and sample —
   e.g. temporarily call the spawn path many times via
   `for(let i=0;i<300;i++){...}` on a throwaway board, or instrument by
   counting blocks after firing shots at high `cfg.balls.timeScale`. Confirm
   waves of 5 occur near level end and never at `shots = 0`.
4. Old-save fallback: in the console, write a fake stale override
   (`localStorage.setItem('bb_cfg_overrides', JSON.stringify({levels:{defs:[{healthMin:1,healthMax:40,speedMult:1,weights:{standard:3,mini:1}}]}}))`
   is NOT the right shape to test the merge — instead simply delete
   `weightsStart`/`weightsEnd` from `BB.State.cfg.levels.defs[0]` at runtime,
   set `.weights = {standard:3,mini:1}`, and confirm `BB.Game.weightsNow()`
   returns that static map with no exception).
5. Clean up test state (clear both localStorage keys, reload) when done.

Commit when verified (message describing the ramp engine; end with the
Co-Authored-By line per repo convention). Do not push or deploy unless asked.
