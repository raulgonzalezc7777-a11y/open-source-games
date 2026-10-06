// Anatomical landmarks + signed distance field body definition for one fighter.
// Bind pose: standing, facing +Z, fighter's left = +X, arms in an A-pose.
import { ellipsoid, sphere, roundCone, muscle, frameEuler, frameAlong, OP_SUB } from './sdf.js';

export const BUILDS = {
  light: { h: 1.78, sh: 0.95, hip: 0.96, mus: 0.9, leg: 0.92, fat: 0.03, def: 1.0, neck: 0.9 },
  middle: { h: 1.83, sh: 1.0, hip: 1.0, mus: 1.0, leg: 1.0, fat: 0.1, def: 0.85, neck: 1.0 },
  heavy: { h: 1.9, sh: 1.08, hip: 1.07, mus: 1.14, leg: 1.12, fat: 0.42, def: 0.45, neck: 1.18 },
};

export const BONE_NAMES = [
  'hips', 'spine', 'chest', 'neck', 'head',
  'clavicleL', 'upperArmL', 'forearmL', 'handL',
  'clavicleR', 'upperArmR', 'forearmR', 'handR',
  'thighL', 'shinL', 'footL', 'toeL',
  'thighR', 'shinR', 'footR', 'toeR',
];
export const BONE_PARENT = {
  hips: null, spine: 'hips', chest: 'spine', neck: 'chest', head: 'neck',
  clavicleL: 'chest', upperArmL: 'clavicleL', forearmL: 'upperArmL', handL: 'forearmL',
  clavicleR: 'chest', upperArmR: 'clavicleR', forearmR: 'upperArmR', handR: 'forearmR',
  thighL: 'hips', shinL: 'thighL', footL: 'shinL', toeL: 'footL',
  thighR: 'hips', shinR: 'thighR', footR: 'shinR', toeR: 'footR',
};

const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const crossv = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

export function buildParams(profile) {
  const b = { ...BUILDS[profile.build || 'middle'] };
  if (profile.height) b.h = profile.height;
  const face = {
    jaw: 1, brow: 1, nose: 1, noseFlat: 0, cheek: 1, lips: 1, eyeOpen: 1, cauliflower: 0, chin: 1, headW: 1,
    ...(profile.face || {}),
  };
  return { ...b, face, s: b.h / 1.8 };
}

