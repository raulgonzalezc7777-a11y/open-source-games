// FightSim: deterministic MMA striking simulation (pure logic, THREE math only).
//
// Coordinate conventions
//   World: metres, Y up, octagon centred at the origin.
//   Fighter local frame: +Z = facing (toward opponent), +X = (cos f, 0, -sin f) for yaw f,
//   matching THREE's Object3D.rotation.y = f. InputState.moveX / FighterState.move.x use
//   this local +X; main.js resolves camera-relative sticks into it.
//
// Events (sim.events; main.js drains it, e.g. `sim.events.length = 0` after reading)
//   For strike events `side` is the ATTACKER and `target` the defender.
//   For knockdown/ko `side` is the fighter who went DOWN and `by` the other one.
//   hit       {side,target,moveId,zone,damage,point,dir,counter,interrupt,combo,power,stunned}
//   block     {side,target,moveId,zone,damage(chip),point,dir,perfect,guardBreak}
//   whiff     {side,target,moveId,zone,evaded,point?}
//   combo     {side,combo}
//   special   {side,moveId}               (special started: slow-mo hook)
//   stun      {side}                       (fighter got wobbled)
//   knockdown {side,by,point,dir,count,round}
//   getUp     {side}
//   ko        {side,by,method:'KO'|'TKO',point,dir,round,time}
//   roundStart{round}
//   roundEnd  {round,scores:[a,b],judges:[[a,b]x3]}
//   fightEnd  {winner(0|1|null),method:'KO'|'TKO'|'Decision'|'Draw',detail,round,time,judges}
//   taunt     {side}
import * as THREE from 'three';
import { MOVES, getMoveForInput } from './moves.js';
import { CombatFighter } from './fighter.js';
import { CpuBrain } from './ai.js';
import { makeRng } from './rng.js';

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const clamp01 = (v) => clamp(v, 0, 1);
const wrapAngle = (a) => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};

/** Tuning knobs (exported so main.js / tests can tweak). */
export const TUNING = {
  minSep: 0.55,          // centre-to-centre minimum distance
  bodyRadius: 0.4,       // keeps the torso off the cage wall
  cageSlowZone: 0.7,     // outward speed fades over this band near the fence
  accel: 11, decel: 16,
  fwdSpeed: 2.4, backSpeed: 1.55, strafeSpeed: 1.8,
  turnRate: 7.5, turnRateBusy: 3.2,
  perfectBlockWindow: 0.12, // block pressed this close before impact => parry
  blockMashGap: 0.25,       // need this long with guard down for a parry to count
  dodgeDur: 0.42, dodgeIFrames: [0.03, 0.3], dodgeStamina: 0.05, dodgeCooldown: 0.2,
  counterWindow: 0.7, counterBonus: 1.5,
  comboWindow: 0.6,
  kdShock: 0.25, kdScale: 0.25, dazeGain: 0.3,
  dazeStun: 0.5, stunTime: 2.1, dazeDecay: 0.11,
  knockdownFall: 0.9, getUpTime: 1.2, getUpGrace: 0.7,
  globalDamage: 0.35,
  staminaCost: 1.35,     // multiplier on MOVES[].stamina
  staminaRegen: 0.075,   // per second at rest (scaled by cardio)
  meterDealt: 1.5, meterTaken: 0.5, // special meter gain per unit of damage
  roundRecovery: 0.3,    // fraction of missing zone health restored between rounds
};

export const ZONE_HEIGHT = { head: 1.62, body: 1.22, legs: 0.5 };
const ZONE_RADIUS = { head: 0.16, body: 0.26, legs: 0.22 };
const HIT_TOLERANCE = 0.1; // glove / shin thickness

const BLANK_INPUT = Object.freeze({
  moveX: 0, moveZ: 0, jab: false, cross: false, hook: false, uppercut: false, bodyMod: false,
  frontKick: false, legKick: false, roundhouse: false, special: false, block: false,
  dodge: false, taunt: false,
});

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();

export class FightSim {
  /**
   * @param {object} o
   *   p1Profile, p2Profile  fighter profiles (stats {power,speed,chin,cardio}, special, optional style)
   *   radius      usable octagon radius (default 4.6)
   *   rounds      default 3
   *   roundTime   seconds per round (default 120)
   *   seed        RNG seed (default 1) -> fully deterministic
   *   difficulty  CPU difficulty for both sides ('easy'|'normal'|'hard'|'legend'), or
   *   difficulties [d0, d1]
   *   roundBreak  seconds between rounds before auto advance (default 4)
   *   autoAdvance false => stay in 'roundBreak' until nextRound() is called
   */
  constructor(o = {}) {
    this.radius = o.radius ?? 4.6;
    this.rounds = o.rounds ?? 3;
    this.roundTime = o.roundTime ?? 120;
    this.roundBreak = o.roundBreak ?? 4;
    this.autoAdvance = o.autoAdvance ?? true;
    this.seed = (o.seed ?? 1) >>> 0;
    this.rng = makeRng(this.seed);
    this.fighters = [new CombatFighter(0, o.p1Profile), new CombatFighter(1, o.p2Profile)];
    const diffs = o.difficulties || [o.difficulty || 'normal', o.difficulty || 'normal'];
    this.brains = [0, 1].map((i) => new CpuBrain(this, i, diffs[i], makeRng(this.seed * 7919 + 101 + i * 31337)));
    this.events = [];
    this.round = 1;
    this.clock = this.roundTime;
    this.time = 0;
    this.state = 'fight'; // 'fight' | 'roundBreak' | 'ended'
    this.breakTimer = 0;
    this.endTimer = 0;
    this.winner = null;   // 0 | 1 | null (draw / undecided)
    this.method = null;   // 'KO' | 'TKO' | 'Decision' | 'Draw'
    this.finish = null;   // { round, time } of the stoppage
    this.score = { rounds: [], judges: [[0, 0], [0, 0], [0, 0]], totals: [0, 0] };
    this._getPoint = null;
    this._placeForRound();
  }

