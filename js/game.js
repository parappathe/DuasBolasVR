// Núcleo de uma partida com várias bolas ao mesmo tempo. Não depende de navegador: o main.js
// liga isto à tela e aos controles, e os testes rodam IA contra IA com ele.
//
// Cada bola tem o seu próprio ponto (Rally) e corre independente das outras; o placar é um só.
// Quando uma bola sai de jogo, quem perdeu aquele ponto relança a bola pela máquina do seu lado,
// depois de uma pausa curta. As bolas não colidem entre si.
import { TABLE, DT, makeBall, copyBall, stepBall, solveShot } from './physics.js';
import { Rally, Match } from './match.js';
import { TwoHands } from './ai.js';

export const BALLS = [
  { id: 'azul', name: 'azul', color: 0x2f7bff },
  { id: 'laranja', name: 'laranja', color: 0xff8a1e },
  { id: 'verde', name: 'verde', color: 0x3fd65a },
];
export const THIRD_AT = 8;        // a bola verde entra quando alguém chega a 8 pontos
export const PAUSE_AFTER = 1.2;   // depois do ponto, a bola some por este tempo
export const SHOW_BEFORE = 0.7;   // e aparece na máquina este tempo antes de sair
export const LAUNCH_SPEED = 5;    // velocidade horizontal da máquina (moderada)

// Máquinas lançadoras: uma de cada lado da mesa, fora do caminho das raquetes.
export function launcherPos(side) {
  return side === 0 ? { x: -1.3, y: 1.0, z: 1.1 } : { x: 1.3, y: 1.0, z: -1.1 };
}

export class MultiCore {
  // ai[0] = lado do jogador (TwoHands nos testes; null = humano), ai[1] = adversário.
  constructor({ opponent, playerAI = null, rng = Math.random, bestOf = 1, pointsToWin = 11, onEvent = null, third = null }) {
    this.rng = rng;
    this.opponent = opponent;
    this.ai = [playerAI, new TwoHands(opponent, -1, rng)];
    this.match = new Match({ bestOf, pointsToWin, firstServer: 0 });
    this.onEvent = onEvent;
    this.time = 0;
    this.state = 'playing';
    this.overTimer = 0;
    this.third = third ?? !!opponent.third;
    this.thirdAdded = false;
    this.slots = [];
    this.lastPoint = null;
    this._tmp = makeBall();
    this._events = [];
    // Começo: a azul sai da máquina do adversário, a laranja da sua, um pouco depois.
    this.addBall(0, 1, 0.6);
    this.addBall(1, 0, 1.9);
  }

  emit(type, data = {}) { this.onEvent?.(type, data); }
  isHuman(i) { return !this.ai[i]; }

  addBall(idx, launcher, delay) {
    const slot = {
      idx, ...BALLS[idx], ball: makeBall(), prev: makeBall(), pre: makeBall(),
      rally: null, state: 'hidden', timer: delay, launcher, retry: [0, 0], launches: 0,
    };
    this._park(slot);
    this.slots.push(slot);
    this.emit('ballAdded', { slot: idx, launcher });
    return slot;
  }

  _park(slot) {
    const b = slot.ball, p = launcherPos(slot.launcher);
    b.px = p.x; b.py = p.y; b.pz = p.z;
    b.vx = b.vy = b.vz = b.wx = b.wy = b.wz = 0;
  }

  _launch(slot) {
    const s = slot.launcher, b = slot.ball, rng = this.rng;
    this._park(slot);
    const dir = s === 0 ? -1 : 1; // para onde vai (sinal de z)
    const tx = (rng() * 2 - 1) * 0.45;
    const tz = dir * (0.45 + rng() * 0.4) * TABLE.halfL;
    const v = solveShot(b.px, b.py, b.pz, tx, tz, LAUNCH_SPEED);
    b.vx = v.vx; b.vy = v.vy; b.vz = v.vz;
    slot.rally = new Rally(s);
    slot.rally.onHit(s);
    slot.state = 'rally';
    slot.retry[0] = slot.retry[1] = 0;
    slot.launches++;
    this.emit('launch', { slot: slot.idx, launcher: s });
  }

