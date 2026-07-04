/* =====================================================================
   STATE — shared live config + economy + run/meta state.
   All three screens read and write through here. Nothing else touches
   localStorage. Config values are read live every frame, so playtesting
   menu edits take effect immediately.
   ===================================================================== */

window.BB = window.BB || {};

BB.State = (function () {
  const CFG_KEY  = "bb_cfg_overrides";
  const META_KEY = "bb_meta_save";

  const S = {
    cfg: null,   // live config (defaults merged with saved overrides)
    run: null,   // per-run state (wiped on every new run)
    meta: null,  // persistent state (currency, meta levels, best)
  };

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  // Deep-merge src onto base (so new config keys added later still appear
  // even when an older override save exists).
  function merge(base, src) {
    if (src === null || typeof src !== "object" || Array.isArray(src)) return src;
    for (const k of Object.keys(src)) {
      if (base[k] !== null && typeof base[k] === "object" && !Array.isArray(base[k]) &&
          src[k] !== null && typeof src[k] === "object" && !Array.isArray(src[k])) {
        merge(base[k], src[k]);
      } else {
        base[k] = src[k];
      }
    }
    return base;
  }

  function load(key) {
    try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; }
  }

  S.init = function () {
    S.cfg = clone(window.BB_DEFAULTS);
    const saved = load(CFG_KEY);
    if (saved) merge(S.cfg, saved);

    const meta = load(META_KEY);
    S.meta = meta || {
      currency: S.cfg.economy.startingMetaCurrency,
      unlockedLevel: 1, // highest level reached; a run starts here
      levels: {
        ballsPerShot: 0,
        blockCurrency: 0,
        chainEff:   S.cfg.meta.chainEff.startLevel,
        pierceEff:  S.cfg.meta.pierceEff.startLevel,
        shotgunEff: S.cfg.meta.shotgunEff.startLevel,
        bounceEff:  S.cfg.meta.bounceEff.startLevel,
        heavyEff:   S.cfg.meta.heavyEff.startLevel,
        startCurrency: 0,
      },
      bestShots: 0,
      totalRuns: 0,
    };
    S.newRun();
  };

  S.newRun = function () {
    S.run = {
      // state.js loads before upgrades.js, so compute directly from config
      // rather than calling into BB.Upgrades.
      currency: S.cfg.economy.startingRunCurrency +
        S.cfg.meta.startCurrency.step * (S.meta.levels.startCurrency || 0),
      shots: 0,
      blocksDestroyed: 0,
      hpDestroyed: 0,
      over: false,
      level: S.meta.unlockedLevel || 1, // this run's fixed level
      cleared: false,                    // set true when the level is beaten
      levels: { chain: 0, pierce: 0, shotgun: 0, heavy: 0, angle: 0, bounces: 0, guide: 0 },
    };
  };

  // Ends a run (death OR level clear). Awards meta currency (plus a clear
  // bonus on a win), advances the unlocked level on a win, updates records,
  // and returns a breakdown for the death/victory screen.
  S.endRun = function () {
    const e = S.cfg.economy;
    const defs = S.cfg.levels.defs;
    const level = S.run.level;
    const cleared = !!S.run.cleared;

    const fromBlocks = S.run.blocksDestroyed * e.metaYieldPerBlock;
    const fromShots  = S.run.shots * e.metaYieldPerShot;
    const clearBonus = cleared ? e.levelClearBonusPerLevel * level : 0;
    const earned = Math.floor(fromBlocks + fromShots) + clearBonus;

    const gameBeaten = cleared && level >= defs.length;
    if (cleared && level < defs.length) {
      S.meta.unlockedLevel = (S.meta.unlockedLevel || 1) + 1;
    }

    S.meta.currency += earned;
    S.meta.totalRuns += 1;
    if (S.run.shots > S.meta.bestShots) S.meta.bestShots = S.run.shots;
    S.saveMeta();
    return {
      earned, fromBlocks, fromShots, clearBonus,
      cleared, level, gameBeaten,
      shots: S.run.shots,
      blocks: S.run.blocksDestroyed,
      best: S.meta.bestShots,
    };
  };

  /* ----- persistence ----- */
  S.saveMeta   = function () { localStorage.setItem(META_KEY, JSON.stringify(S.meta)); };
  S.saveConfig = function () { localStorage.setItem(CFG_KEY, JSON.stringify(S.cfg)); };

  // Full wipe back to config.js defaults (playtesting menu "Reset game").
  S.resetAll = function () {
    localStorage.removeItem(CFG_KEY);
    localStorage.removeItem(META_KEY);
    location.reload();
  };

  // Pretty JSON of the current live config, for pasting back into config.js.
  S.exportConfig = function () {
    return "window.BB_DEFAULTS = " + JSON.stringify(S.cfg, null, 2) + ";";
  };

  return S;
})();
