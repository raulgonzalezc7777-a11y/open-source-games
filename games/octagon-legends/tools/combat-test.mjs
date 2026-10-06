// Headless combat simulation test: node tools/combat-test.mjs [fightsPerMatchup]
// Runs CPU vs CPU fights at a fixed dt over many seeds, asserts invariants and
// prints a tuning summary. Exits non-zero on any failed assertion.
import * as THREE from 'three';
import { FightSim, MOVES, getMoveForInput, TUNING } from '../src/combat/index.js';

const N = Number(process.argv[2] || 40);
const DT = 1 / 60;
const RADIUS = 4.6;

const PROFILES = [
  { name: 'Striker', stats: { power: 70, speed: 80, chin: 60, cardio: 70 }, special: 'spinningBackfist' },
  { name: 'Brawler', stats: { power: 88, speed: 58, chin: 75, cardio: 72 }, special: 'superman' },
  { name: 'Counter', stats: { power: 62, speed: 86, chin: 55, cardio: 66 }, special: 'spinningHeelKick' },
  { name: 'Muay', stats: { power: 76, speed: 70, chin: 70, cardio: 80 }, special: 'flyingKnee' },
  { name: 'Veteran', stats: { power: 72, speed: 64, chin: 82, cardio: 60 }, special: 'superman' },
  { name: 'Prospect', stats: { power: 66, speed: 74, chin: 58, cardio: 88 }, special: 'spinningHeelKick' },
];

let failures = 0;
const fail = (msg) => { failures++; if (failures <= 25) console.log('  FAIL:', msg); };
const assert = (cond, msg) => { if (!cond) fail(msg); };
const finite = (v) => Number.isFinite(v);

// Analytical stand-in for Fighter.getPoint so the rig-point path of hit detection is exercised.
function makeGetPoint(sim) {
  const out = new THREE.Vector3();
  return (side, name) => {
    const f = sim.fighters[side];
    const s = f.state;
    const fx = Math.sin(f.facing), fz = Math.cos(f.facing);
    const rx = Math.cos(f.facing), rz = -Math.sin(f.facing);
    const heights = { head: 1.62, chin: 1.55, chest: 1.35, abdomen: 1.1, hips: 0.95, kneeL: 0.5, kneeR: 0.5, shinL: 0.3, shinR: 0.3, footL: 0.08, footR: 0.08, fistL: 1.45, fistR: 1.45 };
    let h = heights[name];
    if (h === undefined) return null;
    let fwd = 0.05, lat = 0;
    if (name.endsWith('L')) lat = -0.15; else if (name.endsWith('R')) lat = 0.15;
    if (s.down) h *= 0.25;
    if (name === 'head' && s.anim === 'duck') h -= 0.35;
    if (name === 'head' && s.anim === 'slip') lat += 0.3 * s.dodgeDir;
    // the striking limb extends toward the target during the active window
    if (s.limb === name && s.phase >= s.active0 && s.phase <= s.active1 + 0.05) {
      const m = MOVES[s.moveId];
      fwd = m.reach - 0.05;
      lat *= 0.3;
      h = m.zone === 'head' ? 1.6 : m.zone === 'body' ? 1.22 : 0.55;
    }
    out.set(f.pos.x + fx * fwd + rx * lat, h, f.pos.z + fz * fwd + rz * lat);
    return out;
  };
}