  // Um passo fixo (DT). humanHit(ball, prev, slot, core) testa e aplica a batida do jogador
  // humano naquela bola; devolve true se bateu.
  step(humanHit = null) {
    this.time += DT;
    if (this.state === 'matchOver') return;
    if (this.state === 'ending') {
      this.overTimer -= DT;
      for (const slot of this.slots) this._fly(slot);
      if (this.overTimer <= 0) { this.state = 'matchOver'; this.emit('matchOver', { winner: this.match.winner }); }
      return;
    }

    for (const slot of this.slots) {
      if (slot.state === 'hidden' || slot.state === 'ready') {
        slot.timer -= DT;
        if (slot.state === 'hidden' && slot.timer <= SHOW_BEFORE) { slot.state = 'ready'; this._park(slot); this.emit('ready', { slot: slot.idx }); }
        if (slot.timer <= 0) this._launch(slot);
        continue;
      }
      if (slot.state === 'over') {
        this._fly(slot);
        slot.timer -= DT;
        if (slot.timer <= 0) { slot.state = 'hidden'; slot.timer = SHOW_BEFORE; this._park(slot); }
        continue;
      }
      // Bola em jogo.
      const b = slot.ball;
      copyBall(b, slot.prev);
      const ev = this._events;
      ev.length = 0;
      stepBall(b, DT, ev);
      const out = Math.abs(b.px) > 7 || Math.abs(b.pz) > 9;
      if (out) ev.push({ type: 'floor' });
      let r = null;
      for (const e of ev) {
        this.emit(e.type, { ...e, slot: slot.idx });
        if (e.type === 'table') r = slot.rally.onTable(e.side);
        else if (e.type === 'net') slot.rally.onNet();
        else if (e.type === 'floor') r = slot.rally.onFloor();
        if (r) break;
      }
      if (out) { b.vx = b.vy = b.vz = 0; b.py = 0.02; }
      if (!r) r = slot.rally.tick(DT);
      if (r) { this._resolve(slot, r); if (this.state !== 'playing') return; continue; }
      // Batida do jogador humano (nunca na bola que ele mesmo acabou de mandar).
      if (this.isHuman(0) && humanHit && slot.rally.lastHitter !== 0) {
        copyBall(b, slot.pre);
        if (humanHit(b, slot.prev, slot, this)) this._hit(slot, 0);
        if (this.state !== 'playing') return;
      }
    }

    for (let i = 0; i < 2; i++) {
      const a = this.ai[i];
      if (!a) continue;
      for (const [slot, shot] of a.step(DT, this)) {
        if (slot.state !== 'rally') continue;
        copyBall(slot.ball, slot.pre);
        const b = slot.ball;
        b.vx = shot.vx; b.vy = shot.vy; b.vz = shot.vz; b.wx = shot.wx; b.wy = shot.wy; b.wz = shot.wz;
        this._hit(slot, i);
        if (this.state !== 'playing') return;
      }
    }
  }

  // Bola fora de jogo continua caindo (só para a tela), sem regras.
  _fly(slot) {
    if (slot.state !== 'over') return;
    const b = slot.ball;
    stepBall(b, DT, null);
    if (Math.abs(b.px) > 7 || Math.abs(b.pz) > 9) { b.vx = b.vy = b.vz = 0; b.py = 0.02; }
  }

  _hit(slot, i) {
    const out = slot.rally.bounces === 0 ? !this._wouldLandOn(slot.pre, i) : false;
    const r = slot.rally.onHit(i, out);
    const b = slot.ball;
    this.emit('hit', { who: i, slot: slot.idx, speed: Math.hypot(b.vx, b.vy, b.vz) });
    if (r) { this._resolve(slot, r); return; }
    slot.retry[0] = slot.retry[1] = 0;
    this.ai[i]?.release(slot);
  }

  // A bola (antes da batida) cairia na metade do lado `side`?
  _wouldLandOn(ball, side) {
    const b = copyBall(ball, this._tmp);
    const ev = [];
    for (let t = 0; t < 2; t += DT) {
      ev.length = 0;
      stepBall(b, DT, ev);
      for (const e of ev) {
        if (e.type === 'table') return e.side === side;
        if (e.type === 'floor') return false;
      }
    }
    return false;
  }

  _resolve(slot, r) {
    for (const a of this.ai) a?.release(slot);
    slot.state = 'over';
    slot.timer = PAUSE_AFTER;
    if (r.let) {
      this.emit('let', { slot: slot.idx });
      return;
    }
    const res = this.match.addPoint(r.winner);
    slot.launcher = 1 - r.winner; // quem perdeu relança
    this.lastPoint = { ...r, ...res, slot: slot.idx, ballName: slot.name };
    this.emit('point', this.lastPoint);
    if (this.match.over) {
      // Acabou: as outras bolas saem de jogo e caem (sem valer ponto).
      for (const s of this.slots) if (s.state === 'rally') { for (const a of this.ai) a?.release(s); s.state = 'over'; }
      this.state = 'ending'; this.overTimer = 1.5;
      return;
    }
    const [a, b] = this.match.score;
    if (this.third && !this.thirdAdded && Math.max(a, b) >= THIRD_AT) {
      this.thirdAdded = true;
      const behind = a < b ? 0 : 1; // quem está atrás lança a verde (empate: a máquina do adversário)
      this.addBall(2, behind, 1.6);
      this.emit('thirdBall', { launcher: behind });
    }
  }

  get ballsInPlay() { return this.slots.filter(s => s.state === 'rally').length; }
}
