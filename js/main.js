// Liga o núcleo do jogo (duas bolas) à tela, aos controles do Quest e ao mouse.
import * as THREE from '../vendor/three/three.module.js';
import { TABLE, DT, paddleHit, solveShot, spinFor, assistShot } from './physics.js';
import { OPPONENTS } from './ai.js';
import { MultiCore, BALLS } from './game.js';
import { buildScene, makePaddle, makeOpponent } from './scene.js';
import { Panel, Label } from './ui.js';
import { Sfx } from './audio.js';
import * as T from './tournament.js';

const save = T.loadState();
const sfx = new Sfx();
// ?mudo no endereço: nunca liga o som (testes automáticos).
sfx.muted = new URLSearchParams(location.search).has('mudo');
sfx.setMusic(!!save.music);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;

// ---------- Render e cena ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
renderer.xr.setFoveation?.(1);
document.getElementById('app').appendChild(renderer.domElement);

const world = buildScene();
const scene = world.scene;
const rig = new THREE.Group();
scene.add(rig);
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.02, 60);
rig.add(camera);
const DESK_CAM = new THREE.Vector3(0, 1.45, 2.55);
function deskCamera() {
  rig.position.set(0, 0, 0); rig.rotation.set(0, 0, 0);
  camera.position.copy(DESK_CAM);
  camera.lookAt(0, 0.88, -0.6);
}
deskCamera();
const VR_HEAD_Z = 2.0;

const opp = makeOpponent();
scene.add(opp.group);

const panel = new Panel(1.1);
panel.mesh.position.set(0, 1.33, 1.25);
scene.add(panel.mesh);

const fpsLabel = new Label(0.14);
fpsLabel.mesh.position.set(0.16, -0.14, -0.6);
fpsLabel.mesh.visible = false;
camera.add(fpsLabel.mesh);

// ---------- Raquetes do jogador: 0 = esquerda, 1 = direita ----------
const MOUSE_Z = 1.5;
const MOUSE_GAP = 0.19; // no PC, as duas raquetes ficam lado a lado, a esta distância do mouse
const MOUSE_R = 0.2;    // alcance de cada raquete no PC (as duas juntas cobrem uns 80 cm sem buraco no meio)
const pads = ['left', 'right'].map((hand, k) => {
  const pivot = new THREE.Group();
  const paddle = makePaddle(0xd23c3c);
  pivot.add(paddle);
  scene.add(pivot);
  return {
    hand, k, pivot, paddle,
    pad: { r: 0.075, vx: 0, vy: 0, vz: 0, ax: 0, ay: 0, az: 0, anx: 1, any: 0, anz: 0, bx: 0, by: 0, bz: 0, bnx: 1, bny: 0, bnz: 0 },
    prev: { c: new THREE.Vector3(), n: new THREE.Vector3(1, 0, 0), valid: false },
    cur: { c: new THREE.Vector3(), n: new THREE.Vector3(1, 0, 0) },
    cooldown: [0, 0, 0], // por bola
  };
});

// ---------- Estado do app ----------
let app = 'menu';     // 'menu' | 'playing' | 'paused' | 'result'
let core = null;
let oppIndex = T.nextOpponent(save);
let screen = 'main';
let optionsBack = 'main';
let boardMsg = '';
let time = 0;
opp.setLook(OPPONENTS[oppIndex]);

// ---------- VR: controles ----------
const hands = { left: null, right: null };
const ctrls = [];
for (let i = 0; i < 2; i++) {
  const ctrl = renderer.xr.getController(i);
  const grip = renderer.xr.getControllerGrip(i);
  rig.add(ctrl); rig.add(grip);
  const laser = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]),
    new THREE.LineBasicMaterial({ color: 0xf2c94c }));
  laser.scale.z = 2; laser.visible = false;
  ctrl.add(laser);
  const entry = { ctrl, grip, laser, source: null, hand: null, prevButtons: [] };
  ctrls.push(entry);
  ctrl.addEventListener('connected', (e) => {
    entry.source = e.data; entry.hand = e.data.handedness;
    if (entry.hand === 'left' || entry.hand === 'right') hands[entry.hand] = entry;
    attachHands();
  });
  ctrl.addEventListener('disconnected', () => {
    if (entry.hand && hands[entry.hand] === entry) hands[entry.hand] = null;
    entry.source = null; entry.hand = null;
    attachHands();
  });
  ctrl.addEventListener('selectstart', () => onTrigger(entry));
}

