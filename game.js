/* =====================================================================
   GAME — Ballz-style core loop: aim, fire, bounce, blocks descend one
   row per shot, new blocks spawn at the top, death when a block crosses
   the bottom line. Reads every tunable live from BB.State.cfg so
   playtesting-menu edits apply instantly. No tuning numbers live here.

   Block types (spawned per the current level's weight table in config):
   standard (may be a chain variant), double, armored, wide, black,
   mini (4 quarter blocks per cell), and the combo variants.
   ===================================================================== */

window.BB = window.BB || {};

BB.Game = (function () {
  const G = {};
  const cfg = () => BB.State.cfg;
  const run = () => BB.State.run;

  let canvas, ctx;
  let blocks = [], balls = [], flashes = [], beams = [];
  let blockId = 1;
  let phase = "aim";            // aim | firing | over
  let aimAngle = Math.PI / 2;   // radians, from +x axis
  let launchX = 0, nextLaunchX = null;
  let fireQueue = 0, fireTimer = 0, shotEff = null;
  let lastT = 0;

  /* ---------- geometry helpers (computed live from config) ---------- */
  function dims() {
    const b = cfg().board;
    return {
      W: b.canvasWidth, H: b.canvasHeight,
      cols: b.cols, rows: b.rows,
      cellW: b.canvasWidth / b.cols,
      cellH: (b.canvasHeight - b.launchZone) / b.rows,
      deathY: b.canvasHeight - b.launchZone,
      launchY: b.canvasHeight - b.launchZone / 2,
    };
  }

  /* ---------- level helpers ---------- */
  function levelIndex() {
    const L = cfg().levels;
    return Math.min(Math.floor(run().shots / L.shotsPerLevel), L.defs.length - 1);
  }
  function levelDef() { return cfg().levels.defs[levelIndex()]; }
  G.levelNumber = () => levelIndex() + 1;

  // Block health at the current shot count: interpolates healthMin ->
  // healthMax across the level; past the last level's end it keeps
  // climbing at the same rate (frac not clamped on the final level).
  function healthLevel() {
    const L = cfg().levels;
    const idx = levelIndex();
    const def = L.defs[idx];
    const frac = (run().shots - idx * L.shotsPerLevel) / L.shotsPerLevel;
    return Math.max(1, Math.round(def.healthMin + (def.healthMax - def.healthMin) * frac));
  }

  /* ================= run lifecycle ================= */
  G.newRun = function () {
    BB.State.newRun();
    blocks = []; balls = []; flashes = []; beams = [];
    phase = "aim";
    fireQueue = 0;
    launchX = dims().W / 2;
    nextLaunchX = null;
    for (let i = 0; i < cfg().board.initialRows; i++) {
      descendBlocks();
      spawnWave();
    }
    BB.UI.refresh();
  };

  /* ================= spawning ================= */
  function pickType(weights) {
    let total = 0;
    for (const k of Object.keys(weights)) total += weights[k];
    let r = Math.random() * total;
    for (const k of Object.keys(weights)) {
      r -= weights[k];
      if (r <= 0) return k;
    }
    return "standard";
  }

  function makeBlock(props) {
    blocks.push(Object.assign({
      id: blockId++, row: 0, w: 1,
      armored: false, black: false, chain: false, mini: false, q: 0,
    }, props));
  }

  // Places one spawn of the given type. Returns false if it didn't fit
  // (caller falls back to standard).
  function placeType(type, free, hp, eff) {
    const bt = cfg().blockTypes;
    const takeCol = () => free.splice(Math.floor(Math.random() * free.length), 1)[0];

    if (type === "wide" || type === "armoredWide") {
      const w = Math.max(2, Math.min(bt.wideCells, cfg().board.cols));
      const starts = free.filter((c) => {
        for (let i = 1; i < w; i++) if (!free.includes(c + i)) return false;
        return true;
      });
      if (starts.length === 0) return false;
      const col = starts[Math.floor(Math.random() * starts.length)];
      for (let i = 0; i < w; i++) free.splice(free.indexOf(col + i), 1);
      makeBlock({ col, w, hp, maxHp: hp, armored: type === "armoredWide" });
      return true;
    }

    if (type === "mini" || type === "armoredMini" || type === "blackMini") {
      if (free.length === 0) return false;
      const col = takeCol();
      const mhp = Math.max(1, Math.round(hp * bt.miniHealthMult));
      for (let q = 0; q < 4; q++) {
        makeBlock({
          col, q, mini: true, hp: mhp, maxHp: mhp,
          armored: type === "armoredMini", black: type === "blackMini",
        });
      }
      return true;
    }

    if (free.length === 0) return false;
    const col = takeCol();
    if (type === "double") {
      const dhp = Math.round(hp * bt.doubleHealthMult);
      makeBlock({ col, hp: dhp, maxHp: dhp });
    } else if (type === "armored") {
      makeBlock({ col, hp, maxHp: hp, armored: true });
    } else if (type === "black") {
      makeBlock({ col, hp, maxHp: hp, black: true });
    } else { // standard — may roll the chain variant (decided AT SPAWN)
      makeBlock({ col, hp, maxHp: hp, chain: Math.random() < eff.chainPct });
    }
    return true;
  }

  function spawnWave() {
    const c = cfg(), d = dims();
    const eff = BB.Upgrades.effective();
    const def = levelDef();
    const count = c.spawn.minPerRow +
      Math.floor(Math.random() * (c.spawn.maxPerRow - c.spawn.minPerRow + 1));
    const hp = healthLevel();
    const free = [];
    for (let i = 0; i < d.cols; i++) free.push(i);

    for (let n = 0; n < count && free.length > 0; n++) {
      const type = pickType(def.weights);
      if (!placeType(type, free, hp, eff)) placeType("standard", free, hp, eff);
    }
  }

  function descendBlocks() {
    for (const b of blocks) b.row += 1;
  }

  function checkDeath() {
    return blocks.some((b) => b.row >= cfg().board.rows);
  }

  /* ================= firing ================= */
  function fire() {
    if (phase !== "aim") return;
    shotEff = BB.Upgrades.effective();
    fireQueue = shotEff.ballsPerShot;
    fireTimer = 0;
    nextLaunchX = null;
    phase = "firing";
    run().shots += 1;
    // pierce rolls ONCE PER SHOT: an instant beam alongside the balls
    if (Math.random() < shotEff.piercePct) fireBeam(shotEff);
  }

  // Piercing beam: instant ray from the launch point along the aim angle,
  // reflecting off side/top walls pierceReflects times, damaging every
  // block it crosses (beam width scales with the pierce meta track).
  function fireBeam(eff) {
    const d = dims();
    const halfW = cfg().balls.radius * eff.pierceWidth;
    let x = launchX, y = d.launchY;
    let dx = Math.cos(aimAngle), dy = -Math.sin(aimAngle);
    const segs = [];
    for (let s = 0; s <= eff.pierceReflects && s < 12; s++) {
      let tMin = Infinity, wall = null;
      if (dx > 1e-6)  { const t = (d.W - x) / dx;      if (t < tMin) { tMin = t; wall = "r"; } }
      if (dx < -1e-6) { const t = -x / dx;             if (t < tMin) { tMin = t; wall = "l"; } }
      if (dy < -1e-6) { const t = -y / dy;             if (t < tMin) { tMin = t; wall = "t"; } }
      if (dy > 1e-6)  { const t = (d.launchY - y) / dy; if (t < tMin) { tMin = t; wall = "b"; } }
      if (!isFinite(tMin)) break;
      const nx = x + dx * tMin, ny = y + dy * tMin;
      segs.push([x, y, nx, ny]);
      if (wall === "b") break;
      x = nx; y = ny;
      if (wall === "l" || wall === "r") dx = -dx; else dy = -dy;
    }

    const dmg = cfg().inGame.pierce.beamDamage;
    const hit = new Set();
    for (const [x1, y1, x2, y2] of segs) {
      const steps = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / 6));
      for (let i = 0; i <= steps; i++) {
        const px = x1 + ((x2 - x1) * i) / steps;
        const py = y1 + ((y2 - y1) * i) / steps;
        for (const b of blocks.slice()) {
          if (hit.has(b.id)) continue;
          const r = blockRect(b, d);
          if (px >= r.x - halfW && px <= r.x + r.w + halfW &&
              py >= r.y - halfW && py <= r.y + r.h + halfW) {
            hit.add(b.id);
            dealDamage(b, dmg, false, { allowChain: true, hitX: px });
          }
        }
      }
    }
    beams.push({ segs, w: Math.max(2, halfW * 2), t: 0.4 });
  }

  function launchBall(angle, type) {
    const d = dims();
    const speed = cfg().balls.speed * levelDef().speedMult;
    balls.push({
      x: launchX, y: d.launchY,
      vx: Math.cos(angle) * speed, vy: -Math.sin(angle) * speed,
      r: cfg().balls.radius, type,
      bounces: 0, done: false,
    });
  }

  function dequeueBall() {
    const eff = shotEff;
    let type = "normal";
    const roll = Math.random();
    if (roll < eff.heavyPct) type = "heavy";
    else if (roll < eff.heavyPct + eff.shotgunPct) type = "shotgun";

    if (type === "shotgun") {
      const n = Math.max(2, eff.shotgunBalls);
      const spread = (eff.shotgunSpread * Math.PI) / 180;
      for (let i = 0; i < n; i++) {
        const a = aimAngle - spread / 2 + (spread * i) / (n - 1);
        launchBall(a, "shotgun");
      }
    } else {
      launchBall(aimAngle, type);
    }
  }

  /* ================= damage / chain ================= */
  function blockCoversCell(b, col, row) {
    return row === b.row && col >= b.col && col < b.col + b.w;
  }

  function destroyBlock(b) {
    blocks = blocks.filter((x) => x !== b);
    const eff = shotEff || BB.Upgrades.effective();
    const gain = Math.round(b.maxHp * cfg().economy.currencyPerHp * eff.currencyMult);
    run().currency += gain;
    run().blocksDestroyed += 1;
    run().hpDestroyed += b.maxHp;
  }

  // Central damage entry point.
  // opts.ball      — the ball that dealt it (black blocks eat that ball)
  // opts.allowChain — a chain-variant block fires its pattern on this hit
  //                   (pattern damage itself passes allowChain: false)
  // opts.hitX      — impact x, anchors the chain pattern column
  function dealDamage(b, dmg, isHeavy, opts) {
    opts = opts || {};
    const a = cfg().armor;
    if (b.armored) dmg *= isHeavy ? a.heavyDamageMult : a.nonHeavyDamageMult;
    b.hp -= dmg;
    if (b.black && opts.ball) opts.ball.done = true; // eaten
    const col = b.col, row = b.row, isChain = b.chain;
    if (b.hp <= 0.0001) destroyBlock(b);
    if (isChain && opts.allowChain) {
      triggerChain(col, row, b.w, opts.hitX !== undefined ? opts.hitX : (col + 0.5) * dims().cellW);
    }
  }

  function triggerChain(col, row, w, hitX) {
    const eff = shotEff || BB.Upgrades.effective();
    if (eff.chainTier <= 0) return;
    const d = dims();
    const pattern = cfg().chain.patterns[eff.chainTier - 1];
    if (!pattern) return;
    const anchor = Math.max(col, Math.min(col + w - 1, Math.floor(hitX / d.cellW)));

    const cells = [];
    if (pattern.fullRow) for (let i = 0; i < d.cols; i++) cells.push([i, row]);
    if (pattern.fullCol) for (let j = 0; j < cfg().board.rows; j++) cells.push([anchor, j]);
    if (pattern.cells) for (const [dc, dr] of pattern.cells) cells.push([anchor + dc, row + dr]);

    const dmg = cfg().chain.damage;
    const hit = new Set();
    for (const [cc, rr] of cells) {
      for (const b of blocks.slice()) {
        if (!hit.has(b.id) && blockCoversCell(b, cc, rr)) {
          hit.add(b.id);
          dealDamage(b, dmg, false, {}); // no chain recursion
        }
      }
    }
    flashes.push({ cells, t: 0.35 });
  }

  /* ================= physics ================= */
  function blockRect(b, d) {
    if (b.mini) {
      const hw = d.cellW / 2, hh = d.cellH / 2;
      return {
        x: b.col * d.cellW + (b.q % 2) * hw,
        y: b.row * d.cellH + Math.floor(b.q / 2) * hh,
        w: hw, h: hh,
      };
    }
    return { x: b.col * d.cellW, y: b.row * d.cellH, w: b.w * d.cellW, h: d.cellH };
  }

  function outOfBounces(ball) {
    // ball simply disappears, so the shot phase ends sooner
    if (ball.bounces > (shotEff || BB.Upgrades.effective()).bounces) ball.done = true;
  }

  function stepBall(ball, dt, d) {
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;

    // bottom: ball returns
    if (ball.y > d.launchY) {
      ball.done = true;
      if (nextLaunchX === null) {
        nextLaunchX = Math.max(ball.r, Math.min(d.W - ball.r, ball.x));
      }
      return;
    }

    // walls
    let wallHit = false;
    if (ball.x < ball.r)          { ball.x = ball.r; ball.vx = Math.abs(ball.vx); wallHit = true; }
    else if (ball.x > d.W - ball.r) { ball.x = d.W - ball.r; ball.vx = -Math.abs(ball.vx); wallHit = true; }
    if (ball.y < ball.r)          { ball.y = ball.r; ball.vy = Math.abs(ball.vy); wallHit = true; }
    if (wallHit) {
      ball.bounces += 1;
      outOfBounces(ball);
      if (ball.done) return;
    }

    // blocks
    for (const b of blocks.slice()) {
      const r = blockRect(b, d);
      const cx = Math.max(r.x, Math.min(r.x + r.w, ball.x));
      const cy = Math.max(r.y, Math.min(r.y + r.h, ball.y));
      const dx = ball.x - cx, dy = ball.y - cy;
      if (dx * dx + dy * dy > ball.r * ball.r) continue;

      if (ball.type === "heavy") {
        const eff = shotEff || BB.Upgrades.effective();
        dealDamage(b, eff.heavyDamage || 1, true, { ball, allowChain: true, hitX: ball.x });
        ball.done = true; // consumed on first hit
        return;
      }

      if (b.black) { // eats the ball; no reflection
        dealDamage(b, 1, false, { ball, allowChain: true, hitX: ball.x });
        ball.done = true;
        return;
      }

      // normal / shotgun: reflect off the nearer axis
      const overlapX = ball.r + r.w / 2 - Math.abs(ball.x - (r.x + r.w / 2));
      const overlapY = ball.r + r.h / 2 - Math.abs(ball.y - (r.y + r.h / 2));
      if (overlapX < overlapY) {
        ball.vx = ball.x < r.x + r.w / 2 ? -Math.abs(ball.vx) : Math.abs(ball.vx);
        ball.x += ball.vx > 0 ? overlapX : -overlapX;
      } else {
        ball.vy = ball.y < r.y + r.h / 2 ? -Math.abs(ball.vy) : Math.abs(ball.vy);
        ball.y += ball.vy > 0 ? overlapY : -overlapY;
      }
      dealDamage(b, 1, false, { ball, allowChain: true, hitX: ball.x });
      ball.bounces += 1;
      outOfBounces(ball);
      break; // one block collision per substep
    }
  }

  function endTurn() {
    descendBlocks();
    if (checkDeath()) {
      phase = "over";
      run().over = true;
      BB.Main.onDeath();
      return;
    }
    spawnWave();
    if (nextLaunchX !== null) launchX = nextLaunchX;
    phase = "aim";
    BB.UI.refresh();
  }

  /* ================= main loop ================= */
  function update(dt) {
    for (const f of flashes) f.t -= dt;
    flashes = flashes.filter((f) => f.t > 0);
    for (const bm of beams) bm.t -= dt;
    beams = beams.filter((bm) => bm.t > 0);

    if (phase !== "firing") return;
    const c = cfg();

    if (fireQueue > 0) {
      fireTimer -= dt * 1000;
      if (fireTimer <= 0) {
        dequeueBall();
        fireQueue -= 1;
        fireTimer = c.balls.fireIntervalMs;
      }
    }

    const d = dims();
    const maxStep = 6; // px per substep, prevents tunneling
    for (const ball of balls) {
      if (ball.done) continue;
      const dist = Math.hypot(ball.vx, ball.vy) * dt;
      const steps = Math.max(1, Math.ceil(dist / maxStep));
      for (let i = 0; i < steps && !ball.done; i++) stepBall(ball, dt / steps, d);
    }
    balls = balls.filter((b) => !b.done);

    if (fireQueue === 0 && balls.length === 0) endTurn();
  }

  /* ================= aim guide (simulated bounces) ================= */
  // Ray vs rect inflated by the ball radius; returns nearest entry {t, axis}.
  function raySlab(x, y, dx, dy, rect, r) {
    const rx = rect.x - r, ry = rect.y - r, rw = rect.w + 2 * r, rh = rect.h + 2 * r;
    let tmin = -Infinity, tmax = Infinity, axis = null;
    if (Math.abs(dx) < 1e-9) {
      if (x < rx || x > rx + rw) return null;
    } else {
      let t1 = (rx - x) / dx, t2 = (rx + rw - x) / dx;
      if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; }
      if (t1 > tmin) { tmin = t1; axis = "x"; }
      tmax = Math.min(tmax, t2);
    }
    if (Math.abs(dy) < 1e-9) {
      if (y < ry || y > ry + rh) return null;
    } else {
      let t1 = (ry - y) / dy, t2 = (ry + rh - y) / dy;
      if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; }
      if (t1 > tmin) { tmin = t1; axis = "y"; }
      tmax = Math.min(tmax, t2);
    }
    if (tmin > tmax || tmin <= 1e-6) return null;
    return { t: tmin, axis };
  }

  function drawGuide(d) {
    const eff = BB.Upgrades.effective();
    let budget = eff.guideLen;
    const r = cfg().balls.radius;
    let x = launchX, y = d.launchY;
    let dx = Math.cos(aimAngle), dy = -Math.sin(aimAngle);

    ctx.strokeStyle = "#ffffff88";
    ctx.setLineDash([3, 9]);
    ctx.beginPath();
    for (let seg = 0; seg < 14 && budget > 1; seg++) {
      // nearest hit: walls, then blocks
      let tMin = budget, axis = null, isBottom = false;
      if (dx < -1e-9) { const t = (r - x) / dx;        if (t > 1e-6 && t < tMin) { tMin = t; axis = "x"; } }
      if (dx > 1e-9)  { const t = (d.W - r - x) / dx;  if (t > 1e-6 && t < tMin) { tMin = t; axis = "x"; } }
      if (dy < -1e-9) { const t = (r - y) / dy;        if (t > 1e-6 && t < tMin) { tMin = t; axis = "y"; } }
      if (dy > 1e-9)  { const t = (d.launchY - y) / dy; if (t > 1e-6 && t < tMin) { tMin = t; axis = "y"; isBottom = true; } }
      for (const b of blocks) {
        const hit = raySlab(x, y, dx, dy, blockRect(b, d), r);
        if (hit && hit.t < tMin) { tMin = hit.t; axis = hit.axis; isBottom = false; }
      }
      const nx = x + dx * tMin, ny = y + dy * tMin;
      ctx.moveTo(x, y);
      ctx.lineTo(nx, ny);
      budget -= tMin;
      if (isBottom) break;
      x = nx; y = ny;
      if (axis === "x") dx = -dx; else if (axis === "y") dy = -dy; else break;
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }

  /* ================= drawing ================= */
  function hpColor(b) {
    // ratio is relative to the CURRENT LEVEL's max health, so color only
    // shifts when a block's own hp changes and reads consistently per level
    const ratio = Math.min(1, b.hp / Math.max(1, levelDef().healthMax));
    const hue = 200 - ratio * 160; // blue -> red with remaining health
    return `hsl(${hue},70%,50%)`;
  }

  const BALL_COLORS = { normal: "#f5f5f5", heavy: "#ffb020", shotgun: "#8dff6a" };

  function drawBlock(b, d) {
    const r = blockRect(b, d);
    const pad = b.mini ? 1 : 2;
    ctx.fillStyle = b.black ? "#08080c" : hpColor(b);
    ctx.fillRect(r.x + pad, r.y + pad, r.w - 2 * pad, r.h - 2 * pad);
    if (b.black) {
      ctx.strokeStyle = "#66607a";
      ctx.lineWidth = 1;
      ctx.strokeRect(r.x + pad, r.y + pad, r.w - 2 * pad, r.h - 2 * pad);
    }
    if (b.armored) { // the gold-plated "boss" visual
      ctx.strokeStyle = "#ffd700";
      ctx.lineWidth = 2;
      ctx.strokeRect(r.x + pad, r.y + pad, r.w - 2 * pad, r.h - 2 * pad);
    }
    ctx.fillStyle = "#fff";
    ctx.font = (b.mini ? "bold 10px" : "bold 15px") + " system-ui, sans-serif";
    ctx.fillText(Math.ceil(b.hp), r.x + r.w / 2, r.y + r.h / 2);
    if (b.chain) {
      ctx.font = (b.mini ? "8px" : "11px") + " system-ui, sans-serif";
      ctx.fillText("⚡", r.x + r.w - 8, r.y + 8);
    }
  }

  function draw() {
    const d = dims();
    if (canvas.width !== d.W) canvas.width = d.W;
    if (canvas.height !== d.H) canvas.height = d.H;

    ctx.fillStyle = "#12141c";
    ctx.fillRect(0, 0, d.W, d.H);

    // death line
    ctx.strokeStyle = "#e0405066";
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(0, d.deathY);
    ctx.lineTo(d.W, d.deathY);
    ctx.stroke();
    ctx.setLineDash([]);

    // pierce beams (fading)
    for (const bm of beams) {
      ctx.strokeStyle = `rgba(77,210,255,${(bm.t / 0.4) * 0.8})`;
      ctx.lineWidth = bm.w;
      ctx.lineCap = "round";
      ctx.beginPath();
      for (const [x1, y1, x2, y2] of bm.segs) {
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
      }
      ctx.stroke();
      ctx.lineWidth = 1;
    }

    // chain flashes
    for (const f of flashes) {
      ctx.fillStyle = `rgba(255,220,80,${f.t / 0.35 * 0.35})`;
      for (const [cc, rr] of f.cells) {
        ctx.fillRect(cc * d.cellW, rr * d.cellH, d.cellW, d.cellH);
      }
    }

    // blocks
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const b of blocks) drawBlock(b, d);

    // aim guide (simulates real bounces; length is an in-run upgrade)
    if (phase === "aim") drawGuide(d);

    // launch point + queued-ball count
    ctx.fillStyle = "#f5f5f5";
    ctx.beginPath();
    ctx.arc(launchX, d.launchY, cfg().balls.radius + 1, 0, Math.PI * 2);
    ctx.fill();
    if (phase === "aim") {
      ctx.font = "12px system-ui, sans-serif";
      ctx.fillText("x" + BB.Upgrades.effective().ballsPerShot, launchX, d.launchY + 18);
    }

    // balls
    for (const ball of balls) {
      ctx.fillStyle = BALL_COLORS[ball.type] || "#fff";
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function loop(t) {
    const dt = Math.min(0.05, (t - lastT) / 1000) * (cfg().balls.timeScale || 1);
    lastT = t;
    update(dt);
    draw();
    if (phase === "firing") BB.UI.updateHUD(); // currency ticks up live
    requestAnimationFrame(loop);
  }

  /* ================= input ================= */
  function setAimFromPoint(px, py) {
    const d = dims();
    let a = Math.atan2(d.launchY - py, px - launchX);
    const half = ((BB.Upgrades.effective().angle / 2) * Math.PI) / 180;
    const lo = Math.PI / 2 - half, hi = Math.PI / 2 + half;
    aimAngle = Math.max(lo, Math.min(hi, a));
  }

  function canvasPos(ev) {
    const rect = canvas.getBoundingClientRect();
    const t = ev.touches ? ev.touches[0] : ev;
    return [t.clientX - rect.left, t.clientY - rect.top];
  }

  function bindInput() {
    canvas.addEventListener("mousemove", (ev) => {
      if (phase === "aim") setAimFromPoint(...canvasPos(ev));
    });
    canvas.addEventListener("click", (ev) => {
      if (phase === "aim") { setAimFromPoint(...canvasPos(ev)); fire(); }
    });
    canvas.addEventListener("touchmove", (ev) => {
      if (phase === "aim") { ev.preventDefault(); setAimFromPoint(...canvasPos(ev)); }
    }, { passive: false });
    canvas.addEventListener("touchend", (ev) => {
      if (phase === "aim") fire();
    });
  }

  /* ================= public ================= */
  G.init = function (cv) {
    canvas = cv;
    ctx = cv.getContext("2d");
    bindInput();
    G.newRun();
    requestAnimationFrame((t) => { lastT = t; requestAnimationFrame(loop); });
  };

  G.phase = () => phase;

  return G;
})();
