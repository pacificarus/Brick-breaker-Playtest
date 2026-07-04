# Plan 3 of 4: Level-gated runs, level completion, softened starts

**Difficulty: MEDIUM-HARD.** This restructures the core run loop (what a
"run" is), adds a win path alongside the death path, and changes the health
curve. It touches `state.js`, `game.js`, `main.js`, `config.js`, and
`devmenu.js`. Recommend the strongest available model. (Plan 4 —
`plans/04-level-gated-upgrades.md` — is the easy follow-up: upgrade
visibility + a new meta upgrade. Do NOT do Plan 4's work here.)

**Ordering:** Best applied AFTER plans 01/02 (intra-level spawn ramping).
Check `game.js` first: if `levelFrac()` and `rampedWeights(...)` exist,
plans 01/02 are merged and this plan's instructions apply as written. If
they do NOT exist, the same logic lives inline in `healthLevel()` and
`spawnWave()` — adapt the same changes to that shape; nothing here
fundamentally depends on 01/02.

## Project context (self-contained)

Repo: `C:\Users\iancm\OneDrive\Desktop\Claude\brick-breaker` (git, branch
`main`). Framework-free browser Ballz-style brick-breaker playtesting
prototype; plain script tags, no build. `config.js` holds ALL tunables
(`window.BB_DEFAULTS`); the in-browser playtesting menu (gear button)
live-edits a copy persisted to localStorage (`bb_cfg_overrides`; meta save
in `bb_meta_save`). Preview server: `brick-breaker` entry in
`.claude/launch.json` in the parent folder (python http.server :8123).

Current behavior you are changing: a run starts at level 1 and climbs
through all five levels (`cfg.levels.defs`, `cfg.levels.shotsPerLevel` shots
each) in one continuous run until a block crosses the death line. `game.js`
computes `levelIndex()` from cumulative `run().shots`; block health
interpolates `healthMin -> healthMax` within each level and extrapolates
past the last level. On death, `BB.Main.onDeath()` -> `BB.State.endRun()`
awards meta currency = `floor(blocks * metaYieldPerBlock + shots *
metaYieldPerShot)` and shows the death/upgrade screen; "Start next run"
restarts at level 1.

## Goal

1. **One run = one level attempt.** The player starts at their highest
   unlocked level (persisted in the meta save; starts at 1). Surviving
   `shotsPerLevel` shots at that level BEATS it: the run ends (win), the
   next level unlocks, and all future runs start at that new level. Beating
   the last level = game beaten (banner; further runs replay the last level).
2. **Both run endings land on the same death/upgrade screen**, but a level
   clear is framed as a victory ("Level N cleared!") and pays a completion
   bonus in meta currency.
3. **Softened starting health for level 2+.** A fresh run at level N (N>=2)
   starts block health at a blend between the previous level's starting
   health and this level's starting health, then ramps to this level's
   `healthMax` by level end. Blend is a config tunable (default 0.5 —
   halfway), because whether halfway is right is exactly what playtesting
   will decide.

## Design

### Config (`config.js`)

- `levels` gains `startHealthBlend: 0.5` — 0 = start at the previous
  level's healthMin (gentlest), 1 = start at this level's own healthMin
  (hardest). Comment it in the existing style.
- `economy` gains `levelClearBonusPerLevel: 8` — meta currency bonus on a
  level clear = this value x the cleared level number (so clearing later
  levels pays more), added on top of the normal death-formula yield.

### State (`state.js`)

- Fresh meta save gains `unlockedLevel: 1`. Stale saves in localStorage
  won't have it — everywhere it is read, guard with
  `(S.meta.unlockedLevel || 1)`.
- `newRun()` records `S.run.level = S.meta.unlockedLevel || 1` (the run's
  fixed level) and `S.run.cleared = false`.
- `endRun()` takes the win/loss into account: if `S.run.cleared`, add
  `economy.levelClearBonusPerLevel * S.run.level` to the earned meta, and if
  `S.run.level === <number of level defs>` set a `gameBeaten` flag in the
  returned stats. If cleared and `S.run.level < defs.length`, increment
  `S.meta.unlockedLevel`. Persist meta. Return the extra fields
  (`cleared`, `level`, `clearBonus`, `gameBeaten`) in the stats object for
  the death screen.

### Game (`game.js`)

- `levelIndex()` becomes constant for the run: `run().level - 1` (clamped to
  the defs array). Cumulative-shots-based level climbing is GONE.
- Within-level progress: `frac = run().shots / cfg().levels.shotsPerLevel`,
  clamped to 1 for weights/spawn AND health (a run can no longer outlive its
  level, so health extrapolation past the end is dead code — remove it).
- Health curve: let `i = levelIndex()`. Start health =
  `i === 0 ? defs[0].healthMin : lerp(defs[i-1].healthMin, defs[i].healthMin,
  cfg().levels.startHealthBlend)`. Health at frac f =
  `round(lerp(startHealth, defs[i].healthMax, f))`, min 1.
- **Level-clear detection** in `endTurn()`: current order is descend ->
  death check -> spawn -> back to aim. After the death check passes, if
  `run().shots >= cfg().levels.shotsPerLevel`, set `run().cleared = true`,
  set phase to `"over"`, call `BB.Main.onDeath()` (same exit as death — the
  stats object distinguishes win from loss), and do NOT spawn. The player
  must survive the final descend for the clear to count.

### Screens (`main.js` + `index.html` if needed)

- `onDeath()` already renders stats from `BB.State.endRun()`. Extend it:
  when `stats.cleared`, the heading reads "Level N cleared!" (style
  distinct from the red "Run over" — reuse existing CSS patterns, e.g. the
  green of `button.big`), the stats include the clear bonus line, and when
  `stats.gameBeaten`, show a "Game beaten — replaying final level" banner.
  When not cleared, show "Run over — Level N" so the player knows where
  they died. Keep it plain DOM/`innerHTML` like the existing code.
- The gameplay HUD "Lv" indicator now shows the run's fixed level.

### Dev menu (`devmenu.js`)

- In the "Current state" section add a numeric row for
  `meta.unlockedLevel` (write through `BB.State.saveMeta()`, refresh UI) so
  playtesters can jump to any level. Pattern-match the existing meta-level
  rows in `buildStateSection`.

## UX rationale (context for implementation choices — do not skip the bonus)

Because a run is now a single level, the intra-level spawn ramp (plans
01/02) becomes the ENTIRE arc of every run: gentle open, cresting close.
Dying always replays the same level — there is no easier level to farm — so
meta income from FAILED attempts is the engine of progression; that is why
the clear bonus is additive (winning must beat losing-at-the-buzzer, but
failed attempts must still pay). The softened start (blend) exists because a
fresh level-2 run with zero in-run upgrades facing full 40-hp blocks would
wall the player; Plan 4 adds a starting-currency meta upgrade attacking the
same wall from the economy side.

## Verification (all of these, via the preview server)

Clear state first: `localStorage.removeItem('bb_cfg_overrides');
localStorage.removeItem('bb_meta_save'); location.reload()`.

1. No console errors; fresh run is level 1, HUD shows Lv 1, health starts
   at 1.
2. Set `BB.State.cfg.levels.shotsPerLevel = 3` and
   `BB.State.cfg.balls.timeScale = 5` (small level for testing); survive 3
   shots (fire via clicks or dispatched MouseEvents). Confirm: victory
   framing appears, clear bonus = `levelClearBonusPerLevel * 1` more than
   the plain formula, `BB.State.meta.unlockedLevel === 2` and survives a
   page reload.
3. Next run: HUD shows Lv 2; with defaults restored
   (`shotsPerLevel` back to 25), first-wave block health ≈
   `lerp(defs[0].healthMin, defs[1].healthMin, 0.5)` ≈ 20, NOT 40 and NOT 1.
4. Die deliberately at level 2 (let blocks reach the line): loss framing
   "Run over — Level 2", no unlock change, next run is still level 2.
5. Set `BB.State.meta.unlockedLevel = 5`, `shotsPerLevel = 3`, clear it:
   game-beaten banner; `unlockedLevel` stays 5; next run replays level 5.
6. Dev menu: the new unlockedLevel row exists and jumping levels works.
7. Clean up: clear both localStorage keys, reload.

Commit when verified (end the commit message with the repo's existing
Co-Authored-By convention). Do not push or deploy unless asked.
