// Skeleton construction and SDF-driven skin weights.
import * as THREE from 'three';
import { BONE_NAMES, BONE_PARENT } from './anatomy.js';
import { primDist, OP_UNION, adjacency } from './sdf.js';

export function createSkeleton(J) {
  const bones = {};
  const list = [];
  for (const name of BONE_NAMES) {
    const b = new THREE.Bone();
    b.name = name;
    bones[name] = b;
    list.push(b);
  }
  for (const name of BONE_NAMES) {
    const p = BONE_PARENT[name];
    const w = J[name];
    if (p) {
      const pw = J[p];
      bones[name].position.set(w[0] - pw[0], w[1] - pw[1], w[2] - pw[2]);
      bones[p].add(bones[name]);
    } else {
      bones[name].position.set(w[0], w[1], w[2]);
    }
  }
  const skeleton = new THREE.Skeleton(list);
  return { bones, list, skeleton, root: bones.hips };
}

/**
 * Per-vertex 4-influence skin weights derived from which tagged SDF primitives
 * lie closest to the vertex (soft-min over primitive distances).
 */
export function computeSkinWeights(P, field, opts = {}) {
  const n = P.length / 3;
  const sigma = opts.sigma ?? 0.011;
  const boneIdx = {};
  BONE_NAMES.forEach((b, i) => (boneIdx[b] = i));
  const NB = BONE_NAMES.length;
  const W = new Float32Array(n * NB);
  const acc = new Float32Array(NB);
  for (let v = 0; v < n; v++) {
    const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2];
    const l = field.listAt(x, y, z) || [];
    let dmin = 1e9;
    const ds = [];
    for (let i = 0; i < l.length; i++) {
      const p = l[i];
      if (p.op !== OP_UNION || !p.bones) { ds.push(1e9); continue; }
      const d = primDist(p, x, y, z);
      ds.push(d);
      if (d < dmin) dmin = d;
    }
    acc.fill(0);
    for (let i = 0; i < l.length; i++) {
      const p = l[i];
      if (ds[i] >= 1e8) continue;
      const w = Math.exp(-(ds[i] - dmin) / (sigma * p.wsig));
      if (w < 1e-4) continue;
      for (const [bn, bw] of p.bones) acc[boneIdx[bn]] += w * bw;
    }
    let s = 0;
    for (let b = 0; b < NB; b++) s += acc[b];
    if (s <= 0) { acc[0] = 1; s = 1; }
    for (let b = 0; b < NB; b++) W[v * NB + b] = acc[b] / s;
  }
  return { W, NB };
}

export function smoothWeights(Wd, indices, iters, frozen) {
  const { W, NB } = Wd;
  const n = W.length / NB;
  const { start, nb } = adjacency(n, indices);
  const T = new Float32Array(W.length);
  for (let it = 0; it < iters; it++) {
    for (let v = 0; v < n; v++) {
      const s = start[v], e = start[v + 1];
      if ((frozen && frozen[v]) || e === s) {
        for (let b = 0; b < NB; b++) T[v * NB + b] = W[v * NB + b];
        continue;
      }
      const c = e - s;
      for (let b = 0; b < NB; b++) {
        let a = 0;
        for (let j = s; j < e; j++) a += W[nb[j] * NB + b];
        T[v * NB + b] = W[v * NB + b] * 0.4 + (a / c) * 0.6;
      }
    }
    W.set(T);
  }
}

export function packWeights(Wd) {
  const { W, NB } = Wd;
  const n = W.length / NB;
  const si = new Uint16Array(n * 4);
  const sw = new Float32Array(n * 4);
  const top = [0, 0, 0, 0], tw = [0, 0, 0, 0];
  for (let v = 0; v < n; v++) {
    tw.fill(-1); top.fill(0);
    for (let b = 0; b < NB; b++) {
      const w = W[v * NB + b];
      if (w <= tw[3]) continue;
      let k = 3;
      while (k > 0 && w > tw[k - 1]) { tw[k] = tw[k - 1]; top[k] = top[k - 1]; k--; }
      tw[k] = w; top[k] = b;
    }
    let s = 0;
    for (let k = 0; k < 4; k++) { if (tw[k] < 0.01) tw[k] = 0; s += tw[k]; }
    for (let k = 0; k < 4; k++) { si[v * 4 + k] = top[k]; sw[v * 4 + k] = tw[k] / s; }
  }
  return { skinIndex: si, skinWeight: sw };
}

// Rigid weights (single bone) for accessory meshes.
export function rigidWeights(n, boneName) {
  const i = BONE_NAMES.indexOf(boneName);
  const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
  for (let v = 0; v < n; v++) { si[v * 4] = i; sw[v * 4] = 1; }
  return { skinIndex: si, skinWeight: sw };
}
