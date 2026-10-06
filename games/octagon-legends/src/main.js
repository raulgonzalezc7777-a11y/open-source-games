import * as THREE from 'three';
import { createRenderer } from './render/renderer.js';
import { createArena } from './render/arena.js';
import { Fighter, FIGHTER_PROFILES } from './fighter/Fighter.js';
import { FightSim } from './combat/index.js';
import { createInput } from './input.js';
import { createFightCamera } from './camera.js';
import { createHUD } from './ui/hud.js';
import { createMenus } from './ui/menus.js';
import { createAudio } from './audio.js';
import { loadProgression } from './progression.js';
import './ui/ui.css';

// ?debug=fight|ko|menu  &p1=0&p2=3  &anim=headKick&phase=0.5  &t=seconds-to-simulate  &cam=fight|hero|broadcast|ko
const Q = new URLSearchParams(location.search);
const DEBUG = Q.get('debug');

const canvas = document.getElementById('game');
const uiRoot = document.getElementById('ui');
const gfx = createRenderer(canvas);
const { scene, camera } = gfx;
const arena = createArena(scene, gfx.renderer);
const cam = createFightCamera(camera);
const input = createInput();
const audio = createAudio();
const progression = loadProgression();
const hud = createHUD(uiRoot);
hud.hide();

const game = {
  state: 'title', // title | menu | intro | fight | roundBreak | ko | results | paused
  sim: null,
  fighters: [null, null],
  config: null,
  timeScale: 1,
  slowmo: 0,
  stateTime: 0,
  koInfo: null,
  hitstop: 0,
};

const _p0 = new THREE.Vector3();
const _p1 = new THREE.Vector3();
const _tmp = new THREE.Vector3();
const _fwd = new THREE.Vector3();

function disposeFighters() {
  for (const f of game.fighters) if (f) { scene.remove(f.root); f.dispose(); }
  game.fighters = [null, null];
}

function spawnFighters(i0, i1) {
  disposeFighters();
  game.fighters = [new Fighter(scene, FIGHTER_PROFILES[i0]), new Fighter(scene, FIGHTER_PROFILES[i1])];
  game.fighters[0].root.position.set(0, 0, -1.6);
  game.fighters[1].root.position.set(0, 0, 1.6);
  game.fighters[1].root.rotation.y = Math.PI;
}

function startFight(cfg) {
  game.config = cfg;
  spawnFighters(cfg.p1Index, cfg.p2Index);
  game.sim = new FightSim({
    p1Profile: FIGHTER_PROFILES[cfg.p1Index],
    p2Profile: FIGHTER_PROFILES[cfg.p2Index],
    radius: arena.radius,
    rounds: cfg.rounds ?? 3,
    roundTime: cfg.roundTime ?? 120,
    difficulty: cfg.difficulty ?? 'normal',
    seed: cfg.seed ?? (Date.now() & 0xffff),
  });
  hud.setFighters(FIGHTER_PROFILES[cfg.p1Index], FIGHTER_PROFILES[cfg.p2Index]);
  hud.show();
  syncFighters(0);
  cam.setMode('fight');
  cam.update(0.016, _p0, _p1); cam.snap();
  beginRound();
}

function beginRound() {
  game.state = 'intro';
  game.stateTime = 0;
  hud.showRoundCard(game.sim.round);
  audio.bell();
  audio.announcer(game.sim.round === 1 ? '¡Peleen!' : `Asalto ${game.sim.round}`);
  arena.crowdExcite(0.6);
}

function syncFighters(dt) {
  const sim = game.sim;
  for (let i = 0; i < 2; i++) {
    const F = sim.fighters[i];
    const f = game.fighters[i];
    f.root.position.set(F.pos.x, F.pos.y || 0, F.pos.z);
    f.root.rotation.y = F.facing;
    f.update(dt, F.state);
    const h = F.state.health;
    f.setDamage({ head: 1 - h.head, body: 1 - h.body, legs: 1 - h.legs });
    f.setSweat(Math.min(1, 0.15 + (sim.elapsed ?? 0) / 300 + (1 - F.state.stamina) * 0.3));
  }
  _p0.copy(game.fighters[0].root.position);
  _p1.copy(game.fighters[1].root.position);
}

