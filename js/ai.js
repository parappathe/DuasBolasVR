// Adversários controlados pelo computador. Não depende de navegador.
// A IA prevê a trajetória da bola com a mesma física do jogo, escolhe onde bater, anda até
// lá com velocidade limitada e, se chegar a tempo, devolve a bola mirando um ponto da mesa.
import { TABLE, DT, makeBall, copyBall, stepBall, solveShot, spinFor } from './physics.js';

// Ordem do torneio: do mais fraco para o mais forte. Velocidades mais baixas que no PingPongVR:
// com duas bolas ao mesmo tempo já é difícil. `third`: põe a bola verde em jogo quando alguém
// chega a 8 pontos. `move` vale para cada mão (as duas andam ao mesmo tempo).
export const OPPONENTS = [
  {
    id: 'lia', name: 'Lia Calma', style: 'Iniciante',
    desc: 'Devagar e sem efeito. Bom para pegar o jeito das duas bolas.',
    shirt: 0x6fbf73, rubber: 0xd23c3c, skin: 0xe8b48a, hair: 0x5a3a1e,
    move: 1.7, reaction: 0.32, speed: [4, 5.4], smash: 0, top: [0, 20], back: 0, side: 0,
    aim: 0.1, err: 0.17, mistake: 0.12, early: false, late: false, third: false,
  },
  {
    id: 'polvo', name: 'Seu Polvo', style: 'Braços longos',
    desc: 'Alcança quase tudo com as duas mãos, mas devolve alto e devagar.',
    shirt: 0x4b6cd8, rubber: 0x222222, skin: 0xc68e62, hair: 0x1d1d1d,
    move: 2.6, reaction: 0.22, speed: [4, 5.2], smash: 0.1, top: [-40, 0], back: 0.6, side: 0,
    aim: 0.35, err: 0.1, mistake: 0.05, early: false, late: true, third: false,
  },
  {
    id: 'ro', name: 'Rô Relâmpago', style: 'Atacante',
    desc: 'Pega a bola subindo e devolve rápido. Erra quando as duas chegam juntas.',
    shirt: 0xe0503a, rubber: 0xd23c3c, skin: 0xf0c9a0, hair: 0xc0392b,
    move: 2.2, reaction: 0.22, speed: [6.2, 8.2], smash: 0.7, top: [40, 90], back: 0, side: 0,
    aim: 0.65, err: 0.11, mistake: 0.08, early: true, late: false, third: false,
  },
  {
    id: 'malabar', name: 'Professor Malabar', style: 'Três bolas',
    desc: 'Efeito para todo lado. No 8 ele joga a bola verde: três ao mesmo tempo.',
    shirt: 0x9b59d0, rubber: 0x222222, skin: 0xd9a77c, hair: 0xdddddd,
    move: 2.4, reaction: 0.2, speed: [5, 6.8], smash: 0.3, top: [-100, 110], back: 0.35, side: 60,
    aim: 0.55, err: 0.09, mistake: 0.06, early: false, late: false, third: true,
  },
  {
    id: 'tempestade', name: 'Dona Tempestade', style: 'Campeã',
    desc: 'Rápida e precisa com as duas mãos. Também traz a bola verde no 8.',
    shirt: 0x1d1d1d, rubber: 0xd23c3c, skin: 0xb07850, hair: 0x2a2a2a,
    move: 3.0, reaction: 0.16, speed: [6.5, 8.8], smash: 0.9, top: [40, 110], back: 0.15, side: 40,
    aim: 0.8, err: 0.06, mistake: 0.03, early: true, late: false, third: true,
  },
];

