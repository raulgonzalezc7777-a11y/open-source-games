// CPU opponent. Produces an InputState each frame, exactly like a human pad would,
// so the sim treats CPU and player identically. It only "sees" the opponent's
// moves after a human-like reaction delay and sometimes misreads or ignores them.
import { MOVES } from './moves.js';

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/**
 * Difficulty knobs.
 *   reaction  seconds before an opponent windup is noticed (+ jitter)
 *   read      chance of noticing an attack at all
 *   blockSkill chance the chosen guard (high/low) is the right one
 *   slip      chance of slipping/ducking instead of blocking a head strike
 *   counter   chance of punishing an opened counter window
 *   combo     preference for longer combinations
 *   spacing   accuracy of range judgement (1 = throws only in range)
 *   guard     habit of keeping the shell up at close range
 *   think     seconds between tactical decisions
 *   special   eagerness to use a full special meter well
 *   aggression multiplier
 */
export const DIFFICULTY = {
  easy:   { reaction: 0.45, jitter: 0.14, read: 0.35, blockSkill: 0.6,  slip: 0.04, counter: 0.12, combo: 0.25, spacing: 0.35, guard: 0.12, think: 0.65, special: 0.35, aggression: 0.75 },
  normal: { reaction: 0.3,  jitter: 0.1,  read: 0.55, blockSkill: 0.76, slip: 0.12, counter: 0.4,  combo: 0.55, spacing: 0.65, guard: 0.25, think: 0.45, special: 0.6,  aggression: 0.95 },
  hard:   { reaction: 0.22, jitter: 0.07, read: 0.68, blockSkill: 0.88, slip: 0.22, counter: 0.65, combo: 0.75, spacing: 0.85, guard: 0.32, think: 0.33, special: 0.8,  aggression: 1.05 },
  legend: { reaction: 0.17, jitter: 0.06, read: 0.78, blockSkill: 0.94, slip: 0.3,  counter: 0.85, combo: 0.9,  spacing: 0.95, guard: 0.38, think: 0.25, special: 0.95, aggression: 1.1 },
};

/** Personality from profile style (see fighter.js styleFor). */
const STYLE = {
  striker:  { range: 1.3, aggression: 1.0,  kicks: 1.4, body: 0.8, power: 0.9, feint: 0.8, counter: 1.0, retreat: 1.0 },
  pressure: { range: 1.14, aggression: 1.35, kicks: 0.7, body: 1.5, power: 1.3, feint: 0.4, counter: 0.8, retreat: 0.6 },
  counter:  { range: 1.38,  aggression: 0.7,  kicks: 1.0, body: 0.9, power: 1.0, feint: 1.6, counter: 1.6, retreat: 1.2 },
};

// Combos as button tokens. 'b:x' = x with bodyMod held. 'hook' alternates lead/rear in the sim.
// tags weight the pick by style: k = kicks, b = body, p = power.
const COMBOS = [
  { seq: ['jab'], w: 1.4 },
  { seq: ['jab', 'jab'], w: 0.6 },
  { seq: ['jab', 'cross'], w: 2.2 },
  { seq: ['jab', 'cross', 'hook'], w: 1.4, p: 1 },
  { seq: ['jab', 'jab', 'cross'], w: 0.8 },
  { seq: ['jab', 'legKick'], w: 1.3, k: 1 },
  { seq: ['jab', 'cross', 'legKick'], w: 1.0, k: 1 },
  { seq: ['cross', 'hook', 'legKick'], w: 0.7, k: 1, p: 1 },
  { seq: ['jab', 'b:cross'], w: 0.8, b: 1 },
  { seq: ['b:hook', 'hook'], w: 0.9, b: 1, p: 1 },
  { seq: ['jab', 'cross', 'b:hook'], w: 0.8, b: 1 },
  { seq: ['hook', 'uppercut', 'hook'], w: 0.6, p: 1 },
  { seq: ['uppercut', 'hook'], w: 0.6, p: 1 },
  { seq: ['cross'], w: 0.6, p: 1 },
  { seq: ['legKick'], w: 1.1, k: 1 },
  { seq: ['b:roundhouse'], w: 0.7, k: 1, b: 1 },
  { seq: ['roundhouse'], w: 0.45, k: 1, p: 1 },
  { seq: ['jab', 'roundhouse'], w: 0.4, k: 1, p: 1 },
  { seq: ['frontKick'], w: 0.5, k: 1 },
  { seq: ['feint', 'cross'], w: 0.5, f: 1 },
  { seq: ['feint', 'roundhouse'], w: 0.25, f: 1, k: 1 },
  { seq: ['feint', 'b:hook', 'hook'], w: 0.3, f: 1, b: 1 },
];
const COUNTERS = [['cross'], ['hook', 'cross'], ['uppercut', 'hook'], ['cross', 'hook'], ['b:hook', 'hook']];
const FINISHERS = [['cross', 'hook', 'uppercut'], ['hook', 'hook', 'cross'], ['jab', 'cross', 'hook', 'cross'], ['roundhouse'], ['uppercut', 'cross']];

