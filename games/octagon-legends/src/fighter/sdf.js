// Signed distance field primitives, a culling/bucketed evaluator and a Surface Nets
// polygoniser (dual contouring without QEF: vertices are projected onto the true SDF).
// Everything here is plain JS (no THREE) so it can run in a worker or in Node.

export const OP_UNION = 0, OP_SUB = 1, OP_INTER = 2;
const T_ELL = 0, T_CONE = 1, T_BOX = 2, T_SPHERE = 3;

let primCounter = 0;

function normalize(v) {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}
function cross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }

// Orthonormal frame whose local Y axis is `dir`; `hint` picks the local Z axis.
export function frameAlong(dir, hint = [0, 0, 1]) {
  const y = normalize(dir);
  let h = hint;
  if (Math.abs(dot(h, y)) > 0.95) h = [1, 0, 0];
  const x = normalize(cross(y, h));
  const z = cross(x, y);
  return [x, y, z];
}

// Frame from Euler-ish rotation (degrees) around X then Y then Z applied to identity axes.
export function frameEuler(rx = 0, ry = 0, rz = 0) {
  const d = Math.PI / 180;
  const cx = Math.cos(rx * d), sx = Math.sin(rx * d);
  const cy = Math.cos(ry * d), sy = Math.sin(ry * d);
  const cz = Math.cos(rz * d), sz = Math.sin(rz * d);
  // R = Ry * Rx * Rz (yaw, then pitch, then roll in local)
  const m = [
    [cy * cz + sy * sx * sz, -cy * sz + sy * sx * cz, sy * cx],
    [cx * sz, cx * cz, -sx],
    [-sy * cz + cy * sx * sz, sy * sz + cy * sx * cz, cy * cx],
  ];
  // columns are the local axes in world space
  return [
    [m[0][0], m[1][0], m[2][0]],
    [m[0][1], m[1][1], m[2][1]],
    [m[0][2], m[1][2], m[2][2]],
  ];
}

function base(type, opts) {
  return {
    id: primCounter++,
    type,
    op: opts.op ?? OP_UNION,
    k: opts.k ?? 0.02,
    bones: opts.bones || null, // [[boneName, weight], ...]
    mat: opts.mat ?? 0,
    tag: opts.tag || '',
    wsig: opts.wsig ?? 1,
  };
}

function setAxes(p, axes) {
  const [ax, ay, az] = axes || [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  p.m0 = ax[0]; p.m1 = ax[1]; p.m2 = ax[2];
  p.m3 = ay[0]; p.m4 = ay[1]; p.m5 = ay[2];
  p.m6 = az[0]; p.m7 = az[1]; p.m8 = az[2];
  p.axes = [ax, ay, az];
}

export function ellipsoid(c, r, opts = {}) {
  const p = base(T_ELL, opts);
  p.cx = c[0]; p.cy = c[1]; p.cz = c[2];
  p.rx = r[0]; p.ry = r[1]; p.rz = r[2];
  p.irx = 1 / r[0]; p.iry = 1 / r[1]; p.irz = 1 / r[2];
  p.irx2 = p.irx * p.irx; p.iry2 = p.iry * p.iry; p.irz2 = p.irz * p.irz;
  p.rmin = Math.min(r[0], r[1], r[2]);
  setAxes(p, opts.axes);
  const ext = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    ext[i] = Math.sqrt((p.axes[0][i] * r[0]) ** 2 + (p.axes[1][i] * r[1]) ** 2 + (p.axes[2][i] * r[2]) ** 2);
  }
  p.min = [c[0] - ext[0], c[1] - ext[1], c[2] - ext[2]];
  p.max = [c[0] + ext[0], c[1] + ext[1], c[2] + ext[2]];
  return p;
}

export function sphere(c, r, opts = {}) {
  const p = base(T_SPHERE, opts);
  p.cx = c[0]; p.cy = c[1]; p.cz = c[2]; p.r = r;
  p.min = [c[0] - r, c[1] - r, c[2] - r];
  p.max = [c[0] + r, c[1] + r, c[2] + r];
  return p;
}