  setDifficulty(side, d) { this.brains[side].setDifficulty(d); }

  /** Advance the simulation. inputs[i] null => CPU controls side i. */
  update(dt, inputs = [null, null], getPoint = null) {
    if (!(dt > 0)) return;
    dt = Math.min(dt, 0.1);
    const steps = Math.ceil(dt / (1 / 50));
    const h = dt / steps;
    this._getPoint = typeof getPoint === 'function' ? getPoint : null;
    for (let s = 0; s < steps; s++) this._step(h, inputs || [null, null]);
    if (this.events.length > 512) this.events.splice(0, this.events.length - 512);
  }

  /** Begin the next round when autoAdvance is false. */
  nextRound() {
    if (this.state === 'roundBreak') this._startRound(this.round + 1);
  }

  // ------------------------------------------------------------------ internals

  emit(type, data) { this.events.push({ type, ...data }); }

  _placeForRound() {
    const [a, b] = this.fighters;
    a.pos.set(0, 0, -1.7); b.pos.set(0, 0, 1.7);
    a.facing = 0; b.facing = Math.PI;
    for (const f of this.fighters) {
      f.localVel.x = f.localVel.z = 0;
      f.knock.set(0, 0, 0);
      f.action = null;
      f.blocking = false;
      f.buffer = null;
    }
    this._writeStates(0);
  }

  _startRound(n) {
    this.round = n;
    this.clock = this.roundTime;
    this.state = 'fight';
    for (const f of this.fighters) {
      const r = TUNING.roundRecovery;
      for (const z of ['head', 'body', 'legs']) f.health[z] += (1 - f.health[z]) * r;
      f.stamina = f.maxStamina;
      f.daze = 0; f.stunTime = 0; f.guardHP = 1; f.counterTime = 0;
      f.comboCount = 0; f.knockdownsRound = 0; f.hitsTakenStunned = 0;
      f.roundStats = f.newRoundStats();
    }
    for (const b of this.brains) b.reset();
    this._placeForRound();
    this.emit('roundStart', { round: n });
  }

  _step(dt, inputs) {
    this.time += dt;
    const F = this.fighters;
    const anyDown = F.some((f) => f.action && (f.action.type === 'knockdown' || f.action.type === 'getUp'));

    if (this.state === 'fight') {
      if (!anyDown) this.clock = Math.max(0, this.clock - dt);
      for (let i = 0; i < 2; i++) {
        const inp = inputs[i] ? inputs[i] : this.brains[i].think(dt);
        F[i]._input = inp || BLANK_INPUT;
      }
    } else {
      for (const f of F) f._input = BLANK_INPUT;
      if (this.state === 'roundBreak') {
        this.breakTimer -= dt;
        if (this.breakTimer <= 0 && this.autoAdvance) this._startRound(this.round + 1);
      } else if (this.state === 'ended') {
        this.endTimer += dt;
        if (this.endTimer > 1.4 && !this._celebrated) this._celebrate();
      }
    }

    for (let i = 0; i < 2; i++) this._handleInput(F[i], F[1 - i], F[i]._input, dt);
    for (let i = 0; i < 2; i++) this._locomotion(F[i], F[1 - i], F[i]._input, dt);
    this._resolveBodies();
    for (let i = 0; i < 2; i++) this._face(F[i], F[1 - i], dt);
    for (let i = 0; i < 2; i++) this._advanceAction(F[i], F[1 - i], dt);
    for (let i = 0; i < 2; i++) this._regen(F[i], dt);
    this._writeStates(dt);

    if (this.state === 'fight' && this.clock <= 0) {
      const busy = F.some((f) => f.action && (f.action.type === 'knockdown' || f.action.type === 'getUp'));
      if (!busy) this._endRound();
    }
  }

  // ---------------------------------------------------------------- input

  _handleInput(f, opp, input, dt) {
    // buffered move timer
    if (f.buffer) { f.bufferTime -= dt; if (f.bufferTime <= 0) f.buffer = null; }
    const wantBlock = !!input.block;
    if (wantBlock && !f.blockInput) f.blockPressTime = this.time;
    if (!wantBlock && f.blockInput) f.blockReleaseTime = this.time;
    f.blockInput = wantBlock;
    f.blockLow = !!input.bodyMod;

    if (this.state !== 'fight' || !f.canControl()) { f.blocking = false; return; }

    // Block during the first half of a non-special startup cancels it (feint-cancel).
    const a = f.action;
    if (wantBlock && a && a.type === 'move' && !a.m.special && a.t / a.dur < a.a0 * 0.5) {
      this._endMove(f);
    }

    const s = f.state;
    s.lastMove = f.lastMove;
    s.lastMoveAge = f.move ? 0 : this.time - f.lastMoveEnd;
    const id = getMoveForInput(input, s);
    if (id) { f.buffer = id; f.bufferTime = 0.22; }

    if (input.dodge && f.dodgeCooldown <= 0 && (!f.action || f.action.type === 'blockstun' ||
        (f.action.type === 'move' && f.canStartMove()))) {
      if (f.move) this._endMove(f);
      this._startDodge(f, input);
      return;
    }
    if (input.taunt && !f.action && !wantBlock) {
      f.action = { type: 'taunt', anim: 'taunt', t: 0, dur: 1.5 };
      f.specialMeter = Math.min(1, f.specialMeter + 0.08);
      this.emit('taunt', { side: f.side });
      return;
    }
    if (f.buffer && !wantBlock && f.canStartMove()) {
      const mid = f.buffer;
      if (!MOVES[mid].special || f.specialMeter >= 1) this._startMove(f, opp, mid);
      f.buffer = null;
    }
    f.blocking = wantBlock && (!f.action || f.action.type === 'blockstun');
  }