// Uma raquete em cada controle (no PC, as duas seguem o mouse).
function attachHands() {
  const inVR = renderer.xr.isPresenting;
  for (const p of pads) {
    const h = hands[p.hand];
    if (inVR && h) {
      h.grip.add(p.pivot);
      p.pivot.position.set(0, 0, 0);
      p.pivot.rotation.set(THREE.MathUtils.degToRad(save.angle), 0, 0);
      p.paddle.position.set(0, 0, -0.12);
      p.paddle.rotation.set(0, 0, 0);
      p.pivot.visible = true;
    } else {
      scene.add(p.pivot);
      p.pivot.rotation.set(0, 0, 0);
      p.paddle.position.set(0, 0, 0);
      p.paddle.rotation.set(Math.PI / 2, Math.PI / 2, 0, 'YXZ');
      p.pivot.visible = !inVR; // no VR sem esse controle, a raquete some
    }
    p.prev.valid = false;
  }
}

function pulse(handName, v, ms) {
  try { hands[handName]?.source?.gamepad?.hapticActuators?.[0]?.pulse?.(v, ms); } catch { /* sem vibração */ }
}

function recenter() {
  const e = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
  rig.rotation.set(0, -e.y, 0);
  const head = camera.position.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), -e.y);
  rig.position.set(-head.x, 0, VR_HEAD_Z - head.z);
}

let recenterIn = 0;
renderer.xr.addEventListener('sessionstart', () => { recenterIn = 5; attachHands(); updateHint(); });
renderer.xr.addEventListener('sessionend', () => { deskCamera(); attachHands(); updateHint(); });

// ---------- Mouse (PC) ----------
const mouse = { ndc: new THREE.Vector2(0, -0.3), down: false, x: 0, y: TABLE.y + 0.25 };
const raycaster = new THREE.Raycaster();
const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -MOUSE_Z);
const tmpV = new THREE.Vector3();

renderer.domElement.addEventListener('pointermove', (e) => {
  mouse.ndc.set(e.clientX / window.innerWidth * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
});
renderer.domElement.addEventListener('pointerdown', (e) => {
  sfx.unlock();
  mouse.ndc.set(e.clientX / window.innerWidth * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  mouse.down = true;
  if (panel.visible) {
    raycaster.setFromCamera(mouse.ndc, camera);
    const hit = raycaster.intersectObject(panel.mesh)[0];
    doAction(panel.actionAt(panel.pick(hit?.uv)));
  }
});
window.addEventListener('pointerup', () => { mouse.down = false; });
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') togglePause();
  if (e.key === 'f' || e.key === 'F') { save.fps = !save.fps; T.saveState(save); }
});
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

function updateMousePaddles() {
  if (!dev.autoplay) {
    raycaster.setFromCamera(mouse.ndc, camera);
    if (raycaster.ray.intersectPlane(plane, tmpV)) {
      mouse.x = clamp(tmpV.x, -1.3, 1.3);
      mouse.y = clamp(tmpV.y, TABLE.y + 0.02, 1.7);
    }
  }
}

// ---------- Batidas do jogador ----------
const tmpQ = new THREE.Quaternion();
const lunge = [0, 0];

function readPose(p) {
  p.paddle.updateWorldMatrix(true, false);
  p.paddle.getWorldPosition(p.cur.c);
  p.paddle.getWorldQuaternion(tmpQ);
  p.cur.n.set(1, 0, 0).applyQuaternion(tmpQ);
}

// VR: as duas raquetes têm colisão contínua com cada bola.
function vrHit(ball, prev, slot) {
  for (const p of pads) {
    if (!p.prev.valid || !p.pivot.visible || p.cooldown[slot.idx] > 0) continue;
    if (!paddleHit(ball, prev, p.pad)) continue;
    p.cooldown[slot.idx] = 0.15;
    assistShot(ball, T.ASSIST[save.assist]);
    const sp = Math.hypot(p.pad.vx, p.pad.vy, p.pad.vz);
    pulse(p.hand, clamp(0.3 + sp / 10, 0.3, 1), 35);
    return true;
  }
  return false;
}