/** Approximate move id a token will produce (for range checks). */
function tokenMove(tok, specialMove) {
  const body = tok.startsWith('b:');
  const t = body ? tok.slice(2) : tok;
  switch (t) {
    case 'jab': return body ? 'bodyJab' : 'jab';
    case 'cross': return body ? 'bodyCross' : 'cross';
    case 'hook': return body ? 'leadBodyHook' : 'leadHook';
    case 'uppercut': return body ? 'bodyUppercut' : 'uppercut';
    case 'roundhouse': return body ? 'bodyKick' : 'headKick';
    case 'special': return specialMove;
    default: return t; // legKick, frontKick, feint
  }
}

export class CpuBrain {
  constructor(sim, side, difficulty, rng) {
    this.sim = sim;
    this.side = side;
    this.rng = rng;
    this.setDifficulty(difficulty);
    this.reset();
  }

  setDifficulty(d) {
    this.difficulty = DIFFICULTY[d] ? d : 'normal';
    this.d = DIFFICULTY[this.difficulty];
  }

  reset() {
    this.t = 0;
    this.intent = 'circle';
    this.intentTimer = 0.3 + this.rng() * 0.5;
    this.queue = [];
    this.queueAge = 0;
    this.waitSerial = -1;
    this.seenSerial = -1;
    this.react = null;
    this.blockUntil = 0;
    this.blockLow = false;
    this.shell = false;
    this.circleDir = this.rng() < 0.5 ? -1 : 1;
    this.circleTimer = 1;
    this.jitterX = 0;
    this.jitterTimer = 0;
    this.rangeBias = 0;
    this.counterArmed = false;
    this.cooldown = 0.5;
    this.backUntil = 0;
    this.distRate = 0;
    this.prevDist = undefined;
    this.seenDist = undefined;
    this.input = this.blank();
  }

  blank() {
    return { moveX: 0, moveZ: 0, jab: false, cross: false, hook: false, uppercut: false, bodyMod: false,
      frontKick: false, legKick: false, roundhouse: false, special: false, block: false, dodge: false,
      taunt: false, feint: false };
  }

