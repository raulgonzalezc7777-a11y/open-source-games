// Move table and input -> move mapping.
//
// Every attack is one entry in MOVES. Timing is real frame data in seconds at
// speed stat 50 and full stamina (fast fighters are up to ~10% quicker, a gassed
// fighter up to ~20% slower):
//
//   |-- startup (windup) --|-- active --|-- recovery --|
//                          ^ the limb can connect only inside the active window
//
// Field reference
//   anim       FighterState.anim played while the move runs (several moves share
//              an anim; FighterState.target tells the rig 'head' or 'body').
//   damage     zone health removed on a clean hit (zone health is 0..1).
//   stamina    stamina spent when thrown (whiffs cost an extra 40%).
//   reach      max centre-to-centre distance (m) at which the move connects.
//   minRange   below this the strike is smothered (too close to extend).
//   cone       half-angle (deg) in front of the attacker the target must be in.
//   zone       'head' | 'body' | 'legs' target zone.
//   knockback  m/s pushed into the defender on hit (half on block).
//   hitstun    seconds the defender is locked in a hit reaction.
//   power      0..1 knockdown potency (how much a clean shot rattles the brain).
//   lunge      metres the attacker travels forward during startup+active.
//   special    true for profile specials (need a full special meter).
//   limb       attacking limb, also the getPoint() name used for hit tests.
//   hand       'lead' | 'rear' (drives hook alternation in combos).
//   kind       'punch' | 'kick' | 'special' | 'feint'.