// PC: a bola que cruza o plano do mouse perto de uma das duas raquetes é rebatida com jogada
// calculada (lado da raquete que acerta define o lado da mesa).
function mouseHit(ball, prev) {
  if (!(prev.pz < MOUSE_Z && ball.pz >= MOUSE_Z)) return false;
  const f = (MOUSE_Z - prev.pz) / (ball.pz - prev.pz);
  const bx = lerp(prev.px, ball.px, f), by = lerp(prev.py, ball.py, f);
  for (const p of pads) {
    const cx = mouse.x + (p.k === 0 ? -MOUSE_GAP : MOUSE_GAP);
    const off = bx - cx, offY = by - mouse.y;
    if (Math.hypot(off, offY) > MOUSE_R) continue;
    ball.px = bx; ball.py = by; ball.pz = MOUSE_Z;
    const smash = mouse.down;
    const tx = clamp(bx * 0.3 + (off / MOUSE_R) * 0.6, -0.66, 0.66);
    const tz = smash ? -1.1 : -0.8 - Math.random() * 0.3;
    const speed = smash ? 10 : 6.5, top = smash ? 80 : 35;
    const dx = tx - ball.px, dz = tz - ball.pz, dl = Math.hypot(dx, dz);
    const w = spinFor(dx / dl, dz / dl, top, 0);
    const v = solveShot(ball.px, ball.py, ball.pz, tx, tz, speed, w.wx, w.wy, w.wz);
    Object.assign(ball, { vx: v.vx, vy: v.vy, vz: v.vz, wx: w.wx, wy: w.wy, wz: w.wz });
    lunge[p.k] = 1;
    return true;
  }
  return false;
}

// ---------- Partida ----------
function startMatch(i) {
  oppIndex = i;
  const p = OPPONENTS[i];
  opp.setLook(p);
  core = new MultiCore({ opponent: p, bestOf: save.bestOf, onEvent });
  app = 'playing';
  panel.hide();
  boardMsg = p.third ? 'Duas bolas! No 8, entra a verde' : 'Duas bolas! Cada uma vale um ponto';
  drawBoard();
  updateHint();
}

const hex = (c) => '#' + c.toString(16).padStart(6, '0');
function boardInfo() {
  const p = OPPONENTS[oppIndex];
  return {
    round: `RODADA ${oppIndex + 1} DE ${OPPONENTS.length} · ${p.style.toUpperCase()}`,
    pName: 'Você', oName: p.name, oColor: hex(p.shirt),
    score: core ? core.match.score : [0, 0], games: core ? core.match.games : [0, 0],
    showGames: save.bestOf > 1, msg: boardMsg,
    balls: core ? core.slots.map(s => ({ color: s.color, active: s.state === 'rally' || s.state === 'ready' })) : [],
  };
}
const drawBoard = () => world.scoreboard.draw(boardInfo());

function onEvent(type, d) {
  const slot = core?.slots[d.slot];
  const b = slot?.ball;
  const pan = b ? clamp(b.px / 2, -1, 1) : 0;
  switch (type) {
    case 'hit': sfx.hit(Math.hypot(b.vx, b.vy, b.vz) / 15, pan); break;
    case 'table': sfx.bounce(pan); break;
    case 'net': sfx.net(); break;
    case 'floor': sfx.floor(pan); break;
    case 'launch': sfx.launch(d.launcher === 0 ? -0.6 : 0.6); drawBoard(); break;
    case 'ready': drawBoard(); break;
    case 'thirdBall':
      boardMsg = 'Bola verde em jogo! Agora são três';
      sfx.newBall();
      drawBoard();
      break;
    case 'let': boardMsg = `Bola ${slot.name}: rede no lançamento, repete`; drawBoard(); break;
    case 'point': {
      const name = OPPONENTS[oppIndex].name;
      boardMsg = d.winner === 0 ? `Ponto seu na ${d.ballName} (${d.reason})` : `Ponto de ${name} na ${d.ballName}`;
      if (d.gameWon && !d.matchWon) boardMsg = d.winner === 0 ? 'Você venceu o set!' : `${name} venceu o set`;
      if (d.winner === 0) { sfx.cheer(d.gameWon); world.crowd.cheer(d.gameWon ? 1.5 : 1); }
      else sfx.groan();
      drawBoard();
      break;
    }
    case 'matchOver': {
      const won = d.winner === 0;
      if (won && oppIndex === save.beaten) { save.beaten = oppIndex + 1; T.saveState(save); }
      boardMsg = won ? 'VITÓRIA!' : `${OPPONENTS[oppIndex].name} venceu`;
      drawBoard();
      sfx.fanfare(won);
      if (won) world.crowd.cheer(2);
      lastResult = { won, i: oppIndex, score: [...core.match.score], games: [...core.match.games] };
      setTimeout(() => { if (app === 'playing') { app = 'result'; showScreen('result'); } }, 1200);
      break;
    }
  }
}
let lastResult = null;

