# Plan 4 of 4: Level-gated upgrade visibility + starting-currency upgrade

**Difficulty: EASY** (suitable for a smaller/faster model). Config entries,
one visibility function, one new meta upgrade definition, and a small
state-wiring change. **Prerequisite:** Plan 3
(`plans/03-level-gated-runs.md`) must already be merged — verify first that
`BB.State.meta.unlockedLevel` exists and that runs start at the unlocked
level. If not, STOP and report; do not attempt Plan 3's work.

## Project context (self-contained)

Repo: `C:\Users\iancm\OneDrive\Desktop\Claude\brick-breaker` (git, branch
`main`). Framework-free browser brick-breaker prototype. `config.js` is the
single source of truth for tunables; `upgrades.js` defines in-game upgrades
(bought mid-run, `IN_GAME` array) and meta upgrades (bought on the death
screen, `META` array), plus `U.effective()` which computes all effective
values, and render functions for both panels. `state.js` owns run/meta
state and persistence (`bb_meta_save` in localStorage); `newRun()` sets
`run.currency = cfg.economy.startingRunCurrency`.

As of Plan 3: one run = one level attempt; the player unlocks levels
sequentially (`meta.unlockedLevel`, starts at 1, max 5). Upgrade visibility
is currently gated by ROUND (run count) via `upgradeHidden(id)` in
`upgrades.js`, reading `cfg.visibility.heavyRound` / `pierceRound` and
`meta().totalRuns`.

## Goal

1. **Gate upgrade visibility by unlocked level instead of round.** Heavy
   (in-game % card AND its `heavyEff` meta track) stays hidden until the
   player has unlocked level 2; Pierce (in-game card AND `pierceEff`) until
   level 3. Rationale: upgrades now appear exactly when the difficulty step
   they answer appears — level 2 introduces armored blocks (heavy's
   purpose), level 3 introduces black/wide blocks (pierce's purpose).
2. **New meta upgrade: starting in-game currency**, visible only once level
   2 is unlocked. It exists to offset the level-2+ difficulty wall: fresh
   runs at higher levels face expensive in-run upgrades with zero savings;
   this upgrade lets meta progress convert into a faster in-run opening.

## Changes

### `config.js`

- Replace the `visibility` section contents: `heavyLevel: 2`,
  `pierceLevel: 3`, `startCurrencyLevel: 2` (delete `heavyRound` /
  `pierceRound`; stale keys lingering in old localStorage overrides are
  harmless — the code just stops reading them). Update the section comment:
  "Level N = hidden until meta.unlockedLevel >= N."
- In `meta`, add: `startCurrency: { baseCost: 10, costGrowth: 1.6, base: 0,
  step: 15 }` — each level grants +15 starting in-game currency per run.
  Comment it like the neighbors.

### `upgrades.js`

- Rewrite `upgradeHidden(id)` (and remove the now-unused `currentRound()`):
  let `ul = BB.State.meta.unlockedLevel || 1`; hidden when
  (`heavy`/`heavyEff` and `ul < cfg().visibility.heavyLevel`), or
  (`pierce`/`pierceEff` and `ul < cfg().visibility.pierceLevel`), or
  (`startCurrency` and `ul < cfg().visibility.startCurrencyLevel`).
- Add to `U.effective()`: `startCurrency: c.meta.startCurrency.base +
  c.meta.startCurrency.step * (m.startCurrency || 0)` (the `|| 0` guards
  stale meta saves lacking the new level key).
- Add a `META` entry: id `startCurrency`, name "Starting funds", value
  `(e) => "+" + e.startCurrency + " 💰"`, desc "Start every run with this
  much in-game currency". No `max`.

### `state.js`

- Fresh-save `levels` map gains `startCurrency: 0`.
- `newRun()` starting currency becomes `cfg.economy.startingRunCurrency +
  cfg.meta.startCurrency.step * (S.meta.levels.startCurrency || 0)`.
  (state.js loads before upgrades.js, so compute from config directly —
  do NOT call BB.Upgrades from state.js.)

## Verification (via the `brick-breaker` preview server)

Clear state first: `localStorage.removeItem('bb_cfg_overrides');
localStorage.removeItem('bb_meta_save'); location.reload()`.

1. No console errors. Fresh save (unlockedLevel 1): in-run panel shows no
   Heavy or Pierce card; death-screen meta panel (die once to see it) shows
   no heavyEff, pierceEff, or Starting funds entries.
2. `BB.State.meta.unlockedLevel = 2; BB.UI.refresh()` → Heavy card and
   heavyEff + Starting funds meta entries appear; Pierce still hidden.
   `= 3` → Pierce appears too.
3. On the death screen with meta currency granted
   (`BB.State.meta.currency = 100; BB.UI.refresh()`), buy Starting funds
   twice; start the next run; `BB.State.run.currency` === 30 (2 x 15) plus
   `economy.startingRunCurrency`. Cost should have scaled by 1.6x for the
   second purchase.
4. Stale-save guard: delete the key at runtime
   (`delete BB.State.meta.levels.startCurrency`) and confirm starting a new
   run neither crashes nor yields NaN currency.
5. Clean up: clear both localStorage keys, reload.

Commit when verified (end the commit message with the repo's existing
Co-Authored-By convention). Do not push or deploy unless asked.