  think(dt) {
    const sim = this.sim, rng = this.rng, d = this.d;
    const me = sim.fighters[this.side], op = sim.fighters[1 - this.side];
    const style = STYLE[me.style] || STYLE.striker;
    this.t += dt;
    const inp = this.input;
    Object.assign(inp, this.blank());
    if (me.isDown || sim.state !== 'fight') { this.queue.length = 0; this.react = null; return inp; }
    const canAct = me.canControl();

    const dx = op.pos.x - me.pos.x, dz = op.pos.z - me.pos.z;
    const dist = Math.hypot(dx, dz);
    // closing-speed estimate (negative = closing) for range prediction
    if (this.prevDist !== undefined && dt > 0) {
      this.distRate += ((dist - this.prevDist) / dt - this.distRate) * Math.min(1, dt * 12);
    }
    this.prevDist = dist;
    // Footwork reacts to a delayed, smoothed read of the range (no perfect distance keeping).
    if (this.seenDist === undefined) this.seenDist = dist;
    this.seenDist += (dist - this.seenDist) * Math.min(1, dt / Math.max(0.05, d.reaction * 1.2));
    const myHurt = me.hurt();
    const opHurt = op.hurt();
    const tired = 1 - me.stamina / Math.max(0.3, me.maxStamina);
    const opDown = op.isDown || op.invulnTime > 0;

    // ---- 1. perceive opponent attacks (delayed, imperfect)
    const om = op.move;
    if (om && op.moveSerial !== this.seenSerial) {
      this.seenSerial = op.moveSerial;
      const busyAttacking = me.move && me.move.t / me.move.dur < me.move.a1;
      const perceive = d.read * (me.stunTime > 0 ? 0.45 : 1) * (1 - 0.35 * tired) * (busyAttacking ? 0.3 : 1);
      if (rng() < perceive) {
        this.react = { at: this.t + Math.max(0.05, d.reaction + d.jitter * rng.gauss()), serial: op.moveSerial };
      }
    }
    if (!canAct) {
      // still reading the opponent while rocked / in hitstun, but cannot act yet
      if (this.queue.length && me.action && me.action.type === 'hitstun') this.queue.length = 0;
      return inp;
    }
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.react && this.t >= this.react.at) {
      const r = this.react; this.react = null;
      const a = op.move;
      if (a && op.moveSerial === r.serial && a.t / a.dur < a.a1 && dist < a.m.reach + 0.45) {
        const m = a.m;
        const remaining = a.dur * a.a1 - a.t;
        if (m.zone === 'head' && rng() < d.slip * style.counter && me.dodgeCooldown <= 0 && m.kind !== 'feint') {
          inp.dodge = true;
          inp.moveX = a.id === 'uppercut' ? (rng() < 0.5 ? -1 : 1) : rng.pick([-1, 1, 0]);
          this.queue.length = 0;
          this.counterArmed = true;
          return inp;
        }
        // sometimes just step back out of range instead
        if (dist > m.reach - 0.2 && rng() < 0.25 + 0.2 * style.retreat - 0.1 * (me.style === 'pressure')) {
          this.backUntil = this.t + remaining + 0.15;
          this.queue.length = 0;
          return inp;
        }
        let low = m.zone !== 'head';
        if (rng() > d.blockSkill) low = !low;
        this.blockLow = low;
        this.blockUntil = this.t + remaining + 0.1 + rng() * 0.15;
        this.queue.length = 0;
        this.counterArmed = true;
      }
    }

    // ---- 2. punish a counter window (after a parry / slip)
    if (me.counterTime > 0 && this.counterArmed && !me.move) {
      this.counterArmed = false;
      if (rng() < d.counter * style.counter) {
        this.queue = rng.pick(COUNTERS).slice();
        this.queueAge = 0;
        this.blockUntil = 0;
      }
    }
    if (me.counterTime <= 0 && !this.react && this.t > this.blockUntil) this.counterArmed = false;

    // ---- 3. tactical decision
    this.intentTimer -= dt;
    if (this.intentTimer <= 0) {
      this.intentTimer = d.think * rng.range(0.6, 1.5);
      this.decide(me, op, dist, myHurt, opHurt, tired, style, opDown);
    }

    // ---- 4. movement
    this.circleTimer -= dt;
    const R = sim.radius;
    const myR = Math.hypot(me.pos.x, me.pos.z);
    // local +X in world: (cos f, 0, -sin f). Positive moveX -> that way.
    const rx = Math.cos(me.facing), rz = -Math.sin(me.facing);
    const outward = (me.pos.x * rx + me.pos.z * rz) / Math.max(myR, 1e-3);
    if (myR > R - 1.5 && Math.abs(outward) > 0.2) this.circleDir = outward > 0 ? -1 : 1; // circle off the fence
    else if (this.circleTimer <= 0) {
      this.circleTimer = rng.range(1, 3);
      if (rng() < 0.4) this.circleDir *= -1;
    }
    this.jitterTimer -= dt;
    if (this.jitterTimer <= 0) { this.jitterTimer = rng.range(0.2, 0.6); this.jitterX = rng.range(-0.35, 0.35); }