function togglePause() {
  if (app === 'playing') { app = 'paused'; showScreen('pause'); }
  else if (app === 'paused' && screen === 'pause') { app = 'playing'; panel.hide(); updateHint(); }
}

// ---------- Telas do painel ----------
const PW = 1024;
function showScreen(name) {
  screen = name;
  panel.show((p) => SCREENS[name](p));
  updateHint();
}

const SCREENS = {
  main(p) {
    p.title('Torneio das Duas Bolas', 58);
    const champ = T.isChampion(save);
    p.text(champ ? 'Você venceu o torneio! Pode jogar de novo com qualquer um.' : 'Uma raquete em cada mão, duas bolas na mesa. Vença os 5 em sequência:', PW / 2, 108, { size: 26, color: '#8b97b3' });
    OPPONENTS.forEach((o, i) => {
      p.row(140 + i * 96, {
        num: i + 1, name: o.name, style: o.style, desc: o.desc, status: T.statusOf(save, i),
        action: 'play:' + i, color: hex(o.shirt),
      });
    });
    const bw = 296, y = 628;
    const next = T.nextOpponent(save);
    p.button(champ ? 'Jogar a final' : `Jogar: ${OPPONENTS[next].name}`, 'play:' + next, 40, y, bw + 40, 70, { size: 28, on: true });
    p.button('Opções', 'options', 40 + bw + 56, y, bw - 20, 70);
    p.button('Recomeçar torneio', 'askReset', 40 + bw * 2 + 52, y, bw + 4, 70, { size: 28 });
  },
  options(p) {
    p.title('Opções', 58);
    const line = (y, label, items, current, key) => {
      p.text(label, 50, y + 34, { size: 30, align: 'left', bold: true });
      const x0 = 400, w = (PW - 50 - x0 - (items.length - 1) * 10) / items.length;
      items.forEach(([val, txt], i) => p.button(txt, `set:${key}:${val}`, x0 + i * (w + 10), y, w, 68, { on: String(current) === String(val), size: 28 }));
    };
    line(110, 'Ajuda na mira', Object.keys(T.ASSIST).map(k => [k, T.ASSIST_LABEL[k]]), save.assist, 'assist');
    line(195, 'Ângulo das raquetes', [[-30, '-30°'], [-15, '-15°'], [0, '0°'], [15, '+15°'], [30, '+30°']], save.angle, 'angle');
    line(280, 'Partida', [[1, '1 set de 11'], [3, 'Melhor de 3']], save.bestOf, 'bestOf');
    line(365, 'Música', [[1, 'Sim'], [0, 'Não']], save.music ? 1 : 0, 'music');
    line(450, 'Mostrar FPS', [[1, 'Sim'], [0, 'Não']], save.fps ? 1 : 0, 'fps');
    p.text('Ajuda na mira corrige batidas que iam para fora. Ângulo: inclina as raquetes nas mãos (VR).', PW / 2, 560, { size: 22, color: '#8b97b3' });
    p.button('Voltar', 'back', PW / 2 - 160, 610, 320, 76, { on: true });
  },
  pause(p) {
    p.title('Pausa', 70);
    const s = core.match.score;
    p.text(`Você ${s[0]} x ${s[1]} ${OPPONENTS[oppIndex].name}`, PW / 2, 140, { size: 36 });
    const vr = renderer.xr.isPresenting;
    const items = [['Continuar', 'resume'], ...(vr ? [['Recentralizar', 'recenter']] : []), ['Opções', 'options'], ['Desistir da partida', 'quit']];
    items.forEach(([t, a], i) => p.button(t, a, PW / 2 - 230, 200 + i * 104, 460, 84, { on: i === 0 }));
  },
  result(p) {
    const r = lastResult;
    const o = OPPONENTS[r.i];
    const champNow = r.won && r.i === OPPONENTS.length - 1;
    p.title(champNow ? 'CAMPEÃO DO TORNEIO!' : r.won ? 'Vitória!' : 'Derrota', 80);
    const sc = save.bestOf > 1 ? `sets ${r.games[0]} x ${r.games[1]}` : `${r.score[0]} x ${r.score[1]}`;
    p.text(`Você ${sc} ${o.name}`, PW / 2, 170, { size: 40 });
    if (champNow) p.text('Você venceu os 5 adversários.', PW / 2, 230, { size: 30, color: '#8b97b3' });
    else if (r.won) p.text(`Próximo: ${OPPONENTS[r.i + 1].name} (${OPPONENTS[r.i + 1].style})`, PW / 2, 230, { size: 30, color: '#8b97b3' });
    else p.text('Tente de novo: cada partida é diferente.', PW / 2, 230, { size: 30, color: '#8b97b3' });
    const btns = [];
    if (r.won && !champNow) btns.push(['Próximo adversário', 'play:' + (r.i + 1)]);
    btns.push([r.won ? 'Jogar de novo' : 'Tentar de novo', 'play:' + r.i]);
    btns.push(['Menu do torneio', 'menu']);
    btns.forEach(([t, a], i) => p.button(t, a, PW / 2 - 250, 300 + i * 110, 500, 88, { on: i === 0 }));
  },
  confirmReset(p) {
    p.title('Recomeçar o torneio?', 150);
    p.text('As vitórias salvas serão apagadas. As opções continuam.', PW / 2, 240, { size: 30, color: '#8b97b3' });
    p.button('Sim, recomeçar', 'reset', PW / 2 - 330, 360, 300, 90);
    p.button('Não', 'main', PW / 2 + 30, 360, 300, 90, { on: true });
  },
};