/** Converts camera-relative stick input into fighter-local movement. */
function toLocalInput(raw, fighterIndex) {
  const F = game.sim.fighters[fighterIndex];
  camera.getWorldDirection(_fwd); _fwd.y = 0; _fwd.normalize();
  const right = _tmp.set(-_fwd.z, 0, _fwd.x);
  const wx = right.x * raw.moveX + _fwd.x * raw.moveZ;
  const wz = right.z * raw.moveX + _fwd.z * raw.moveZ;
  const s = Math.sin(F.facing), c = Math.cos(F.facing);
  // Fighter local +Z is (sin, cos) in world space; local +X is (cos, -sin).
  return { ...raw, moveX: wx * c - wz * s, moveZ: wx * s + wz * c };
}

function project(p) {
  _tmp.copy(p).project(camera);
  return { x: (_tmp.x * 0.5 + 0.5) * innerWidth, y: (-_tmp.y * 0.5 + 0.5) * innerHeight, ndc: { x: _tmp.x, y: _tmp.y } };
}

function handleEvents() {
  const sim = game.sim;
  for (const ev of sim.events.splice(0)) {
    const att = ev.side;
    const def = 1 - att;
    switch (ev.type) {
      case 'hit': {
        const strength = Math.min(1, ev.damage / 14 + (ev.counter ? 0.3 : 0));
        const isKick = /Kick|Knee/.test(ev.move || '');
        isKick ? audio.kick(strength) : audio.punch(strength, ev.zone);
        if (ev.point) {
          const dir = _tmp.subVectors(game.fighters[def].root.position, game.fighters[att].root.position).setY(0).normalize();
          game.fighters[def].flinch(ev.zone, dir.clone(), strength);
          const sp = project(ev.point);
          hud.damagePopup(sp.x, sp.y, Math.round(ev.damage), ev.counter);
          gfx.impact(strength, sp.ndc);
        }
        cam.shake(0.25 + strength * 0.7);
        cam.kickFov(strength * 0.6);
        game.hitstop = Math.max(game.hitstop, 0.03 + strength * 0.07);
        if (ev.counter) hud.showMessage('CONTRAGOLPE', 'counter');
        if (ev.combo >= 3) hud.showMessage(`COMBO x${ev.combo}`, 'combo');
        arena.crowdExcite(0.3 + strength * 0.5);
        audio.crowd(0.45 + strength * 0.4);
        break;
      }
      case 'block': audio.block(); cam.shake(0.08); break;
      case 'whiff': audio.whiff(); break;
      case 'special':
        hud.showMessage('ESPECIAL', 'special');
        game.slowmo = Math.max(game.slowmo, 0.6);
        break;
      case 'knockdown':
        hud.showMessage('¡DERRIBO!', 'knockdown');
        audio.knockdown(); audio.roar();
        arena.crowdExcite(1); arena.flashBulbs(40);
        game.slowmo = 1.2;
        cam.shake(1);
        break;
      case 'ko': {
        game.state = 'ko';
        game.stateTime = 0;
        game.koInfo = ev;
        const loser = ev.loser ?? def;
        const f = game.fighters[loser];
        const dir = _tmp.subVectors(f.root.position, game.fighters[1 - loser].root.position).setY(0).normalize();
        f.startRagdoll(dir.multiplyScalar(3.5).setY(1.2));
        hud.showMessage('K.O.!', 'ko');
        audio.ko(); audio.roar(); audio.announcer('¡Nocaut!');
        arena.crowdExcite(1); arena.flashBulbs(120);
        game.slowmo = 2.2;
        gfx.impact(1, null);
        cam.setMode('ko');
        break;
      }
      case 'roundEnd':
        if (game.state === 'fight') {
          game.state = 'roundBreak'; game.stateTime = 0;
          audio.bell();
          hud.showMessage(`FIN DEL ASALTO ${ev.round ?? sim.round}`, 'round');
        }
        break;
      case 'fightEnd':
        if (game.state !== 'ko') { game.state = 'ko'; game.stateTime = 0; game.koInfo = ev; cam.setMode('victory'); }
        break;
    }
  }
}