function runFight({ seed, p1, p2, d1, d2, roundTime = 120, usePoints = false }) {
  const sim = new FightSim({ p1Profile: p1, p2Profile: p2, radius: RADIUS, rounds: 3, roundTime, seed, difficulties: [d1, d2], roundBreak: 1 });
  const gp = usePoints ? makeGetPoint(sim) : null;
  const maxT = 3 * (roundTime + 30) + 20;
  const ev = { hit: 0, block: 0, whiff: 0, evaded: 0, knockdown: 0, ko: 0, roundEnd: 0, fightEnd: 0, combo: 0, special: 0, counter: 0, perfect: 0, guardBreak: 0, stun: 0, taunt: 0, getUp: 0, bigCombo: 0 };
  const kdOrder = [];
  let fightEnd = null;
  let t = 0, minDist = Infinity, maxR = 0, nan = false;
  let pendingDown = [0, 0];
  while (t < maxT) {
    sim.update(DT, [null, null], gp);
    t += DT;
    for (const e of sim.events) {
      ev[e.type] = (ev[e.type] || 0) + 1;
      if (e.type === 'hit') {
        assert(e.point instanceof THREE.Vector3 && finite(e.point.x) && finite(e.point.y) && finite(e.point.z), 'hit point not a finite Vector3');
        assert(e.damage > 0 && e.damage < 0.5, `hit damage out of range ${e.damage}`);
        assert(['head', 'body', 'legs'].includes(e.zone), 'bad zone ' + e.zone);
        assert(e.side !== e.target, 'self hit');
        assert(!pendingDown[e.target], 'hit landed on a downed fighter');
        if (e.counter) ev.counter++;
        if (e.combo > 3) ev.bigCombo++;
      }
      if (e.type === 'block') { if (e.perfect) ev.perfect++; if (e.guardBreak) ev.guardBreak++; }
      if (e.type === 'whiff' && e.evaded) ev.evaded++;
      if (e.type === 'knockdown') { kdOrder.push(e.side); pendingDown[e.side] = 1; }
      if (e.type === 'getUp') { assert(pendingDown[e.side], 'getUp without knockdown'); pendingDown[e.side] = 0; }
      if (e.type === 'fightEnd') { assert(!fightEnd, 'two fightEnd events'); fightEnd = e; }
      if (e.type === 'ko') assert(e.method === 'KO' || e.method === 'TKO', 'ko method');
    }
    sim.events.length = 0;
    const [a, b] = sim.fighters;
    for (const f of sim.fighters) {
      const s = f.state;
      const nums = [f.pos.x, f.pos.z, f.facing, s.animTime, s.phase, s.guard, s.stamina, s.health.head, s.health.body, s.health.legs, s.move.x, s.move.z, s.specialMeter];
      if (!nums.every(finite)) nan = true;
      maxR = Math.max(maxR, Math.hypot(f.pos.x, f.pos.z));
      assert(s.phase >= 0 && s.phase <= 1, 'phase out of range');
      assert(s.stamina >= 0 && s.stamina <= 1.0001, 'stamina out of range');
    }
    minDist = Math.min(minDist, Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z));
    if (nan) break;
    if (sim.state === 'ended' && sim.endTimer > 2) break;
  }
  assert(!nan, `NaN in state (seed ${seed})`);
  assert(maxR <= RADIUS - TUNING.bodyRadius + 1e-6, `fighter left the octagon r=${maxR.toFixed(3)}`);
  assert(minDist >= TUNING.minSep - 0.02, `fighters overlapped d=${minDist.toFixed(3)}`);
  assert(fightEnd, `fight did not end (seed ${seed})`);
  assert(ev.roundEnd <= 3, 'too many rounds');
  const [a, b] = sim.fighters;
  const length = sim.finish ? (sim.finish.round - 1) * roundTime + sim.finish.time : 3 * roundTime;
  // comeback: the fighter knocked down first still won
  const comeback = kdOrder.length > 0 && sim.winner !== null && sim.winner === kdOrder[0];
  return {
    sim, ev, method: sim.method, winner: sim.winner, length, comeback,
    thrown: a.strikesThrown + b.strikesThrown, landed: a.strikesLanded + b.strikesLanded,
    landedBy: [a.strikesLanded, b.strikesLanded], thrownBy: [a.strikesThrown, b.strikesThrown],
    kds: a.knockdowns + b.knockdowns,
  };
}

// ---------------------------------------------------------------- unit checks
{
  const fs = { specialMeter: 0, specialMove: 'superman', lastMove: null, lastMoveAge: 99 };
  assert(getMoveForInput({ jab: true }, fs) === 'jab', 'jab mapping');
  assert(getMoveForInput({ jab: true, bodyMod: true }, fs) === 'bodyJab', 'body jab mapping');
  assert(getMoveForInput({ hook: true }, fs) === 'leadHook', 'lead hook');
  assert(getMoveForInput({ hook: true }, { ...fs, lastMove: 'jab', lastMoveAge: 0.1 }) === 'rearHook', 'jab-hook gives rear hook');
  assert(getMoveForInput({ hook: true }, { ...fs, lastMove: 'cross', lastMoveAge: 0.1 }) === 'leadHook', '1-2-3 lead hook');
  assert(getMoveForInput({ hook: true, bodyMod: true }, fs) === 'leadBodyHook', 'body hook');
  assert(getMoveForInput({ roundhouse: true }, fs) === 'headKick', 'head kick');
  assert(getMoveForInput({ roundhouse: true, bodyMod: true }, fs) === 'bodyKick', 'body kick');
  assert(getMoveForInput({ special: true }, fs) === null, 'special needs meter');
  assert(getMoveForInput({ special: true }, { ...fs, specialMeter: 1 }) === 'superman', 'special with meter');
  for (const [id, m] of Object.entries(MOVES)) {
    for (const k of ['anim', 'damage', 'stamina', 'reach', 'zone', 'startup', 'active', 'recovery', 'knockback', 'special', 'limb']) {
      assert(m[k] !== undefined, `MOVES.${id}.${k} missing`);
    }
  }
}