// Ellipsoid aligned with the segment a->b. t in [0,1] picks the centre along it,
// `along` is the radius along the segment, rx/rz the cross radii, `off` shifts the centre
// (world vector), hint orients the local Z axis.
export function muscle(a, b, t, along, rx, rz, opts = {}) {
  const dir = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const axes = frameAlong(dir, opts.hint || [0, 0, 1]);
  const off = opts.off || [0, 0, 0];
  const c = [a[0] + dir[0] * t + off[0], a[1] + dir[1] * t + off[1], a[2] + dir[2] * t + off[2]];
  return ellipsoid(c, [rx, along, rz], { ...opts, axes });
}

export function roundCone(a, b, r1, r2, opts = {}) {
  const p = base(T_CONE, opts);
  p.ax = a[0]; p.ay = a[1]; p.az = a[2];
  p.bax = b[0] - a[0]; p.bay = b[1] - a[1]; p.baz = b[2] - a[2];
  p.l2 = p.bax * p.bax + p.bay * p.bay + p.baz * p.baz;
  p.r1 = r1; p.r2 = r2;
  p.rr = r1 - r2;
  p.a2 = p.l2 - p.rr * p.rr;
  p.il2 = 1 / p.l2;
  const rm = Math.max(r1, r2);
  p.min = [Math.min(a[0] - r1, b[0] - r2), Math.min(a[1] - r1, b[1] - r2), Math.min(a[2] - r1, b[2] - r2)];
  p.max = [Math.max(a[0] + r1, b[0] + r2), Math.max(a[1] + r1, b[1] + r2), Math.max(a[2] + r1, b[2] + r2)];
  p.rm = rm;
  return p;
}

export function roundBox(c, half, rad, opts = {}) {
  const p = base(T_BOX, opts);
  p.cx = c[0]; p.cy = c[1]; p.cz = c[2];
  p.hx = half[0] - rad; p.hy = half[1] - rad; p.hz = half[2] - rad;
  p.rad = rad;
  setAxes(p, opts.axes);
  const ext = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    ext[i] = Math.abs(p.axes[0][i]) * half[0] + Math.abs(p.axes[1][i]) * half[1] + Math.abs(p.axes[2][i]) * half[2];
  }
  p.min = [c[0] - ext[0], c[1] - ext[1], c[2] - ext[2]];
  p.max = [c[0] + ext[0], c[1] + ext[1], c[2] + ext[2]];
  return p;
}

export function primDist(p, x, y, z) {
  switch (p.type) {
    case T_ELL: {
      const dx = x - p.cx, dy = y - p.cy, dz = z - p.cz;
      const lx = dx * p.m0 + dy * p.m1 + dz * p.m2;
      const ly = dx * p.m3 + dy * p.m4 + dz * p.m5;
      const lz = dx * p.m6 + dy * p.m7 + dz * p.m8;
      const k0 = Math.sqrt(lx * lx * p.irx2 + ly * ly * p.iry2 + lz * lz * p.irz2);
      const k1 = Math.sqrt(lx * lx * p.irx2 * p.irx2 + ly * ly * p.iry2 * p.iry2 + lz * lz * p.irz2 * p.irz2);
      if (k1 < 1e-9) return -p.rmin;
      return (k0 * (k0 - 1)) / k1;
    }
    case T_SPHERE: {
      const dx = x - p.cx, dy = y - p.cy, dz = z - p.cz;
      return Math.sqrt(dx * dx + dy * dy + dz * dz) - p.r;
    }
    case T_CONE: {
      const pax = x - p.ax, pay = y - p.ay, paz = z - p.az;
      const yy = pax * p.bax + pay * p.bay + paz * p.baz;
      const zz = yy - p.l2;
      const xvx = pax * p.l2 - p.bax * yy, xvy = pay * p.l2 - p.bay * yy, xvz = paz * p.l2 - p.baz * yy;
      const x2 = xvx * xvx + xvy * xvy + xvz * xvz;
      const y2 = yy * yy * p.l2;
      const z2 = zz * zz * p.l2;
      const rr = p.rr;
      const k = Math.sign(rr) * rr * rr * x2;
      if (Math.sign(zz) * p.a2 * z2 > k) return Math.sqrt(x2 + z2) * p.il2 - p.r2;
      if (Math.sign(yy) * p.a2 * y2 < k) return Math.sqrt(x2 + y2) * p.il2 - p.r1;
      return (Math.sqrt(x2 * p.a2 * p.il2) + yy * rr) * p.il2 - p.r1;
    }
    case T_BOX: {
      const dx = x - p.cx, dy = y - p.cy, dz = z - p.cz;
      const qx = Math.abs(dx * p.m0 + dy * p.m1 + dz * p.m2) - p.hx;
      const qy = Math.abs(dx * p.m3 + dy * p.m4 + dz * p.m5) - p.hy;
      const qz = Math.abs(dx * p.m6 + dy * p.m7 + dz * p.m8) - p.hz;
      const ox = qx > 0 ? qx : 0, oy = qy > 0 ? qy : 0, oz = qz > 0 ? qz : 0;
      return Math.sqrt(ox * ox + oy * oy + oz * oz) + Math.min(Math.max(qx, qy, qz), 0) - p.rad;
    }
  }
  return 1;
}