async function finishFight() {
  const sim = game.sim;
  const winner = sim.winner ?? game.koInfo?.side ?? 0;
  const result = {
    winner,
    method: sim.method || game.koInfo?.method || (game.koInfo?.type === 'ko' ? 'KO' : 'Decisión'),
    round: sim.round, time: sim.clock,
    stats: sim.fighters.map((F) => ({
      landed: F.state.strikesLanded ?? 0, thrown: F.state.strikesThrown ?? 0,
      knockdowns: F.state.knockdownsScored ?? 0, damage: Math.round(F.state.damageDealt ?? 0),
    })),
    p1Index: game.config.p1Index, p2Index: game.config.p2Index,
    mode: game.config.mode, difficulty: game.config.difficulty,
    events: sim.history || [],
  };
  const rec = progression.recordFight(result);
  game.state = 'results';
  await hud.showResults({ ...result, ...rec });
  hud.hide();
  game.sim = null;
  disposeFighters();
  game.state = 'menu';
  menus.showMain();
}

const menus = createMenus(uiRoot, {
  profiles: FIGHTER_PROFILES,
  progression,
  audio,
  onStart: (cfg) => { menus.hideAll?.(); startFight(cfg); },
  onQuality: (q) => gfx.setQuality(q),
  onShake: (s) => cam.setShakeScale(s),
  onVolume: (m, mu, s) => audio.setVolume(m, mu, s),
  onResume: () => { game.state = game.prevState || 'fight'; },
  onQuit: () => { hud.hide(); game.sim = null; disposeFighters(); game.state = 'menu'; menus.showMain(); },
});

addEventListener('keydown', (e) => {
  if (e.code === 'Escape' && (game.state === 'fight' || game.state === 'intro')) {
    game.prevState = game.state; game.state = 'paused'; menus.showPause();
  } else if (e.code === 'Escape' && game.state === 'paused') {
    menus.hidePause(); game.state = game.prevState;
  }
});

function step(dt) {
  game.stateTime += dt;
  const sim = game.sim;
  if (!sim) return;
  switch (game.state) {
    case 'intro':
      sim.update(dt, [null, null], getPoint, { frozen: true });
      if (game.stateTime > 2.2) { game.state = 'fight'; input.clear(); }
      break;
    case 'fight': {
      const raw = input.poll();
      const p1 = toLocalInput(raw, 0);
      sim.update(dt, [p1, null], getPoint);
      handleEvents();
      if (raw.taunt) audio.roar();
      break;
    }
    case 'roundBreak':
      sim.update(dt, [null, null], getPoint, { frozen: true });
      if (game.stateTime > 3.5) {
        if (sim.winner != null || sim.over) { game.state = 'ko'; game.stateTime = 0; cam.setMode('victory'); }
        else { sim.nextRound?.(); beginRound(); }
      }
      break;
    case 'ko':
      sim.update(dt, [null, null], getPoint, { frozen: true });
      handleEvents();
      if (game.stateTime > 3 && cam.mode === 'ko') cam.setMode('victory');
      if (game.stateTime > 7.5) finishFight();
      break;
  }
}

function getPoint(side, name) {
  const f = game.fighters[side];
  return f ? f.getPoint(name) : null;
}

let last = performance.now();
let time = 0;
function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  tick(dt);
}

