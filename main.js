/* =====================================================================
   MAIN — screen switching, HUD, and boot wiring. Keeps the three
   screens (game, death/upgrade, dev drawer) talking through BB.State.
   ===================================================================== */

window.BB = window.BB || {};

/* ----- shared UI helpers ----- */
BB.UI = {
  updateHUD() {
    const r = BB.State.run, m = BB.State.meta;
    document.getElementById("hud-currency").textContent = Math.floor(r.currency);
    document.getElementById("hud-meta").textContent = Math.floor(m.currency);
    document.getElementById("hud-shots").textContent = r.shots;
    document.getElementById("hud-best").textContent = m.bestShots;
  },
  // Re-render everything that displays state (called after any purchase
  // or dev-menu edit so changes show up immediately).
  refresh() {
    BB.UI.updateHUD();
    BB.Upgrades.renderInGamePanel();
    if (!document.getElementById("screen-death").classList.contains("hidden")) {
      BB.Upgrades.renderMetaPanel();
      document.getElementById("death-meta-bank").textContent = Math.floor(BB.State.meta.currency);
    }
  },
};

BB.Main = (function () {
  const M = {};

  function show(screenId) {
    for (const id of ["screen-game", "screen-death"]) {
      document.getElementById(id).classList.toggle("hidden", id !== screenId);
    }
  }

  M.onDeath = function () {
    const stats = BB.State.endRun();
    document.getElementById("death-stats").innerHTML =
      `<div class="stat"><b>${stats.shots}</b> shots survived (best: ${stats.best})</div>` +
      `<div class="stat"><b>${stats.blocks}</b> blocks destroyed</div>` +
      `<div class="stat earn">+<b>${stats.earned}</b> meta currency ` +
      `<span class="fine">(${stats.fromBlocks.toFixed(1)} from blocks + ${stats.fromShots.toFixed(1)} from shots)</span></div>`;
    show("screen-death");
    BB.Upgrades.renderMetaPanel();
    BB.UI.refresh();
  };

  M.startRun = function () {
    show("screen-game");
    BB.Game.newRun();
  };

  M.boot = function () {
    BB.State.init();
    BB.DevMenu.init();

    // HUD speed toggle (writes cfg.balls.timeScale, same value the dev menu edits)
    const speedBtn = document.getElementById("hud-speed");
    const speeds = [1, 2, 3];
    speedBtn.onclick = () => {
      const cur = speeds.indexOf(BB.State.cfg.balls.timeScale);
      BB.State.cfg.balls.timeScale = speeds[(cur + 1) % speeds.length] || 1;
      BB.State.saveConfig();
      speedBtn.textContent = "x" + BB.State.cfg.balls.timeScale;
    };
    speedBtn.textContent = "x" + (BB.State.cfg.balls.timeScale || 1);

    document.getElementById("btn-next-run").onclick = M.startRun;

    BB.Game.init(document.getElementById("game-canvas"));
    BB.UI.refresh();
    show("screen-game");
  };

  return M;
})();

document.addEventListener("DOMContentLoaded", BB.Main.boot);