function doAction(a) {
  if (!a) return;
  sfx.unlock();
  sfx.click();
  if (a.startsWith('play:')) { startMatch(Number(a.slice(5))); return; }
  if (a.startsWith('set:')) {
    const [, key, val] = a.split(':');
    if (key === 'assist') save.assist = val;
    else if (key === 'angle') save.angle = Number(val);
    else if (key === 'bestOf') save.bestOf = Number(val);
    else if (key === 'fps') save.fps = val === '1';
    else if (key === 'music') { save.music = val === '1'; sfx.setMusic(save.music); }
    T.saveState(save);
    attachHands();
    showScreen('options');
    return;
  }
  switch (a) {
    case 'options': optionsBack = screen; showScreen('options'); break;
    case 'back': showScreen(optionsBack === 'options' ? 'main' : optionsBack); break;
    case 'askReset': showScreen('confirmReset'); break;
    case 'reset': save.beaten = 0; T.saveState(save); goMenu(); break;
    case 'main': showScreen('main'); break;
    case 'menu': goMenu(); break;
    case 'resume': app = 'playing'; panel.hide(); updateHint(); break;
    case 'recenter': recenter(); break;
    case 'quit': goMenu(); break;
  }
}

function goMenu() {
  app = 'menu';
  core = null;
  oppIndex = T.nextOpponent(save);
  opp.setLook(OPPONENTS[oppIndex]);
  boardMsg = 'Escolha um adversário';
  drawBoard();
  showScreen('main');
}

function onTrigger(entry) {
  sfx.unlock();
  if (panel.visible && entry.hoverIndex >= 0) doAction(panel.actionAt(entry.hoverIndex));
}

// B/Y pausam.
function pollButtons() {
  for (const e of ctrls) {
    const gp = e.source?.gamepad;
    if (!gp) continue;
    const pressed = (i) => !!gp.buttons[i]?.pressed;
    if (pressed(5) && !e.prevButtons[5]) togglePause();
    e.prevButtons = gp.buttons.map(b => b.pressed);
  }
}

