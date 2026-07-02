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
    speed: 540,         // px per second
    radius: 6,          // px
    fireIntervalMs: 70, // delay between balls in a multi-ball shot
    timeScale: 1,       // global speed multiplier (playtest lever; HUD has x1/x2/x3)
  },

  /* ---------- Block spawning & health scaling ---------- */
  spawn: {
    minPerRow: 1,       // random 1–4 new blocks per shot (spec)
    maxPerRow: 4,
    // "predetermined health level amount" for a new block after S shots:
    //   health = round(healthBase + healthLinear*S + healthQuad*S^2), min 1
    healthBase: 1,
    healthLinear: 0.5,
    healthQuad: 0.012,
    doubleBlockChance: 0.12, // chance a spawned block gets 2x the health level
  },

  /* ---------- Bosses ---------- */
  boss: {
    chance: 0.07,            // chance per spawn wave that one block is a boss
    minShotsBeforeBoss: 6,   // no bosses earlier than this many shots
    widthCells: 2,           // bosses occupy multiple cells (width, 1 row tall)
    healthMult: 6,           // boss hp = health level * this
    nonHeavyDamageMult: 0.25,// non-heavy damage is multiplied by this vs bosses
    heavyDamageMult: 1.5,    // heavy damage is multiplied by this vs bosses
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
     bought at least once. bounces & angle are available from the start.   */
  inGame: {
    chain:   { baseCost: 20, costGrowth: 1.55, base: 0.06, step: 0.06, maxLevel: 12 }, // chance per BALL HIT to trigger a chain
    pierce:  { baseCost: 25, costGrowth: 1.55, base: 0.05, step: 0.05, maxLevel: 12 }, // chance a ball is a piercing beam
    shotgun: { baseCost: 25, costGrowth: 1.55, base: 0.06, step: 0.06, maxLevel: 12 }, // chance a ball fires as a spread
    heavy:   { baseCost: 30, costGrowth: 1.55, base: 0.05, step: 0.05, maxLevel: 12 }, // chance a ball is heavy (big dmg, consumed on hit)
    angle:   { baseCost: 15, costGrowth: 1.7,  base: 60,   step: 15, maxAngle: 170 },  // aim arc in degrees, centered straight up
    bounces: { baseCost: 12, costGrowth: 1.5,  base: 1 },  // base bounce budget; step per purchase comes from meta bounceEff
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
