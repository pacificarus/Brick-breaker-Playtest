# Plan 2 of 2: Spawn-ramp tuning defaults + docs

**Difficulty: EASY** (suitable for a smaller/faster model). Pure config
numbers, comments, and README text. **Prerequisite:** Plan 1
(`plans/01-ramped-spawn-engine.md`) must already be merged — verify first
that `config.js` level defs have `weightsStart`/`weightsEnd` and that
`game.js` has `rampedWeights(...)` and `BB.Game.weightsNow()`. If not, STOP
and report; do not attempt Plan 1's work.

## Project context

Repo: `C:\Users\iancm\OneDrive\Desktop\Claude\brick-breaker` (git, branch
`main`). Framework-free browser brick-breaker prototype; `config.js` is the
single source of truth for all tuning; the in-browser playtesting menu (gear
button) live-edits it. Block types: `standard` (can roll a ⚡ chain variant
at spawn — only standard blocks can), `double` (2x hp), `armored` (resists
non-heavy damage), `wide` (3 cells), `black` (eats balls that damage it),
`mini` (4 quarter blocks/cell), plus combos `armoredMini`, `blackMini`,
`armoredWide`. Five levels, `levels.shotsPerLevel` shots each; within a
level, spawn weights now lerp `weightsStart -> weightsEnd` and a 5th spawn
chance ramps up via `spawn.extraSpawnChanceEnd` (Plan 1's engine).

## Goal

Replace Plan 1's placeholder ramp numbers with deliberate defaults, document
the tuning intent in config comments, and update the README. The UX intent
driving the numbers:

- **Each level opens as a breather and closes as a squeeze.** Level start:
  mostly standard blocks, gentler board. Level end: special density slightly
  above the old static values PLUS the growing 5th-spawn chance PLUS peak
  block health — a deliberate difficulty crest right before the next level
  resets the tension (incremental-game squeeze/release).
- **Threat ramps steeper than variety.** Blocks that punish the player's
  resources (black eats balls; armored resists damage) should start rarer
  and arrive later in the level than "variety" blocks (double, mini, wide),
  so the early-level board stays readable and the late-level board feels
  dangerous rather than merely busy.
- **Keep `standard` weights CONSTANT within each level (L1–L4).** Two
  reasons: (a) `pickType` normalizes weights, so a constant standard anchor
  is what makes the specials' ramp actually change the mix; (b) chain blocks
  only spawn from standards, so ramping standard down would silently nerf
  the player's chain upgrade late-level.
- **L5 is the exception:** it has no standards at level end; its
  start-of-level standard weight fades to 0 across the level (anchor +
  breather), and its two combo types ramp at different rates so the mix
  itself shifts (blackMini — the scarier one — ramps harder).

## Exact default values (edit `config.js`)

`levels.defs`, keeping healthMin/healthMax/speedMult unchanged:

| Level | weightsStart | weightsEnd |
|---|---|---|
| 1 | `{ standard: 3, double: 0.4, mini: 0.3 }` | `{ standard: 3, double: 1.2, mini: 1.2 }` |
| 2 | `{ standard: 3, double: 0.5, armored: 0.25 }` | `{ standard: 3, double: 1.1, armored: 1.2 }` |
| 3 | `{ standard: 3, wide: 0.4, black: 0.2 }` | `{ standard: 3, wide: 1.2, black: 1.15 }` |
| 4 | `{ standard: 2, armoredMini: 0.35 }` | `{ standard: 2, armoredMini: 1.3 }` |
| 5 | `{ standard: 1.5, blackMini: 0.4, armoredWide: 0.5 }` | `{ standard: 0, blackMini: 1.25, armoredWide: 1.1 }` |

(Rationale encoded above: ends are slightly above the old static value of 1;
starts are ~0.2–0.5 with the nastiest block of each level lowest — armored
0.25 in L2, black 0.2 in L3.)

`spawn`: keep `minPerRow: 1`, `maxPerRow: 4`, `extraSpawnChanceEnd: 0.35`
(35% chance of a 5th spawn at level end, scaling linearly from 0 — leave
unless playtesting said otherwise).

## Comments & docs

1. In `config.js`, above `levels.defs`, extend the existing comment block to
   explain: weightsStart→weightsEnd lerp per level, the constant-standard
   anchor rule and WHY (normalization + chain-block supply), the L5
   fade-to-zero exception, and that `extraSpawnChanceEnd` is the 5th-spawn
   chance at level end. Match the existing comment voice/format.
2. In `README.md`, in the "five levels" paragraph, add one or two sentences:
   special blocks fade in across each level and a 5th spawn becomes possible
   near level end, so each level opens gentle and closes with a crest.

## Verification

Serve via the `brick-breaker` preview server (`.claude/launch.json` in the
parent folder), clear saved state
(`localStorage.removeItem('bb_cfg_overrides'); localStorage.removeItem('bb_meta_save'); location.reload()`), then:

1. No console errors; `BB.Game.weightsNow()` at `BB.State.run.shots = 0`
   matches L1 weightsStart, at `shots = 24` approaches L1 weightsEnd.
2. Set `shots = 100` (level 5 start) — confirm standards appear on fresh
   spawns; `shots = 124` — confirm none/almost none, mostly black minis and
   armored wides.
3. Sanity-play a few shots at each of levels 1, 3, 5 (set `shots`, raise
   `BB.State.cfg.balls.timeScale`) and eyeball that early-level boards read
   mostly standard.
4. Clear localStorage test state and reload when done.

Commit when verified (end the message with the repo's Co-Authored-By
convention). Do not push or deploy unless asked.