// ---------- Raio do menu (VR) ----------
const rayOrigin = new THREE.Vector3(), rayDir = new THREE.Vector3();
function updateMenuRays() {
  const vr = renderer.xr.isPresenting;
  let hover = -1;
  for (const e of ctrls) {
    e.hoverIndex = -1;
    e.laser.visible = vr && panel.visible && !!e.source;
    if (!e.laser.visible) continue;
    e.ctrl.getWorldPosition(rayOrigin);
    e.ctrl.getWorldQuaternion(tmpQ);
    rayDir.set(0, 0, -1).applyQuaternion(tmpQ);
    raycaster.set(rayOrigin, rayDir);
    const hit = raycaster.intersectObject(panel.mesh)[0];
    e.laser.scale.z = hit ? hit.distance : 2;
    e.hoverIndex = panel.pick(hit?.uv);
    if (e.hoverIndex >= 0) hover = e.hoverIndex;
  }
  if (!vr && panel.visible) {
    raycaster.setFromCamera(mouse.ndc, camera);
    hover = panel.pick(raycaster.intersectObject(panel.mesh)[0]?.uv);
    renderer.domElement.style.cursor = hover >= 0 && panel.actionAt(hover) ? 'pointer' : 'default';
  } else renderer.domElement.style.cursor = 'default';
  if (panel.visible) panel.setHover(hover);
}

// ---------- HTML (PC) ----------
const hintEl = document.getElementById('hint');
const fpsEl = document.getElementById('fps');
function updateHint() {
  if (renderer.xr.isPresenting) { hintEl.textContent = ''; return; }
  hintEl.textContent = app === 'playing'
    ? 'Mouse move as duas raquetes · segure o botão na batida para cortar · Esc pausa'
    : 'Clique nas opções do painel · No Quest, use o botão "Entrar em VR"';
}

const vrBtn = document.getElementById('vr');
async function setupVR() {
  const ok = navigator.xr && await navigator.xr.isSessionSupported('immersive-vr').catch(() => false);
  if (!ok) {
    vrBtn.textContent = window.isSecureContext ? 'VR não disponível neste navegador' : 'VR precisa de HTTPS (veja o CLAUDE.md)';
    vrBtn.disabled = true;
    return;
  }
  vrBtn.textContent = 'Entrar em VR';
  vrBtn.disabled = false;
  vrBtn.onclick = async () => {
    sfx.unlock();
    if (renderer.xr.isPresenting) { renderer.xr.getSession()?.end(); return; }
    try {
      const session = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor'] });
      await renderer.xr.setSession(session);
      vrBtn.textContent = 'Sair do VR';
      session.addEventListener('end', () => { vrBtn.textContent = 'Entrar em VR'; });
    } catch (err) {
      vrBtn.textContent = 'Erro ao entrar em VR';
      console.error(err);
    }
  };
}
setupVR();

// ---------- Laço principal ----------
let acc = 0, lastT = performance.now(), padElapsed = 0;
let fpsFrames = 0, fpsTime = 0;
const nTmp = new THREE.Vector3();

function setPad(p, fa, fb) {
  const a = p.prev.c, b = p.cur.c, pd = p.pad;
  pd.ax = lerp(a.x, b.x, fa); pd.ay = lerp(a.y, b.y, fa); pd.az = lerp(a.z, b.z, fa);
  pd.bx = lerp(a.x, b.x, fb); pd.by = lerp(a.y, b.y, fb); pd.bz = lerp(a.z, b.z, fb);
  nTmp.copy(p.prev.n).lerp(p.cur.n, fa).normalize();
  pd.anx = nTmp.x; pd.any = nTmp.y; pd.anz = nTmp.z;
  nTmp.copy(p.prev.n).lerp(p.cur.n, fb).normalize();
  pd.bnx = nTmp.x; pd.bny = nTmp.y; pd.bnz = nTmp.z;
}

