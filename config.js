/* =====================================================================
   BRICK BREAKER PROTOTYPE — MASTER CONFIG
   =====================================================================
   Single source of truth for EVERY tunable number in the prototype.
   The playtesting menu (gear button, top-right) edits a LIVE COPY of
   this object at runtime and persists it to localStorage. "Reset game"
   in that menu wipes the overrides and returns to these defaults.

   To bake in a good tuning session: use "Export config" in the
   playtesting menu and paste the result over this object.

   Nothing in the game logic hardcodes numbers — if you want different
   pacing, edit here (or live in the browser) and never touch game.js.
   ===================================================================== */

window.BB_DEFAULTS = {

  /* ---------- Board geometry ---------- */
  board: {
    cols: 7,            // grid columns
    rows: 10,           // rows between the top and the death line
    canvasWidth: 420,   // px
    canvasHeight: 620,  // px; play area height = canvasHeight - launchZone
    launchZone: 80,     // px strip at the bottom where balls launch/return
    initialRows: 3,     // rows pre-spawned at run start so there's something to shoot
  },

  /* ---------- Ball physics / feel ---------- */
  balls: {
    speed: 540,         // px per second at level 1 (levels multiply this)
    radius: 6,          // px
    fireIntervalMs: 70, // delay between balls in a multi-ball shot
    timeScale: 1,       // global speed multiplier (playtest lever; HUD has x1/x2/x3)
  },

  /* ---------- Block spawning ---------- */
  spawn: {
    minPerRow: 1,       // random 1–4 new spawns per shot (a wide/mini counts as 1)
    maxPerRow: 4,
  },

  /* ---------- Levels ----------
     A run climbs through these in order, shotsPerLevel shots each.
     Block health interpolates healthMin -> healthMax across the level
     (and keeps climbing at the same rate past the last level's end).
     speedMult scales ball launch speed. weights picks which block types
     spawn at that level (relative odds; see Block types below).
     Type names: standard, double, armored, wide, black, mini,
                 armoredMini, blackMini, armoredWide.                  */
  levels: {
    shotsPerLevel: 25,
    defs: [
      { healthMin: 1,   healthMax: 40,  speedMult: 1.0,
        weights: { standard: 3, double: 1, mini: 1 } },
      { healthMin: 40,  healthMax: 80,  speedMult: 1.08,
        weights: { standard: 3, double: 1, armored: 1 } },
      { healthMin: 80,  healthMax: 120, speedMult: 1.16,
        weights: { standard: 3, black: 1, wide: 1 } },
      { healthMin: 120, healthMax: 160, speedMult: 1.24,
        weights: { standard: 2, armoredMini: 1 } },
      { healthMin: 160, healthMax: 200, speedMult: 1.32,
        weights: { blackMini: 1, armoredWide: 1 } },
    ],
  },

  /* ---------- Block types ----------
     standard  — 1 cell, level health. May spawn as a CHAIN variant
                 (see chain below; odds come from the in-run chain upgrade).
     double    — 1 cell, level health x doubleHealthMult.
     armored   — 1 cell, level health, gold-plated visual; resists all
                 non-heavy damage (see armor below).
     wide      — wideCells wide, level health.
     black     — 1 cell; EATS any ball that damages it.
     mini      — four quarter-size blocks in one cell, each with
                 level health x miniHealthMult.
     armoredMini / blackMini / armoredWide — combo variants.          */
  blockTypes: {
    doubleHealthMult: 2,
    miniHealthMult: 0.5,  // each of the four minis gets this share of level health
    wideCells: 3,
  },

  /* ---------- Armor (armored blocks; the Heavy-ball counterplay) ---------- */
  armor: {
    nonHeavyDamageMult: 0.25, // non-heavy damage multiplied by this vs armored
    heavyDamageMult: 1.5,     // heavy damage multiplied by this vs armored
  },

  /* ---------- Upgrade visibility (progressive reveal) ----------
     Round N = the Nth run (round 1 is the first run of a fresh save). */
  visibility: {
    heavyRound: 2,   // Heavy (in-game % and meta track) hidden until this round
    pierceRound: 3,  // Pierce (in-game % and meta track) hidden until this round
  },

  /* ---------- Economy ---------- */
  economy: {
    startingRunCurrency: 0,   // in-game currency at the start of every run
    currencyPerHp: 1,         // in-game currency per point of max-hp destroyed
    startingMetaCurrency: 0,  // meta currency on a fresh save
    // Meta currency awarded on death:
    //   floor(blocksDestroyed * metaYieldPerBlock + shotsSurvived * metaYieldPerShot)
    metaYieldPerBlock: 0.2,
    metaYieldPerShot: 0.35,
  },

  /* ---------- In-game upgrades (bought mid-run with in-game currency) ----------
     Cost of the next level = round(baseCost * costGrowth ^ currentLevel).
     Value at level L (for the % ones) = base + step * (L - 1); level 0 = 0%.
     chain/pierce/shotgun/heavy are LOCKED until their meta track below is
     bought at least once. bounces, angle & guide are available from the start. */
  inGame: {
    chain:   { baseCost: 20, costGrowth: 1.55, base: 0.06, step: 0.06, maxLevel: 12 }, // chance a standard block SPAWNS as a chain block
    pierce:  { baseCost: 25, costGrowth: 1.55, base: 0.05, step: 0.05, maxLevel: 12,
               beamDamage: 1 }, // chance PER SHOT to fire a piercing beam; damage per block crossed
    shotgun: { baseCost: 25, costGrowth: 1.55, base: 0.06, step: 0.06, maxLevel: 12 }, // chance a ball fires as a spread
    heavy:   { baseCost: 30, costGrowth: 1.55, base: 0.05, step: 0.05, maxLevel: 12 }, // chance a ball is heavy (big dmg, consumed on hit)
    angle:   { baseCost: 15, costGrowth: 1.7,  base: 60,   step: 15, maxAngle: 170 },  // aim arc in degrees, centered straight up
    bounces: { baseCost: 12, costGrowth: 1.5,  base: 1 },  // base bounce budget; step per purchase comes from meta bounceEff
    guide:   { baseCost: 10, costGrowth: 1.5,  base: 260, step: 140, maxLevel: 10 },   // aim-guide length in px; guide simulates real bounces
  },

  /* ---------- Meta upgrades (bought on the death screen with meta currency) ----
     Cost of next level = round(baseCost * costGrowth ^ purchasesMade).
     The five *Eff tracks unlock their in-game upgrade at level 1 and then
     permanently improve its efficacy. startLevel is the level on a fresh save. */
  meta: {
    ballsPerShot:  { baseCost: 10, costGrowth: 1.35, base: 1, step: 1 },      // THE primary ball-count track
    blockCurrency: { baseCost: 8,  costGrowth: 1.5,  base: 1, step: 0.25 },   // in-game currency multiplier
    chainEff:   { baseCost: 12, costGrowth: 1.8, startLevel: 0 },             // level = chain pattern tier (see chain.patterns)
    pierceEff:  { baseCost: 12, costGrowth: 1.8, startLevel: 0,
                  widthBase: 1, widthStep: 0.5,       // beam width multiplier on ball radius
                  reflectsBase: 0, reflectsStep: 1 }, // wall reflects a beam gets before ending
    shotgunEff: { baseCost: 12, costGrowth: 1.8, startLevel: 0,
                  ballsBase: 2, ballsStep: 1,         // balls in the spread
                  spreadDeg: 30 },                    // total fan angle of the spread
    bounceEff:  { baseCost: 10, costGrowth: 1.6, startLevel: 1,
                  stepBase: 3, stepStep: 1 },         // bounces granted per in-game bounce purchase
    heavyEff:   { baseCost: 15, costGrowth: 1.8, startLevel: 0,
                  dmgBase: 3, dmgStep: 2 },           // heavy ball damage
  },

  /* ---------- Chain reaction patterns ----------
     Chain blocks are decided AT SPAWN (odds = the in-run chain upgrade);
     every hit a chain block takes fires the pattern below.
     The meta chainEff level picks a tier (level 1 = patterns[0], etc).
     Patterns start partial and grow into rows/columns/combinations (spec).
     cells = offsets [dc, dr] from the hit block; fullRow/fullCol add the
     whole row/column of the hit block. Chain damage hits every block
     covering an affected cell. Editable as JSON in the playtesting menu. */
  chain: {
    damage: 1, // damage dealt to each block caught in the pattern
    patterns: [
      { name: "Spark (2 neighbors)",  cells: [[-1,0],[1,0]] },
      { name: "Short row (4 cells)",  cells: [[-2,0],[-1,0],[1,0],[2,0]] },
      { name: "Full row",             fullRow: true },
      { name: "Row + short column",   fullRow: true, cells: [[0,-1],[0,1]] },
      { name: "Row + full column",    fullRow: true, fullCol: true },
      { name: "Cross burst",          fullRow: true, fullCol: true, cells: [[-1,-1],[1,-1],[-1,1],[1,1]] },
    ],
  },
};