export function smin(a, b, k) {
  if (k <= 0) return a < b ? a : b;
  const h = k - Math.abs(a - b);
  if (h <= 0) return a < b ? a : b;
  const hh = h / k;
  return (a < b ? a : b) - hh * hh * k * 0.25;
}
export function smax(a, b, k) { return -smin(-a, -b, k); }

export function evalList(list, x, y, z) {
  let d = 1;
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    const di = primDist(p, x, y, z);
    if (p.op === OP_UNION) d = smin(d, di, p.k);
    else if (p.op === OP_SUB) d = smax(d, -di, p.k);
    else d = smax(d, di, p.k);
  }
  return d;
}

// A field made of an ordered list of primitives.
export class PrimField {
  constructor(prims, bucket = 0.03) {
    this.prims = prims;
    this.bucket = bucket;
    const min = [1e9, 1e9, 1e9], max = [-1e9, -1e9, -1e9];
    for (const p of prims) {
      const m = p.k + 0.002;
      p.bmin = [p.min[0] - m, p.min[1] - m, p.min[2] - m];
      p.bmax = [p.max[0] + m, p.max[1] + m, p.max[2] + m];
      if (p.op === OP_UNION) for (let i = 0; i < 3; i++) { min[i] = Math.min(min[i], p.min[i]); max[i] = Math.max(max[i], p.max[i]); }
    }
    this.min = min; this.max = max;
    const o = 0.02;
    this.gmin = [min[0] - o, min[1] - o, min[2] - o];
    this.gn = [0, 1, 2].map((i) => Math.ceil((max[i] - min[i] + 2 * o) / bucket) + 1);
    this.buckets = new Array(this.gn[0] * this.gn[1] * this.gn[2]);
  }
  cull(x0, y0, z0, x1, y1, z1, margin = 0) {
    const out = [];
    for (const p of this.prims) {
      if (p.bmax[0] + margin < x0 || p.bmin[0] - margin > x1) continue;
      if (p.bmax[1] + margin < y0 || p.bmin[1] - margin > y1) continue;
      if (p.bmax[2] + margin < z0 || p.bmin[2] - margin > z1) continue;
      out.push(p);
    }
    return out;
  }
  listAt(x, y, z) {
    const b = this.bucket, g = this.gmin, n = this.gn;
    const i = Math.floor((x - g[0]) / b), j = Math.floor((y - g[1]) / b), k = Math.floor((z - g[2]) / b);
    if (i < 0 || j < 0 || k < 0 || i >= n[0] || j >= n[1] || k >= n[2]) return null;
    const idx = i + n[0] * (j + n[1] * k);
    let l = this.buckets[idx];
    if (!l) {
      const x0 = g[0] + i * b, y0 = g[1] + j * b, z0 = g[2] + k * b;
      l = this.buckets[idx] = this.cull(x0, y0, z0, x0 + b, y0 + b, z0 + b, 0.03);
    }
    return l;
  }
  eval(x, y, z) {
    const l = this.listAt(x, y, z);
    if (!l || !l.length) return 1;
    return evalList(l, x, y, z);
  }
  // returns evaluator for an AABB region (used by the brick polygoniser)
  region(x0, y0, z0, x1, y1, z1) {
    const l = this.cull(x0, y0, z0, x1, y1, z1, 0.03);
    if (!l.length) return null;
    return (x, y, z) => evalList(l, x, y, z);
  }
}

