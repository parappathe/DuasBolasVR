// Cenário: ginásio de escola à noite (quadra de madeira, janelas com o céu escuro, luzes de
// teto), mesa, rede, placar de parede, torcida de alunos, as máquinas lançadoras, as bolas e o
// adversário com duas raquetes. Tudo gerado por código (sem modelos nem imagens).
import * as THREE from '../vendor/three/three.module.js';
import { TABLE, BALL_R } from './physics.js';
import { BALLS, launcherPos } from './game.js';

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return { tex: t, canvas: c, ctx: g };
}

function rand(seed) { let s = seed; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }

const HALL = { w: 16, d: 22, h: 7.5, zc: -3 }; // tamanho do ginásio, centro em z = -3

export function buildScene() {
  const R = rand(777);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0c1424);
  scene.fog = new THREE.Fog(0x1a2232, 18, 34);

  scene.add(new THREE.HemisphereLight(0xeaf2ff, 0x5a4630, 1.7));
  const top = new THREE.DirectionalLight(0xffffff, 1.3);
  top.position.set(1, 7, 2);
  scene.add(top);

  // Piso de tacos com as linhas da quadra de basquete.
  const floorTex = canvasTex(1024, 1024, (g, w, h) => {
    for (let y = 0; y < h; y += 8) {
      for (let x = (y / 8) % 2 ? -20 : 0; x < w; x += 40) {
        g.fillStyle = `hsl(34, ${45 + R() * 10}%, ${52 + R() * 10}%)`;
        g.fillRect(x, y, 39, 7);
      }
    }
    g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 6;
    g.strokeRect(60, 40, w - 120, h - 80);
    g.beginPath(); g.moveTo(60, h / 2); g.lineTo(w - 60, h / 2); g.stroke();
    g.beginPath(); g.arc(w / 2, h / 2, 90, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = 'rgba(30,80,200,0.8)';
    for (const y of [40, h - 40]) { g.beginPath(); g.arc(w / 2, y, 260, y < h / 2 ? 0 : Math.PI, y < h / 2 ? Math.PI : Math.PI * 2); g.stroke(); }
  });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(HALL.w, HALL.d), new THREE.MeshLambertMaterial({ map: floorTex.tex }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.z = HALL.zc;
  scene.add(floor);

  // Paredes: faixa azul embaixo, creme em cima, janelas altas com céu de noite e lua.
  const wallTex = canvasTex(1024, 512, (g, w, h) => {
    g.fillStyle = '#e6dcc4'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#2a4fa8'; g.fillRect(0, h * 0.72, w, h * 0.28);
    g.fillStyle = '#f2c94c'; g.fillRect(0, h * 0.7, w, h * 0.025);
    for (let x = 40; x < w; x += 200) {
      const sky = g.createLinearGradient(0, 40, 0, 200);
      sky.addColorStop(0, '#0a1430'); sky.addColorStop(1, '#23386a');
      g.fillStyle = '#8a8a8a'; g.fillRect(x - 6, 34, 132, 182);
      g.fillStyle = sky; g.fillRect(x, 40, 120, 170);
      g.fillStyle = 'rgba(255,255,255,0.8)';
      for (let k = 0; k < 6; k++) g.fillRect(x + R() * 116, 44 + R() * 150, 2, 2);
      g.fillStyle = '#8a8a8a'; g.fillRect(x + 58, 40, 4, 170); g.fillRect(x, 122, 120, 4);
    }
  });
  const moonTex = canvasTex(128, 128, (g, w, h) => {
    const gr = g.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, 60);
    gr.addColorStop(0, '#fffbe8'); gr.addColorStop(0.45, '#fff3c0'); gr.addColorStop(0.5, 'rgba(255,240,190,0.25)'); gr.addColorStop(1, 'rgba(255,240,190,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
  const wallMat = new THREE.MeshLambertMaterial({ map: wallTex.tex });
  const addWall = (x, z, len, rotY) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(len, HALL.h), wallMat);
    m.position.set(x, HALL.h / 2, z); m.rotation.y = rotY;
    scene.add(m);
  };
  const zb = HALL.zc - HALL.d / 2, zf = HALL.zc + HALL.d / 2;
  addWall(0, zb, HALL.w, 0);
  addWall(0, zf, HALL.w, Math.PI);
  addWall(-HALL.w / 2, HALL.zc, HALL.d, Math.PI / 2);
  addWall(HALL.w / 2, HALL.zc, HALL.d, -Math.PI / 2);
  const moon = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), new THREE.MeshBasicMaterial({ map: moonTex.tex, transparent: true, depthWrite: false }));
  moon.position.set(-HALL.w / 2 + 0.02, 6.2, -6.5); moon.rotation.y = Math.PI / 2;
  scene.add(moon);
  // Teto com treliça e luminárias.
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(HALL.w, HALL.d), new THREE.MeshLambertMaterial({ color: 0x3a3f4a }));
  ceil.rotation.x = Math.PI / 2; ceil.position.set(0, HALL.h, HALL.zc);
  scene.add(ceil);
  const beamMat = new THREE.MeshLambertMaterial({ color: 0x4a505c });
  for (let z = zb + 2; z < zf; z += 3) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(HALL.w, 0.25, 0.2), beamMat);
    beam.position.set(0, HALL.h - 0.3, z);
    scene.add(beam);
  }
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xf4f8ff });
  for (const x of [-3, 0, 3]) for (let z = zb + 3.5; z < zf - 1; z += 3) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.06, 0.25), lampMat);
    l.position.set(x, HALL.h - 0.55, z);
    scene.add(l);
  }

  // Tabelas de basquete nas paredes do fundo e da frente.
  const boardMat = new THREE.MeshLambertMaterial({ color: 0xf4f4f4 });
  const rimMat = new THREE.MeshLambertMaterial({ color: 0xe0501a });
  for (const [z, dir] of [[zb + 0.05, 1], [zf - 0.05, -1]]) {
    const bb = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.05, 0.04), boardMat);
    bb.position.set(0, 3.4, z + dir * 0.6);
    scene.add(bb);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.6), beamMat);
    arm.position.set(0, 3.4, z + dir * 0.3);
    scene.add(arm);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.23, 0.015, 6, 20), rimMat);
    rim.rotation.x = Math.PI / 2; rim.position.set(0, 3.05, z + dir * 0.88);
    scene.add(rim);
  }

  // Faixas penduradas.
  const banner = (text, color) => canvasTex(512, 160, (g, w, h) => {
    g.fillStyle = color; g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffffff'; g.font = 'bold 64px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2);
  }).tex;
  for (const [x, text, color] of [[-HALL.w / 2 + 0.03, 'JOGOS ESCOLARES', '#c0392b'], [HALL.w / 2 - 0.03, 'DUAS BOLAS', '#2a6fdb']]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(3, 0.94), new THREE.MeshLambertMaterial({ map: banner(text, color) }));
    m.position.set(x, 4.3, -1); m.rotation.y = x < 0 ? Math.PI / 2 : -Math.PI / 2;
    scene.add(m);
  }

  // Mesa (grafite: as bolas azul, laranja e verde aparecem bem nela).
  const topTex = canvasTex(512, 920, (g, w, h) => {
    g.fillStyle = '#2e3440'; g.fillRect(0, 0, w, h);
    const lw = Math.round(w * 0.02 / 1.525);
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, w, lw * 1.2); g.fillRect(0, h - lw * 1.2, w, lw * 1.2);
    g.fillRect(0, 0, lw, h); g.fillRect(w - lw, 0, lw, h);
    g.fillRect(w / 2 - lw * 0.15, 0, lw * 0.3, h);
  });
  const tableGroup = new THREE.Group();
  const topMat = new THREE.MeshPhongMaterial({ map: topTex.tex, shininess: 30, specular: 0x222222 });
  const sideMat = new THREE.MeshLambertMaterial({ color: 0x22262e });
  const tableTop = new THREE.Mesh(new THREE.BoxGeometry(TABLE.halfW * 2, 0.03, TABLE.halfL * 2),
    [sideMat, sideMat, topMat, sideMat, sideMat, sideMat]);
  tableTop.position.y = TABLE.y - 0.015;
  tableGroup.add(tableTop);
  const legMat = new THREE.MeshLambertMaterial({ color: 0x8a9099 });
  for (const sz of [-1, 1]) {
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.06, 0.06), legMat);
    frame.position.set(0, TABLE.y - 0.08, sz * 0.9);
    tableGroup.add(frame);
    for (const sx of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, TABLE.y - 0.05, 0.05), legMat);
      leg.position.set(sx * 0.6, (TABLE.y - 0.05) / 2, sz * 0.9);
      tableGroup.add(leg);
    }
  }
  const netW = (TABLE.halfW + TABLE.netOver) * 2;
  const netTex = canvasTex(512, 64, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.strokeStyle = 'rgba(230,230,230,0.7)'; g.lineWidth = 1.5;
    for (let x = 0; x <= w; x += 6) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    for (let y = 0; y <= h; y += 6) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    g.fillStyle = '#f2f2f2'; g.fillRect(0, 0, w, 7);
  });
  const net = new THREE.Mesh(new THREE.PlaneGeometry(netW, TABLE.netH),
    new THREE.MeshBasicMaterial({ map: netTex.tex, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
  net.position.y = TABLE.y + TABLE.netH / 2;
  tableGroup.add(net);
  for (const sx of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, TABLE.netH + 0.03, 8), legMat);
    post.position.set(sx * netW / 2, TABLE.y + TABLE.netH / 2, 0);
    tableGroup.add(post);
  }
  scene.add(tableGroup);

  // Máquinas lançadoras (uma de cada lado, ao lado da mesa).
  const machineMat = new THREE.MeshLambertMaterial({ color: 0xf2c94c });
  const tubeMat = new THREE.MeshLambertMaterial({ color: 0x2a2f38 });
  const machineLights = [];
  for (const side of [0, 1]) {
    const p = launcherPos(side);
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, p.y - 0.12, 8), tubeMat);
    base.position.y = (p.y - 0.12) / 2;
    g.add(base);
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.18, 0.26), machineMat);
    body.position.y = p.y - 0.12;
    g.add(body);
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.16, 12, 1, true), tubeMat);
    tube.rotation.x = Math.PI / 2 - 0.5;
    tube.position.set(0, p.y - 0.03, 0);
    g.add(tube);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), new THREE.MeshBasicMaterial({ color: 0x333333 }));
    lamp.scale.setScalar(1.6);
    lamp.position.set(0, p.y - 0.02, -0.08); // em cima, atrás do tubo
    g.add(lamp);
    machineLights.push(lamp);
    g.position.set(p.x, 0, p.z);
    // Tubo virado para o centro da mesa do outro lado.
    g.rotation.y = Math.atan2(-p.x, (side === 0 ? -1 : 1) * 1.95);
    scene.add(g);
  }

  // Arquibancada de madeira (fundo e lados) com a torcida de alunos.
  const standMat = new THREE.MeshLambertMaterial({ color: 0x9a6a3a });
  const seats = [];
  const addStand = (cx, cz, len, rotY) => {
    const g = new THREE.Group();
    g.position.set(cx, 0, cz); g.rotation.y = rotY;
    for (let r = 0; r < 5; r++) {
      const step = new THREE.Mesh(new THREE.BoxGeometry(len, 0.4 * (r + 1), 0.7), standMat);
      step.position.set(0, 0.2 * (r + 1), -r * 0.7);
      g.add(step);
      for (let k = 0; k < len / 0.55 - 1; k++) {
        if (R() < 0.3) continue;
        seats.push({ group: g, p: new THREE.Vector3(-len / 2 + 0.45 + k * 0.55 + (R() - 0.5) * 0.1, 0.4 * (r + 1), -r * 0.7) });
      }
    }
    scene.add(g);
    g.updateMatrixWorld(true);
  };
  addStand(0, -9.6, 11, 0);
  addStand(-5.6, -2.5, 9, Math.PI / 2);
  addStand(5.6, -2.5, 9, -Math.PI / 2);
  const crowdGeo = new THREE.CapsuleGeometry(0.16, 0.32, 3, 6);
  crowdGeo.translate(0, 0.33, 0);
  const crowd = new THREE.InstancedMesh(crowdGeo, new THREE.MeshLambertMaterial(), seats.length);
  const shirtColors = [0x2a6fdb, 0xffffff, 0xc0392b, 0xf2c94c, 0x2a6fdb, 0x6fcf97, 0x9b51e0, 0x333333];
  const tmp = new THREE.Object3D(), col = new THREE.Color();
  const crowdBase = [];
  seats.forEach((st, i) => {
    const wp = st.p.clone().applyMatrix4(st.group.matrixWorld);
    crowdBase.push({ wp, phase: R() * Math.PI * 2, jump: 0.5 + R() * 0.5 });
    tmp.position.copy(wp); tmp.updateMatrix();
    crowd.setMatrixAt(i, tmp.matrix);
    crowd.setColorAt(i, col.setHex(shirtColors[i % shirtColors.length]).multiplyScalar(0.7 + R() * 0.3));
  });
  scene.add(crowd);
  let cheerT = 0, cheerAmp = 0;
  const crowdApi = {
    cheer(strength = 1) { cheerT = 1.6; cheerAmp = strength; },
    update(dt, time) {
      if (cheerT <= 0) return;
      cheerT -= dt;
      const k = Math.max(0, cheerT / 1.6) * cheerAmp;
      crowdBase.forEach((c, i) => {
        tmp.position.copy(c.wp);
        tmp.position.y += Math.max(0, Math.sin(time * 9 + c.phase)) * 0.18 * k * c.jump;
        tmp.updateMatrix();
        crowd.setMatrixAt(i, tmp.matrix);
      });
      crowd.instanceMatrix.needsUpdate = true;
    },
  };

  // Placar de parede.
  const board = canvasTex(1024, 512, () => {});
  const boardMesh = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 1.8), new THREE.MeshBasicMaterial({ map: board.tex }));
  boardMesh.position.set(0, 3.6, -7.0); // pendurado no teto, mais perto que a parede
  scene.add(boardMesh);
  const boardFrame = new THREE.Mesh(new THREE.BoxGeometry(3.8, 2.0, 0.08), new THREE.MeshLambertMaterial({ color: 0x1a1a1a }));
  boardFrame.position.set(0, 3.6, -7.05);
  for (const sx of [-1.6, 1.6]) {
    const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, HALL.h - 4.6, 4), beamMat);
    cable.position.set(sx, (HALL.h + 4.6) / 2, -7.05);
    scene.add(cable);
  }
  scene.add(boardFrame);
  const scoreboard = { draw(info) { drawBoard(board.ctx, info); board.tex.needsUpdate = true; } };

  // Bolas (uma malha por cor) e sombras.
  const shadowTex = canvasTex(64, 64, (g, w, h) => {
    const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    gr.addColorStop(0, 'rgba(0,0,0,0.6)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
  const ballGeo = new THREE.SphereGeometry(BALL_R * 1.1, 16, 12);
  const shadowGeo = new THREE.PlaneGeometry(0.07, 0.07);
  const balls = BALLS.map((info) => {
    const c = new THREE.Color(info.color);
    const mesh = new THREE.Mesh(ballGeo, new THREE.MeshLambertMaterial({ color: c, emissive: c.clone().multiplyScalar(0.35) }));
    const shadow = new THREE.Mesh(shadowGeo, new THREE.MeshBasicMaterial({ map: shadowTex.tex, transparent: true, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2;
    mesh.visible = shadow.visible = false;
    scene.add(mesh, shadow);
    return { mesh, shadow };
  });
  // slots: core.slots (ou null). A bola escondida (entre pontos) não aparece.
  const updateBalls = (slots, time) => {
    balls.forEach((bm, i) => {
      const slot = slots?.[i];
      const vis = !!slot && slot.state !== 'hidden';
      bm.mesh.visible = bm.shadow.visible = vis;
      if (!vis) return;
      const b = slot.ball;
      bm.mesh.position.set(b.px, b.py, b.pz);
      if (slot.state === 'ready') bm.mesh.scale.setScalar(1 + Math.sin(time * 18) * 0.15);
      else bm.mesh.scale.setScalar(1);
      const overTable = Math.abs(b.px) <= TABLE.halfW && Math.abs(b.pz) <= TABLE.halfL && b.py >= TABLE.y;
      const gy = overTable ? TABLE.y + 0.001 : 0.004;
      bm.shadow.position.set(b.px, gy, b.pz);
      const s = 1 / (1 + (b.py - gy) * 2);
      bm.shadow.scale.setScalar(s);
      bm.shadow.material.opacity = s;
    });
    // Luz da máquina acende na cor da bola que vai sair.
    machineLights.forEach((lamp, side) => {
      const s = slots?.find(x => x.state === 'ready' && x.launcher === side);
      lamp.material.color.setHex(s ? s.color : 0x333333);
    });
  };

  return { scene, scoreboard, crowd: crowdApi, updateBalls, shadowTex: shadowTex.tex };
}

// Raquete: centro da lâmina na origem, face vermelha virada para +X, cabo para +Z.
export function makePaddle(rubberColor = 0xd23c3c, backColor = 0x1b1b1b) {
  const g = new THREE.Group();
  const r = 0.075;
  const wood = new THREE.MeshLambertMaterial({ color: 0xc9a06a });
  const blade = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.006, 28), wood);
  blade.rotation.z = Math.PI / 2;
  g.add(blade);
  const face = (color, sx) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r - 0.002, r - 0.002, 0.003, 28), new THREE.MeshLambertMaterial({ color }));
    m.rotation.z = Math.PI / 2;
    m.position.x = sx * 0.0045;
    g.add(m);
  };
  face(rubberColor, 1);
  face(backColor, -1);
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.032, 0.1), wood);
  handle.position.z = r + 0.045;
  g.add(handle);
  return g;
}

