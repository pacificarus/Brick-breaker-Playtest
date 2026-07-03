# Brick Breaker — Playtesting Prototype

Standalone, framework-free browser prototype of the Ballz-style brick breaker.
**To play: open `index.html` in a browser** (double-click works — no build step, no server).

## The loop being tested
Aim with the mouse, click to fire. Every shot descends all blocks one row and
spawns 1–4 new numbered blocks at the top. When a block crosses the dashed
line, the run ends and you spend **meta currency** (🔮) on permanent upgrades,
then start the next run. During a run, blocks pay out **in-game currency** (💰)
spent in the right-hand sidebar.

A run climbs through **five levels** (health 1–40, 40–80, … and slightly
faster balls each level). Each level spawns its own mix of **block types**:
standard (sometimes a ⚡ **chain** variant, decided at spawn), double-health,
**armored** (gold border; resists all non-heavy damage), 3-wide, **black**
(eats any ball that damages it), **mini** (four quarter blocks per cell), and
combo variants (armored mini, black mini, armored wide) on levels 4–5.

Chain / Pierce / Shotgun / Heavy are locked in-run until their meta track is
bought once on the death screen. Heavy doesn't appear at all until round 2,
Pierce until round 3.

## Playtesting menu
The ⚙ button (top-right) opens a drawer that live-edits every tunable:
currencies and upgrade levels (jump to any game state), all cost/scaling/step
values, spawn and health scaling, boss parameters, chain patterns (as JSON),
and ball physics. Edits apply immediately and persist across reloads.
**Reset game** wipes everything back to `config.js` defaults.
**Export config** copies the current tuned values as a paste-over for `config.js`.

## Files (edit the smallest one that does the job)
| File | Responsibility |
|---|---|
| `config.js` | **Every tunable number.** Tune pacing here; never touch game logic for balance. |
| `state.js` | Live config + currencies + run/meta state + persistence + reset/export. |
| `upgrades.js` | Upgrade definitions, cost math, effective values, both purchase panels. |
| `game.js` | Canvas gameplay: physics, collisions, descend/spawn, chain, bosses, death. |
| `devmenu.js` | The playtesting drawer (auto-generated from the config). |
| `main.js` | Screen switching, HUD, boot wiring. |
| `index.html` / `style.css` | Shell and theme. |