// Generic field from a function, with an optional region() fast path.
export class FuncField {
  constructor(fn, min, max, regionFn) {
    this.fn = fn; this.min = min; this.max = max;
    this.regionFn = regionFn;
  }
  eval(x, y, z) { return this.fn(x, y, z); }
  region(x0, y0, z0, x1, y1, z1) {
    if (this.regionFn) return this.regionFn(x0, y0, z0, x1, y1, z1);
    return this.fn;
  }
}

/**
 * Surface Nets polygonisation.
 * field: {eval(x,y,z), region(aabb) -> evaluator|null}
 * opts: {min, max, h, keepCell(x,y,z)->bool (cell centre filter), relax, project}
 * returns {positions: Float32Array, normals: Float32Array, indices: Uint32Array, count}
 */
export function polygonize(field, opts) {
  const h = opts.h;
  const min = opts.min, max = opts.max;
  const nx = Math.ceil((max[0] - min[0]) / h) + 2;
  const ny = Math.ceil((max[1] - min[1]) / h) + 2;
  const nz = Math.ceil((max[2] - min[2]) / h) + 2;
  const ox = min[0] - h * 0.5, oy = min[1] - h * 0.5, oz = min[2] - h * 0.5;
  const N = nx * ny * nz;
  const F = new Float32Array(N).fill(1);
  const sxy = nx * ny;
  const B = 8;
  const half = Math.sqrt(3) * (B - 1) * h * 0.5;
  for (let bz = 0; bz < nz; bz += B) {
    for (let by = 0; by < ny; by += B) {
      for (let bx = 0; bx < nx; bx += B) {
        const ex = Math.min(bx + B, nx), ey = Math.min(by + B, ny), ez = Math.min(bz + B, nz);
        const x0 = ox + bx * h, y0 = oy + by * h, z0 = oz + bz * h;
        const x1 = ox + (ex - 1) * h, y1 = oy + (ey - 1) * h, z1 = oz + (ez - 1) * h;
        const ev = field.region(x0, y0, z0, x1, y1, z1);
        if (!ev) continue;
        const dc = ev((x0 + x1) * 0.5, (y0 + y1) * 0.5, (z0 + z1) * 0.5);
        if (Math.abs(dc) > half * 1.5 + 0.01) {
          if (dc < 0) {
            for (let k = bz; k < ez; k++) for (let j = by; j < ey; j++) {
              const row = k * sxy + j * nx;
              for (let i = bx; i < ex; i++) F[row + i] = -1;
            }
          }
          continue;
        }
        for (let k = bz; k < ez; k++) {
          const z = oz + k * h;
          for (let j = by; j < ey; j++) {
            const y = oy + j * h;
            const row = k * sxy + j * nx;
            for (let i = bx; i < ex; i++) F[row + i] = ev(ox + i * h, y, z);
          }
        }
      }
    }
  }

  // vertices per cell
  const cx = nx - 1, cy = ny - 1, cz = nz - 1;
  const cellV = new Int32Array(cx * cy * cz).fill(-1);
  const pos = [];
  const keep = opts.keepCell;
  const corner = [0, 1, nx, nx + 1, sxy, sxy + 1, sxy + nx, sxy + nx + 1];
  const cofs = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const edges = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const v = new Float32Array(8);
  for (let k = 0; k < cz; k++) {
    for (let j = 0; j < cy; j++) {
      for (let i = 0; i < cx; i++) {
        const b = k * sxy + j * nx + i;
        let mask = 0;
        for (let c = 0; c < 8; c++) { v[c] = F[b + corner[c]]; if (v[c] < 0) mask |= 1 << c; }
        if (mask === 0 || mask === 255) continue;
        const px = ox + (i + 0.5) * h, py = oy + (j + 0.5) * h, pz = oz + (k + 0.5) * h;
        if (keep && !keep(px, py, pz)) continue;
        let sx = 0, sy = 0, sz = 0, n = 0;
        for (let e = 0; e < 12; e++) {
          const a = edges[e][0], c2 = edges[e][1];
          const va = v[a], vb = v[c2];
          if ((va < 0) === (vb < 0)) continue;
          const t = va / (va - vb);
          const A = cofs[a], C = cofs[c2];
          sx += A[0] + (C[0] - A[0]) * t;
          sy += A[1] + (C[1] - A[1]) * t;
          sz += A[2] + (C[2] - A[2]) * t;
          n++;
        }
        cellV[k * cx * cy + j * cx + i] = pos.length / 3;
        pos.push(ox + (i + sx / n) * h, oy + (j + sy / n) * h, oz + (k + sz / n) * h);
      }
    }
  }

  // quads
  const idx = [];
  const cxy = cx * cy;
  const quad = (a, b, c, d, flip) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) { const t = b; b = d; d = t; }
    // split along shorter diagonal
    const P = pos;
    const d1 = (P[a * 3] - P[c * 3]) ** 2 + (P[a * 3 + 1] - P[c * 3 + 1]) ** 2 + (P[a * 3 + 2] - P[c * 3 + 2]) ** 2;
    const d2 = (P[b * 3] - P[d * 3]) ** 2 + (P[b * 3 + 1] - P[d * 3 + 1]) ** 2 + (P[b * 3 + 2] - P[d * 3 + 2]) ** 2;
    if (d1 < d2) idx.push(a, b, c, a, c, d);
    else idx.push(a, b, d, b, c, d);
  };
  const cell = (i, j, k) => (i < 0 || j < 0 || k < 0 || i >= cx || j >= cy || k >= cz ? -1 : cellV[k * cxy + j * cx + i]);
  for (let k = 0; k < nz; k++) {
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const b = k * sxy + j * nx + i;
        const s0 = F[b] < 0;
        if (i < nx - 1 && j > 0 && k > 0) {
          const s1 = F[b + 1] < 0;
          if (s0 !== s1) quad(cell(i, j - 1, k - 1), cell(i, j, k - 1), cell(i, j, k), cell(i, j - 1, k), !s0);
        }
        if (j < ny - 1 && i > 0 && k > 0) {
          const s1 = F[b + nx] < 0;
          if (s0 !== s1) quad(cell(i - 1, j, k - 1), cell(i - 1, j, k), cell(i, j, k), cell(i, j, k - 1), !s0);
        }
        if (k < nz - 1 && i > 0 && j > 0) {
          const s1 = F[b + sxy] < 0;
          if (s0 !== s1) quad(cell(i - 1, j - 1, k), cell(i, j - 1, k), cell(i, j, k), cell(i - 1, j, k), !s0);
        }
      }
    }
  }

  let positions = new Float32Array(pos);
  let indices = new Uint32Array(idx);
  // drop unreferenced vertices (cells filtered by keep may leave orphans)
  ({ positions, indices } = compact(positions, indices));
  const count = positions.length / 3;

  if (opts.relax) relax(positions, indices, opts.relax, field, h);
  if (opts.project !== false) project(positions, field, opts.project || 2, h);
  const normals = fieldNormals(positions, field, h * 0.5);
  return { positions, normals, indices, count };
}

