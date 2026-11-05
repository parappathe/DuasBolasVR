// Física da bola de ping pong. Não depende de navegador (roda no Node para os testes).
// Unidades: metros, segundos, rad/s. Eixo Z ao longo da mesa: o jogador fica no lado +Z,
// o adversário no lado -Z. Y para cima. Rede em z = 0.

export const TABLE = {
  y: 0.76,          // altura do tampo
  halfL: 1.37,      // metade do comprimento (2,74 m)
  halfW: 0.7625,    // metade da largura (1,525 m)
  netH: 0.1525,     // altura da rede acima do tampo
  netOver: 0.1525,  // quanto a rede passa da lateral da mesa
};
export const BALL_R = 0.02;
export const DT = 1 / 240;

const G = 9.81;
const K_DRAG = 0.11;      // 0.5·ρ·Cd·A / m
const K_MAGNUS = 0.0033;  // força de efeito (Magnus) por (ω × v)
const SPIN_DECAY = 0.15;  // perda de giro por segundo no ar
const INERTIA_K = 1.5;    // m·R²/I para casca esférica (I = 2/3·m·R²)
const MAX_SPEED = 35;
const MAX_SPIN = 300;

export const SURF = {
  table: { e: 0.9, mu: 0.25 },
  floor: { e: 0.6, mu: 0.3 },
  net: { e: 0.15, mu: 0.3 },
  paddle: { e: 0.82, mu: 0.55 },
};

export function makeBall() {
  return { px: 0, py: 1, pz: 0, vx: 0, vy: 0, vz: 0, wx: 0, wy: 0, wz: 0 };
}

export function copyBall(a, b = makeBall()) {
  b.px = a.px; b.py = a.py; b.pz = a.pz;
  b.vx = a.vx; b.vy = a.vy; b.vz = a.vz;
  b.wx = a.wx; b.wy = a.wy; b.wz = a.wz;
  return b;
}

// Topspin positivo faz a bola cair mais rápido na direção (ux, uz); side gira em torno de Y.
export function spinFor(ux, uz, top, side) {
  return { wx: top * uz, wy: side, wz: -top * ux };
}

// Contato da bola com uma superfície de normal n (unitária, apontando para a bola) que se
// move com velocidade s. Aplica restituição na normal e atrito no ponto de contato, que
// troca velocidade por giro (é isso que faz o efeito pegar na mesa e na raquete).
export function contact(b, nx, ny, nz, e, mu, sx = 0, sy = 0, sz = 0) {
  const rvx = b.vx - sx, rvy = b.vy - sy, rvz = b.vz - sz;
  const vn = rvx * nx + rvy * ny + rvz * nz;
  if (vn >= 0) return false;
  const rx = -BALL_R * nx, ry = -BALL_R * ny, rz = -BALL_R * nz;
  let cx = rvx + (b.wy * rz - b.wz * ry);
  let cy = rvy + (b.wz * rx - b.wx * rz);
  let cz = rvz + (b.wx * ry - b.wy * rx);
  const cn = cx * nx + cy * ny + cz * nz;
  cx -= cn * nx; cy -= cn * ny; cz -= cn * nz;
  let tx = -cx / (1 + INERTIA_K), ty = -cy / (1 + INERTIA_K), tz = -cz / (1 + INERTIA_K);
  const tl = Math.hypot(tx, ty, tz);
  const maxT = mu * (1 + e) * -vn;
  if (tl > maxT && tl > 0) { const k = maxT / tl; tx *= k; ty *= k; tz *= k; }
  const jn = -(1 + e) * vn;
  b.vx += jn * nx + tx; b.vy += jn * ny + ty; b.vz += jn * nz + tz;
  const k = INERTIA_K / (BALL_R * BALL_R);
  b.wx += (ry * tz - rz * ty) * k;
  b.wy += (rz * tx - rx * tz) * k;
  b.wz += (rx * ty - ry * tx) * k;
  clampBall(b);
  return true;
}

function clampBall(b) {
  const s = Math.hypot(b.vx, b.vy, b.vz);
  if (s > MAX_SPEED) { const k = MAX_SPEED / s; b.vx *= k; b.vy *= k; b.vz *= k; }
  const w = Math.hypot(b.wx, b.wy, b.wz);
  if (w > MAX_SPIN) { const k = MAX_SPIN / w; b.wx *= k; b.wy *= k; b.wz *= k; }
}