  _startDodge(f, input) {
    const dir = input.moveX > 0.3 ? 1 : input.moveX < -0.3 ? -1 : 0;
    f.action = { type: 'dodge', anim: dir === 0 ? 'duck' : 'slip', t: 0, dur: TUNING.dodgeDur, dir, evaded: false };
    f.dodgeDir = dir;
    f.blocking = false;
    f.dodgeCooldown = TUNING.dodgeDur + TUNING.dodgeCooldown;
    f.stamina = Math.max(0, f.stamina - TUNING.dodgeStamina);
    if (dir) f.localVel.x += dir * 1.6;
  }

  _speedScale(f) {
    const st = clamp01(f.stamina / 0.5);
    return (0.92 + 0.16 * f.stats.speed) * (0.8 + 0.2 * st) * (f.stunTime > 0 ? 0.82 : 1);
  }

  _startMove(f, opp, id) {
    const m = MOVES[id];
    if (f.move) this._endMove(f);
    const total = m.startup + m.active + m.recovery;
    const dur = total / this._speedScale(f);
    f.action = {
      type: 'move', id, m, anim: m.anim, t: 0, dur,
      a0: m.startup / total, a1: (m.startup + m.active) / total,
      resolved: m.kind === 'feint', contact: false, evaded: false,
    };
    f.stamina = Math.max(0, f.stamina - m.stamina * TUNING.staminaCost * (1.15 - 0.3 * f.stats.cardio));
    f.moveSerial++;
    f.lastMove = id;
    f.blocking = false;
    if (m.kind !== 'feint') { f.strikesThrown++; f.roundStats.thrown++; }
    if (m.special) {
      f.specialMeter = 0;
      this.emit('special', { side: f.side, moveId: id });
    }
  }

  _endMove(f) {
    f.action = null;
    f.lastMoveEnd = this.time;
  }

  // ---------------------------------------------------------------- movement