function compact(positions, indices) {
  const n = positions.length / 3;
  const used = new Int32Array(n).fill(-1);
  let c = 0;
  for (let i = 0; i < indices.length; i++) { const a = indices[i]; if (used[a] < 0) used[a] = c++; }
  if (c === n) return { positions, indices };
  const P = new Float32Array(c * 3);
  for (let i = 0; i < n; i++) {
    const u = used[i];
    if (u < 0) continue;
    P[u * 3] = positions[i * 3]; P[u * 3 + 1] = positions[i * 3 + 1]; P[u * 3 + 2] = positions[i * 3 + 2];
  }
  const I = new Uint32Array(indices.length);
  for (let i = 0; i < indices.length; i++) I[i] = used[indices[i]];
  return { positions: P, indices: I };
}

export function adjacency(count, indices) {
  const deg = new Int32Array(count + 1);
  for (let t = 0; t < indices.length; t += 3) {
    deg[indices[t]] += 2; deg[indices[t + 1]] += 2; deg[indices[t + 2]] += 2;
  }
  const start = new Int32Array(count + 1);
  for (let i = 0; i < count; i++) start[i + 1] = start[i] + deg[i];
  const fill = start.slice(0, count);
  const nb = new Int32Array(start[count]);
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t], b = indices[t + 1], c = indices[t + 2];
    nb[fill[a]++] = b; nb[fill[a]++] = c;
    nb[fill[b]++] = a; nb[fill[b]++] = c;
    nb[fill[c]++] = a; nb[fill[c]++] = b;
  }
  return { start, nb };
}