function frame() {
  const now = performance.now();
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;
  time += dt;
  const vr = renderer.xr.isPresenting;

  if (recenterIn > 0 && --recenterIn === 0) recenter();
  pollButtons();

  if (!vr) {
    updateMousePaddles();
    if (dev.autoplay) autoplay();
    for (const p of pads) {
      lunge[p.k] = Math.max(0, lunge[p.k] - dt * 6);
      p.pivot.position.set(mouse.x + (p.k === 0 ? -MOUSE_GAP : MOUSE_GAP), mouse.y, MOUSE_Z - Math.sin(lunge[p.k] * Math.PI) * 0.12);
    }
  }
  for (const p of pads) readPose(p);

  if (app === 'playing' && core) {
    acc += dt;
    padElapsed += dt;
    const n = Math.min(12, Math.floor(acc / DT));
    if (n > 0) {
      for (const p of pads) {
        if (p.prev.valid && padElapsed > 0) {
          p.pad.vx = (p.cur.c.x - p.prev.c.x) / padElapsed;
          p.pad.vy = (p.cur.c.y - p.prev.c.y) / padElapsed;
          p.pad.vz = (p.cur.c.z - p.prev.c.z) / padElapsed;
        }
      }
      for (let k = 0; k < n; k++) {
        for (const p of pads) {
          setPad(p, k / n, (k + 1) / n);
          for (let i = 0; i < 3; i++) p.cooldown[i] = Math.max(0, p.cooldown[i] - DT);
        }
        core.step(vr ? vrHit : mouseHit);
      }
      acc -= n * DT;
      if (acc > DT * 4) acc = 0;
      for (const p of pads) { p.prev.c.copy(p.cur.c); p.prev.n.copy(p.cur.n); p.prev.valid = true; }
      padElapsed = 0;
    }
  } else {
    for (const p of pads) { p.prev.c.copy(p.cur.c); p.prev.n.copy(p.cur.n); p.prev.valid = true; }
    padElapsed = 0; acc = 0;
  }

  // Adversário
  if (core) { const hs = core.ai[1].hands; opp.update([hs[0].paddle, hs[1].paddle], [hs[0].swing, hs[1].swing], time); }
  else {
    const y = TABLE.y + 0.25, sw = Math.sin(time * 0.7) * 0.1;
    opp.update([{ x: -0.36 + sw, y, z: -1.9 }, { x: 0.36 + sw, y, z: -1.9 }], [0, 0], time);
  }

  world.updateBalls(core ? core.slots : null, time);
  world.crowd.update(dt, time);
  updateMenuRays();

  fpsFrames++; fpsTime += dt;
  if (fpsTime >= 0.5) {
    const f = Math.round(fpsFrames / fpsTime);
    fpsFrames = 0; fpsTime = 0;
    fpsEl.style.display = save.fps && !vr ? 'block' : 'none';
    fpsEl.textContent = `${f} FPS`;
    fpsLabel.mesh.visible = save.fps && vr;
    fpsLabel.set(`${f} FPS`);
  }

  renderer.render(scene, camera);
}

attachHands();
goMenu();
renderer.setAnimationLoop(frame);

// Para testes no console: window.dbvr (autoplay = as raquetes do mouse vão até a próxima bola).
const dev = { autoplay: false };
function autoplay() {
  if (!core) return;
  let best = null, bestT = Infinity;
  for (const s of core.slots) {
    const b = s.ball;
    if (s.state !== 'rally' || s.rally.lastHitter === 0 || b.vz <= 0 || b.pz > MOUSE_Z) continue;
    const t = (MOUSE_Z - b.pz) / b.vz;
    if (t < bestT) { bestT = t; best = b; }
  }
  if (!best) return;
  // A raquete mais perto da bola vai até ela (a outra fica ao lado).
  const side = best.px < mouse.x ? -1 : 1;
  mouse.x = clamp(best.px - side * MOUSE_GAP, -1.3, 1.3);
  mouse.y = clamp(best.py, TABLE.y + 0.05, 1.7);
}
// advance(s): roda s segundos de jogo na hora, a 72 quadros/s (o painel escondido não anima).
dev.advance = (sec) => { for (let i = 0; i < sec * 72; i++) { lastT = performance.now() - 1000 / 72; frame(); } };
dev.state = () => core ? {
  app, state: core.state, score: [...core.match.score], games: [...core.match.games], msg: boardMsg,
  balls: core.slots.map(s => ({ cor: s.name, estado: s.state, lancador: s.launcher, z: +s.ball.pz.toFixed(2) })),
} : { app };
window.dbvr = { get core() { return core; }, save, startMatch, doAction, dev, mouse, renderer, scene, camera, BALLS };