export const MOVES = {
  // ---- punches (orthodox: lead = left) ----
  jab: {
    anim: 'jab', kind: 'punch', hand: 'lead', limb: 'fistL', zone: 'head',
    damage: 0.026, stamina: 0.02, reach: 1.08, minRange: 0.45, cone: 32,
    startup: 0.11, active: 0.06, recovery: 0.16, knockback: 0.25, hitstun: 0.24, power: 0.15,
    lunge: 0.12, special: false,
  },
  cross: {
    anim: 'cross', kind: 'punch', hand: 'rear', limb: 'fistR', zone: 'head',
    damage: 0.055, stamina: 0.04, reach: 1.12, minRange: 0.5, cone: 30,
    startup: 0.19, active: 0.07, recovery: 0.24, knockback: 0.5, hitstun: 0.32, power: 0.45,
    lunge: 0.08, special: false,
  },
  leadHook: {
    anim: 'leadHook', kind: 'punch', hand: 'lead', limb: 'fistL', zone: 'head',
    damage: 0.062, stamina: 0.045, reach: 0.92, minRange: 0.4, cone: 60,
    startup: 0.21, active: 0.07, recovery: 0.27, knockback: 0.4, hitstun: 0.34, power: 0.6,
    lunge: 0.03, special: false,
  },
  rearHook: {
    anim: 'rearHook', kind: 'punch', hand: 'rear', limb: 'fistR', zone: 'head',
    damage: 0.075, stamina: 0.055, reach: 0.95, minRange: 0.4, cone: 60,
    startup: 0.27, active: 0.08, recovery: 0.3, knockback: 0.55, hitstun: 0.38, power: 0.75,
    lunge: 0.05, special: false,
  },
  uppercut: {
    anim: 'uppercut', kind: 'punch', hand: 'rear', limb: 'fistR', zone: 'head',
    damage: 0.072, stamina: 0.055, reach: 0.82, minRange: 0.3, cone: 35,
    startup: 0.25, active: 0.07, recovery: 0.3, knockback: 0.45, hitstun: 0.38, power: 0.8,
    lunge: 0.04, special: false,
  },
  // Body variants (bodyMod held). They reuse the punch anims; FighterState.target = 'body'.
  bodyJab: {
    anim: 'jab', kind: 'punch', hand: 'lead', limb: 'fistL', zone: 'body',
    damage: 0.03, stamina: 0.022, reach: 1.02, minRange: 0.45, cone: 32,
    startup: 0.13, active: 0.06, recovery: 0.18, knockback: 0.25, hitstun: 0.24, power: 0.1,
    lunge: 0.1, special: false,
  },
  bodyCross: {
    anim: 'cross', kind: 'punch', hand: 'rear', limb: 'fistR', zone: 'body',
    damage: 0.06, stamina: 0.042, reach: 1.06, minRange: 0.5, cone: 30,
    startup: 0.21, active: 0.07, recovery: 0.25, knockback: 0.5, hitstun: 0.34, power: 0.3,
    lunge: 0.12, special: false,
  },
  leadBodyHook: {
    anim: 'bodyHook', kind: 'punch', hand: 'lead', limb: 'fistL', zone: 'body',
    damage: 0.068, stamina: 0.045, reach: 0.9, minRange: 0.35, cone: 60,
    startup: 0.22, active: 0.07, recovery: 0.27, knockback: 0.4, hitstun: 0.36, power: 0.45,
    lunge: 0.05, special: false,
  },
  rearBodyHook: {
    anim: 'bodyHook', kind: 'punch', hand: 'rear', limb: 'fistR', zone: 'body',
    damage: 0.08, stamina: 0.055, reach: 0.92, minRange: 0.35, cone: 60,
    startup: 0.27, active: 0.08, recovery: 0.3, knockback: 0.5, hitstun: 0.4, power: 0.55,
    lunge: 0.06, special: false,
  },
  bodyUppercut: {
    anim: 'uppercut', kind: 'punch', hand: 'rear', limb: 'fistR', zone: 'body',
    damage: 0.075, stamina: 0.05, reach: 0.8, minRange: 0.3, cone: 35,
    startup: 0.24, active: 0.07, recovery: 0.3, knockback: 0.45, hitstun: 0.38, power: 0.5,
    lunge: 0.05, special: false,
  },

  // ---- kicks (rear leg roundhouses, lead leg teep) ----
  legKick: {
    anim: 'legKick', kind: 'kick', hand: 'rear', limb: 'footR', zone: 'legs',
    damage: 0.075, stamina: 0.06, reach: 1.12, minRange: 0.5, cone: 45,
    startup: 0.25, active: 0.08, recovery: 0.32, knockback: 0.2, hitstun: 0.34, power: 0.0,
    lunge: 0.05, special: false,
  },
  frontKick: {
    anim: 'frontKick', kind: 'kick', hand: 'lead', limb: 'footL', zone: 'body',
    damage: 0.05, stamina: 0.06, reach: 1.3, minRange: 0.55, cone: 30,
    startup: 0.25, active: 0.08, recovery: 0.33, knockback: 3.2, hitstun: 0.4, power: 0.2,
    lunge: 0.05, special: false,
  },
  bodyKick: {
    anim: 'bodyKick', kind: 'kick', hand: 'rear', limb: 'footR', zone: 'body',
    damage: 0.1, stamina: 0.08, reach: 1.22, minRange: 0.55, cone: 50,
    startup: 0.32, active: 0.09, recovery: 0.38, knockback: 0.8, hitstun: 0.45, power: 0.6,
    lunge: 0.06, special: false,
  },
  headKick: {
    anim: 'headKick', kind: 'kick', hand: 'rear', limb: 'footR', zone: 'head',
    damage: 0.14, stamina: 0.1, reach: 1.25, minRange: 0.6, cone: 50,
    startup: 0.4, active: 0.09, recovery: 0.45, knockback: 0.9, hitstun: 0.5, power: 1.25,
    lunge: 0.06, special: false,
  },

  // ---- specials (need specialMeter >= 1; the profile's `special` picks one) ----
  superman: {
    anim: 'superman', kind: 'special', hand: 'rear', limb: 'fistR', zone: 'head',
    damage: 0.13, stamina: 0.12, reach: 1.15, minRange: 0.4, cone: 40,
    startup: 0.36, active: 0.09, recovery: 0.36, knockback: 1.0, hitstun: 0.55, power: 1.2,
    lunge: 0.75, special: true,
  },
  flyingKnee: {
    anim: 'flyingKnee', kind: 'special', hand: 'rear', limb: 'kneeR', zone: 'head',
    damage: 0.16, stamina: 0.14, reach: 0.95, minRange: 0.2, cone: 40,
    startup: 0.4, active: 0.1, recovery: 0.42, knockback: 1.3, hitstun: 0.6, power: 1.4,
    lunge: 0.95, special: true,
  },
  spinningBackfist: {
    anim: 'spinningBackfist', kind: 'special', hand: 'rear', limb: 'fistR', zone: 'head',
    damage: 0.12, stamina: 0.1, reach: 1.1, minRange: 0.4, cone: 55,
    startup: 0.34, active: 0.09, recovery: 0.34, knockback: 0.9, hitstun: 0.55, power: 1.15,
    lunge: 0.35, special: true,
  },
  spinningHeelKick: {
    anim: 'spinningHeelKick', kind: 'special', hand: 'rear', limb: 'footR', zone: 'head',
    damage: 0.18, stamina: 0.15, reach: 1.3, minRange: 0.5, cone: 55,
    startup: 0.48, active: 0.1, recovery: 0.48, knockback: 1.4, hitstun: 0.65, power: 1.6,
    lunge: 0.3, special: true,
  },

  // ---- feint: a twitch of the jab that never connects (CPU uses it; optional input.feint) ----
  feint: {
    anim: 'jab', kind: 'feint', hand: 'lead', limb: 'fistL', zone: 'head',
    damage: 0, stamina: 0.006, reach: 0, minRange: 0, cone: 0,
    startup: 0.09, active: 0, recovery: 0.1, knockback: 0, hitstun: 0, power: 0,
    lunge: 0.04, special: false,
  },
};

