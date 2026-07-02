/* =====================================================================
   DEV MENU — the playtesting drawer (gear button, top-right).
   Auto-generates an editor for every numeric/boolean value in the live
   config (grouped by section), plus direct control of currencies and
   upgrade levels, chain patterns as editable JSON, full reset, and
   config export. Everything writes straight into BB.State.cfg /
   BB.State.run / BB.State.meta, which the game reads live.
   ===================================================================== */

window.BB = window.BB || {};

BB.DevMenu = (function () {
  const D = {};
  const cfg = () => BB.State.cfg;

  const SECTION_LABELS = {
    board: "Board", balls: "Balls", spawn: "Spawning & health",
    boss: "Bosses", economy: "Economy",
    inGame: "In-run upgrade tuning", meta: "Meta upgrade tuning",
    chain: "Chain reaction",
  };

  function getPath(obj, path) {
    return path.reduce((o, k) => o[k], obj);
  }
  function setPath(obj, path, v) {
    getPath(obj, path.slice(0, -1))[path[path.length - 1]] = v;
  }

  function numberRow(labelText, value, onChange) {
    const row = document.createElement("label");
    row.className = "dev-row";
    const span = document.createElement("span");
    span.textContent = labelText;
    const input = document.createElement("input");
    input.type = "number";
    input.step = "any";
    input.value = value;
    input.addEventListener("change", () => {
      const v = parseFloat(input.value);
      if (!isNaN(v)) onChange(v);
    });
    row.append(span, input);
    return row;
  }

  // Recursively emit editors for every leaf under `path` in the config.
  function buildFields(container, path, prefix) {
    const node = getPath(cfg(), path);
    for (const key of Object.keys(node)) {
      const v = node[key];
      const label = prefix ? prefix + "." + key : key;
      if (typeof v === "number") {
        container.appendChild(numberRow(label, v, (nv) => {
          setPath(cfg(), [...path, key], nv);
          BB.State.saveConfig();
          BB.UI.refresh();
        }));
      } else if (typeof v === "boolean") {
        const row = document.createElement("label");
        row.className = "dev-row";
        row.innerHTML = `<span>${label}</span>`;
        const input = document.createElement("input");
        input.type = "checkbox";
        input.checked = v;
        input.addEventListener("change", () => {
          setPath(cfg(), [...path, key], input.checked);
          BB.State.saveConfig();
          BB.UI.refresh();
        });
        row.appendChild(input);
        container.appendChild(row);
      } else if (Array.isArray(v)) {
        // arrays (chain patterns) -> editable JSON textarea
        const wrap = document.createElement("div");
        wrap.className = "dev-json";
        wrap.innerHTML = `<span>${label} (JSON)</span>`;
        const ta = document.createElement("textarea");
        ta.value = JSON.stringify(v, null, 1);
        ta.addEventListener("change", () => {
          try {
            setPath(cfg(), [...path, key], JSON.parse(ta.value));
            ta.classList.remove("bad");
            BB.State.saveConfig();
            BB.UI.refresh();
          } catch (e) { ta.classList.add("bad"); }
        });
        wrap.appendChild(ta);
        container.appendChild(wrap);
      } else if (v !== null && typeof v === "object") {
        buildFields(container, [...path, key], label);
      }
    }
  }

  function section(parent, title, open) {
    const det = document.createElement("details");
    if (open) det.open = true;
    const sum = document.createElement("summary");
    sum.textContent = title;
    det.appendChild(sum);
    parent.appendChild(det);
    return det;
  }

  /* ----- current-state controls (currencies + levels) ----- */
  function buildStateSection(parent) {
    const det = section(parent, "Current state (jump to a game state)", true);

    det.appendChild(numberRow("in-game currency", BB.State.run.currency, (v) => {
      BB.State.run.currency = v; BB.UI.refresh();
    }));
    det.appendChild(numberRow("meta currency", BB.State.meta.currency, (v) => {
      BB.State.meta.currency = v; BB.State.saveMeta(); BB.UI.refresh();
    }));

    for (const id of Object.keys(BB.State.run.levels)) {
      det.appendChild(numberRow("run level: " + id, BB.State.run.levels[id], (v) => {
        BB.State.run.levels[id] = Math.max(0, Math.round(v)); BB.UI.refresh();
      }));
    }
    for (const id of Object.keys(BB.State.meta.levels)) {
      det.appendChild(numberRow("meta level: " + id, BB.State.meta.levels[id], (v) => {
        BB.State.meta.levels[id] = Math.max(0, Math.round(v));
        BB.State.saveMeta(); BB.UI.refresh();
      }));
    }
  }

  /* ----- build the whole drawer ----- */
  D.rebuild = function () {
    const body = document.getElementById("devmenu-body");
    body.innerHTML = "";

    // action buttons
    const actions = document.createElement("div");
    actions.className = "dev-actions";

    const btnRun = document.createElement("button");
    btnRun.textContent = "New run";
    btnRun.onclick = () => { BB.Main.startRun(); };

    const btnExport = document.createElement("button");
    btnExport.textContent = "Export config";
    btnExport.onclick = () => {
      const out = document.getElementById("dev-export");
      out.classList.remove("hidden");
      out.value = BB.State.exportConfig();
      out.select();
      try { document.execCommand("copy"); } catch (e) {}
      btnExport.textContent = "Copied to clipboard ✓";
      setTimeout(() => (btnExport.textContent = "Export config"), 1500);
    };

    const btnReset = document.createElement("button");
    btnReset.className = "danger";
    btnReset.textContent = "Reset game (full wipe)";
    btnReset.onclick = () => {
      if (confirm("Wipe all tuning overrides and meta progress, back to config.js defaults?")) {
        BB.State.resetAll();
      }
    };

    actions.append(btnRun, btnExport, btnReset);
    body.appendChild(actions);

    const exportBox = document.createElement("textarea");
    exportBox.id = "dev-export";
    exportBox.className = "hidden";
    exportBox.readOnly = true;
    body.appendChild(exportBox);

    buildStateSection(body);

    for (const key of Object.keys(cfg())) {
      const det = section(body, SECTION_LABELS[key] || key, false);
      buildFields(det, [key], "");
    }
  };

  D.init = function () {
    const toggle = document.getElementById("devmenu-toggle");
    const panel = document.getElementById("devmenu");
    toggle.onclick = () => {
      panel.classList.toggle("hidden");
      if (!panel.classList.contains("hidden")) D.rebuild(); // fresh values on open
    };
  };

  return D;
})();