function relax(P, indices, iters, field, h) {
  const n = P.length / 3;
  const { start, nb } = adjacency(n, indices);
  const Q = new Float32Array(P.length);
  for (let it = 0; it < iters; it++) {
    for (let i = 0; i < n; i++) {
      let sx = 0, sy = 0, sz = 0;
      const s = start[i], e = start[i + 1];
      if (e === s) { Q[i * 3] = P[i * 3]; Q[i * 3 + 1] = P[i * 3 + 1]; Q[i * 3 + 2] = P[i * 3 + 2]; continue; }
      for (let j = s; j < e; j++) { const q = nb[j] * 3; sx += P[q]; sy += P[q + 1]; sz += P[q + 2]; }
      const c = e - s;
      Q[i * 3] = P[i * 3] * 0.5 + (sx / c) * 0.5;
      Q[i * 3 + 1] = P[i * 3 + 1] * 0.5 + (sy / c) * 0.5;
      Q[i * 3 + 2] = P[i * 3 + 2] * 0.5 + (sz / c) * 0.5;
    }
    P.set(Q);
    project(P, field, 1, h);
  }
}

export function project(P, field, iters, h) {
  const n = P.length / 3;
  const e = h * 0.25;
  for (let i = 0; i < n; i++) {
    let x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
    for (let it = 0; it < iters; it++) {
      const d = field.eval(x, y, z);
      const gx = field.eval(x + e, y, z) - d;
      const gy = field.eval(x, y + e, z) - d;
      const gz = field.eval(x, y, z + e) - d;
      const g2 = (gx * gx + gy * gy + gz * gz) / (e * e);
      if (g2 < 1e-8) break;
      const s = d / g2 / e;
      let mx = gx * s, my = gy * s, mz = gz * s;
      // never move more than a cell
      const m = Math.hypot(mx, my, mz);
      if (m > h) { mx *= h / m; my *= h / m; mz *= h / m; }
      x -= mx; y -= my; z -= mz;
    }
    P[i * 3] = x; P[i * 3 + 1] = y; P[i * 3 + 2] = z;
  }
}

export function fieldNormals(P, field, e) {
  const n = P.length / 3;
  const N = new Float32Array(P.length);
  for (let i = 0; i < n; i++) {
    const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
    const gx = field.eval(x + e, y, z) - field.eval(x - e, y, z);
    const gy = field.eval(x, y + e, z) - field.eval(x, y - e, z);
    const gz = field.eval(x, y, z + e) - field.eval(x, y, z - e);
    const l = Math.hypot(gx, gy, gz) || 1;
    N[i * 3] = gx / l; N[i * 3 + 1] = gy / l; N[i * 3 + 2] = gz / l;
  }
  return N;
}

// Ambient occlusion baked from the field (cheap cone-less SDF AO).
export function bakeAO(P, N, field, dists = [0.012, 0.03, 0.06], strength = 1) {
  const n = P.length / 3;
  const ao = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let occ = 0, wsum = 0;
    for (let s = 0; s < dists.length; s++) {
      const t = dists[s];
      const d = field.eval(P[i * 3] + N[i * 3] * t, P[i * 3 + 1] + N[i * 3 + 1] * t, P[i * 3 + 2] + N[i * 3 + 2] * t);
      const w = 1 / (s + 1);
      occ += w * Math.max(0, (t - d) / t);
      wsum += w;
    }
    ao[i] = Math.max(0, 1 - strength * occ / wsum);
  }
  return ao;
}