  _locomotion(f, opp, input, dt) {
    const a = f.action;
    let factor = 1;
    if (a) {
      switch (a.type) {
        case 'move': factor = a.t / a.dur < a.a1 ? 0.55 : 0.2; break;
        case 'dodge': factor = 0.45; break;
        case 'hitstun': case 'blockstun': factor = 0.15; break;
        case 'stagger': factor = 0.25; break;
        default: factor = 0;
      }
    } else if (f.blocking) factor = 0.55;
    if (this.state !== 'fight') factor = 0;

    const legs = f.health.legs;
    const mul = (0.55 + 0.45 * legs) * (0.62 + 0.38 * clamp01(f.stamina / 0.4)) *
      (0.93 + 0.14 * f.stats.speed) * (f.stunTime > 0 ? 0.5 : 1) * factor;
    let mx = clamp(input.moveX || 0, -1, 1), mz = clamp(input.moveZ || 0, -1, 1);
    const ml = Math.hypot(mx, mz);
    if (ml > 1) { mx /= ml; mz /= ml; }
    const tx = mx * TUNING.strafeSpeed * mul;
    const tz = mz * (mz > 0 ? TUNING.fwdSpeed : TUNING.backSpeed) * mul;
    const approach = (cur, tgt) => {
      const rate = (Math.abs(tgt) > Math.abs(cur) && Math.sign(tgt) === Math.sign(cur || tgt)) ? TUNING.accel : TUNING.decel;
      const d = tgt - cur, step = rate * dt;
      return Math.abs(d) <= step ? tgt : cur + Math.sign(d) * step;
    };
    f.localVel.x = approach(f.localVel.x, tx);
    f.localVel.z = approach(f.localVel.z, tz);

    const sf = Math.sin(f.facing), cf = Math.cos(f.facing);
    let vx = cf * f.localVel.x + sf * f.localVel.z;
    let vz = -sf * f.localVel.x + cf * f.localVel.z;

    // Lunge: attacker drives forward through startup + active.
    if (a && a.type === 'move' && a.m.lunge > 0) {
      const p = a.t / a.dur;
      if (p < a.a1) {
        const dist = Math.hypot(opp.pos.x - f.pos.x, opp.pos.z - f.pos.z);
        if (dist > TUNING.minSep + 0.12) {
          const sp = a.m.lunge / (a.a1 * a.dur);
          vx += sf * sp; vz += cf * sp;
        }
      }
    }

    // Cage slowdown: outward speed fades as the fence approaches.
    const R = this.radius - TUNING.bodyRadius;
    const r = Math.hypot(f.pos.x, f.pos.z);
    if (r > R - TUNING.cageSlowZone && r > 1e-4) {
      const nx = f.pos.x / r, nz = f.pos.z / r;
      const out = vx * nx + vz * nz;
      if (out > 0) {
        const k = clamp01((R - r) / TUNING.cageSlowZone);
        vx -= nx * out * (1 - k); vz -= nz * out * (1 - k);
      }
    }

    const dBefore = Math.hypot(opp.pos.x - f.pos.x, opp.pos.z - f.pos.z);
    f.pos.x += vx * dt; f.pos.z += vz * dt;
    // Pure strafing circles the opponent at constant range.
    if (Math.abs(mz) < 0.2 && Math.abs(mx) > 0.1 && !(a && a.type === 'move')) {
      const dx = f.pos.x - opp.pos.x, dz = f.pos.z - opp.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 1e-4) { f.pos.x = opp.pos.x + dx / d * dBefore; f.pos.z = opp.pos.z + dz / d * dBefore; }
    }
    // Knockback
    f.pos.x += f.knock.x * dt; f.pos.z += f.knock.z * dt;
    const kd = Math.exp(-7 * dt);
    f.knock.multiplyScalar(kd);
    // footwork drains a bit of stamina
    f.stamina = Math.max(0, f.stamina - Math.hypot(f.localVel.x, f.localVel.z) * 0.004 * dt);
  }

  _resolveBodies() {
    const [a, b] = this.fighters;
    const R = this.radius - TUNING.bodyRadius;
    for (let it = 0; it < 3; it++) {
      let dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
      let d = Math.hypot(dx, dz);
      if (d < TUNING.minSep) {
        if (d < 1e-5) { dx = Math.sin(a.facing); dz = Math.cos(a.facing); d = 1; }
        const push = (TUNING.minSep - d) / 2;
        const nx = dx / d, nz = dz / d;
        a.pos.x -= nx * push; a.pos.z -= nz * push;
        b.pos.x += nx * push; b.pos.z += nz * push;
      }
      for (const f of this.fighters) {
        f.pos.y = 0;
        const r = Math.hypot(f.pos.x, f.pos.z);
        if (r > R) { f.pos.x *= R / r; f.pos.z *= R / r; }
      }
    }
    // If pinned on the fence the clamp may undo separation: slide along the fence.
    let dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
    let d = Math.hypot(dx, dz);
    if (d < TUNING.minSep - 1e-3) {
      for (const f of [a, b]) {
        const r = Math.hypot(f.pos.x, f.pos.z) || 1;
        const tx = -f.pos.z / r, tz = f.pos.x / r;
        const o = f === a ? b : a;
        const s = Math.sign((f.pos.x - o.pos.x) * tx + (f.pos.z - o.pos.z) * tz) || (f === a ? -1 : 1);
        const need = (TUNING.minSep - d) / 2 + 1e-3;
        f.pos.x += tx * s * need; f.pos.z += tz * s * need;
        const r2 = Math.hypot(f.pos.x, f.pos.z);
        if (r2 > R) { f.pos.x *= R / r2; f.pos.z *= R / r2; }
      }
    }
  }

  _face(f, opp, dt) {
    if (f.action && (f.action.type === 'ko' || f.action.type === 'knockdown')) return;
    const target = Math.atan2(opp.pos.x - f.pos.x, opp.pos.z - f.pos.z);
    const diff = wrapAngle(target - f.facing);
    const busy = f.action && f.action.type !== 'dodge';
    const rate = (busy ? TUNING.turnRateBusy : TUNING.turnRate) * (f.stunTime > 0 ? 0.6 : 1);
    const step = rate * dt;
    f.facing = wrapAngle(f.facing + clamp(diff, -step, step));
  }

  // ---------------------------------------------------------------- actions & hits

  _advanceAction(f, opp, dt) {
    const a = f.action;
    if (!a) return;
    a.t += dt;
    if (a.type === 'move') {
      const p = a.t / a.dur;
      if (!a.resolved && p >= a.a0) this._checkHit(f, opp, a, p);
      if (f.action !== a) return;
      if (a.t >= a.dur) this._endMove(f);
      return;
    }
    if (a.t < a.dur) return;
    switch (a.type) {
      case 'knockdown':
        f.action = { type: 'getUp', anim: 'getUp', t: 0, dur: TUNING.getUpTime };
        this.emit('getUp', { side: f.side });
        break;
      case 'getUp':
        f.action = null;
        f.invulnTime = TUNING.getUpGrace;
        f.daze = Math.min(f.daze, 0.25);
        f.stunTime = 0;
        break;
      case 'ko': case 'victory': case 'defeat':
        a.t = Math.min(a.t, a.dur); // hold
        break;
      default:
        f.action = null;
    }
  }

  _gp(side, name) {
    if (!this._getPoint) return null;
    let p;
    try { p = this._getPoint(side, name); } catch { return null; }
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) return null;
    return p;
  }

  /** World-space centre of a defender's target zone (rig point if available). */
  zoneCenter(f, zone, out = new THREE.Vector3()) {
    let p = null;
    if (zone === 'head') p = this._gp(f.side, 'head');
    else if (zone === 'body') {
      const c = this._gp(f.side, 'chest'), ab = this._gp(f.side, 'abdomen');
      if (c && ab) { out.copy(c).add(ab).multiplyScalar(0.5); return out; }
      p = c || ab;
    } else {
      const k = this._gp(f.side, 'kneeL');
      if (k) { out.copy(k); out.y += 0.08; return out; }
    }
    if (p) return out.copy(p);
    out.set(f.pos.x, ZONE_HEIGHT[zone], f.pos.z);
    const a = f.action;
    if (zone === 'head' && a && a.type === 'dodge') {
      const k = Math.sin(clamp01(a.t / a.dur) * Math.PI);
      if (a.dir === 0) out.y -= 0.38 * k;
      else {
        const cf = Math.cos(f.facing), sf = Math.sin(f.facing);
        out.x += cf * a.dir * 0.3 * k; out.z += -sf * a.dir * 0.3 * k; out.y -= 0.1 * k;
      }
    }
    if (zone === 'legs') { // lead (left) thigh sits toward local -X... roughly centred
      out.x += Math.sin(f.facing) * 0.1; out.z += Math.cos(f.facing) * 0.1;
    }
    return out;
  }

  _checkHit(att, def, a, p) {
    const m = a.m;
    const dx = def.pos.x - att.pos.x, dz = def.pos.z - att.pos.z;
    const dist = Math.hypot(dx, dz);
    const ang = Math.abs(wrapAngle(Math.atan2(dx, dz) - att.facing)) * 180 / Math.PI;
    const reach = m.reach + 0.03 * (att.stats.speed - 0.5);
    const gate = dist <= reach && ang <= m.cone;
    const mid = (a.a0 + a.a1) / 2;
    const ended = p >= a.a1;

    let hit = false, point = null;
    const limbP = this._gp(att.side, m.limb);
    if (limbP && dist <= reach + 0.25 && ang <= m.cone + 20) {
      const c = this.zoneCenter(def, m.zone, _v1);
      if (limbP.distanceTo(c) <= ZONE_RADIUS[m.zone] + HIT_TOLERANCE) {
        hit = true;
        point = limbP.clone().lerp(c, 0.5);
      }
    }
    if (!hit && p >= mid && gate) hit = true;

    if (!hit) {
      if (ended) {
        a.resolved = true;
        att.stamina = Math.max(0, att.stamina - m.stamina * 0.4);
        a.dur += 0.08 / this._speedScale(att); // overcommitted on a miss
        this.emit('whiff', { side: att.side, target: def.side, moveId: a.id, zone: m.zone, evaded: false, dist, angle: ang });
      }
      return;
    }

    if (!point) {
      const c = this.zoneCenter(def, m.zone, _v1);
      _v2.set(att.pos.x - c.x, 0, att.pos.z - c.z);
      if (_v2.lengthSq() > 1e-8) _v2.normalize();
      point = c.clone().addScaledVector(_v2, ZONE_RADIUS[m.zone] * 0.85);
    }
    a.resolved = true;
    const dir = new THREE.Vector3(dx, 0, dz);
    if (dist > 1e-5) dir.divideScalar(dist); else dir.set(Math.sin(att.facing), 0, Math.cos(att.facing));
    this._resolveContact(att, def, a, dist, dir, point);
  }

  _resolveContact(att, def, a, dist, dir, point) {
    const m = a.m;
    const rng = this.rng;
    const da = def.action;

    // Downed / invulnerable fighters cannot be struck (no hitting a fighter getting up).
    if (def.isDown || def.invulnTime > 0) {
      this.emit('whiff', { side: att.side, target: def.side, moveId: a.id, zone: m.zone, evaded: false });
      return;
    }

    // --- evasion (slip / duck i-frames vs head strikes)
    if (da && da.type === 'dodge' && m.zone === 'head') {
      const inI = da.t >= TUNING.dodgeIFrames[0] && da.t <= TUNING.dodgeIFrames[1];
      const punishDuck = da.dir === 0 && (a.id === 'uppercut' || a.id === 'flyingKnee');
      if (inI && !punishDuck) {
        a.evaded = true;
        da.evaded = true;
        def.counterTime = TUNING.counterWindow;
        def.specialMeter = Math.min(1, def.specialMeter + 0.06);
        def.evades++;
        a.dur += 0.12 / this._speedScale(att);
        att.stamina = Math.max(0, att.stamina - m.stamina * 0.4);
        this.emit('whiff', { side: att.side, target: def.side, moveId: a.id, zone: m.zone, evaded: true, point });
        return;
      }
    }

    // --- block
    const covers = def.blocking && (def.blockLow ? m.zone !== 'head' : m.zone === 'head');
    if (covers) {
      a.contact = true;
      const perfect = (this.time - def.blockPressTime) <= TUNING.perfectBlockWindow &&
        (def.blockPressTime - def.blockReleaseTime) >= TUNING.blockMashGap;
      const pf = 0.82 + 0.36 * att.stats.power;
      let chip = 0, guardBreak = false;
      if (perfect) {
        def.counterTime = TUNING.counterWindow;
        def.specialMeter = Math.min(1, def.specialMeter + 0.08);
        a.dur += 0.15 / this._speedScale(att);
        att.knock.addScaledVector(dir, -0.6);
      } else {
        const stun = def.stunTime > 0 ? 2 : 1;
        chip = m.damage * (m.special ? 0.35 : m.kind === 'kick' ? 0.2 : 0.12) * pf * stun * TUNING.globalDamage;
        def.health[m.zone] = Math.max(0, def.health[m.zone] - chip);
        def.stamina = Math.max(0, def.stamina - (0.015 + m.damage * 0.7));
        def.guardHP -= m.damage * (m.kind === 'punch' ? 3.2 : 4.5) * pf * (stun > 1 ? 1.5 : 1);
        def.specialMeter = Math.min(1, def.specialMeter + 0.015);
        def.knock.addScaledVector(dir, m.knockback * 0.5);
        if (def.guardHP <= 0) {
          guardBreak = true;
          def.guardHP = 0.45;
          def.blocking = false;
          def.action = { type: 'stagger', anim: 'stagger', t: 0, dur: 0.75 };
        } else {
          def.action = { type: 'blockstun', anim: def.blockLow ? 'blockLow' : 'blockHigh', t: 0, dur: 0.1 + m.hitstun * 0.35 };
        }
      }
      // Checked leg kick hurts the kicker's shin.
      if (a.id === 'legKick') att.health.legs = Math.max(0, att.health.legs - 0.025);
      att.specialMeter = Math.min(1, att.specialMeter + 0.01);
      def.blocksMade++;
      def.roundStats.blocked++;
      this.emit('block', { side: att.side, target: def.side, moveId: a.id, zone: m.zone, damage: chip, point, dir, perfect, guardBreak });
      return;
    }

    // --- clean hit
    a.contact = true;
    const counter = att.counterTime > 0;
    const interrupt = !!(da && da.type === 'move' && da.t / da.dur < da.a1 && da.m.kind !== 'feint');
    const caughtDucking = !!(da && da.type === 'dodge' && da.dir === 0 && m.zone === 'head');
    if (counter) att.counterTime = 0;

    if (this.time - att.lastHitTime <= TUNING.comboWindow) att.comboCount++;
    else att.comboCount = 1;
    att.lastHitTime = this.time;
    const combo = att.comboCount;
    const comboBonus = combo > 3 ? Math.min(1.4, 1 + 0.08 * (combo - 3)) : 1;

    const smother = dist < m.minRange ? 0.6 : 1;
    const zoneMul = m.zone === 'head' ? 1.2 - 0.4 * def.stats.chin
      : m.zone === 'body' ? 1.15 - 0.3 * def.stats.cardio : 1;
    const mult = (0.82 + 0.36 * att.stats.power) *
      (0.6 + 0.4 * clamp01(att.stamina / 0.6)) * comboBonus *
      (counter ? TUNING.counterBonus : 1) * (interrupt ? 1.2 : 1) * (caughtDucking ? 1.3 : 1) *
      (def.stunTime > 0 ? 1.15 : 1) * smother * zoneMul * rng.range(0.9, 1.1) * TUNING.globalDamage;
    const dmg = m.damage * mult;
    const zone = m.zone;
    def.health[zone] = Math.max(0, def.health[zone] - dmg);

    att.strikesLanded++;
    att.damageDealt += dmg;
    att.roundStats.landed++;
    att.roundStats.damage += dmg;
    if (m.power >= 0.4) { att.powerLanded++; att.roundStats.power++; }
    att.specialMeter = Math.min(1, att.specialMeter + dmg * TUNING.meterDealt);
    def.specialMeter = Math.min(1, def.specialMeter + dmg * TUNING.meterTaken);
    if (zone === 'body') def.stamina = Math.max(0, def.stamina - dmg * 1.4);
    def.knock.addScaledVector(dir, m.knockback * (zone === 'legs' ? 0.3 : 1));

    // interrupt the defender's own move / block
    if (def.move) this._endMove(def);
    def.blocking = false;

    const wasStunned = def.stunTime > 0;
    if (wasStunned) def.hitsTakenStunned++;
    const hitEv = {
      side: att.side, target: def.side, moveId: a.id, zone, damage: dmg, point, dir,
      counter, interrupt, combo, power: m.power, special: m.special, stunned: wasStunned,
    };
    this.emit('hit', hitEv);
    if (combo >= 2) this.emit('combo', { side: att.side, combo });

    // --- consequences
    const h = def.health;
    let outcome = null; // 'ko' | 'tko' | 'kd' | 'stun'
    if (zone === 'head') {
      // Shock: how hard this shot rattles the brain. Driven by the move's power, the
      // attacker's power stat, the defender's chin and accumulated head damage.
      const shock = m.power * (0.8 + 0.4 * att.stats.power) * (1.3 - 0.6 * def.stats.chin) *
        (0.35 + (1 - h.head) * 1.3) * (counter ? 1.7 : 1) * (interrupt ? 1.25 : 1) * comboBonus;
      hitEv.shock = shock;
      if (h.head <= 0) outcome = 'ko';
      else {
        let pKD = (shock - TUNING.kdShock) * TUNING.kdScale;
        if (wasStunned && m.power >= 0.15) pKD += 0.1 + 0.2 * m.power;
        if (rng() < clamp(pKD, 0, 0.9)) {
          // flash KO: huge clean shot on a compromised chin
          const pKO = (shock - 1.1) * 0.5 + (h.head < 0.25 ? 0.25 : 0) + (def.knockdowns >= 2 ? 0.15 : 0);
          outcome = rng() < clamp(pKO, 0, 0.8) ? 'ko' : 'kd';
        } else {
          def.daze += shock * TUNING.dazeGain;
          if (!wasStunned && def.daze >= TUNING.dazeStun) outcome = 'stun';
        }
      }
    } else if (zone === 'body') {
      if (h.body <= 0) outcome = 'tko';
      else if (h.body < 0.3 && m.power >= 0.3 && rng() < (0.3 - h.body) * 2.2 * (m.damage / 0.07)) outcome = 'kd';
    } else if (zone === 'legs') {
      if (h.legs <= 0) outcome = 'tko';
      else if (h.legs < 0.18 && rng() < 0.4) outcome = 'kd';
    }
    if (!outcome && wasStunned && def.hitsTakenStunned >= 6 && h.head < 0.35) outcome = 'tko';

    if (outcome === 'ko' || outcome === 'tko') {
      this._ko(def, att, outcome === 'ko' ? 'KO' : 'TKO', point, dir);
    } else if (outcome === 'kd') {
      this._knockdown(def, att, point, dir);
    } else {
      if (outcome === 'stun') {
        def.stunTime = TUNING.stunTime;
        def.hitsTakenStunned = 0;
        this.emit('stun', { side: def.side });
      }
      const anim = zone === 'head' ? 'hitHead' : zone === 'body' ? 'hitBody' : 'hitLeg';
      const hs = m.hitstun * (wasStunned ? 1.2 : 1) * (counter ? 1.15 : 1);
      def.action = outcome === 'stun'
        ? { type: 'hitstun', anim: 'stagger', t: 0, dur: Math.max(hs, 0.6) }
        : { type: 'hitstun', anim, t: 0, dur: hs };
    }
  }

  _knockdown(def, att, point, dir) {
    def.knockdowns++;
    def.knockdownsRound++;
    att.roundStats.knockdowns++;
    this.emit('knockdown', { side: def.side, by: att.side, point, dir, count: def.knockdowns, round: this.round });
    if (def.move) this._endMove(def);
    def.blocking = false;
    def.stunTime = 0;
    def.hitsTakenStunned = 0;
    const h = def.health;
    // Referee: three knockdowns in a round, or a fighter who clearly cannot continue.
    const pStay = clamp((0.28 - h.head) * 2.4, 0, 0.85) + 0.1 * Math.max(0, def.knockdowns - 2);
    if (def.knockdownsRound >= 3 || this.rng() < pStay) {
      this._ko(def, att, 'TKO', point, dir, true);
      return;
    }
    const down = TUNING.knockdownFall + 1.4 + (1 - h.head) * 1.8 + this.rng() * 0.6;
    def.action = { type: 'knockdown', anim: 'knockdown', t: 0, dur: down };
    def.knock.addScaledVector(dir, 1.2);
    // the downed fighter recovers a little (adrenaline) so comebacks stay possible
    def.daze = 0.2;
    def.stamina = Math.min(def.maxStamina, def.stamina + 0.15);
    att.counterTime = 0;
  }

  _ko(def, att, method, point, dir, fromKnockdown = false) {
    if (!fromKnockdown) {
      def.knockdowns++;
      def.knockdownsRound++;
      att.roundStats.knockdowns++;
    }
    if (def.move) this._endMove(def);
    def.blocking = false;
    def.action = { type: 'ko', anim: 'ko', t: 0, dur: 3 };
    def.knock.addScaledVector(dir, 1.5);
    this.winner = att.side;
    this.method = method;
    const time = this.roundTime - this.clock;
    this.finish = { round: this.round, time };
    this.state = 'ended';
    this.endTimer = 0;
    this.emit('ko', { side: def.side, by: att.side, method, point, dir, round: this.round, time });
    this.emit('fightEnd', { winner: att.side, method, detail: method === 'KO' ? 'Knockout' : 'Referee stoppage', round: this.round, time, judges: null });
  }

  _celebrate() {
    this._celebrated = true;
    this.fighters.forEach((f, i) => {
      if (f.action && f.action.type === 'ko') return;
      if (this.winner === null) f.action = null;
      else f.action = { type: i === this.winner ? 'victory' : 'defeat', anim: i === this.winner ? 'victory' : 'defeat', t: 0, dur: 4 };
    });
  }

  // ---------------------------------------------------------------- rounds & scoring

  _roundPoints(f, o) {
    const r = f.roundStats;
    return r.damage * 100 + r.landed * 0.55 + r.power * 0.8 + r.knockdowns * 14 + r.blocked * 0.1 +
      (r.thrown - o.roundStats.thrown) * 0.05; // a hair of credit for octagon control
  }

  _endRound() {
    const [a, b] = this.fighters;
    const pa = this._roundPoints(a, b), pb = this._roundPoints(b, a);
    const judges = [];
    for (let j = 0; j < 3; j++) {
      const diff = pa - pb + this.rng.gauss() * 1.6;
      let card;
      if (Math.abs(diff) < 0.35) card = [10, 10];
      else {
        const kdA = a.roundStats.knockdowns, kdB = b.roundStats.knockdowns;
        const big = Math.abs(diff) > 22 || Math.abs(kdA - kdB) >= 2;
        card = diff > 0 ? [10, big ? 8 : 9] : [big ? 8 : 9, 10];
      }
      judges.push(card);
      this.score.judges[j][0] += card[0];
      this.score.judges[j][1] += card[1];
    }
    // consensus card for the HUD: majority of judges
    const aWins = judges.filter((c) => c[0] > c[1]).length;
    const bWins = judges.filter((c) => c[1] > c[0]).length;
    const consensus = aWins > bWins ? judges.find((c) => c[0] > c[1]) : bWins > aWins ? judges.find((c) => c[1] > c[0]) : [10, 10];
    this.score.rounds.push(consensus.slice());
    this.score.totals[0] += consensus[0];
    this.score.totals[1] += consensus[1];
    this.clock = 0;
    for (const f of this.fighters) {
      if (f.move) this._endMove(f);
      if (f.action && f.action.type !== 'ko') f.action = null;
      f.blocking = false;
    }
    this.emit('roundEnd', { round: this.round, scores: consensus.slice(), judges, points: [pa, pb] });
    if (this.round >= this.rounds) this._decision();
    else { this.state = 'roundBreak'; this.breakTimer = this.roundBreak; }
  }

  _decision() {
    const J = this.score.judges;
    let a = 0, b = 0;
    for (const c of J) { if (c[0] > c[1]) a++; else if (c[1] > c[0]) b++; }
    let winner = null, detail = 'Draw', method = 'Draw';
    if (a > b) winner = 0; else if (b > a) winner = 1;
    if (winner !== null) {
      method = 'Decision';
      const w = Math.max(a, b), l = Math.min(a, b);
      detail = w === 3 ? 'Unanimous decision' : l === 1 ? 'Split decision' : 'Majority decision';
    } else if (a === b && a > 0) detail = 'Split draw';
    this.winner = winner;
    this.method = method;
    this.finish = { round: this.round, time: this.roundTime };
    this.state = 'ended';
    this.endTimer = 0;
    this.emit('fightEnd', { winner, method, detail, round: this.round, time: this.roundTime, judges: J.map((c) => c.slice()) });
  }

  // ---------------------------------------------------------------- regen & state out

  _regen(f, dt) {
    const a = f.action;
    const maxSt = f.maxStamina;
    const busy = a && a.type === 'move';
    let regen = (busy ? 0 : f.blocking ? 0.3 : 1) * TUNING.staminaRegen;
    if (this.state === 'roundBreak') regen = 0.2;
    regen *= (0.7 + 0.6 * f.stats.cardio) * (f.stunTime > 0 ? 0.5 : 1);
    if (f.stamina < maxSt) f.stamina = Math.min(maxSt, f.stamina + regen * dt);
    else f.stamina = Math.max(maxSt, f.stamina - 0.05 * dt);

    f.daze = Math.max(0, f.daze - TUNING.dazeDecay * dt);
    if (f.stunTime > 0) { f.stunTime -= dt; if (f.stunTime <= 0) { f.stunTime = 0; f.hitsTakenStunned = 0; } }
    f.counterTime = Math.max(0, f.counterTime - dt);
    f.invulnTime = Math.max(0, f.invulnTime - dt);
    f.dodgeCooldown = Math.max(0, f.dodgeCooldown - dt);
    f.guardHP = Math.min(1, f.guardHP + (f.blocking ? 0.05 : 0.3) * dt);
    if (this.time - f.lastHitTime > TUNING.comboWindow) f.comboCount = 0;
    if (!f.isDown && this.state === 'fight') {
      // very slow in-round recovery (keeps late comebacks possible)
      f.health.head = Math.min(1, f.health.head + 0.0012 * dt);
      f.health.body = Math.min(1, f.health.body + 0.0008 * dt);
    }
  }

  _writeStates(dt) {
    for (const f of this.fighters) {
      const s = f.state, a = f.action;
      let anim, phase = 0, a0 = 0, a1 = 0;
      if (a) {
        anim = a.anim;
        phase = a.dur > 0 ? clamp01(a.t / a.dur) : 1;
        if (a.type === 'move') { a0 = a.a0; a1 = a.a1; }
      } else if (f.blocking) anim = f.blockLow ? 'blockLow' : 'blockHigh';
      else if (f.stunTime > 0) anim = 'stagger';
      else if (Math.hypot(f.localVel.x, f.localVel.z) > 0.15) anim = 'walk';
      else anim = 'idle';

      if (a) s.animTime = a.t;
      else if (anim !== s.anim) s.animTime = 0;
      else s.animTime += dt;
      if (!a) phase = (s.animTime / (anim === 'walk' ? 0.8 : anim === 'stagger' ? 1.2 : 2)) % 1;
      s.anim = anim;
      s.phase = phase;
      s.active0 = a0; s.active1 = a1;
      s.move.x = f.localVel.x; s.move.z = f.localVel.z;

      let g;
      if (f.isDown) g = 0;
      else if (f.blocking || (a && a.type === 'blockstun')) g = 1;
      else if (f.stunTime > 0) g = 0.2;
      else if (a && a.type === 'move') g = 0.35;
      else g = 0.45 + 0.25 * clamp01(f.stamina / 0.6);
      f.guard += (g - f.guard) * clamp01(dt * 14);
      if (dt === 0) f.guard = g;
      s.guard = f.guard;
      s.stamina = f.stamina;
      s.stunned = f.stunTime > 0;
      const m = f.move;
      s.moveId = m ? m.id : null;
      s.target = m ? m.m.zone : null;
      s.limb = m ? m.m.limb : null;
      s.special = m ? !!m.m.special : false;
      s.dodgeDir = a && a.type === 'dodge' ? a.dir : 0;
      s.blocking = f.blocking;
      s.blockLow = f.blockLow;
      s.limp = clamp01((0.65 - f.health.legs) / 0.55);
      s.maxStamina = f.maxStamina;
      s.specialMeter = f.specialMeter;
      s.comboCount = f.comboCount;
      s.counterWindow = f.counterTime;
      s.knockdowns = f.knockdowns;
      s.down = f.isDown;
      s.invulnerable = f.isDown || f.invulnTime > 0;
      s.daze = f.daze;
      s.guardHP = f.guardHP;
      s.strikesThrown = f.strikesThrown;
      s.strikesLanded = f.strikesLanded;
      s.damageDealt = f.damageDealt;
      s.lastMove = f.lastMove;
      s.lastMoveAge = m ? 0 : this.time - f.lastMoveEnd;
    }
  }
}
