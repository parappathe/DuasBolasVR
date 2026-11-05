// Testes automáticos: node tests/run.js  (tem que terminar com "Tudo certo")
import { TABLE, BALL_R, DT, makeBall, stepBall, paddleHit, solveShot, landing, spinFor, assistShot } from '../js/physics.js';
import { Rally, Match } from '../js/match.js';
import { AIPlayer, TwoHands, OPPONENTS } from '../js/ai.js';
import { MultiCore, BALLS, THIRD_AT } from '../js/game.js';

let fails = 0, count = 0;
function ok(cond, msg) {
  count++;
  if (!cond) { fails++; console.log('  FALHOU: ' + msg); }
}
function section(name) { console.log(name); }

// Gerador aleatório com semente, para os testes darem sempre o mesmo resultado.
function seeded(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function run(b, seconds, ev) { for (let t = 0; t < seconds; t += DT) stepBall(b, DT, ev); }

section('Física');
{
  // Queda de 30 cm acima da mesa: quica e volta a uns 80% da altura.
  const b = makeBall(); b.py = TABLE.y + 0.3 + BALL_R; b.pz = 0.5;
  const ev = []; let maxAfter = 0, bounced = false;
  for (let t = 0; t < 1; t += DT) {
    const n = ev.length; stepBall(b, DT, ev);
    if (ev.length > n && ev[n].type === 'table') bounced = true;
    if (bounced) maxAfter = Math.max(maxAfter, b.py - BALL_R - TABLE.y);
  }
  ok(bounced, 'bola deveria quicar na mesa');
  ok(maxAfter > 0.2 && maxAfter < 0.28, `altura do quique ${maxAfter.toFixed(3)} fora de 0.20..0.28`);
  ok(ev[0].side === 0, 'quique em z>0 deveria ser no lado do jogador');
}
{
  // Bola baixa e reta bate na rede e não passa.
  const b = makeBall(); b.py = TABLE.y + 0.08; b.pz = 0.6; b.vz = -6; b.vy = 0.3;
  const ev = []; run(b, 0.5, ev);
  ok(ev.some(e => e.type === 'net'), 'bola baixa deveria bater na rede');
  ok(b.pz > -0.05, 'bola baixa não deveria atravessar a rede');
}
{
  // Topspin faz cair antes; backspin faz ir mais longe.
  const shoot = (top) => {
    const b = makeBall(); b.py = 1.0; b.pz = 1.6; b.vz = -8; b.vy = 1.2;
    const w = spinFor(0, -1, top, 0); b.wx = w.wx; b.wy = w.wy; b.wz = w.wz;
    return landing(b, -1, 0, -1).s;
  };
  ok(shoot(120) < shoot(0) && shoot(0) < shoot(-120), 'topspin deveria encurtar e backspin alongar a bola');
}
{
  // Bola rápida contra raquete rápida não atravessa (colisão contínua).
  const b = makeBall(); b.py = 1; b.pz = 1.2; b.vz = 15;
  const pad = { r: 0.075, vx: 0, vy: 0, vz: -10 };
  let hit = false; let pz = 1.6;
  for (let i = 0; i < 40 && !hit; i++) {
    const prev = { px: b.px, py: b.py, pz: b.pz };
    stepBall(b, DT);
    const nz = pz - 10 * DT;
    Object.assign(pad, { ax: 0, ay: 1, az: pz, anx: 0, any: 0, anz: 1, bx: 0, by: 1, bz: nz, bnx: 0, bny: 0, bnz: 1 });
    pz = nz;
    hit = paddleHit(b, prev, pad);
  }
  ok(hit, 'raquete deveria acertar a bola rápida');
  ok(b.vz < -15, `bola deveria voltar rápida (vz=${b.vz.toFixed(1)})`);
}
{
  // Raquete inclinada com movimento para cima gera topspin.
  const b = makeBall(); b.py = 0.95; b.pz = 1.5; b.vz = 6;
  const prev = { px: 0, py: 0.95, pz: 1.5 - 6 * DT };
  b.pz = 1.5 + 0.005;
  const pad = { r: 0.075, vx: 0, vy: 4, vz: -3, ax: 0, ay: 0.95, az: 1.505, bx: 0, by: 0.95, bz: 1.505, anx: 0, any: 0, anz: 1, bnx: 0, bny: 0, bnz: 1 };
  paddleHit(b, prev, pad);
  ok(b.wx < -20, `raspar a bola para cima deveria dar topspin para quem recebe do outro lado (wx=${b.wx.toFixed(0)})`);
}
{
  // O resolvedor de jogada acerta o alvo, com e sem efeito.
  for (const [top, side] of [[0, 0], [100, 0], [-80, 0], [60, 80]]) {
    const w = spinFor(0, -1, top, side);
    const v = solveShot(0.2, 1.0, 1.6, -0.4, -0.9, 8, w.wx, w.wy, w.wz);
    const b = makeBall(); Object.assign(b, { px: 0.2, py: 1.0, pz: 1.6, vx: v.vx, vy: v.vy, vz: v.vz, ...w });
    const ev = []; run(b, 1.5, ev);
    const t = ev.find(e => e.type === 'table');
    ok(v.ok && t && Math.hypot(t.x + 0.4, t.z + 0.9) < 0.06, `jogada com efeito (${top},${side}) deveria cair em (-0.4,-0.9), caiu ${t ? t.x.toFixed(2) + ',' + t.z.toFixed(2) : 'fora'}`);
  }
}

{
  // Ajuda na mira: batidas ruins (longa, na rede, aberta) entram com ajuda alta; boa não muda.
  const firstBounce = (v) => {
    const b = makeBall(); Object.assign(b, { px: 0.1, py: 0.95, pz: 1.55, ...v });
    const ev = []; run(b, 2, ev);
    return ev.find(e => e.type === 'table' || e.type === 'floor');
  };
  const cases = { longa: { vx: 0, vy: 2.5, vz: -12 }, rede: { vx: 0, vy: -1.5, vz: -9 }, aberta: { vx: 3, vy: 1, vz: -8 } };
  for (const [name, v] of Object.entries(cases)) {
    const raw = firstBounce(v);
    ok(!(raw.type === 'table' && raw.side === 1), `caso de teste "${name}" deveria errar sem ajuda`);
    const b = makeBall(); Object.assign(b, { px: 0.1, py: 0.95, pz: 1.55, ...v });
    assistShot(b, 1);
    const fixed = firstBounce({ vx: b.vx, vy: b.vy, vz: b.vz });
    ok(fixed.type === 'table' && fixed.side === 1, `batida "${name}" com ajuda total deveria cair na mesa do adversário`);
  }
  const good = makeBall(); Object.assign(good, { px: 0.1, py: 0.95, pz: 1.55 });
  const sv = solveShot(0.1, 0.95, 1.55, 0.3, -0.8, 8); Object.assign(good, { vx: sv.vx, vy: sv.vy, vz: sv.vz });
  ok(!assistShot(good, 1), 'batida boa não deveria ser alterada pela ajuda');
}

section('Regras');
{
  const r = new Rally(0);
  ok(r.onHit(0) === null, 'saque válido');
  ok(r.onTable(1) === null, 'saque cai do outro lado');
  ok(r.onHit(1) === null, 'devolução');
  const res = r.onTable(1);
  ok(res && res.winner === 0 && res.reason === 'quicou no próprio lado', 'quicar no próprio lado é ponto do outro');
}
{
  const r = new Rally(1); r.onHit(1); r.onTable(0); const res = r.onTable(0);
  ok(res && res.winner === 1, 'dois quiques sem devolver: ponto de quem bateu');
}
{
  const r = new Rally(0); r.onHit(0); const res = r.onFloor();
  ok(res && res.winner === 1, 'bola direto no chão: ponto do outro');
}
{
  const r = new Rally(0); r.onHit(0); r.onNet(); const res = r.onTable(1);
  ok(res && res.let, 'saque que toca a rede e entra: repete');
}
{
  const r = new Rally(0); r.onHit(0);
  ok(r.onHit(1, true).winner === 1, 'voleio em bola que ia sair: ponto de quem pegou');
  const r2 = new Rally(0); r2.onHit(0);
  ok(r2.onHit(1, false).winner === 0, 'voleio em bola que ia entrar: ponto de quem bateu');
}
{
  const m = new Match({ firstServer: 0 });
  const servers = [];
  for (let i = 0; i < 6; i++) { servers.push(m.server); m.addPoint(i % 2); }
  ok(servers.join('') === '001100', `saque a cada 2 pontos (${servers.join('')})`);
  const d = new Match({ firstServer: 0 });
  for (let i = 0; i < 10; i++) { d.addPoint(0); d.addPoint(1); }
  const s1 = d.server; d.addPoint(0); const s2 = d.server;
  ok(s1 !== s2, 'no 10 x 10 o saque troca a cada ponto');
  ok(!d.over, '11 x 10 não termina');
  d.addPoint(0);
  ok(d.over && d.winner === 0, '12 x 10 termina');
  const b3 = new Match({ bestOf: 3, firstServer: 0 });
  for (let i = 0; i < 11; i++) b3.addPoint(1);
  ok(!b3.over && b3.games[1] === 1 && b3.server === 1, 'melhor de 3: segundo game começa com o outro sacando');
}

section('IA e partida');
{
  // Cada adversário consegue devolver uma bola normal.
  for (const p of OPPONENTS) {
    let returned = 0;
    const rng = seeded(7);
    for (let k = 0; k < 20; k++) {
      const ai = new AIPlayer(p, -1, rng);
      const b = makeBall();
      const tx = (rng() * 2 - 1) * 0.5, tz = -0.5 - rng() * 0.7;
      const v = solveShot(0, 1.0, 1.6, tx, tz, 7);
      Object.assign(b, { px: 0, py: 1.0, pz: 1.6, vx: v.vx, vy: v.vy, vz: v.vz });
      ai.planFor(b);
      const ev = [];
      let landed = null;
      for (let t = 0; t < 3; t += DT) {
        stepBall(b, DT, ev);
        const s = ai.tick(DT, b);
        if (s) { Object.assign(b, s); ev.length = 0; landed = 'hit'; }
        if (landed === 'hit') { const e = ev.find(e => e.type === 'table' || e.type === 'floor'); if (e) { landed = e.type === 'table' && e.side === 0 ? 'in' : 'out'; break; } }
      }
      if (landed === 'in') returned++;
    }
    ok(returned >= 12, `${p.name} devolveu ${returned}/20 bolas normais`);
  }
}
section('Duas bolas');
{
  // Duas raquetes: a mesma colisão contínua com duas poses pega duas bolas ao mesmo tempo.
  const pads = [-0.3, 0.3].map(x => ({ r: 0.075, vx: 0, vy: 0, vz: -3, x }));
  const balls = [-0.3, 0.3].map(x => { const b = makeBall(); Object.assign(b, { px: x, py: 1, pz: 1.2, vz: 8 }); return b; });
  const hit = [false, false];
  let pz = 1.6;
  for (let i = 0; i < 80; i++) {
    const nz = pz - 3 * DT;
    for (let k = 0; k < 2; k++) {
      if (hit[k]) continue;
      const b = balls[k];
      const prev = { px: b.px, py: b.py, pz: b.pz };
      stepBall(b, DT);
      for (const pd of pads) {
        Object.assign(pd, { ax: pd.x, ay: 1, az: pz, anx: 0, any: 0, anz: 1, bx: pd.x, by: 1, bz: nz, bnx: 0, bny: 0, bnz: 1 });
        if (paddleHit(b, prev, pd)) { hit[k] = pd.x; break; }
      }
    }
    pz = nz;
  }
  ok(hit[0] === -0.3 && hit[1] === 0.3, 'cada raquete deveria rebater a bola do seu lado');
  ok(balls.every(b => b.vz < 0), 'as duas bolas deveriam voltar');
}
{
  // Rallies independentes: o jogador (humano parado) não devolve nada; cada bola dá um ponto
  // separado ao adversário, e a outra bola continua em jogo quando uma acaba.
  const rng = seeded(31);
  const pts = [];
  const core = new MultiCore({ opponent: OPPONENTS[0], rng, onEvent: (t, d) => { if (t === 'point') pts.push({ ...d, others: core.slots.filter(s => s.idx !== d.slot).map(s => s.state) }); } });
  let n = 0;
  while (pts.length < 2 && n++ < 240 * 10) core.step(null);
  ok(pts.length === 2 && pts[0].slot !== pts[1].slot, `dois pontos de bolas diferentes (${pts.map(p => p.slot).join(',')})`);
  ok(pts.every(p => p.winner === 1), 'bola não devolvida: ponto do adversário');
  ok(core.match.score[1] === 2 && core.match.score[0] === 0, `placar único 0 x 2 (${core.match.score})`);
  ok(pts[0].others.includes('rally') || pts[0].others.includes('ready') || pts[0].others.includes('hidden'), 'a outra bola segue a vida dela');
  ok(core.slots.every(s => s.launcher === 0), 'quem perdeu o ponto daquela bola relança pela sua máquina');
  const launches = [];
  core.onEvent = (t, d) => { if (t === 'launch') launches.push(d); };
  n = 0;
  while (launches.length < 1 && n++ < 240 * 5) core.step(null);
  ok(launches.length === 1 && launches[0].launcher === 0, 'bola volta em jogo sozinha, saindo do lado de quem perdeu');
}
{
  // Ponto de uma bola não mexe no rally da outra.
  const rng = seeded(32);
  const core = new MultiCore({ opponent: OPPONENTS[0], playerAI: new TwoHands(OPPONENTS[0], 1, rng), rng });
  let n = 0;
  while (core.ballsInPlay < 2 && n++ < 240 * 6) core.step();
  ok(core.ballsInPlay === 2, 'as duas bolas entram em jogo');
  const [a, b] = core.slots;
  const rallyB = b.rally;
  core._resolve(a, { winner: 0, reason: 'teste' });
  ok(b.state === 'rally' && b.rally === rallyB && !rallyB.result, 'o rally da outra bola continua igual');
  ok(a.state === 'over' && core.match.score[0] === 1, 'só a bola do ponto sai de jogo');
}
{
  // Terceira bola: entra quando alguém chega a 8, só com os adversários que têm `third`.
  for (const [opp, want] of [[3, true], [4, true], [0, false]]) {
    const rng = seeded(33);
    let third = 0;
    const core = new MultiCore({ opponent: OPPONENTS[opp], playerAI: new TwoHands(OPPONENTS[0], 1, rng), rng, onEvent: (t) => { if (t === 'thirdBall') third++; } });
    for (let i = 0; i < THIRD_AT - 1; i++) core.match.addPoint(1);
    core._resolve(core.slots[0], { winner: 1, reason: 'teste' });
    ok((third === 1) === want && (core.slots.length === 3) === want, `${OPPONENTS[opp].name}: bola verde ${want ? 'deveria' : 'não deveria'} entrar no 8`);
    if (want) {
      ok(core.slots[2].id === 'verde' && core.slots[2].launcher === 0, 'a verde sai do lado de quem está atrás');
      core._resolve(core.slots[1], { winner: 1, reason: 'teste' });
      ok(core.slots.length === 3, 'a terceira bola entra uma vez só');
      let n = 0;
      while (core.slots[2].state !== 'rally' && n++ < 240 * 4) core.step();
      ok(core.slots[2].state === 'rally', 'a bola verde entra em jogo');
    }
  }
}
{
  // IA com duas mãos: duas bolas ao mesmo tempo vão para mãos diferentes, e as mãos andam com
  // velocidade limitada (sem teleporte).
  const rng = seeded(34);
  const core = new MultiCore({ opponent: OPPONENTS[4], playerAI: new TwoHands(OPPONENTS[4], 1, rng), rng });
  let both = false, maxStep = 0;
  const last = core.ai[1].hands.map(h => ({ ...h.paddle }));
  for (let n = 0; n < 240 * 30; n++) {
    core.step();
    const hs = core.ai[1].hands;
    if (hs[0].slot && hs[1].slot && hs[0].slot !== hs[1].slot) both = true;
    hs.forEach((h, k) => {
      const d = Math.hypot(h.paddle.x - last[k].x, (h.paddle.y - last[k].y) * 0.7, (h.paddle.z - last[k].z) * 0.6);
      maxStep = Math.max(maxStep, d);
      Object.assign(last[k], h.paddle);
    });
    if (core.state !== 'playing') break;
  }
  ok(both, 'as duas mãos deveriam cuidar de bolas diferentes ao mesmo tempo');
  ok(maxStep <= OPPONENTS[4].move * DT * 1.01, `mão andou ${(maxStep / DT).toFixed(2)} m/s num passo (limite ${OPPONENTS[4].move})`);
}

section('Partidas IA x IA');
{
  const results = [];
  for (const [a, b] of [[4, 0], [2, 1], [3, 3]]) {
    let winsA = 0, totalHits = 0, points = 0, thirds = 0;
    for (let m = 0; m < 4; m++) {
      const rng = seeded(100 + m);
      const core = new MultiCore({ opponent: OPPONENTS[b], playerAI: new TwoHands(OPPONENTS[a], 1, rng), rng,
        onEvent: (t) => { if (t === 'hit') totalHits++; if (t === 'point') points++; if (t === 'thirdBall') thirds++; } });
      let steps = 0;
      while (core.state !== 'matchOver' && steps < 240 * 60 * 20) { core.step(); steps++; }
      ok(core.state === 'matchOver', 'partida IA x IA deveria terminar');
      ok(Math.max(...core.match.score) >= 11 || core.match.bestOf > 1, 'partida vai até 11');
      if (core.match.winner === 0) winsA++;
    }
    results.push(`${OPPONENTS[a].name} x ${OPPONENTS[b].name}: ${winsA}/4, ${(totalHits / points).toFixed(1)} batidas por ponto${thirds ? `, bola verde em ${thirds} partidas` : ''}`);
    if (a === 4 && b === 0) ok(winsA >= 3, 'A Dona Tempestade deveria ganhar da Lia Calma quase sempre');
    else ok(totalHits / points > 3, `rallies muito curtos em ${OPPONENTS[a].name} x ${OPPONENTS[b].name}`);
    if (b === 3) ok(thirds === 4, 'com o Professor Malabar a bola verde deveria entrar em toda partida');
  }
  console.log('  ' + results.join('\n  '));
}

console.log(fails ? `\n${fails} de ${count} verificações falharam.` : `\nTudo certo (${count} verificações).`);
process.exit(fails ? 1 : 0);