// Adversário estilizado com dois braços, cada um com a sua raquete.
export function makeOpponent() {
  const g = new THREE.Group();
  const shirt = new THREE.MeshLambertMaterial({ color: 0x888888 });
  const skin = new THREE.MeshLambertMaterial({ color: 0xe0b090 });
  const shorts = new THREE.MeshLambertMaterial({ color: 0x1f2430 });
  const hairMat = new THREE.MeshLambertMaterial({ color: 0x3a2a1a });
  const body = new THREE.Group();
  g.add(body);
  for (const sx of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.065, 0.62, 3, 8), skin);
    leg.position.set(sx * 0.11, 0.42, 0);
    body.add(leg);
  }
  const hips = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.16, 0.22, 12), shorts);
  hips.position.y = 0.86;
  body.add(hips);
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.19, 0.36, 4, 12), shirt);
  torso.position.y = 1.22;
  body.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.115, 16, 12), skin);
  head.position.y = 1.62;
  body.add(head);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), hairMat);
  hair.position.y = 1.64;
  body.add(hair);
  const arms = [], paddles = [];
  for (let k = 0; k < 2; k++) {
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.04, 1, 8), skin);
    arm.geometry.rotateX(Math.PI / 2);
    g.add(arm);
    arms.push(arm);
    const p = makePaddle();
    g.add(p);
    paddles.push(p);
  }
  const shoulder = new THREE.Vector3(), hand = new THREE.Vector3();
  return {
    group: g, paddles,
    setLook(p) {
      shirt.color.setHex(p.shirt); skin.color.setHex(p.skin); hairMat.color.setHex(p.hair ?? 0x3a2a1a);
      for (const pd of paddles) pd.children[1].material.color.setHex(p.rubber);
    },
    // pds: posições das duas raquetes; swings: 0..1 de cada mão.
    update(pds, swings, time) {
      const bx = (pds[0].x + pds[1].x) / 2;
      const bz = Math.min(Math.min(pds[0].z, pds[1].z) - 0.4, -TABLE.halfL - 0.28);
      body.position.set(bx, Math.sin(time * 4) * 0.008, bz);
      body.rotation.y = (Math.sin(swings[0] * Math.PI) - Math.sin(swings[1] * Math.PI)) * 0.2;
      for (let k = 0; k < 2; k++) {
        const pd = pds[k], sw = swings[k];
        const sx = k === 0 ? -1 : 1;
        paddles[k].position.set(pd.x, pd.y, pd.z);
        paddles[k].rotation.set(Math.PI / 2, -Math.PI / 2 + sx * sw * 0.6, 0, 'YXZ');
        shoulder.set(bx + sx * 0.22, 1.36, bz);
        hand.set(pd.x, pd.y - 0.1, pd.z);
        arms[k].position.copy(shoulder).lerp(hand, 0.5);
        arms[k].scale.set(1, 1, shoulder.distanceTo(hand));
        arms[k].lookAt(hand);
      }
    },
  };
}