    let want = style.range + this.rangeBias;
    let strafe = 0;
    switch (this.intent) {
      case 'attack': case 'special': case 'finish': {
        const tok = this.queue[0];
        if (tok) {
          const m = MOVES[tokenMove(tok, me.specialMove)];
          const slop = (1 - d.spacing) * 0.35;
          want = m.reach - 0.12 + this.rangeBias * 0.5 + slop * 0.5;
        } else want = style.range - 0.15;
        strafe = this.jitterX;
        break;
      }
      case 'pressure': want = style.range - 0.1; strafe = this.circleDir * 0.25 + this.jitterX; break;
      case 'circle': strafe = this.circleDir * 0.85; break;
      case 'retreat': want = 2.6; strafe = this.circleDir * 0.8; break;
      case 'feint': want = style.range; strafe = this.jitterX; break;
      case 'taunt': want = 2.4; break;
      case 'neutral': default: want = style.range + 0.05; strafe = this.circleDir * 0.35 + this.jitterX; break;
    }
    if (opDown) { want = 2.8; strafe = this.circleDir * 0.5; this.queue.length = 0; }
    if (this.t < this.backUntil) { want = 2.2; strafe = this.circleDir * 0.4; }
    const err = this.seenDist - want;
    inp.moveZ = Math.abs(err) < 0.06 ? 0 : clamp(err * 2.6, -1, 1);
    inp.moveX = clamp(strafe, -1, 1);

    // ---- 5. guard
    const holdingBlock = this.t < this.blockUntil;
    if (holdingBlock) {
      inp.block = true; inp.bodyMod = this.blockLow;
      inp.moveZ = Math.min(inp.moveZ, 0.1);
    } else if (this.shell && !this.queue.length && dist < 1.35 && !opDown) {
      inp.block = true; inp.bodyMod = false;
    }

    // ---- 6. offense: press the next token of the queued combination
    if (this.queue.length && !inp.block && !opDown) {
      this.queueAge += dt;
      if (me.moveSerial !== this.waitSerial && this.waitSerial >= 0) {
        // previous token started
        this.waitSerial = -1;
        this.queue.shift();
        this.queueAge = 0;
        if (!this.queue.length) this.endCombo(style);
      }
      const tok = this.queue[0];
      if (tok) {
        const id = tokenMove(tok, me.specialMove);
        const m = MOVES[id];
        const first = !me.move;
        // Range judgement: weaker AIs misjudge and sometimes throw from too far.
        const slop = (1 - d.spacing) * 0.45;
        // Good fighters predict where the target will be when the strike lands.
        const lead = (m.startup + m.active * 0.5) * d.spacing;
        const predicted = dist + this.distRate * lead - m.lunge * d.spacing;
        const okRange = m.kind === 'feint' ||
          (first ? predicted <= m.reach - 0.04 * d.spacing + slop * rng() : predicted <= m.reach + 0.4 * (1 - d.spacing) + 0.05);
        if (!first && !okRange && d.spacing > 0.6 && me.canStartMove()) {
          // opponent escaped: smart fighters abandon the rest of the combination
          this.queue.length = 0; this.waitSerial = -1; this.endCombo(style);
          return inp;
        }
        const ready = me.canStartMove();
        if (ready && okRange && this.waitSerial < 0) {
          this.press(inp, tok);
          this.waitSerial = me.moveSerial;
        }
        if (this.queueAge > (first ? 1.6 : 0.6)) { this.queue.length = 0; this.waitSerial = -1; this.endCombo(style); }
      } else this.waitSerial = -1;
    } else if (!this.queue.length) this.waitSerial = -1;