export function buildAnatomy(profile) {
  const P = buildParams(profile);
  const s = P.s;
  const sh = P.sh, hp = P.hip, mus = P.mus, fat = P.fat, def = P.def, nk = P.neck, lg = P.leg;
  const F = P.face;
  const Y = (y) => y * s;
  const J = {};
  // ---- skeleton landmarks --------------------------------------------------
  J.hips = [0, Y(0.975), 0];
  J.spine = [0, Y(1.1), -0.012 * s];
  J.chest = [0, Y(1.265), -0.02 * s];
  J.neck = [0, Y(1.485), -0.03 * s];
  J.head = [0, Y(1.595), -0.012 * s];
  J.headTop = [0, Y(1.815), -0.01 * s];
  const armA = (43 * Math.PI) / 180;
  for (const side of [1, -1]) {
    const L = side > 0 ? 'L' : 'R';
    J['clavicle' + L] = [0.022 * side * s, Y(1.452), 0.012 * s];
    const S = [0.178 * side * s * sh, Y(1.44), -0.022 * s];
    J['upperArm' + L] = S;
    const d = norm([Math.sin(armA) * side, -Math.cos(armA), 0.03]);
    const E = add(S, mul(d, 0.29 * s));
    const W = add(E, mul(d, 0.255 * s));
    J['forearm' + L] = E;
    J['hand' + L] = W;
    J['handEnd' + L] = add(W, mul(d, 0.085 * s));
    J['armDir' + L] = d;
    const hipJ = [0.09 * side * s * hp, Y(0.93), 0.0];
    const K = [0.105 * side * s * hp, Y(0.505), 0.012 * s];
    const A = [0.112 * side * s * hp, Y(0.083), -0.022 * s];
    const Ball = [0.122 * side * s * hp, Y(0.022), 0.118 * s];
    const ToeE = [0.126 * side * s * hp, Y(0.016), 0.178 * s];
    J['thigh' + L] = hipJ;
    J['shin' + L] = K;
    J['foot' + L] = A;
    J['toe' + L] = Ball;
    J['toeEnd' + L] = ToeE;
  }

  // ---- body SDF ------------------------------------------------------------
  const prims = [];
  const push = (p) => { prims.push(p); return p; };
  const B = (...pairs) => pairs; // bones helper

  // Torso core
  push(ellipsoid([0, Y(0.955), -0.008 * s], [0.152 * s * hp, 0.105 * s, 0.104 * s * (1 + fat * 0.15)], { k: 0.04 * s, bones: B(['hips', 1]) }));
  push(ellipsoid([0, Y(1.045), 0.012 * s], [0.132 * s * hp * (1 + fat * 0.15), 0.09 * s, 0.096 * s * (1 + fat * 0.25)], { k: 0.04 * s, bones: B(['hips', 0.55], ['spine', 0.45]) }));
  push(ellipsoid([0, Y(1.135), 0.004 * s], [(0.124 + fat * 0.035) * s * sh, 0.1 * s, (0.094 + fat * 0.05) * s], { k: 0.05 * s, bones: B(['spine', 1]) }));
  if (fat > 0.15) {
    push(ellipsoid([0, Y(1.075), 0.045 * s], [0.115 * s, 0.095 * s, 0.08 * s * fat * 1.3], { k: 0.05 * s, bones: B(['spine', 0.7], ['hips', 0.3]) }));
    // love handles
    for (const side of [1, -1]) push(ellipsoid([0.115 * side * s * hp, Y(1.03), -0.01 * s], [0.045 * s, 0.05 * s, 0.07 * s], { k: 0.04 * s, bones: B(['hips', 0.6], ['spine', 0.4]) }));
  }
  push(ellipsoid([0, Y(1.27), -0.016 * s], [0.143 * s * sh, 0.165 * s, 0.108 * s * (1 + fat * 0.1)], { k: 0.05 * s, bones: B(['chest', 1]) }));
  push(ellipsoid([0, Y(1.385), -0.022 * s], [0.158 * s * sh, 0.085 * s, 0.094 * s], { k: 0.05 * s, bones: B(['chest', 1]) }));
  // Pecs
  for (const side of [1, -1]) {
    const L = side > 0 ? 'L' : 'R';
    push(ellipsoid([0.07 * side * s * sh, Y(1.348), 0.058 * s], [0.08 * s * mus * sh, 0.058 * s * mus, 0.042 * s * mus], {
      k: 0.026 * s, axes: frameEuler(-8, 10 * side, -14 * side), bones: B(['chest', 0.92], ['upperArm' + L, 0.08]),
    }));
  }
  // Abs (six pack) – definition controls bump depth & sharpness
  const absDepth = 0.016 * def + 0.006;
  const absK = (0.008 + (1 - def) * 0.02) * s;
  for (let r = 0; r < 3; r++) {
    const y = Y(1.208 - r * 0.07);
    const z = (0.098 - r * 0.002 + fat * 0.03 * (r + 1) * 0.6) * s - 0.016 * s;
    for (const side of [1, -1]) {
      push(ellipsoid([0.031 * side * s, y, z], [0.029 * s, 0.03 * s, absDepth * s], { k: absK, bones: B([r === 0 ? 'chest' : 'spine', 1]) }));
    }
  }
  // lower abs mass
  push(ellipsoid([0, Y(1.0), 0.068 * s], [0.05 * s, 0.055 * s, 0.03 * s], { k: 0.02 * s, bones: B(['hips', 0.7], ['spine', 0.3]) }));
  // navel
  push(sphere([0, Y(1.035), 0.112 * s + fat * 0.06 * s], 0.0075 * s, { op: OP_SUB, k: 0.008 * s }));
  for (const side of [1, -1]) {
    const L = side > 0 ? 'L' : 'R';
    // obliques
    push(ellipsoid([0.112 * side * s * hp, Y(1.07), 0.02 * s], [0.046 * s, 0.085 * s, 0.07 * s], { k: 0.03 * s, axes: frameEuler(0, 0, 8 * side), bones: B(['spine', 0.6], ['hips', 0.4]) }));
    // serratus hints
    for (let i = 0; i < 3 && def > 0.6; i++) {
      push(ellipsoid([0.118 * side * s * sh, Y(1.29 - i * 0.04), 0.045 * s], [0.012 * s, 0.014 * s, 0.03 * s], { k: 0.012 * s, axes: frameEuler(0, 20 * side, 30 * side), bones: B(['chest', 1]) }));
    }
    // lats
    push(ellipsoid([0.112 * side * s * sh, Y(1.27), -0.045 * s], [0.064 * s * mus, 0.14 * s, 0.062 * s], { k: 0.04 * s, axes: frameEuler(0, 0, 14 * side), bones: B(['chest', 0.95], ['upperArm' + L, 0.05]) }));
    // shoulder blades
    push(ellipsoid([0.085 * side * s * sh, Y(1.36), -0.088 * s], [0.06 * s, 0.075 * s, 0.03 * s], { k: 0.03 * s, axes: frameEuler(0, 0, 10 * side), bones: B(['chest', 0.85], ['clavicle' + L, 0.15]) }));
    // erectors
    push(ellipsoid([0.032 * side * s, Y(1.12), -0.08 * s], [0.029 * s, 0.13 * s, 0.032 * s], { k: 0.025 * s, bones: B(['spine', 0.8], ['hips', 0.2]) }));
    // glutes
    push(ellipsoid([0.068 * side * s * hp, Y(0.905), -0.07 * s], [0.08 * s * hp, 0.09 * s, 0.07 * s * mus], { k: 0.035 * s, axes: frameEuler(-10, 0, 8 * side), bones: B(['hips', 0.75], ['thigh' + L, 0.25]) }));
    // traps
    push(roundCone([0.0, Y(1.545), -0.058 * s], [0.162 * side * s * sh, Y(1.462), -0.032 * s], 0.042 * s * mus * nk, 0.026 * s, {
      k: 0.045 * s, bones: B(['chest', 0.4], ['neck', 0.25], ['clavicle' + L, 0.35]),
    }));
    // clavicle ridge
    push(roundCone([0.014 * side * s, Y(1.462), 0.046 * s], [0.158 * side * s * sh, Y(1.468), 0.004 * s], 0.0115 * s, 0.013 * s, {
      k: 0.02 * s, bones: B(['chest', 0.5], ['clavicle' + L, 0.5]),
    }));
    // SCM
    push(roundCone([0.044 * side * s, Y(1.635), -0.028 * s], [0.013 * side * s, Y(1.47), 0.04 * s], 0.015 * s * nk, 0.013 * s * nk, {
      k: 0.02 * s, bones: B(['neck', 0.8], ['head', 0.2]),
    }));
  }
  push(ellipsoid([0, Y(1.405), -0.085 * s], [0.1 * s * sh, 0.09 * s, 0.035 * s], { k: 0.04 * s, bones: B(['chest', 1]) }));
  // Neck
  push(roundCone([0, Y(1.44), -0.032 * s], [0, Y(1.625), -0.008 * s], 0.06 * s * nk, 0.052 * s * (0.9 + nk * 0.1), {
    k: 0.04 * s, bones: B(['neck', 1]),
  }));
  push(ellipsoid([0, Y(1.548), 0.042 * s], [0.012 * s, 0.017 * s, 0.012 * s], { k: 0.012 * s, bones: B(['neck', 1]) }));

  // ---- Head ------------------------------------------------------------------
  const hw = F.headW;
  const HB = B(['head', 1]);
  push(ellipsoid([0, Y(1.715), -0.014 * s], [0.077 * s * hw, 0.098 * s, 0.1 * s], { k: 0.03 * s, bones: HB }));
  push(ellipsoid([0, Y(1.735), 0.032 * s], [0.07 * s * hw, 0.062 * s, 0.062 * s], { k: 0.03 * s, bones: HB }));
  push(ellipsoid([0, Y(1.665), 0.03 * s], [0.06 * s * hw * F.cheek, 0.066 * s, 0.07 * s], { k: 0.03 * s, bones: HB }));
  // back of skull / occipital
  push(ellipsoid([0, Y(1.69), -0.07 * s], [0.065 * s * hw, 0.07 * s, 0.05 * s], { k: 0.03 * s, bones: HB }));
  for (const side of [1, -1]) {
    // jaw line
    push(roundCone([0.059 * side * s * F.jaw * hw, Y(1.648), -0.012 * s], [0.021 * side * s, Y(1.585), 0.07 * s], 0.021 * s * F.jaw, 0.017 * s, { k: 0.022 * s, bones: HB }));
    // masseter
    push(ellipsoid([0.055 * side * s * F.jaw * hw, Y(1.635), 0.018 * s], [0.016 * s, 0.03 * s, 0.026 * s], { k: 0.02 * s, bones: HB }));
    // cheekbones
    push(ellipsoid([0.047 * side * s * F.cheek, Y(1.68), 0.064 * s], [0.027 * s, 0.016 * s, 0.024 * s], { k: 0.02 * s, axes: frameEuler(0, 25 * side, 0), bones: HB }));
    // temples fill
    push(ellipsoid([0.066 * side * s * hw, Y(1.725), 0.03 * s], [0.016 * s, 0.03 * s, 0.035 * s], { k: 0.02 * s, bones: HB }));
    // brow ridge
    push(roundCone([0.009 * side * s, Y(1.716), 0.096 * s], [0.055 * side * s, Y(1.72), 0.078 * s], 0.0105 * s * F.brow, 0.009 * s * F.brow, { k: 0.016 * s, bones: HB }));
  }
  push(ellipsoid([0, Y(1.585), 0.078 * s], [0.025 * s * F.chin, 0.021 * s, 0.02 * s], { k: 0.02 * s, bones: HB }));
  push(ellipsoid([0, Y(1.625), 0.074 * s], [0.034 * s, 0.03 * s, 0.031 * s], { k: 0.02 * s, bones: HB }));
  // Nose
  const ns = F.nose, nf = F.noseFlat;
  push(roundCone([0, Y(1.706), 0.097 * s], [0, Y(1.669), (0.122 - nf * 0.008) * s], 0.0075 * s * ns, 0.0105 * s * ns * (1 + nf * 0.3), { k: 0.012 * s, bones: HB }));
  push(sphere([0, Y(1.664), (0.12 - nf * 0.007) * s], 0.0125 * s * ns * (1 + nf * 0.2), { k: 0.008 * s, bones: HB }));
  for (const side of [1, -1]) {
    push(ellipsoid([0.0135 * side * s * ns * (1 + nf * 0.35), Y(1.659), 0.107 * s], [0.0105 * s * (1 + nf * 0.25), 0.0085 * s, 0.0105 * s], { k: 0.007 * s, bones: HB }));
    push(ellipsoid([0.0075 * side * s, Y(1.6525), 0.114 * s - nf * 0.006 * s], [0.0042 * s, 0.0024 * s, 0.0042 * s], { op: OP_SUB, k: 0.003 * s }));
  }
  // Eyes: socket, lid mass, aperture
  const eyeC = (side) => [0.0325 * side * s, Y(1.6925), 0.0775 * s];
  for (const side of [1, -1]) {
    const e = eyeC(side);
    push(ellipsoid([e[0], e[1] + 0.001 * s, 0.091 * s], [0.021 * s, 0.0145 * s, 0.018 * s], { op: OP_SUB, k: 0.011 * s }));
  }
  for (const side of [1, -1]) {
    const e = eyeC(side);
    push(sphere(e, 0.0137 * s, { k: 0.006 * s, bones: HB }));
    // upper lid crease fold
    push(ellipsoid([e[0], e[1] + 0.0075 * s, e[2] + 0.004 * s], [0.014 * s, 0.006 * s, 0.0105 * s], { k: 0.004 * s, bones: HB }));
  }
  for (const side of [1, -1]) {
    const e = eyeC(side);
    push(ellipsoid([e[0], e[1] - 0.0004 * s, e[2] + 0.013 * s], [0.0128 * s, 0.0047 * s * F.eyeOpen, 0.0125 * s], {
      op: OP_SUB, k: 0.0018 * s, axes: frameEuler(0, 0, 6 * side),
    }));
  }
  // Lips
  const lp = F.lips;
  push(ellipsoid([0, Y(1.627), 0.1 * s], [0.021 * s, 0.0062 * s * lp, 0.0088 * s * lp], { k: 0.006 * s, bones: HB }));
  push(ellipsoid([0, Y(1.6155), 0.0965 * s], [0.0185 * s, 0.007 * s * lp, 0.009 * s * lp], { k: 0.006 * s, bones: HB }));
  push(ellipsoid([0, Y(1.6215), 0.104 * s], [0.021 * s, 0.0011 * s, 0.008 * s], { op: OP_SUB, k: 0.0022 * s, axes: frameEuler(0, 0, 0) }));
  // philtrum groove
  push(ellipsoid([0, Y(1.641), 0.104 * s], [0.0035 * s, 0.008 * s, 0.003 * s], { op: OP_SUB, k: 0.004 * s }));
  // Ears
  for (const side of [1, -1]) {
    const c = [0.077 * side * s * hw, Y(1.684), -0.01 * s];
    const ax = frameEuler(-12, 18 * side, 0);
    const cau = F.cauliflower;
    push(ellipsoid(c, [0.012 * s * (1 + cau * 0.5), 0.031 * s, 0.02 * s], { k: 0.007 * s, axes: ax, bones: HB }));
    // concha hollow
    push(ellipsoid(add(c, [0.008 * side * s, -0.002 * s, 0.004 * s]), [0.006 * s, 0.014 * s * (1 - cau * 0.4), 0.009 * s], { op: OP_SUB, k: 0.004 * s, axes: ax }));
    if (cau > 0) {
      push(sphere(add(c, [0.006 * side * s, 0.012 * s, -0.004 * s]), 0.009 * s * cau, { k: 0.006 * s, bones: HB }));
      push(sphere(add(c, [0.007 * side * s, -0.004 * s, -0.008 * s]), 0.008 * s * cau, { k: 0.006 * s, bones: HB }));
    }
  }

  // ---- Arms --------------------------------------------------------------------
  for (const side of [1, -1]) {
    const L = side > 0 ? 'L' : 'R';
    const S = J['upperArm' + L], E = J['forearm' + L], W = J['hand' + L];
    const d = J['armDir' + L];
    const lat = norm([Math.cos(armA) * side, Math.sin(armA), 0]);
    const fwd = [0, 0, 1];
    const UA = 'upperArm' + L, FA = 'forearm' + L;
    const m = mus;
    // deltoid (3 heads)
    push(muscle(S, E, 0.12, 0.085 * s, 0.05 * s * m, 0.054 * s * m, { off: add(mul(lat, 0.01 * s), [0, 0.004 * s, 0]), k: 0.03 * s, bones: B([UA, 0.7], ['clavicle' + L, 0.3]) }));
    push(muscle(S, E, 0.14, 0.07 * s, 0.032 * s * m, 0.03 * s * m, { off: add(mul(fwd, 0.03 * s), mul(lat, -0.003 * s)), k: 0.025 * s, bones: B([UA, 0.6], ['clavicle' + L, 0.25], ['chest', 0.15]) }));
    push(muscle(S, E, 0.14, 0.07 * s, 0.032 * s * m, 0.03 * s * m, { off: add(mul(fwd, -0.032 * s), mul(lat, -0.002 * s)), k: 0.025 * s, bones: B([UA, 0.6], ['clavicle' + L, 0.25], ['chest', 0.15]) }));
    // upper arm core
    push(roundCone(add(S, mul(d, 0.03 * s)), E, 0.042 * s * m, 0.033 * s, { k: 0.03 * s, bones: B([UA, 1]) }));
    // biceps
    push(muscle(S, E, 0.56, 0.1 * s, 0.031 * s * m, 0.033 * s * m, { off: mul(fwd, 0.014 * s), k: 0.02 * s, bones: B([UA, 1]) }));
    // triceps
    push(muscle(S, E, 0.42, 0.125 * s, 0.035 * s * m, 0.032 * s * m, { off: add(mul(fwd, -0.015 * s), mul(lat, 0.004 * s)), k: 0.024 * s, bones: B([UA, 1]) }));
    // elbow
    push(sphere(E, 0.031 * s, { k: 0.025 * s, bones: B([UA, 0.5], [FA, 0.5]) }));
    push(sphere(add(E, mul(fwd, -0.022 * s)), 0.016 * s, { k: 0.015 * s, bones: B([UA, 0.4], [FA, 0.6]) }));
    // forearm
    push(roundCone(add(E, mul(d, 0.02 * s)), W, 0.037 * s * m, 0.026 * s, { k: 0.025 * s, bones: B([FA, 1]) }));
    push(muscle(E, W, 0.26, 0.09 * s, 0.036 * s * m, 0.034 * s * m, { off: add(mul(lat, 0.012 * s), mul(fwd, 0.006 * s)), k: 0.025 * s, bones: B([FA, 0.88], [UA, 0.12]) }));
    push(muscle(E, W, 0.3, 0.085 * s, 0.03 * s * m, 0.028 * s * m, { off: add(mul(lat, -0.01 * s), mul(fwd, -0.004 * s)), k: 0.025 * s, bones: B([FA, 1]) }));
    // wrist + hand stub (hidden inside the glove)
    push(ellipsoid(W, [0.027 * s, 0.018 * s, 0.021 * s], { k: 0.015 * s, axes: frameAlong(d, [0, 0, 1]), bones: B([FA, 0.6], ['hand' + L, 0.4]) }));
    push(roundCone(W, add(W, mul(d, 0.065 * s)), 0.026 * s, 0.026 * s, { k: 0.015 * s, bones: B(['hand' + L, 1]) }));
  }

  // ---- Legs --------------------------------------------------------------------
  for (const side of [1, -1]) {
    const L = side > 0 ? 'L' : 'R';
    const H = J['thigh' + L], K = J['shin' + L], A = J['foot' + L], Ball = J['toe' + L], TE = J['toeEnd' + L];
    const TH = 'thigh' + L, SH = 'shin' + L, FT = 'foot' + L, TO = 'toe' + L;
    const lat = [side, 0, 0], fwd = [0, 0, 1];
    const m = mus * lg;
    push(roundCone(add(H, [0, 0.02 * s, 0]), K, 0.082 * s * m, 0.05 * s, { k: 0.04 * s, bones: B([TH, 1]) }));
    push(muscle(H, K, 0.52, 0.17 * s, 0.048 * s * m, 0.054 * s * m, { off: add(mul(lat, 0.032 * s), mul(fwd, 0.004 * s)), k: 0.03 * s, bones: B([TH, 1]) }));
    push(muscle(H, K, 0.42, 0.17 * s, 0.044 * s * m, 0.038 * s * m, { off: mul(fwd, 0.036 * s), k: 0.03 * s, bones: B([TH, 1]) }));
    push(muscle(H, K, 0.8, 0.07 * s, 0.038 * s * m, 0.033 * s * m, { off: add(mul(lat, -0.024 * s), mul(fwd, 0.018 * s)), k: 0.025 * s, bones: B([TH, 0.9], [SH, 0.1]) }));
    push(muscle(H, K, 0.22, 0.12 * s, 0.05 * s * m, 0.05 * s, { off: add(mul(lat, -0.035 * s), [0, 0, -0.005 * s]), k: 0.035 * s, bones: B([TH, 0.75], ['hips', 0.25]) }));
    push(muscle(H, K, 0.5, 0.17 * s, 0.046 * s * m, 0.043 * s * m, { off: mul(fwd, -0.034 * s), k: 0.03 * s, bones: B([TH, 1]) }));
    // knee
    push(sphere(K, 0.046 * s, { k: 0.03 * s, bones: B([TH, 0.5], [SH, 0.5]) }));
    push(ellipsoid(add(K, [0, 0.008 * s, 0.036 * s]), [0.024 * s, 0.027 * s, 0.014 * s], { k: 0.014 * s, bones: B([TH, 0.35], [SH, 0.65]) }));
    // shin + calf
    push(roundCone(add(K, [0, -0.02 * s, 0]), A, 0.043 * s, 0.027 * s, { k: 0.03 * s, bones: B([SH, 1]) }));
    push(muscle(K, A, 0.27, 0.1 * s, 0.032 * s * m, 0.036 * s * m, { off: add(mul(fwd, -0.03 * s), mul(lat, -0.011 * s)), k: 0.025 * s, bones: B([SH, 1]) }));
    push(muscle(K, A, 0.25, 0.09 * s, 0.027 * s * m, 0.031 * s * m, { off: add(mul(fwd, -0.028 * s), mul(lat, 0.014 * s)), k: 0.025 * s, bones: B([SH, 1]) }));
    push(muscle(K, A, 0.32, 0.12 * s, 0.02 * s, 0.018 * s, { off: add(mul(fwd, 0.019 * s), mul(lat, 0.012 * s)), k: 0.02 * s, bones: B([SH, 1]) }));
    // achilles
    push(roundCone(add(A, [0, 0.11 * s, -0.035 * s]), add(A, [0, -0.04 * s, -0.045 * s]), 0.013 * s, 0.015 * s, { k: 0.02 * s, bones: B([SH, 0.6], [FT, 0.4]) }));
    // malleoli
    push(sphere(add(A, [0.022 * side * s, 0.002 * s, 0]), 0.014 * s, { k: 0.015 * s, bones: B([SH, 0.5], [FT, 0.5]) }));
    push(sphere(add(A, [-0.02 * side * s, 0.008 * s, 0.002 * s]), 0.014 * s, { k: 0.015 * s, bones: B([SH, 0.5], [FT, 0.5]) }));
    // foot
    push(ellipsoid(add(A, [0, -0.045 * s, -0.035 * s]), [0.031 * s, 0.032 * s, 0.038 * s], { k: 0.02 * s, bones: B([FT, 1]) }));
    const fdir = sub(Ball, A);
    push(muscle(A, Ball, 0.5, 0.085 * s, 0.037 * s, 0.026 * s, { hint: [0, 1, 0], off: [0, -0.012 * s, 0], k: 0.025 * s, bones: B([FT, 1]) }));
    push(ellipsoid(add(Ball, [-0.004 * side * s, 0.004 * s, 0]), [0.046 * s, 0.018 * s, 0.026 * s], { k: 0.02 * s, bones: B([FT, 0.6], [TO, 0.4]) }));
    // sole flattening pad
    push(ellipsoid(lerp3(A, Ball, 0.5).map((v, i) => (i === 1 ? 0.018 * s : v)), [0.038 * s, 0.016 * s, 0.1 * s], { k: 0.02 * s, bones: B([FT, 1]) }));
    // toes
    const toeX = [-0.03, -0.012, 0.004, 0.019, 0.032];
    const toeL = [0.05, 0.042, 0.038, 0.033, 0.027];
    const toeR = [0.0115, 0.0085, 0.008, 0.0075, 0.007];
    for (let t = 0; t < 5; t++) {
      const a0 = add(Ball, [toeX[t] * side * s, 0.002 * s, 0.01 * s - t * 0.004 * s]);
      const a1 = add(a0, [toeX[t] * side * s * 0.2, -0.004 * s, toeL[t] * s]);
      push(roundCone(a0, a1, toeR[t] * s * 1.05, toeR[t] * s * 0.9, { k: 0.005 * s, bones: B([TO, 1]) }));
    }
    void TE; void fdir;
  }

  // nipples
  for (const side of [1, -1]) {
    push(sphere([0.094 * side * s * sh, Y(1.318), 0.098 * s * mus], 0.0045 * s, { k: 0.004 * s, bones: B(['chest', 1]), tag: 'nipple' }));
  }

  const eyes = [eyeC(1), eyeC(-1)];
  const nipples = [[0.094 * s * sh, Y(1.318), 0.1 * s * mus], [-0.094 * s * sh, Y(1.318), 0.1 * s * mus]];
  return {
    params: P,
    joints: J,
    prims,
    eyes,
    eyeRadius: 0.0122 * s,
    nipples,
    headCutY: Y(1.552),
    headCenter: [0, Y(1.69), 0],
    landmarks: {
      browL: [[0.012 * s, Y(1.723), 0.1 * s], [0.056 * s, Y(1.727), 0.08 * s]],
      lipsY: Y(1.6215),
      mouthZ: 0.104 * s,
      chinY: Y(1.575),
      hairFrontY: Y(1.765),
      hairNapeY: Y(1.625),
      earY: Y(1.684),
      noseTip: [0, Y(1.664), 0.132 * s],
    },
  };
}

export const vec = { add, sub, mul, norm, lerp3, crossv };