function gauss(rng) {
  const u = Math.max(1e-9, rng()), v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class AIPlayer {
  // side = -1: joga no lado -Z (adversário). side = +1: lado do jogador (usado nos testes).
  constructor(profile, side = -1, rng = Math.random) {
    this.p = profile;
    this.side = side;
    this.rng = rng;
    this.paddle = { x: 0, y: TABLE.y + 0.25, z: side * 1.9 };
    this.plan = null;
    this.time = 0;
    this.swing = 0; // 0..1 para animar a batida
    this._b = makeBall();
    this._ev = [];
    this.homeX = 0; // posição de espera de lado (cada mão tem a sua)
    this.slot = null; // bola que esta mão vai rebater (TwoHands)
  }

  ready() { return { x: this.homeX, y: TABLE.y + 0.25, z: this.side * 1.9 }; }

  reset() {
    this.plan = null;
    Object.assign(this.paddle, this.ready());
  }

  // Chamado quando o outro lado bate: a bola vem para cá. alreadyBounced: a bola já quicou
  // do nosso lado (plano feito no meio do caminho, quando a mão fica livre).
  planFor(ball, alreadyBounced = false) {
    this.plan = null;
    const s = this.side;
    const b = copyBall(ball, this._b);
    const ev = this._ev;
    const pts = [];
    let bounced = alreadyBounced, tb = 0, stop = false;
    for (let t = DT; t < 2.6 && !stop; t += DT) {
      ev.length = 0;
      stepBall(b, DT, ev);
      for (const e of ev) {
        if (e.type === 'floor') stop = true;
        else if (e.type === 'table') {
          if (bounced) stop = true; // segundo quique: só vale o que veio antes
          else if (e.z * s <= 0) return; // vai quicar no lado de quem bateu: ponto, nem tenta
          else { bounced = true; tb = t; }
        }
      }
      if (stop || !bounced || t < tb + 0.04) continue;
      if (b.pz * s > 3 || b.py > 2.1) break;
      if (b.py - TABLE.y > 0.05) pts.push({ x: b.px, y: b.py, z: b.pz, vy: b.vy, t });
    }
    if (!bounced || !pts.length) return;

    const pd = this.paddle;
    const stretchOf = (q) => {
      const dist = Math.hypot(q.x - pd.x, (q.y - pd.y) * 0.7, (q.z - pd.z) * 0.6);
      return dist / this.p.move / Math.max(0.01, q.t - this.p.reaction);
    };
    const p = this.p;
    const prefer = [
      p.early ? (q) => q.y - TABLE.y > 0.14 && q.t > tb + 0.07 : null,
      p.late ? (q) => (q.vy <= 0 && q.y - TABLE.y < 0.3) || q.z * s > 2.2 : null,
      (q) => (q.vy <= 0 && q.y - TABLE.y > 0.08) || q.z * s > 1.65,
    ].filter(Boolean);
    let hit = null, stretch = Infinity;
    for (const f of prefer) {
      const q = pts.find(f);
      if (q) { const st = stretchOf(q); if (st <= 1) { hit = q; stretch = st; break; } }
    }
    if (!hit) {
      for (const q of pts) { const st = stretchOf(q); if (st < stretch) { stretch = st; hit = q; } }
    }
    const speedIn = Math.hypot(ball.vx, ball.vy, ball.vz);
    const spinIn = Math.hypot(ball.wx, ball.wy, ball.wz);
    const difficulty = clamp((speedIn - 6) / 10, 0, 1) * 0.5 + clamp(spinIn / 160, 0, 1) * 0.3 + clamp(stretch - 0.5, 0, 1) * 0.4;
    this.plan = {
      x: hit.x, y: hit.y, z: hit.z,
      hitTime: this.time + hit.t, startMove: this.time + p.reaction,
      reachable: stretch <= 1.35, desperate: stretch > 1, difficulty, stretch,
    };
  }

  // Avança o tempo; se for a hora e a raquete chegou, devolve {vx,vy,vz,wx,wy,wz}.
  tick(dt, ball) {
    this.time += dt;
    this.swing = Math.max(0, this.swing - dt * 4);
    const pd = this.paddle;
    const pl = this.plan;
    let tx, ty, tz, speed = this.p.move;
    if (pl && this.time >= pl.startMove) { tx = pl.x; ty = pl.y; tz = pl.z + this.side * 0.02; }
    else if (pl) { return null; }
    else { const r = this.ready(); tx = r.x; ty = r.y; tz = r.z; speed *= 0.6; }
    // Mesma métrica do planFor: subir/descer e ir para frente/trás custam menos que o lado.
    const dx = tx - pd.x, dy = ty - pd.y, dz = tz - pd.z;
    const d = Math.hypot(dx, dy * 0.7, dz * 0.6);
    const f = d > 0 ? Math.min(1, speed * dt / d) : 1;
    pd.x += dx * f; pd.y += dy * f; pd.z += dz * f;
    if (!pl || this.time < pl.hitTime - 1e-9) return null;
    this.plan = null;
    const gap = Math.hypot(ball.px - pd.x, ball.py - pd.y, ball.pz - pd.z);
    if (!pl.reachable || gap > (pl.desperate ? 0.45 : 0.16)) return null; // não chegou: a bola passa
    this.swing = 1;
    return this.shot(ball, pl.difficulty + (pl.desperate ? 0.5 : 0));
  }

  // Escolhe a jogada de devolução.
  shot(ball, difficulty) {
    const p = this.p, rng = this.rng, s = this.side;
    const h = ball.py - TABLE.y;
    let speed = lerp(p.speed[0], p.speed[1], rng());
    let top = lerp(p.top[0], p.top[1], rng());
    let side = (rng() * 2 - 1) * p.side;
    if (p.back > 0 && rng() < p.back) top = -Math.abs(top || 40) - 20 * rng();
    // Bola alta: chance de cortada.
    if (h > 0.45 && rng() < p.smash) { speed = p.speed[1] * 1.25; top = Math.max(top, 60); }
    if (h < 0.12) speed *= 0.8;
    // Mira: profundidade e lado. Quem mira bem vai mais nos cantos.
    let depth = lerp(0.45, 0.92, rng());
    let tx;
    if (rng() < p.aim) tx = (rng() < 0.5 ? -1 : 1) * lerp(0.45, 0.66, rng());
    else tx = (rng() * 2 - 1) * lerp(0.15, 0.5, p.aim);
    const errK = p.err * (1 + difficulty);
    tx += gauss(rng) * errK;
    depth += gauss(rng) * errK / TABLE.halfL;
    let netErr = false;
    if (rng() < p.mistake * (1 + 3 * difficulty)) {
      const k = rng();
      if (k < 0.4) netErr = true;
      else if (k < 0.7) depth = 1 + lerp(0.1, 0.4, rng()) / TABLE.halfL;
      else tx = (rng() < 0.5 ? -1 : 1) * (TABLE.halfW + lerp(0.08, 0.35, rng()));
    }
    depth = Math.max(0.12, depth);
    const tz = -s * depth * TABLE.halfL;
    return this._solve(ball, tx, tz, speed, top, side, netErr);
  }

  _solve(ball, tx, tz, speed, top, side, netErr) {
    const dx = tx - ball.px, dz = tz - ball.pz, dl = Math.hypot(dx, dz);
    const w = spinFor(dx / dl, dz / dl, top, side);
    const v = solveShot(ball.px, ball.py, ball.pz, tx, tz, speed, w.wx, w.wy, w.wz);
    if (netErr) v.vy -= lerp(0.8, 1.6, this.rng());
    return { vx: v.vx, vy: v.vy, vz: v.vz, wx: w.wx, wy: w.wy, wz: w.wz };
  }
}

// Um adversário com duas mãos: uma AIPlayer por mão. Cada bola que vem é dada à mão livre que
// chega com mais folga; se as duas estão ocupadas, a bola espera uma mão ficar livre (sem
// teleporte: cada mão anda com a velocidade `move` do adversário).
export class TwoHands {
  // side: -1 (adversário, lado -Z) ou +1 (lado do jogador, nos testes). idx: 1 ou 0 no núcleo.
  constructor(profile, side = -1, rng = Math.random) {
    this.p = profile;
    this.side = side;
    this.idx = side < 0 ? 1 : 0;
    this.hands = [new AIPlayer(profile, side, rng), new AIPlayer(profile, side, rng)];
    this.hands[0].homeX = -0.36; this.hands[1].homeX = 0.36;
    this.reset();
  }

  reset() { for (const h of this.hands) { h.reset(); h.slot = null; } }
  release(slot) { for (const h of this.hands) if (h.slot === slot) { h.slot = null; h.plan = null; } }

  // Um passo: distribui as bolas que vêm, move as mãos e devolve as batidas [[slot, tiro], ...].
  step(dt, core) {
    const me = this.idx;
    for (const h of this.hands) {
      if (h.slot && (h.slot.state !== 'rally' || h.slot.rally.lastHitter === me)) { h.slot = null; h.plan = null; }
    }
    for (const slot of core.slots) {
      if (slot.state !== 'rally' || slot.rally.lastHitter !== 1 - me) continue;
      if (this.hands.some(h => h.slot === slot)) continue;
      if (core.time < (slot.retry[me] || 0)) continue;
      const free = this.hands.filter(h => !h.slot);
      if (!free.length) break;
      let best = null;
      for (const h of free) {
        h.planFor(slot.ball, slot.rally.bounces === 1);
        if (h.plan && (!best || h.plan.stretch < best.plan.stretch)) { if (best) best.plan = null; best = h; }
        else h.plan = null;
      }
      if (best) best.slot = slot;
      else slot.retry[me] = core.time + 0.1;
    }
    const out = [];
    for (const h of this.hands) {
      const slot = h.slot;
      const shot = h.tick(dt, slot ? slot.ball : null);
      if (shot) out.push([slot, shot]);
      if (!h.plan) h.slot = null;
    }
    return out;
  }
}