// Um passo de simulação. Eventos (opcional) recebem {type:'table', side} / 'net' / 'floor'.
// side 0 = metade do jogador (z > 0), 1 = metade do adversário.
export function stepBall(b, dt, events) {
  const s = Math.hypot(b.vx, b.vy, b.vz);
  const ax = -K_DRAG * s * b.vx + K_MAGNUS * (b.wy * b.vz - b.wz * b.vy);
  const ay = -G - K_DRAG * s * b.vy + K_MAGNUS * (b.wz * b.vx - b.wx * b.vz);
  const az = -K_DRAG * s * b.vz + K_MAGNUS * (b.wx * b.vy - b.wy * b.vx);
  b.vx += ax * dt; b.vy += ay * dt; b.vz += az * dt;
  const ox = b.px, oy = b.py, oz = b.pz;
  b.px += b.vx * dt; b.py += b.vy * dt; b.pz += b.vz * dt;
  const decay = 1 - SPIN_DECAY * dt;
  b.wx *= decay; b.wy *= decay; b.wz *= decay;

  // Rede: retângulo fino vertical em z = 0.
  const netTop = TABLE.y + TABLE.netH;
  const netX = TABLE.halfW + TABLE.netOver;
  if (Math.abs(b.px) < netX + BALL_R && b.py > TABLE.y && b.py < netTop + BALL_R) {
    const crossed = (oz > 0) !== (b.pz > 0);
    if (crossed && b.py < netTop && Math.abs(b.px) < netX) {
      const side = oz > 0 ? 1 : -1;
      b.pz = side * BALL_R;
      if (contact(b, 0, 0, side, SURF.net.e, SURF.net.mu)) events?.push({ type: 'net' });
    } else {
      const qx = Math.max(-netX, Math.min(netX, b.px));
      const qy = Math.min(netTop, b.py);
      const dx = b.px - qx, dy = b.py - qy, dz = b.pz;
      const d = Math.hypot(dx, dy, dz);
      if (d < BALL_R && d > 1e-6) {
        const nx = dx / d, ny = dy / d, nz = dz / d;
        b.px = qx + nx * BALL_R; b.py = qy + ny * BALL_R; b.pz = nz * BALL_R;
        if (contact(b, nx, ny, nz, 0.3, 0.2)) events?.push({ type: 'net' });
      }
    }
  }

  // Tampo da mesa.
  if (b.py - BALL_R < TABLE.y && oy - BALL_R >= TABLE.y - 0.002 &&
      Math.abs(b.px) <= TABLE.halfW && Math.abs(b.pz) <= TABLE.halfL) {
    b.py = TABLE.y + BALL_R;
    if (contact(b, 0, 1, 0, SURF.table.e, SURF.table.mu)) {
      events?.push({ type: 'table', side: b.pz > 0 ? 0 : 1, x: b.px, z: b.pz });
    }
  }

  // Chão.
  if (b.py - BALL_R < 0) {
    b.py = BALL_R;
    if (contact(b, 0, 1, 0, SURF.floor.e, SURF.floor.mu)) events?.push({ type: 'floor' });
  }
}