// Scripted player: jab spam at range must land and be deterministic.
{
  const run = () => {
    const sim = new FightSim({ p1Profile: PROFILES[0], p2Profile: PROFILES[1], seed: 7, difficulty: 'easy' });
    const hits = [];
    for (let i = 0; i < 60 * 20; i++) {
      const inp = { moveX: 0, moveZ: 0.6, jab: i % 20 === 0, cross: i % 20 === 8, hook: false, uppercut: false, bodyMod: false, frontKick: false, legKick: false, roundhouse: false, special: false, block: false, dodge: false, taunt: false };
      sim.update(DT, [inp, null]);
      for (const e of sim.events) if (e.type === 'hit') hits.push(`${e.side}:${e.moveId}:${e.damage.toFixed(5)}`);
      sim.events.length = 0;
    }
    return hits.join('|');
  };
  const h1 = run(), h2 = run();
  assert(h1 === h2, 'simulation is not deterministic');
  assert(h1.split('|').some((s) => s.startsWith('0:')), 'scripted player never landed');
}

// ---------------------------------------------------------------- batch fights
function batch(label, cfgs) {
  const R = cfgs.map(runFight);
  const n = R.length;
  const sum = (f) => R.reduce((s, r) => s + f(r), 0);
  const ko = R.filter((r) => r.method === 'KO').length;
  const tko = R.filter((r) => r.method === 'TKO').length;
  const dec = R.filter((r) => r.method === 'Decision').length;
  const draw = R.filter((r) => r.method === 'Draw').length;
  const thrown = sum((r) => r.thrown), landed = sum((r) => r.landed);
  const stats = {
    label, n, ko, tko, dec, draw,
    avgLen: sum((r) => r.length) / n,
    minLen: Math.min(...R.map((r) => r.length)),
    under60: R.filter((r) => r.length < 60).length,
    hitRate: landed / Math.max(1, thrown),
    landedPerMin: landed / (sum((r) => r.length) / 60),
    kdPerFight: sum((r) => r.kds) / n,
    fightsWithKD: R.filter((r) => r.kds > 0).length / n,
    comebacks: R.filter((r) => r.comeback).length,
    blocksPerFight: sum((r) => r.ev.block) / n,
    perfectPerFight: sum((r) => r.ev.perfect) / n,
    evadesPerFight: sum((r) => r.ev.evaded) / n,
    countersPerFight: sum((r) => r.ev.counter) / n,
    specialsPerFight: sum((r) => r.ev.special) / n,
    stunsPerFight: sum((r) => r.ev.stun) / n,
    guardBreaks: sum((r) => r.ev.guardBreak) / n,
    bigCombos: sum((r) => r.ev.bigCombo) / n,
    taunts: sum((r) => r.ev.taunt) / n,
    R,
  };
  const pct = (x) => (100 * x).toFixed(0) + '%';
  console.log(`\n== ${label} (${n} fights)`);
  console.log(`  finishes: KO ${ko}  TKO ${tko}  decision ${dec}  draw ${draw}   avg length ${(stats.avgLen / 60).toFixed(2)} min (min ${stats.minLen.toFixed(0)} s, <60s: ${stats.under60})`);
  console.log(`  accuracy ${pct(stats.hitRate)}  landed/min ${stats.landedPerMin.toFixed(1)}  knockdowns/fight ${stats.kdPerFight.toFixed(2)} (fights with KD ${pct(stats.fightsWithKD)})  comebacks ${stats.comebacks}`);
  console.log(`  per fight: blocks ${stats.blocksPerFight.toFixed(1)}  parries ${stats.perfectPerFight.toFixed(1)}  evades ${stats.evadesPerFight.toFixed(1)}  counters ${stats.countersPerFight.toFixed(1)}  stuns ${stats.stunsPerFight.toFixed(2)}  specials ${stats.specialsPerFight.toFixed(2)}  guard breaks ${stats.guardBreaks.toFixed(2)}  4+ combos ${stats.bigCombos.toFixed(2)}  taunts ${stats.taunts.toFixed(2)}`);
  return stats;
}

