/* =====================================================================
   UPGRADES — definitions, cost math, effective-value computation, and
   rendering of the in-game sidebar + the death-screen meta panel.
   All numbers come from BB.State.cfg; nothing is hardcoded here except
   the wiring between config entries and gameplay meaning.
   ===================================================================== */

window.BB = window.BB || {};

BB.Upgrades = (function () {
  const U = {};
  const cfg  = () => BB.State.cfg;
  const run  = () => BB.State.run;
  const meta = () => BB.State.meta;

  const pct = (v) => Math.round(v * 100) + "%";

  /* =========================================================
     Effective values — the single place gameplay reads from.
     ========================================================= */
  U.effective = function () {
    const c = cfg(), r = run().levels, m = meta().levels;
    const val = (u, lv) => (lv > 0 ? u.base + u.step * (lv - 1) : 0);

    const bounceStep = c.meta.bounceEff.stepBase +
      c.meta.bounceEff.stepStep * Math.max(0, m.bounceEff - 1);

    return {
      // per-ball chances (0 while their meta track is locked)
      chainPct:   m.chainEff   > 0 ? val(c.inGame.chain, r.chain)     : 0,
      piercePct:  m.pierceEff  > 0 ? val(c.inGame.pierce, r.pierce)   : 0,
      shotgunPct: m.shotgunEff > 0 ? val(c.inGame.shotgun, r.shotgun) : 0,
      heavyPct:   m.heavyEff   > 0 ? val(c.inGame.heavy, r.heavy)     : 0,

      angle: Math.min(c.inGame.angle.base + c.inGame.angle.step * r.angle,
                      c.inGame.angle.maxAngle),
      bounces: c.inGame.bounces.base + bounceStep * r.bounces,
      bounceStep,
      guideLen: c.inGame.guide.base + c.inGame.guide.step * r.guide,

      ballsPerShot: c.meta.ballsPerShot.base + c.meta.ballsPerShot.step * m.ballsPerShot,
      currencyMult: c.meta.blockCurrency.base + c.meta.blockCurrency.step * m.blockCurrency,

      chainTier: Math.min(m.chainEff, c.chain.patterns.length),
      pierceWidth:   c.meta.pierceEff.widthBase + c.meta.pierceEff.widthStep * Math.max(0, m.pierceEff - 1),
      pierceReflects: c.meta.pierceEff.reflectsBase + c.meta.pierceEff.reflectsStep * Math.max(0, m.pierceEff - 1),
      shotgunBalls: c.meta.shotgunEff.ballsBase + c.meta.shotgunEff.ballsStep * Math.max(0, m.shotgunEff - 1),
      shotgunSpread: c.meta.shotgunEff.spreadDeg,
      heavyDamage: m.heavyEff > 0
        ? c.meta.heavyEff.dmgBase + c.meta.heavyEff.dmgStep * (m.heavyEff - 1) : 0,
      startCurrency: c.meta.startCurrency.base + c.meta.startCurrency.step * (m.startCurrency || 0),
    };
  };

  /* =========================================================
     In-game upgrades (bought mid-run)
     ========================================================= */
  const IN_GAME = [
    { id: "chain",   name: "Chain blocks",  metaTrack: "chainEff",
      value: (e) => pct(e.chainPct),
      desc: "Chance a standard block spawns as a chain block (fires the chain pattern every time it's hit)" },
    { id: "pierce",  name: "Pierce chance", metaTrack: "pierceEff",
      value: (e) => pct(e.piercePct),
      desc: "Chance per shot to fire a piercing beam through every block in its path" },
    { id: "shotgun", name: "Shotgun chance", metaTrack: "shotgunEff",
      value: (e) => pct(e.shotgunPct),
      desc: "Chance a ball fires as a spread of balls" },
    { id: "heavy",   name: "Heavy chance",  metaTrack: "heavyEff",
      value: (e) => pct(e.heavyPct),
      desc: "Chance a ball is heavy: big damage, consumed on first hit. Armored blocks resist everything else." },
    { id: "angle",   name: "Aim arc",       metaTrack: null,
      value: (e) => e.angle + "°",
      desc: "Width of the aiming arc" },
    { id: "bounces", name: "Bounces",       metaTrack: null,
      value: (e) => e.bounces,
      desc: "Bounce budget per ball before it disappears" },
    { id: "guide",   name: "Aim guide",     metaTrack: null,
      value: (e) => Math.round(e.guideLen) + "px",
      desc: "Longer aim line that previews how balls will actually bounce" },
  ];

  // Progressive reveal: some upgrades stay hidden until the level that
  // introduces the block type they answer has been unlocked.
  function upgradeHidden(id) {
    const v = cfg().visibility;
    const ul = meta().unlockedLevel || 1;
    if ((id === "heavy" || id === "heavyEff") && ul < v.heavyLevel) return true;
    if ((id === "pierce" || id === "pierceEff") && ul < v.pierceLevel) return true;
    if (id === "startCurrency" && ul < v.startCurrencyLevel) return true;
    return false;
  }

  U.inGameCost = function (id) {
    const u = cfg().inGame[id];
    return Math.round(u.baseCost * Math.pow(u.costGrowth, run().levels[id]));
  };

  function inGameMaxed(id, e) {
    const u = cfg().inGame[id];
    if (id === "angle") return e.angle >= u.maxAngle;
    if (u.maxLevel !== undefined) return run().levels[id] >= u.maxLevel;
    return false;
  }

  U.buyInGame = function (id) {
    const cost = U.inGameCost(id);
    if (run().currency < cost) return;
    run().currency -= cost;
    run().levels[id] += 1;
    BB.UI.refresh();
  };

  /* =========================================================
     Meta upgrades (bought on the death screen)
     ========================================================= */
  const META = [
    { id: "ballsPerShot",  name: "Balls per shot",
      value: (e) => e.ballsPerShot,
      desc: "How many balls launch per shot" },
    { id: "blockCurrency", name: "Block currency",
      value: (e) => "x" + e.currencyMult.toFixed(2),
      desc: "Multiplier on in-game currency from destroyed blocks" },
    { id: "chainEff",   name: "Chain pattern",
      value: (e) => e.chainTier > 0 ? cfg().chain.patterns[e.chainTier - 1].name : "locked",
      desc: "Unlocks chain blocks in-run; each level grows the reaction pattern",
      max: () => cfg().chain.patterns.length },
    { id: "pierceEff",  name: "Pierce beam",
      value: (e) => meta().levels.pierceEff > 0
        ? "w x" + e.pierceWidth.toFixed(1) + ", " + e.pierceReflects + " reflects" : "locked",
      desc: "Unlocks Pierce in-run; each level widens the beam and adds a wall reflect" },
    { id: "shotgunEff", name: "Shotgun spread",
      value: (e) => meta().levels.shotgunEff > 0 ? e.shotgunBalls + " balls" : "locked",
      desc: "Unlocks Shotgun in-run; each level adds a ball to the spread" },
    { id: "bounceEff",  name: "Bounce step",
      value: (e) => "+" + e.bounceStep + "/buy",
      desc: "Bounces granted per in-run Bounces purchase" },
    { id: "heavyEff",   name: "Heavy damage",
      value: (e) => meta().levels.heavyEff > 0 ? e.heavyDamage + " dmg" : "locked",
      desc: "Unlocks Heavy in-run; each level adds damage. The armored-block answer." },
    { id: "startCurrency", name: "Starting funds",
      value: (e) => "+" + e.startCurrency + " 💰",
      desc: "Start every run with this much in-game currency" },
  ];

  U.metaCost = function (id) {
    const u = cfg().meta[id];
    const start = u.startLevel || 0;
    const purchases = Math.max(0, meta().levels[id] - start);
    return Math.round(u.baseCost * Math.pow(u.costGrowth, purchases));
  };

  U.buyMeta = function (id) {
    const cost = U.metaCost(id);
    if (meta().currency < cost) return;
    meta().currency -= cost;
    meta().levels[id] += 1;
    BB.State.saveMeta();
    BB.UI.refresh();
  };

  /* =========================================================
     Rendering
     ========================================================= */
  U.renderInGamePanel = function () {
    const el = document.getElementById("ingame-panel");
    const e = U.effective();
    el.innerHTML = "<h3>In-run upgrades</h3>";
    for (const d of IN_GAME) {
      if (upgradeHidden(d.id)) continue;
      const locked = d.metaTrack && meta().levels[d.metaTrack] === 0;
      const maxed = !locked && inGameMaxed(d.id, e);
      const cost = U.inGameCost(d.id);
      const card = document.createElement("div");
      card.className = "card" + (locked ? " locked" : "");
      card.title = d.desc;
      card.innerHTML =
        `<div class="card-head"><span>${d.name}</span>` +
        `<span class="lv">Lv ${run().levels[d.id]}</span></div>` +
        `<div class="card-val">${locked ? "🔒 unlock via meta" : d.value(e)}</div>`;
      const btn = document.createElement("button");
      if (locked)      { btn.textContent = "Locked"; btn.disabled = true; }
      else if (maxed)  { btn.textContent = "Maxed";  btn.disabled = true; }
      else {
        btn.textContent = `Buy — ${cost}`;
        btn.disabled = run().currency < cost;
        btn.onclick = () => U.buyInGame(d.id);
      }
      card.appendChild(btn);
      el.appendChild(card);
    }
  };

  U.renderMetaPanel = function () {
    const el = document.getElementById("meta-panel");
    const e = U.effective();
    el.innerHTML = "<h3>Meta upgrades</h3>";
    for (const d of META) {
      if (upgradeHidden(d.id)) continue;
      const lv = meta().levels[d.id];
      const maxed = d.max && lv >= d.max();
      const cost = U.metaCost(d.id);
      const unlockBuy = cfg().meta[d.id].startLevel !== undefined &&
                        lv === 0; // first buy is the unlock
      const card = document.createElement("div");
      card.className = "card";
      card.title = d.desc;
      card.innerHTML =
        `<div class="card-head"><span>${d.name}</span><span class="lv">Lv ${lv}</span></div>` +
        `<div class="card-val">${d.value(e)}</div>` +
        `<div class="card-desc">${d.desc}</div>`;
      const btn = document.createElement("button");
      if (maxed) { btn.textContent = "Maxed"; btn.disabled = true; }
      else {
        btn.textContent = (unlockBuy ? "Unlock" : "Buy") + ` — ${cost}`;
        btn.disabled = meta().currency < cost;
        btn.onclick = () => U.buyMeta(d.id);
      }
      card.appendChild(btn);
      el.appendChild(card);
    }
  };

  return U;
})();