export const SPECIAL_IDS = ['superman', 'flyingKnee', 'spinningBackfist', 'spinningHeelKick'];

/** The special move for a profile (falls back to superman for unknown ids). */
export function specialFor(profile) {
  const s = profile && profile.special;
  return SPECIAL_IDS.includes(s) ? s : 'superman';
}

/** Total duration of a move in seconds at nominal speed. */
export function moveDuration(id) {
  const m = MOVES[id];
  return m.startup + m.active + m.recovery;
}

// A "lead" hand strike thrown within this many seconds makes the next hook the
// rear hook (so jab -> hook is a 1-2 rear hook and 1-2-3 is jab, cross, lead hook).
export const CHAIN_WINDOW = 0.6;

/**
 * Map an InputState (edge-triggered buttons) to the move it should start.
 * `fs` is the attacker's FighterState (uses specialMeter, specialMove, lastMove, lastMoveAge).
 * Returns a MOVES id or null. Priority: special > kicks > power punches > jab.
 */
export function getMoveForInput(input, fs = {}) {
  if (!input) return null;
  const body = !!input.bodyMod;
  if (input.special && (fs.specialMeter ?? 0) >= 1) return fs.specialMove || 'superman';
  if (input.roundhouse) return body ? 'bodyKick' : 'headKick';
  if (input.legKick) return 'legKick';
  if (input.frontKick) return 'frontKick';
  if (input.uppercut) return body ? 'bodyUppercut' : 'uppercut';
  if (input.hook) {
    const last = fs.lastMove && MOVES[fs.lastMove];
    const chained = last && (fs.lastMoveAge ?? 99) < CHAIN_WINDOW;
    const rear = chained && last.hand === 'lead' && last.kind === 'punch';
    if (body) return rear ? 'rearBodyHook' : 'leadBodyHook';
    return rear ? 'rearHook' : 'leadHook';
  }
  if (input.cross) return body ? 'bodyCross' : 'cross';
  if (input.jab) return body ? 'bodyJab' : 'jab';
  if (input.feint) return 'feint';
  return null;
}