const t0 = Date.now();
const all = [];

// Even matchups across profiles and difficulties (with and without rig points).
const evenCfg = [];
for (let i = 0; i < N; i++) {
  const p1 = PROFILES[i % PROFILES.length], p2 = PROFILES[(i * 5 + 1) % PROFILES.length];
  const d = ['normal', 'hard', 'legend', 'normal'][i % 4];
  evenCfg.push({ seed: 1000 + i, p1, p2, d1: d, d2: d, usePoints: i % 2 === 1 });
}
const even = batch('Even CPU vs CPU (mixed profiles, same difficulty)', evenCfg);
all.push(even);
for (const r of even.R) {
  for (let s = 0; s < 2; s++) {
    const rate = r.landedBy[s] / Math.max(1, r.thrownBy[s]);
    assert(r.thrownBy[s] > 10, `fighter threw almost nothing (${r.thrownBy[s]})`);
    assert(rate > 0.05 && rate < 0.95, `hit rate degenerate ${rate.toFixed(2)}`);
  }
}

// Legend vs easy, mirror profiles, both corners.
const skillCfg = [];
for (let i = 0; i < N; i++) {
  const p = PROFILES[i % PROFILES.length];
  const legendSide = i % 2;
  skillCfg.push({ seed: 5000 + i, p1: p, p2: p, d1: legendSide === 0 ? 'legend' : 'easy', d2: legendSide === 1 ? 'legend' : 'easy', usePoints: i % 3 === 0, legendSide });
}
const skill = batch('Legend vs Easy (mirror profiles)', skillCfg);
const legendWins = skill.R.filter((r, i) => r.winner === skillCfg[i].legendSide).length;
console.log(`  legend win rate ${(100 * legendWins / skill.n).toFixed(0)}%`);

const hardCfg = skillCfg.map((c, i) => ({ ...c, seed: 9000 + i, d1: c.legendSide === 0 ? 'hard' : 'normal', d2: c.legendSide === 1 ? 'hard' : 'normal' }));
const hard = batch('Hard vs Normal (mirror profiles)', hardCfg);
const hardWins = hard.R.filter((r, i) => r.winner === hardCfg[i].legendSide).length;
console.log(`  hard win rate ${(100 * hardWins / hard.n).toFixed(0)}%`);

// Short rounds still conclude.
const shortCfg = [];
for (let i = 0; i < Math.max(6, N / 4); i++) shortCfg.push({ seed: 7000 + i, p1: PROFILES[i % 6], p2: PROFILES[(i + 2) % 6], d1: 'normal', d2: 'hard', roundTime: 30 });
batch('Short rounds (30 s)', shortCfg);

// ---------------------------------------------------------------- tuning assertions
assert(even.hitRate > 0.2 && even.hitRate < 0.7, `even hit rate ${even.hitRate.toFixed(2)} outside 20..70%`);
assert(even.fightsWithKD >= 0.3, `knockdowns too rare (${(even.fightsWithKD * 100).toFixed(0)}% of fights)`);
assert((even.ko + even.tko) / even.n >= 0.2 && (even.ko + even.tko) / even.n <= 0.8, 'finish rate should be between 20% and 80%');
assert(even.avgLen >= 150, `fights too short on average (${even.avgLen.toFixed(0)} s)`);
assert(even.under60 / even.n <= 0.1, 'too many sub-minute fights');
assert(legendWins / skill.n >= 0.75, `legend should beat easy most of the time (${legendWins}/${skill.n})`);
assert(hardWins / hard.n >= 0.5, `hard should edge out normal (${hardWins}/${hard.n})`);
assert(even.specialsPerFight > 0.3, 'specials almost never used');
assert(even.countersPerFight > 0.5, 'counters almost never happen');

console.log(`\n${failures ? 'FAILED' : 'OK'}: ${failures} assertion failure(s); ${((Date.now() - t0) / 1000).toFixed(1)} s`);
process.exit(failures ? 1 : 0);
