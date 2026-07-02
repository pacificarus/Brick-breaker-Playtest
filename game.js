/* =====================================================================
   GAME — Ballz-style core loop: aim, fire, bounce, blocks descend one
   row per shot, new blocks spawn at the top, death when a block crosses
   the bottom line. Reads every tunable live from BB.State.cfg so
   playtesting-menu edits apply instantly. No tuning numbers live here.
   ===================================================================== */

window.BB = window.BB || {};

BB.Game = (function () {
  const G = {};
  const cfg = () => BB.State.cfg;
  const run = () => BB.State.run;

  let canvas, ctx;
  let blocks = [], balls = [], flashes = [];
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

  /* ================= run lifecycle ================= */
  G.newRun = function () {
    BB.State.newRun();
    blocks = []; balls = []; flashes = [];
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

  function healthLevel() {
    const c = cfg().spawn, s = run().shots;
    return Math.max(1, Math.round(c.healthBase + c.healthLinear * s + c.healthQuad * s * s));
  }

  function spawnWave() {
    const c = cfg(), d = dims();
    const count = c.spawn.minPerRow +
      Math.floor(Math.random() * (c.spawn.maxPerRow - c.spawn.minPerRow + 1));
    const hp = healthLevel();
    const free = [];
    for (let i = 0; i < d.cols; i++) free.push(i);
    const used = [];

    // maybe a boss (occupies widthCells columns in one row)
    let bossPlaced = false;
    if (run().shots >= c.boss.minShotsBeforeBoss && Math.random() < c.boss.chance) {
      const w = Math.min(c.boss.widthCells, d.cols);
      const col = Math.floor(Math.random() * (d.cols - w + 1));
      for (let i = 0; i < w; i++) {
        const idx = free.indexOf(col + i);
        if (idx >= 0) free.splice(idx, 1);
      }
      const bhp = Math.round(hp * c.boss.healthMult);
      blocks.push({ id: blockId++, col, row: 0, w, hp: bhp, maxHp: bhp, boss: true });
      bossPlaced = true;
    }

    const normals = Math.max(0, count - (bossPlaced ? 1 : 0));
    for (let i = 0; i < normals && free.length > 0; i++) {
      const idx = Math.floor(Math.random() * free.length);
      const col = free.splice(idx, 1)[0];
      const double = Math.random() < c.spawn.doubleBlockChance;
      const h = double ? hp * 2 : hp;
      blocks.push({ id: blockId++, col, row: 0, w: 1, hp: h, maxHp: h, boss: false });
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
  }

  function launchBall(angle, type, eff) {
    const d = dims();
    const speed = cfg().balls.speed;
    const r = cfg().balls.radius * (type === "pierce" ? eff.pierceWidth : 1);
    balls.push({
      x: launchX, y: d.launchY,
      vx: Math.cos(angle) * speed, vy: -Math.sin(angle) * speed,
      r, type,
      bounces: 0, reflects: 0,
      falling: false, done: false,
      hitSet: type === "pierce" ? {} : null,
    });
  }

  function dequeueBall() {
    const eff = shotEff;
    let type = "normal";
    const roll = Math.random();
    if (roll < eff.piercePct) type = "pierce";
    else if (roll < eff.piercePct + eff.heavyPct) type = "heavy";
    else if (roll < eff.piercePct + eff.heavyPct + eff.shotgunPct) type = "shotgun";

    if (type === "shotgun") {
      const n = Math.max(2, eff.shotgunBalls);
      const spread = (eff.shotgunSpread * Math.PI) / 180;
      for (let i = 0; i < n; i++) {
        const a = aimAngle - spread / 2 + (spread * i) / (n - 1);
        launchBall(a, "shotgun", eff);
      }
    } else {
      launchBall(aimAngle, type, eff);
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

  function dealDamage(b, dmg, isHeavy) {
    const c = cfg().boss;
    if (b.boss) dmg *= isHeavy ? c.heavyDamageMult : c.nonHeavyDamageMult;
    b.hp -= dmg;
    if (b.hp <= 0.0001) destroyBlock(b);
  }

  function maybeChain(hitBlock, ballX) {
    const eff = shotEff || BB.Upgrades.effective();
    if (eff.chainTier <= 0 || Math.random() >= eff.chainPct) return;
    const d = dims();
    const pattern = cfg().chain.patterns[eff.chainTier - 1];
    if (!pattern) return;
    // anchor cell: block's row + the column of the block cell nearest the impact
    const col = Math.max(hitBlock.col,
      Math.min(hitBlock.col + hitBlock.w - 1, Math.floor(ballX / d.cellW)));
    const row = hitBlock.row;

    const cells = [];
    if (pattern.fullRow) for (let i = 0; i < d.cols; i++) cells.push([i, row]);
    if (pattern.fullCol) for (let j = 0; j < cfg().board.rows; j++) cells.push([col, j]);
    if (pattern.cells) for (const [dc, dr] of pattern.cells) cells.push([col + dc, row + dr]);

    const dmg = cfg().chain.damage;
    const hit = new Set();
    for (const [cc, rr] of cells) {
      for (const b of blocks.slice()) {
        if (b !== hitBlock && !hit.has(b.id) && blockCoversCell(b, cc, rr)) {
          hit.add(b.id);
          dealDamage(b, dmg, false);
        }
      }
    }
    flashes.push({ cells, t: 0.35 });
  }

  /* ================= physics ================= */
  function blockRect(b, d) {
    return { x: b.col * d.cellW, y: b.row * d.cellH, w: b.w * d.cellW, h: d.cellH };
  }

  function stepBall(ball, dt, d) {
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;

    // bottom: ball returns
    if (ball.y > d.launchY) {
      ball.done = true;
      if (!ball.falling && nextLaunchX === null) {
        nextLaunchX = Math.max(ball.r, Math.min(d.W - ball.r, ball.x));
      }
      return;
    }
    if (ball.falling) return; // out of bounces: drops through everything

    // walls
    let wallHit = false;
    if (ball.x < ball.r)          { ball.x = ball.r; ball.vx = Math.abs(ball.vx); wallHit = true; }
    else if (ball.x > d.W - ball.r) { ball.x = d.W - ball.r; ball.vx = -Math.abs(ball.vx); wallHit = true; }
    if (ball.y < ball.r)          { ball.y = ball.r; ball.vy = Math.abs(ball.vy); wallHit = true; }
    if (wallHit) {
      if (ball.type === "pierce") {
        ball.reflects += 1;
        if (ball.reflects > (shotEff || BB.Upgrades.effective()).pierceReflects) startFalling(ball);
      } else {
        ball.bounces += 1;
        if (ball.bounces > (shotEff || BB.Upgrades.effective()).bounces) startFalling(ball);
      }
    }

    // blocks
    for (const b of blocks.slice()) {
      const r = blockRect(b, d);
      const cx = Math.max(r.x, Math.min(r.x + r.w, ball.x));
      const cy = Math.max(r.y, Math.min(r.y + r.h, ball.y));
      const dx = ball.x - cx, dy = ball.y - cy;
      if (dx * dx + dy * dy > ball.r * ball.r) continue;

      if (ball.type === "pierce") {
        if (!ball.hitSet[b.id]) {
          ball.hitSet[b.id] = true;
          dealDamage(b, 1, false);
          maybeChain(b, ball.x);
        }
        continue; // pass through
      }

      if (ball.type === "heavy") {
        const eff = shotEff || BB.Upgrades.effective();
        dealDamage(b, eff.heavyDamage || 1, true);
        maybeChain(b, ball.x);
        ball.done = true; // consumed on first hit
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
      dealDamage(b, 1, false);
      maybeChain(b, ball.x);
      ball.bounces += 1;
      if (ball.bounces > (shotEff || BB.Upgrades.effective()).bounces) startFalling(ball);
      break; // one block collision per substep
    }
  }

  function startFalling(ball) {
    ball.falling = true;
    ball.vy = Math.abs(ball.vy) || cfg().balls.speed;
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

    for (const f of flashes) f.t -= dt;
    flashes = flashes.filter((f) => f.t > 0);

    if (fireQueue === 0 && balls.length === 0) endTurn();
  }

  /* ================= drawing ================= */
  function hpColor(b) {
    if (b.boss) return "#b13be0";
    const ratio = Math.min(1, b.maxHp / Math.max(1, healthLevel() * 2));
    const hue = 200 - ratio * 160; // blue -> red as blocks get tougher
    return `hsl(${hue},70%,50%)`;
  }

  const BALL_COLORS = { normal: "#f5f5f5", pierce: "#4dd2ff", heavy: "#ffb020", shotgun: "#8dff6a" };

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
    for (const b of blocks) {
      const r = blockRect(b, d);
      ctx.fillStyle = hpColor(b);
      ctx.fillRect(r.x + 2, r.y + 2, r.w - 4, r.h - 4);
      if (b.boss) {
        ctx.strokeStyle = "#ffd700";
        ctx.lineWidth = 2;
        ctx.strokeRect(r.x + 2, r.y + 2, r.w - 4, r.h - 4);
      }
      ctx.fillStyle = "#fff";
      ctx.font = (b.boss ? "bold 18px" : "bold 15px") + " system-ui, sans-serif";
      ctx.fillText(Math.ceil(b.hp), r.x + r.w / 2, r.y + r.h / 2);
    }

    // aim guide
    if (phase === "aim") {
      const gx = Math.cos(aimAngle), gy = -Math.sin(aimAngle);
      ctx.strokeStyle = "#ffffff88";
      ctx.setLineDash([3, 9]);
      ctx.beginPath();
      ctx.moveTo(launchX, d.launchY);
      ctx.lineTo(launchX + gx * 340, d.launchY + gy * 340);
      ctx.stroke();
      ctx.setLineDash([]);
    }

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