// Colisão contínua com uma raquete (disco) que se move de (a) para (b) neste passo.
// pad: {ax,ay,az, anx,any,anz, bx,by,bz, bnx,bny,bnz, vx,vy,vz, r}
// prev: posição da bola no início do passo {px,py,pz}. Devolve true se bateu.
export function paddleHit(ball, prev, pad) {
  const dPrev = (prev.px - pad.ax) * pad.anx + (prev.py - pad.ay) * pad.any + (prev.pz - pad.az) * pad.anz;
  const dNow = (ball.px - pad.bx) * pad.bnx + (ball.py - pad.by) * pad.bny + (ball.pz - pad.bz) * pad.bnz;
  const crossed = (dPrev > 0) !== (dNow > 0);
  if (!crossed && Math.abs(dNow) >= BALL_R) return false;
  // Ponto do cruzamento (ou o ponto atual, se só encostou).
  const f = crossed ? dPrev / (dPrev - dNow) : 1;
  const bx = prev.px + (ball.px - prev.px) * f, by = prev.py + (ball.py - prev.py) * f, bz = prev.pz + (ball.pz - prev.pz) * f;
  const cx = pad.ax + (pad.bx - pad.ax) * f, cy = pad.ay + (pad.by - pad.ay) * f, cz = pad.az + (pad.bz - pad.az) * f;
  let ox = bx - cx, oy = by - cy, oz = bz - cz;
  const on = ox * pad.bnx + oy * pad.bny + oz * pad.bnz;
  ox -= on * pad.bnx; oy -= on * pad.bny; oz -= on * pad.bnz;
  if (Math.hypot(ox, oy, oz) > pad.r + BALL_R * 0.5) return false;
  // Lado da raquete que está virado para a bola.
  const side = crossed ? (dPrev > 0 ? 1 : -1) : (dNow > 0 ? 1 : -1);
  const nx = pad.bnx * side, ny = pad.bny * side, nz = pad.bnz * side;
  const relN = (ball.vx - pad.vx) * nx + (ball.vy - pad.vy) * ny + (ball.vz - pad.vz) * nz;
  if (relN >= 0) return false;
  ball.px = pad.bx + ox + nx * (BALL_R + 0.001);
  ball.py = pad.by + oy + ny * (BALL_R + 0.001);
  ball.pz = pad.bz + oz + nz * (BALL_R + 0.001);
  return contact(ball, nx, ny, nz, SURF.paddle.e, SURF.paddle.mu, pad.vx, pad.vy, pad.vz);
}

// Simula a bola até ela descer cruzando a altura do tampo (+ raio), sem quicar.
// dir = +1 se a jogada vai para +Z, -1 para -Z. Devolve a distância percorrida na direção
// (ux, uz) e o ponto de chegada. Bater na rede conta como curta.
const _sim = makeBall();
export function landing(b, dir, ux, uz) {
  copyBall(b, _sim);
  const plane = TABLE.y + BALL_R;
  let wasAbove = _sim.py > plane;
  const netTop = TABLE.y + TABLE.netH;
  const netX = TABLE.halfW + TABLE.netOver;
  const sx = b.px, sz = b.pz;
  for (let t = 0; t < 3; t += DT) {
    const oz = _sim.pz;
    stepFree(_sim, DT);
    if ((oz * dir < 0) && (_sim.pz * dir >= 0) && Math.abs(_sim.px) < netX && _sim.py - BALL_R < netTop) {
      // Bateu na rede.
      return { s: -sz * uz - 0.05, x: _sim.px, z: 0, net: true, t };
    }
    if (_sim.py > plane) wasAbove = true;
    else if (wasAbove && _sim.vy < 0) {
      const s = (_sim.px - sx) * ux + (_sim.pz - sz) * uz;
      return { s, x: _sim.px, z: _sim.pz, net: false, t };
    }
  }
  const s = (_sim.px - sx) * ux + (_sim.pz - sz) * uz;
  return { s: wasAbove ? s : -10, x: _sim.px, z: _sim.pz, net: false, t: 3 };
}

// Passo sem colisões (para previsões).
function stepFree(b, dt) {
  const s = Math.hypot(b.vx, b.vy, b.vz);
  const ax = -K_DRAG * s * b.vx + K_MAGNUS * (b.wy * b.vz - b.wz * b.vy);
  const ay = -G - K_DRAG * s * b.vy + K_MAGNUS * (b.wz * b.vx - b.wx * b.vz);
  const az = -K_DRAG * s * b.vz + K_MAGNUS * (b.wx * b.vy - b.wy * b.vx);
  b.vx += ax * dt; b.vy += ay * dt; b.vz += az * dt;
  b.px += b.vx * dt; b.py += b.vy * dt; b.pz += b.vz * dt;
  const decay = 1 - SPIN_DECAY * dt;
  b.wx *= decay; b.wy *= decay; b.wz *= decay;
}