function drawBoard(g, info) {
  const w = 1024, h = 512;
  g.fillStyle = '#05070c'; g.fillRect(0, 0, w, h);
  g.strokeStyle = '#2a4fa8'; g.lineWidth = 4; g.strokeRect(8, 8, w - 16, h - 16);
  g.textBaseline = 'middle';
  g.fillStyle = '#f2c94c'; g.font = 'bold 34px sans-serif'; g.textAlign = 'center';
  g.fillText(info.round || 'TORNEIO DAS DUAS BOLAS', w / 2, 46);
  const row = (y, name, score, games, color) => {
    g.fillStyle = color; g.fillRect(30, y - 52, 14, 104);
    g.fillStyle = '#e8ecf5'; g.font = 'bold 56px sans-serif'; g.textAlign = 'left';
    g.fillText(name.toUpperCase(), 64, y);
    if (games != null) { g.fillStyle = '#8b97b3'; g.font = 'bold 56px sans-serif'; g.textAlign = 'center'; g.fillText(String(games), 730, y); }
    g.fillStyle = '#ffdf6e'; g.font = 'bold 110px monospace'; g.textAlign = 'right';
    g.fillText(String(score), 980, y + 4);
  };
  row(140, info.pName || 'Você', info.score?.[0] ?? 0, info.showGames ? info.games?.[0] : null, '#33c27a');
  row(270, info.oName || '', info.score?.[1] ?? 0, info.showGames ? info.games?.[1] : null, info.oColor || '#cc4444');
  // Bolinhas: quantas estão em jogo, nas cores delas.
  (info.balls || []).forEach((b, i) => {
    g.fillStyle = '#' + b.color.toString(16).padStart(6, '0');
    g.globalAlpha = b.active ? 1 : 0.25;
    g.beginPath(); g.arc(560 + i * 48, 205, 16, 0, Math.PI * 2); g.fill();
  });
  g.globalAlpha = 1;
  g.fillStyle = '#121a2c'; g.fillRect(24, 380, w - 48, 104);
  g.fillStyle = '#ffffff'; g.font = 'bold 46px sans-serif'; g.textAlign = 'center';
  g.fillText(info.msg || '', w / 2, 432);
}