    // ---- 7. stunned / exhausted: survival instincts
    if (me.stunTime > 0) {
      inp.moveZ = -1;
      if (dist < 1.3 && rng() < 0.5 + d.guard) { inp.block = true; inp.bodyMod = false; }
      this.queue.length = 0;
    }
    if (inp.block) {
      // don't press attack buttons while holding the shell (would feint-cancel)
      inp.jab = inp.cross = inp.hook = inp.uppercut = inp.legKick = inp.frontKick = inp.roundhouse = inp.special = false;
    }
    if (this.intent === 'taunt' && dist > 2 && !me.action && !inp.block && rng() < 0.05) {
      inp.taunt = true;
      this.intent = 'neutral';
    }
    return inp;
  }

  // After a combination: reset to neutral for a beat (pressure fighters reset less).
  endCombo(style) {
    this.cooldown = this.rng.range(0.4, 1.6) / (style.aggression * this.d.aggression);
    this.intent = this.rng() < 0.5 ? 'neutral' : 'circle';
    this.intentTimer = Math.max(this.intentTimer, this.cooldown * 0.6);
  }

  press(inp, tok) {
    const body = tok.startsWith('b:');
    const t = body ? tok.slice(2) : tok;
    inp.bodyMod = body;
    if (t in inp) inp[t] = true;
  }

  decide(me, op, dist, myHurt, opHurt, tired, style, opDown) {
    const rng = this.rng, d = this.d;
    this.rangeBias = rng.range(-0.1, 0.12);
    if (this.queue.length && this.intent !== 'neutral') return; // finish what we started
    const opStunned = op.stunTime > 0;
    const hurtGap = opHurt - myHurt; // >0 we're winning the damage war
    let aggr = style.aggression * d.aggression *
      (0.55 + 0.45 * (1 - tired)) * (1 + 1.2 * Math.max(0, hurtGap)) * (opStunned ? 2.5 : 1) *
      (me.stunTime > 0 ? 0.1 : 1);
    if (op.stamina < 0.25) aggr *= 1.3;
    const retreat = (myHurt > 0.45 ? (myHurt - 0.35) * 3 : 0) * style.retreat + tired * tired * 1.6 +
      (me.stunTime > 0 ? 4 : 0) + (opStunned ? -1 : 0);
    const inRange = dist < style.range + 0.45;
    const options = [
      ['attack', aggr * (inRange ? 1.1 : 0.6) * (this.cooldown > 0 && !opStunned ? 0.15 : 1)],
      ['pressure', aggr * 0.5],
      ['circle', 0.55],
      ['neutral', 0.5],
      ['retreat', Math.max(0, retreat)],
      ['feint', 0.18 * style.feint * (d.combo + 0.2)],
      ['taunt', !opStunned && myHurt < 0.25 && dist > 1.8 && hurtGap > 0.05 ? 0.06 : 0.01],
    ];
    if (me.specialMeter >= 1) options.push(['special', 0.4 + d.special * (opStunned || opHurt > 0.45 ? 2.5 : 0.8)]);
    this.intent = rng.weighted(options);
    this.shell = rng() < d.guard * (1 + myHurt) * (opHurt > 0.5 ? 0.5 : 1);

    if (this.intent === 'attack') {
      if (opStunned && rng() < 0.5 + d.combo * 0.5) this.queue = rng.pick(FINISHERS).slice();
      else this.queue = this.pickCombo(style, dist).slice();
      this.queueAge = 0;
      this.shell = false;
    } else if (this.intent === 'special') {
      this.queue = rng() < 0.5 ? ['jab', 'special'] : ['special'];
      this.queueAge = 0;
      this.shell = false;
    } else if (this.intent === 'feint') {
      this.queue = rng() < 0.6 ? ['feint'] : ['feint', 'feint'];
      this.queueAge = 0;
    } else {
      this.queue.length = 0;
    }
  }

  pickCombo(style, dist) {
    const d = this.d;
    const pairs = COMBOS.map((c) => {
      let w = c.w;
      if (c.k) w *= style.kicks;
      if (c.b) w *= style.body;
      if (c.p) w *= style.power;
      if (c.f) w *= style.feint * (0.3 + d.combo);
      const len = c.seq.length;
      w *= len >= 3 ? 0.4 + d.combo : len === 2 ? 0.7 + d.combo * 0.5 : 1.4 - d.combo * 0.6;
      if (dist > 1.35 && c.seq[0] === 'frontKick') w *= 0.3;
      return [c.seq, w];
    });
    return this.rng.weighted(pairs);
  }
}
