// Per-fighter combat state. FightSim (sim.js) drives these; nothing in here
// knows about rendering. `state` is the FighterState object handed to
// Fighter.update() each frame (same object reference for the whole fight).
import * as THREE from 'three';
import { MOVES, specialFor } from './moves.js';

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Normalise profile stats to 0..1 with sane defaults. */
export function normStats(profile) {
  const s = (profile && profile.stats) || {};
  const n = (v) => clamp01((Number.isFinite(v) ? v : 60) / 100);
  return { power: n(s.power), speed: n(s.speed), chin: n(s.chin), cardio: n(s.cardio) };
}

/** Fighting style used by the CPU: explicit profile.style or derived from stats. */
export function styleFor(profile) {
  const st = profile && profile.style;
  if (st === 'pressure' || st === 'striker' || st === 'counter') return st;
  const s = (profile && profile.stats) || {};
  const power = s.power ?? 60, speed = s.speed ?? 60, cardio = s.cardio ?? 60;
  if ((power + cardio) / 2 - speed > 5) return 'pressure';
  if (speed - power > 8) return 'counter';
  return 'striker';
}

export class CombatFighter {
  constructor(side, profile) {
    this.side = side;
    this.profile = profile || {};
    this.stats = normStats(profile);
    this.style = styleFor(profile);
    this.specialMove = specialFor(profile);

    this.pos = new THREE.Vector3();
    this.facing = 0; // yaw; local +Z = (sin f, 0, cos f) points at the opponent
    this.localVel = { x: 0, z: 0 }; // locomotion velocity in fighter-local space
    this.knock = new THREE.Vector3(); // knockback velocity (world), decays

    this.action = null; // { type, anim, t, dur, ... } or null when free
    this.blocking = false;
    this.blockLow = false;
    this.blockInput = false;
    this.blockPressTime = -9;
    this.blockReleaseTime = -9;
    this.guardHP = 1; // guard integrity; 0 => guard break
    this.guard = 0.5;

    this.daze = 0; // accumulated brain rattle, decays; > threshold => stunned
    this.stunTime = 0;
    this.counterTime = 0; // > 0: next landed strike is a counter (+50%)
    this.invulnTime = 0; // post get-up grace
    this.buffer = null;
    this.bufferTime = 0;
    this.comboCount = 0;
    this.lastHitTime = -9;
    this.hitsTakenStunned = 0;
    this.lastMove = null;
    this.lastMoveEnd = -9;
    this.moveSerial = 0;
    this.dodgeDir = 0;
    this.dodgeCooldown = 0;

    this.stamina = 1;
    this.health = { head: 1, body: 1, legs: 1 };
    this.specialMeter = 0;
    this.knockdowns = 0;
    this.knockdownsRound = 0;
    this.strikesThrown = 0;
    this.strikesLanded = 0;
    this.powerLanded = 0;
    this.damageDealt = 0;
    this.blocksMade = 0;
    this.evades = 0;
    this.roundStats = this.newRoundStats();

    this.state = {
      anim: 'idle', animTime: 0, phase: 0, active0: 0, active1: 0,
      move: { x: 0, z: 0 }, guard: 0.5, stamina: 1,
      health: this.health, stunned: false, side,
      // ---- extras (beyond the DESIGN.md contract) ----
      moveId: null,       // MOVES id while attacking (several ids share one anim)
      target: null,       // 'head' | 'body' | 'legs' zone the current strike aims at
      limb: null,         // attacking limb of the current move
      special: false,     // current move is a special
      dodgeDir: 0,        // -1 slip left (local -X), +1 slip right (local +X), 0 duck
      blocking: false,
      blockLow: false,
      limp: 0,            // 0..1 from leg damage (rig should favour the lead leg)
      maxStamina: 1,
      specialMeter: 0,    // 0..1, special usable at 1
      specialMove: this.specialMove,
      comboCount: 0,      // current chain of landed hits by this fighter
      counterWindow: 0,   // seconds left of a counter opportunity
      knockdowns: 0,
      down: false,        // on the canvas (knockdown / getUp / ko)
      invulnerable: false,
      daze: 0,
      guardHP: 1,
      strikesThrown: 0,
      strikesLanded: 0,
      damageDealt: 0,
      lastMove: null,
      lastMoveAge: 99,
      style: this.style,
    };
  }

  newRoundStats() {
    return { thrown: 0, landed: 0, power: 0, damage: 0, knockdowns: 0, blocked: 0 };
  }

  get move() { return this.action && this.action.type === 'move' ? this.action : null; }
  get isDown() {
    const t = this.action && this.action.type;
    return t === 'knockdown' || t === 'getUp' || t === 'ko';
  }
  get maxStamina() { return 0.4 + 0.6 * this.health.body; }

  /** Can the fighter take voluntary actions this frame? */
  canControl() {
    const t = this.action && this.action.type;
    return !t || t === 'move' || t === 'taunt' || t === 'blockstun';
  }

  /** Is a new move allowed to start right now (incl. combo cancels out of recovery)? */
  canStartMove() {
    const a = this.action;
    if (!a) return true;
    if (a.type === 'taunt') return a.t > 0.35;
    if (a.type !== 'move') return false;
    const p = a.t / a.dur;
    if (p < a.a1) return false;
    if (a.m.kind === 'feint') return true;
    const rec = (p - a.a1) / Math.max(1e-6, 1 - a.a1);
    return rec >= (a.contact ? 0.25 : 0.55);
  }

  /** Zone-health weighted "how hurt" 0..1. */
  hurt() {
    const h = this.health;
    return clamp01(1 - (h.head * 0.55 + h.body * 0.3 + h.legs * 0.15));
  }

  moveDef() { return this.move ? MOVES[this.move.id] : null; }
}