function tick(rawDt) {
  let dt = rawDt;
  if (game.hitstop > 0) { game.hitstop -= rawDt; dt *= 0.08; }
  if (game.slowmo > 0) { game.slowmo -= rawDt; dt *= 0.3; }
  gfx.setSlowMo(game.slowmo > 0 ? Math.min(1, game.slowmo) : 0);
  gfx.setKOFade(game.state === 'ko' ? Math.min(1, game.stateTime / 1.5) * 0.6 : 0);
  time += dt;
  if (game.state !== 'paused') step(dt);
  if (game.sim) {
    syncFighters(dt);
    hud.update(game.sim);
    const ko = game.koInfo;
    const winner = game.fighters[game.sim.winner ?? ko?.side ?? 0]?.root.position;
    const down = game.fighters[ko?.loser ?? (1 - (ko?.side ?? 0))]?.root.position;
    cam.update(rawDt, _p0, _p1, { winner, down });
  } else {
    cam.update(rawDt, _p0, _p1, { center: _tmp.set(0, 0, 0), radius: 8.5, height: 3.2, speed: 0.06 });
  }
  arena.update(dt, time);
  gfx.render(rawDt);
}

addEventListener('resize', () => gfx.resize());

// ---------------------------------------------------------------- debug scenarios
function runDebug() {
  const p1 = Number(Q.get('p1') ?? 0), p2 = Number(Q.get('p2') ?? 1);
  if (DEBUG === 'menu' || DEBUG === 'title') {
    menus.showTitle?.();
    if (DEBUG === 'menu') menus.showMain();
    for (let i = 0; i < 60; i++) tick(1 / 60);
  } else {
    startFight({ p1Index: p1, p2Index: p2, difficulty: Q.get('diff') || 'hard', mode: 'quick', rounds: 3, seed: 7 });
    const simT = Number(Q.get('t') ?? 1.5);
    // Fast-forward with CPU vs CPU so fighters are mid-exchange.
    game.state = 'fight';
    const fixed = 1 / 60;
    for (let t = 0; t < simT; t += fixed) {
      game.sim.update(fixed, [null, null], getPoint);
      handleEvents();
      syncFighters(fixed);
      if (game.state !== 'fight') break;
    }
    if (DEBUG === 'ko') {
      const ev = { type: 'ko', side: 0, loser: 1, method: 'KO' };
      game.sim.events.push(ev);
      handleEvents();
      for (let i = 0; i < 90; i++) tick(1 / 60);
    }
    const anim = Q.get('anim');
    if (anim) {
      const F = game.sim.fighters[0];
      Object.assign(F.state, { anim, animTime: 0.2, phase: Number(Q.get('phase') ?? 0.5), active0: 0.4, active1: 0.6 });
      game.fighters[0].update(0, F.state);
    }
    const camMode = Q.get('cam');
    for (let i = 0; i < 40; i++) {
      game.hitstop = 0; game.slowmo = 0;
      if (camMode === 'hero') cam.setMode('victory');
      cam.update(1 / 60, _p0, _p1, { winner: _p0, down: _p1, phase: 0.8 });
      arena.update(1 / 60, time += 1 / 60);
      if (game.fighters[0]) for (const f of game.fighters) f.update(0.0001, game.sim.fighters[game.fighters.indexOf(f)].state);
      gfx.render(1 / 60);
    }
    if (camMode === 'broadcast') { camera.position.set(6.5, 2.4, 0.5); camera.lookAt(0, 1.1, 0); gfx.render(1 / 60); }
    if (Q.get('hud') === '0') hud.hide();
  }
  window.__READY__ = true;
  if (Q.get('live') === '1') requestAnimationFrame(frame);
}

if (DEBUG) {
  runDebug();
} else {
  menus.showTitle();
  input.anyKey(() => { audio.unlock(); menus.showMain(); game.state = 'menu'; });
  requestAnimationFrame(frame);
  window.__READY__ = true;
}
window.__game = game;