// Acha a velocidade para a bola sair de (px,py,pz) com o giro dado e cair em (tx, tz),
// com velocidade horizontal hSpeed. Ajusta a altura do arco (vy) por bissecção e corrige a
// mira lateral para compensar o efeito. Se não alcança, reduz/aumenta a velocidade.
const _shot = makeBall();
export function solveShot(px, py, pz, tx, tz, hSpeed, wx = 0, wy = 0, wz = 0) {
  const dir = tz > pz ? 1 : -1;
  let aimX = tx, aimZ = tz;
  let speed = hSpeed;
  let best = null;
  for (let attempt = 0; attempt < 6; attempt++) {
    aimX = tx; aimZ = tz;
    let sol = null;
    for (let pass = 0; pass < 3; pass++) {
      const dx = aimX - px, dz = aimZ - pz;
      const dist = Math.hypot(dx, dz);
      const ux = dx / dist, uz = dz / dist;
      const want = (tx - px) * ux + (tz - pz) * uz;
      _shot.px = px; _shot.py = py; _shot.pz = pz;
      _shot.wx = wx; _shot.wy = wy; _shot.wz = wz;
      _shot.vx = ux * speed; _shot.vz = uz * speed;
      let lo = -9, hi = 8, land = null;
      _shot.vy = hi;
      const hiLand = landing(_shot, dir, ux, uz);
      if (hiLand.s < want) { sol = { vy: hi, land: hiLand, ux, uz, short: true }; break; }
      _shot.vy = lo;
      const loLand = landing(_shot, dir, ux, uz);
      if (loLand.s > want) { sol = { vy: lo, land: loLand, ux, uz, long: true }; break; }
      for (let i = 0; i < 22; i++) {
        const mid = (lo + hi) / 2;
        _shot.vy = mid;
        land = landing(_shot, dir, ux, uz);
        if (land.s < want) lo = mid; else hi = mid;
      }
      _shot.vy = hi;
      land = landing(_shot, dir, ux, uz);
      sol = { vy: hi, land, ux, uz };
      // Corrige a mira pelo desvio lateral (efeito lateral, arrasto).
      const ex = tx - land.x, ez = tz - land.z;
      if (Math.hypot(ex, ez) < 0.01) break;
      aimX += ex; aimZ += ez;
    }
    const v = { vx: sol.ux * speed, vy: sol.vy, vz: sol.uz * speed };
    const err = Math.hypot(sol.land.x - tx, sol.land.z - tz);
    const cand = { ...v, ok: !sol.short && !sol.long && !sol.land.net && err < 0.08, err, speed };
    if (!best || cand.err < best.err) best = cand;
    if (cand.ok) return cand;
    if (sol.long) speed *= 0.8;        // rápida demais para cair na mesa: diminui
    else if (sol.short) speed *= 1.25; // não alcança nem com arco alto: aumenta
    else speed *= 0.9;
  }
  return best;
}

// Ajuda na mira (batida do jogador em VR): se a bola não ia cair na mesa do adversário
// (lado -Z), puxa a velocidade na direção de uma jogada que cai. level 0 = sem ajuda, 1 = total.
// Batida que já ia entrar não é mexida.
export function assistShot(ball, level) {
  if (!level) return false;
  const hs = Math.hypot(ball.vx, ball.vz);
  if (ball.vz > -0.8 || hs < 0.5) return false;
  const ux = ball.vx / hs, uz = ball.vz / hs;
  const land = landing(ball, -1, ux, uz);
  const inside = !land.net && Math.abs(land.x) <= TABLE.halfW - 0.03 && land.z < -0.05 && land.z >= -TABLE.halfL + 0.03;
  if (inside) return false;
  let tx = land.x, tz = land.z;
  if (land.net || tz > -0.15) { tz = -0.55; tx = ball.px + ux * (tz - ball.pz) / uz; }
  tx = Math.max(-0.66, Math.min(0.66, tx));
  tz = Math.max(-1.25, Math.min(-0.2, tz));
  const sol = solveShot(ball.px, ball.py, ball.pz, tx, tz, Math.max(3, Math.min(15, hs)), ball.wx, ball.wy, ball.wz);
  ball.vx += (sol.vx - ball.vx) * level;
  ball.vy += (sol.vy - ball.vy) * level;
  ball.vz += (sol.vz - ball.vz) * level;
  return true;
}
