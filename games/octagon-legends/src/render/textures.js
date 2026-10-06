// Procedural canvas textures for the arena (no external assets).
// Every texture is painted at load time with the 2D canvas API and wrapped in a THREE texture.
import * as THREE from 'three';

export const FONT = "'Impact', 'Arial Black', 'Liberation Sans', 'DejaVu Sans', sans-serif";
export const FONT_PLAIN = "'Liberation Sans', 'Helvetica Neue', 'DejaVu Sans', sans-serif";

// Deterministic RNG so the arena looks the same on every load.
export function rng(seed = 1) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeCanvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function canvasTex(c, { srgb = true, repeat = false, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  return t;
}

// Draw condensed, italic-skewed "sports" text centred at (x, y).
export function sportText(ctx, text, x, y, size, { color = '#fff', condense = 0.78, skew = -0.18, weight = '900', font = FONT, stroke = null, strokeW = 0, align = 'center', letter = 0 } = {}) {
  ctx.save();
  ctx.translate(x, y);
  ctx.transform(condense, 0, skew * condense, 1, 0, 0);
  ctx.font = `${weight} ${size}px ${font}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  if (letter) ctx.letterSpacing = `${letter}px`;
  if (stroke) {
    ctx.lineJoin = 'round';
    ctx.lineWidth = strokeW;
    ctx.strokeStyle = stroke;
    ctx.strokeText(text, 0, 0);
  }
  ctx.fillStyle = color;
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

function octPath(ctx, cx, cy, r /* inradius */, rot = Math.PI / 8) {
  const R = r / Math.cos(Math.PI / 8);
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = rot + (i * Math.PI) / 4;
    const x = cx + Math.cos(a) * R;
    const y = cy + Math.sin(a) * R;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function noiseTile(size, seed, amp = 255) {
  const c = makeCanvas(size);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const r = rng(seed);
  for (let i = 0; i < size * size; i++) {
    const v = (r() * amp) | 0;
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

// ---------------------------------------------------------------- invented sponsor marks
export const SPONSORS = [
  { name: 'KRAKEN', sub: 'ENERGY', bg: '#0f6d3a', fg: '#ffffff', accent: '#9cf05a' },
  { name: 'VOLTEX', sub: 'PERFORMANCE', bg: '#c61f2a', fg: '#ffffff', accent: '#ffd23f' },
  { name: 'IRONCLAD', sub: 'NUTRITION', bg: '#1b1f2a', fg: '#ffffff', accent: '#c9a24a' },
  { name: 'NORTHWIND', sub: 'AIRWAYS', bg: '#1349a6', fg: '#ffffff', accent: '#7cc7ff' },
  { name: 'APEX GRIP', sub: 'FIGHT GEAR', bg: '#f2b705', fg: '#141414', accent: '#141414' },
  { name: 'TITAN', sub: 'MOTORS', bg: '#2a2a2e', fg: '#e8e8e8', accent: '#e23b3b' },
  { name: 'HALCYON', sub: 'WATCHES', bg: '#5b1a6e', fg: '#ffffff', accent: '#f0c0ff' },
  { name: 'BRAWLR', sub: 'BET LIVE', bg: '#ff5a1f', fg: '#ffffff', accent: '#1a1a1a' },
];

// Paint a sponsor badge centred at (0,0) with given width/height into ctx (already transformed).
function sponsorBadge(ctx, s, w, h, { ink = false } = {}) {
  ctx.save();
  const r = h * 0.18;
  ctx.beginPath();
  ctx.roundRect(-w / 2, -h / 2, w, h, r);
  ctx.fillStyle = s.bg;
  ctx.globalAlpha = ink ? 0.88 : 1;
  ctx.fill();
  ctx.globalAlpha = 1;
  // accent swoosh
  ctx.beginPath();
  ctx.moveTo(-w / 2 + h * 0.25, h / 2 - h * 0.18);
  ctx.quadraticCurveTo(0, h * 0.1, w / 2 - h * 0.25, h / 2 - h * 0.32);
  ctx.lineWidth = h * 0.06;
  ctx.strokeStyle = s.accent;
  ctx.globalAlpha = 0.85;
  ctx.stroke();
  ctx.globalAlpha = 1;
  sportText(ctx, s.name, 0, -h * 0.1, h * 0.52, { color: s.fg });
  sportText(ctx, s.sub, 0, h * 0.3, h * 0.17, { color: s.fg, condense: 1, skew: 0, weight: '700', font: FONT_PLAIN, letter: h * 0.04 });
  ctx.restore();
}

// Emblem: octagon badge with OCTAGON LEGENDS wordmark, centred at (0,0), inradius r.
function emblem(ctx, r, { ink = 1 } = {}) {
  ctx.save();
  octPath(ctx, 0, 0, r * 1.06);
  ctx.fillStyle = '#c9a24a';
  ctx.globalAlpha = 0.95 * ink;
  ctx.fill();
  octPath(ctx, 0, 0, r * 1.0);
  ctx.fillStyle = '#0d1630';
  ctx.globalAlpha = 0.96 * ink;
  ctx.fill();
  octPath(ctx, 0, 0, r * 0.93);
  ctx.lineWidth = r * 0.012;
  ctx.strokeStyle = '#c9a24a';
  ctx.stroke();
  // split red / blue chevrons behind the wordmark
  ctx.save();
  octPath(ctx, 0, 0, r * 0.93);
  ctx.clip();
  ctx.globalAlpha = 0.9 * ink;
  ctx.fillStyle = '#b3121f';
  ctx.beginPath();
  ctx.moveTo(-r * 1.2, -r * 0.05);
  ctx.lineTo(-r * 0.1, -r * 0.05);
  ctx.lineTo(-r * 0.25, r * 0.12);
  ctx.lineTo(-r * 1.2, r * 0.12);
  ctx.fill();
  ctx.fillStyle = '#1446a8';
  ctx.beginPath();
  ctx.moveTo(r * 1.2, -r * 0.05);
  ctx.lineTo(r * 0.25, -r * 0.05);
  ctx.lineTo(r * 0.1, r * 0.12);
  ctx.lineTo(r * 1.2, r * 0.12);
  ctx.fill();
  ctx.restore();
  ctx.globalAlpha = ink;
  sportText(ctx, 'OCTAGON', 0, -r * 0.36, r * 0.5, { color: '#ffffff', condense: 0.72 });
  sportText(ctx, 'LEGENDS', 0, r * 0.36, r * 0.5, { color: '#e2bd62', condense: 0.72 });
  sportText(ctx, 'WORLD FIGHTING CHAMPIONSHIP', 0, r * 0.74, r * 0.085, { color: '#c9cfdd', condense: 1, skew: 0, weight: '700', font: FONT_PLAIN, letter: r * 0.02 });
  sportText(ctx, '★  EST. 2026  ★', 0, -r * 0.74, r * 0.08, { color: '#c9a24a', condense: 1, skew: 0, weight: '700', font: FONT_PLAIN, letter: r * 0.02 });
  ctx.restore();
}

// ---------------------------------------------------------------- the canvas mat
// The texture spans world x,z in [-S, S]; canvas pixel (u,v) <-> world (x,z).
export function makeMatTextures({ size = 4096, S = 6.2, inradius = 4.6, apronIn = 5.75 } = {}) {
  const c = makeCanvas(size);
  const ctx = c.getContext('2d');
  const k = size / (2 * S); // px per metre
  const W = (m) => m * k;
  const cx = size / 2;
  const cy = size / 2;
  const R = rng(1337);

  // apron (outside the fence): deep navy vinyl
  ctx.fillStyle = '#0a1022';
  ctx.fillRect(0, 0, size, size);
  // canvas (inside, extends just under the fence)
  octPath(ctx, cx, cy, W(inradius + 0.12));
  ctx.fillStyle = '#e9e5dc';
  ctx.fill();

  // large-scale tonal variation of the canvas
  ctx.save();
  octPath(ctx, cx, cy, W(inradius + 0.12));
  ctx.clip();
  for (let i = 0; i < 220; i++) {
    const x = cx + (R() - 0.5) * W(10);
    const y = cy + (R() - 0.5) * W(10);
    const rad = W(0.3 + R() * 1.4);
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    const dark = R() < 0.6;
    g.addColorStop(0, dark ? 'rgba(120,108,92,0.05)' : 'rgba(255,255,250,0.06)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  // subtle vignette towards the fence (dirt collects at the edges)
  const eg = ctx.createRadialGradient(cx, cy, W(2.5), cx, cy, W(inradius + 0.2));
  eg.addColorStop(0, 'rgba(0,0,0,0)');
  eg.addColorStop(1, 'rgba(70,60,50,0.12)');
  ctx.fillStyle = eg;
  ctx.fillRect(0, 0, size, size);
  ctx.restore();

  // perimeter band with gold pinstripes
  ctx.save();
  octPath(ctx, cx, cy, W(inradius + 0.12));
  octPath(ctx, cx, cy, W(inradius - 0.5));
  ctx.fillStyle = '#0f1a36';
  ctx.globalAlpha = 0.95;
  ctx.fill('evenodd');
  ctx.globalAlpha = 1;
  octPath(ctx, cx, cy, W(inradius - 0.5));
  ctx.lineWidth = W(0.03);
  ctx.strokeStyle = '#c9a24a';
  ctx.stroke();
  octPath(ctx, cx, cy, W(inradius - 0.58));
  ctx.lineWidth = W(0.012);
  ctx.strokeStyle = 'rgba(15,26,54,0.75)';
  ctx.stroke();
  ctx.restore();

  // band text on each of the 8 sides, "up" pointing to the centre (reads from outside)
  const bandNames = ['OCTAGON LEGENDS', 'KRAKEN ENERGY', 'VOLTEX', 'NORTHWIND AIRWAYS', 'OCTAGON LEGENDS', 'IRONCLAD NUTRITION', 'APEX GRIP', 'TITAN MOTORS'];
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4; // side normal angle (x = cos, z = sin)
    const rr = W(inradius - 0.22);
    ctx.save();
    ctx.translate(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    ctx.rotate(a - Math.PI / 2);
    sportText(ctx, bandNames[i], 0, 0, W(0.3), { color: i % 4 === 0 ? '#e2bd62' : '#f2f2f2', condense: 0.8 });
    ctx.restore();
  }

  // red / blue corner wedges at two opposite vertices
  const corner = (ang, col) => {
    const Rv = W((inradius + 0.1) / Math.cos(Math.PI / 8));
    const Ri = W((inradius - 0.5) / Math.cos(Math.PI / 8));
    const da = 0.11;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(ang - da) * Rv, cy + Math.sin(ang - da) * Rv);
    ctx.lineTo(cx + Math.cos(ang) * Rv, cy + Math.sin(ang) * Rv);
    ctx.lineTo(cx + Math.cos(ang + da) * Rv, cy + Math.sin(ang + da) * Rv);
    ctx.lineTo(cx + Math.cos(ang + da * 1.15) * Ri, cy + Math.sin(ang + da * 1.15) * Ri);
    ctx.lineTo(cx + Math.cos(ang) * (Ri - W(0.25)), cy + Math.sin(ang) * (Ri - W(0.25)));
    ctx.lineTo(cx + Math.cos(ang - da * 1.15) * Ri, cy + Math.sin(ang - da * 1.15) * Ri);
    ctx.closePath();
    ctx.fillStyle = col;
    ctx.globalAlpha = 0.92;
    ctx.fill();
    ctx.restore();
  };
  corner(Math.PI / 8 + Math.PI, '#b3121f'); // vertex at 202.5 deg
  corner(Math.PI / 8, '#1446a8'); // vertex at 22.5 deg

  // centre emblem (multiply-ish ink: slightly translucent)
  ctx.save();
  ctx.translate(cx, cy);
  emblem(ctx, W(1.25), { ink: 0.97 });
  ctx.restore();

  // sponsor panels printed on the canvas, facing out to each side
  const spots = [
    { a: Math.PI / 2, r: 3.05, s: SPONSORS[0], w: 2.2, h: 0.62 }, // near camera (+z)
    { a: -Math.PI / 2, r: 3.05, s: SPONSORS[1], w: 2.2, h: 0.62 },
    { a: 0, r: 3.1, s: SPONSORS[3], w: 2.0, h: 0.56 },
    { a: Math.PI, r: 3.1, s: SPONSORS[2], w: 2.0, h: 0.56 },
    { a: Math.PI / 4, r: 3.05, s: SPONSORS[4], w: 1.3, h: 0.42 },
    { a: (3 * Math.PI) / 4, r: 3.05, s: SPONSORS[5], w: 1.3, h: 0.42 },
    { a: (5 * Math.PI) / 4, r: 3.05, s: SPONSORS[6], w: 1.3, h: 0.42 },
    { a: (7 * Math.PI) / 4, r: 3.05, s: SPONSORS[7], w: 1.3, h: 0.42 },
  ];
  for (const p of spots) {
    ctx.save();
    ctx.translate(cx + Math.cos(p.a) * W(p.r), cy + Math.sin(p.a) * W(p.r));
    ctx.rotate(p.a - Math.PI / 2);
    sponsorBadge(ctx, p.s, W(p.w), W(p.h), { ink: true });
    ctx.restore();
  }

  // fine fabric noise over the whole surface
  const nt = noiseTile(256, 7);
  ctx.save();
  ctx.globalAlpha = 0.07;
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = ctx.createPattern(nt, 'repeat');
  ctx.fillRect(0, 0, size, size);
  ctx.restore();

  // wear: scuffs, footwork arcs, sweat stains, faint blood
  ctx.save();
  octPath(ctx, cx, cy, W(inradius + 0.1));
  ctx.clip();
  ctx.lineCap = 'round';
  for (let i = 0; i < 900; i++) {
    const rr = Math.sqrt(R()) * W(inradius - 0.1);
    const aa = R() * Math.PI * 2;
    const x = cx + Math.cos(aa) * rr;
    const y = cy + Math.sin(aa) * rr;
    const len = W(0.05 + R() * 0.35);
    const dir = R() * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + Math.cos(dir + 0.6) * len * 0.6, y + Math.sin(dir + 0.6) * len * 0.6, x + Math.cos(dir) * len, y + Math.sin(dir) * len);
    ctx.lineWidth = W(0.004 + R() * 0.02);
    const g = 60 + R() * 50;
    ctx.strokeStyle = `rgba(${g + 10},${g},${g - 10},${0.04 + R() * 0.08})`;
    ctx.stroke();
  }
  ctx.filter = `blur(${Math.max(2, W(0.03))}px)`;
  for (let i = 0; i < 60; i++) {
    // footprint smudges / sweat
    const rr = Math.sqrt(R()) * W(inradius - 0.3);
    const aa = R() * Math.PI * 2;
    ctx.beginPath();
    ctx.ellipse(cx + Math.cos(aa) * rr, cy + Math.sin(aa) * rr, W(0.08 + R() * 0.25), W(0.05 + R() * 0.15), R() * 3, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(110,98,80,${0.04 + R() * 0.05})`;
    ctx.fill();
  }
  ctx.filter = `blur(${Math.max(1, W(0.006))}px)`;
  for (let s = 0; s < 5; s++) {
    // blood spatter clusters (faint, mostly cleaned off)
    const rr = Math.sqrt(R()) * W(3.6);
    const aa = R() * Math.PI * 2;
    const bx = cx + Math.cos(aa) * rr;
    const by = cy + Math.sin(aa) * rr;
    const n = 8 + R() * 24;
    for (let i = 0; i < n; i++) {
      const d = W(R() * R() * 0.4);
      const t = R() * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(bx + Math.cos(t) * d, by + Math.sin(t) * d, W(0.004 + R() * 0.018), 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${95 + R() * 40},${18 + R() * 12},${18 + R() * 10},${0.18 + R() * 0.3})`;
      ctx.fill();
    }
  }
  ctx.filter = `blur(${Math.max(2, W(0.02))}px)`;
  for (let i = 0; i < 2; i++) {
    const rr = Math.sqrt(R()) * W(3);
    const aa = R() * Math.PI * 2;
    ctx.beginPath();
    ctx.ellipse(cx + Math.cos(aa) * rr, cy + Math.sin(aa) * rr, W(0.25), W(0.07), R() * 3, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(120,40,35,0.08)';
    ctx.fill();
  }
  ctx.filter = 'none';
  ctx.restore();

  // apron text (outside the fence)
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    const rr = W((inradius + apronIn) / 2 + 0.08);
    ctx.save();
    ctx.translate(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    ctx.rotate(a - Math.PI / 2);
    if (i % 2 === 0) sportText(ctx, 'OCTAGON LEGENDS', 0, 0, W(0.34), { color: '#d9dde8', condense: 0.8 });
    else sponsorBadge(ctx, SPONSORS[(i + 3) % SPONSORS.length], W(1.5), W(0.42));
    ctx.restore();
  }
  ctx.save();
  octPath(ctx, cx, cy, W(apronIn - 0.06));
  ctx.lineWidth = W(0.03);
  ctx.strokeStyle = '#c9a24a';
  ctx.stroke();
  ctx.restore();

  const map = canvasTex(c, { aniso: 16 });

  // roughness / sheen derived from the painted colour (ink is a touch glossier than raw canvas)
  const rs = 1024;
  const rc = makeCanvas(rs);
  const rctx = rc.getContext('2d');
  rctx.drawImage(c, 0, 0, rs, rs);
  const img = rctx.getImageData(0, 0, rs, rs);
  const d = img.data;
  const RR = rng(99);
  for (let i = 0; i < rs * rs; i++) {
    const lum = (d[i * 4] * 0.3 + d[i * 4 + 1] * 0.59 + d[i * 4 + 2] * 0.11) / 255;
    let r = 0.86 - (1 - lum) * 0.28 + (RR() - 0.5) * 0.06;
    const px = (i % rs) / rs - 0.5;
    const py = Math.floor(i / rs) / rs - 0.5;
    const dist = Math.hypot(px, py) * 2 * S;
    if (dist > inradius + 0.12) r = 0.42 + (RR() - 0.5) * 0.05; // vinyl apron: glossier
    const v = Math.max(0, Math.min(255, r * 255)) | 0;
    d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v;
  }
  rctx.putImageData(img, 0, 0);
  const roughnessMap = canvasTex(rc, { srgb: false });

  return { map, roughnessMap, normalMap: makeWeaveNormal() };
}

// Plain-weave fabric normal map tile (tileable).
export function makeWeaveNormal(size = 256, threads = 8) {
  const h = new Float32Array(size * size);
  const p = size / threads;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const tx = Math.floor(x / p);
      const ty = Math.floor(y / p);
      const fx = (x % p) / p;
      const fy = (y % p) / p;
      const over = (tx + ty) % 2 === 0;
      // warp thread runs along y, weft along x
      const warp = Math.sin(fx * Math.PI) * (over ? 1 : 0.55) * (0.75 + 0.25 * Math.sin(fy * Math.PI));
      const weft = Math.sin(fy * Math.PI) * (over ? 0.55 : 1) * (0.75 + 0.25 * Math.sin(fx * Math.PI));
      h[y * size + x] = Math.max(warp, weft) + ((x * 7919 + y * 104729) % 97) / 97 * 0.08;
    }
  }
  const c = makeCanvas(size);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const s = 2.2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const l = h[y * size + ((x - 1 + size) % size)];
      const r = h[y * size + ((x + 1) % size)];
      const u = h[((y - 1 + size) % size) * size + x];
      const dn = h[((y + 1) % size) * size + x];
      let nx = (l - r) * s;
      let ny = (dn - u) * s;
      let nz = 1;
      const len = Math.hypot(nx, ny, nz);
      nx /= len; ny /= len; nz /= len;
      const i = (y * size + x) * 4;
      img.data[i] = (nx * 0.5 + 0.5) * 255;
      img.data[i + 1] = (ny * 0.5 + 0.5) * 255;
      img.data[i + 2] = (nz * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvasTex(c, { srgb: false, repeat: true });
}

// Generic tileable fine-grain normal map (leather / vinyl / concrete).
export function makeGrainNormal(size = 256, seed = 3, strength = 1.5, blur = 1) {
  const c = noiseTile(size, seed);
  const b = makeCanvas(size);
  const bctx = b.getContext('2d');
  bctx.filter = `blur(${blur}px)`;
  // draw 3x3 to keep it tileable under blur
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) bctx.drawImage(c, i * size, j * size);
  const src = bctx.getImageData(0, 0, size, size).data;
  const out = makeCanvas(size);
  const octx = out.getContext('2d');
  const img = octx.createImageData(size, size);
  const H = (x, y) => src[(((y + size) % size) * size + ((x + size) % size)) * 4] / 255;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let nx = (H(x - 1, y) - H(x + 1, y)) * strength;
      let ny = (H(x, y + 1) - H(x, y - 1)) * strength;
      const len = Math.hypot(nx, ny, 1);
      const i = (y * size + x) * 4;
      img.data[i] = (nx / len * 0.5 + 0.5) * 255;
      img.data[i + 1] = (ny / len * 0.5 + 0.5) * 255;
      img.data[i + 2] = (1 / len * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  octx.putImageData(img, 0, 0);
  return canvasTex(out, { srgb: false, repeat: true });
}

// Chain-link diamond alpha tile (white wire on black, soft edges for analytic AA).
export function makeChainLinkAlpha(size = 128) {
  const c = makeCanvas(size);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = size * 0.075;
  ctx.lineCap = 'round';
  ctx.filter = 'blur(1.2px)';
  // a diamond spanning the tile, drawn with wrap copies so it tiles seamlessly
  for (let ox = -1; ox <= 1; ox++) {
    for (let oy = -1; oy <= 1; oy++) {
      const X = ox * size;
      const Y = oy * size;
      ctx.beginPath();
      // zig-zag wire bent at the knuckles (slightly rounded twist)
      ctx.moveTo(X, Y + size / 2);
      ctx.lineTo(X + size / 2, Y);
      ctx.lineTo(X + size, Y + size / 2);
      ctx.lineTo(X + size / 2, Y + size);
      ctx.closePath();
      ctx.stroke();
    }
  }
  ctx.filter = 'none';
  // knuckles: brighter dots where wires twist
  ctx.fillStyle = '#fff';
  for (const [x, y] of [[0, size / 2], [size, size / 2], [size / 2, 0], [size / 2, size]]) {
    ctx.beginPath();
    ctx.arc(x, y, size * 0.06, 0, Math.PI * 2);
    ctx.fill();
  }
  const t = canvasTex(c, { srgb: false, repeat: true, aniso: 16 });
  return t;
}

// Vinyl pad wrap for fence posts: black with blue racing stripe and vertical logo.
export function makePostPadTexture() {
  const w = 512;
  const h = 1024;
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#16181e');
  g.addColorStop(1, '#0c0d11');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  // front stripe (u = 0.5 faces the centre after rotation)
  ctx.fillStyle = '#1446a8';
  ctx.fillRect(w * 0.38, 0, w * 0.24, h);
  ctx.fillStyle = '#c9a24a';
  ctx.fillRect(w * 0.37, 0, w * 0.012, h);
  ctx.fillRect(w * 0.618, 0, w * 0.012, h);
  ctx.save();
  ctx.translate(w * 0.5, h * 0.5);
  ctx.rotate(-Math.PI / 2);
  sportText(ctx, 'OCTAGON LEGENDS', 0, 0, w * 0.15, { color: '#ffffff', condense: 0.8 });
  ctx.restore();
  // seams
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  for (const y of [h * 0.12, h * 0.88]) ctx.fillRect(0, y, w, 3);
  return canvasTex(c);
}

// Apron skirt banner: one per side, u spans the side.
export function makeSkirtTexture(variant = 0) {
  const w = 2048;
  const h = 512;
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#0d1428');
  g.addColorStop(0.5, '#070a14');
  g.addColorStop(1, '#030407');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#c9a24a';
  ctx.fillRect(0, 0, w, 10);
  ctx.fillStyle = variant % 2 ? '#1446a8' : '#b3121f';
  ctx.fillRect(0, 10, w, 8);
  if (variant % 2 === 0) {
    sportText(ctx, 'OCTAGON LEGENDS', w / 2, h * 0.5, h * 0.42, { color: '#f2f2f2', condense: 0.78 });
  } else {
    const s1 = SPONSORS[(variant * 3) % SPONSORS.length];
    const s2 = SPONSORS[(variant * 3 + 1) % SPONSORS.length];
    ctx.save();
    ctx.translate(w * 0.27, h * 0.52);
    sponsorBadge(ctx, s1, w * 0.36, h * 0.52);
    ctx.restore();
    ctx.save();
    ctx.translate(w * 0.73, h * 0.52);
    sponsorBadge(ctx, s2, w * 0.36, h * 0.52);
    ctx.restore();
  }
  return canvasTex(c);
}

// Jumbotron / big screen graphic (emissive).
export function makeScreenTexture(variant = 0) {
  const w = 1024;
  const h = 576;
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, '#2a0a10');
  g.addColorStop(0.5, '#080c1c');
  g.addColorStop(1, '#0a1c44');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  // diagonal speed streaks
  ctx.save();
  ctx.globalAlpha = 0.25;
  for (let i = 0; i < 14; i++) {
    ctx.fillStyle = i % 2 ? '#b3121f' : '#1446a8';
    ctx.beginPath();
    const x = i * 90 - 200;
    ctx.moveTo(x, h);
    ctx.lineTo(x + 40, h);
    ctx.lineTo(x + 340, 0);
    ctx.lineTo(x + 300, 0);
    ctx.fill();
  }
  ctx.restore();
  if (variant === 1) {
    sportText(ctx, 'MAIN EVENT', w / 2, h * 0.16, 60, { color: '#e2bd62', condense: 0.9 });
    sportText(ctx, 'RED', w * 0.25, h * 0.48, 150, { color: '#ff3b3b' });
    sportText(ctx, 'VS', w * 0.5, h * 0.48, 110, { color: '#ffffff' });
    sportText(ctx, 'BLUE', w * 0.75, h * 0.48, 150, { color: '#3b7bff' });
    sportText(ctx, '5 ROUNDS  •  CHAMPIONSHIP', w / 2, h * 0.8, 44, { color: '#ffffff', condense: 0.9 });
  } else {
    ctx.save();
    ctx.translate(w / 2, h * 0.44);
    emblem(ctx, h * 0.34);
    ctx.restore();
    sportText(ctx, 'FIGHT NIGHT  •  LIVE', w / 2, h * 0.9, 50, { color: '#ffffff', condense: 0.9 });
  }
  // LED pixel grid
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  for (let x = 0; x < w; x += 4) ctx.fillRect(x, 0, 1, h);
  for (let y = 0; y < h; y += 4) ctx.fillRect(0, y, w, 1);
  return canvasTex(c);
}

// Scrolling LED ribbon board strip (tile horizontally).
export function makeRibbonTexture(seed = 0) {
  const w = 4096;
  const h = 128;
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  const n = 8;
  const seg = w / n;
  for (let i = 0; i < n; i++) {
    const s = SPONSORS[(i + seed) % SPONSORS.length];
    const x0 = i * seg;
    if (i % 4 === 0) {
      const g = ctx.createLinearGradient(x0, 0, x0 + seg, 0);
      g.addColorStop(0, '#5c0b12');
      g.addColorStop(0.5, '#0b1020');
      g.addColorStop(1, '#0a2a6c');
      ctx.fillStyle = g;
      ctx.fillRect(x0, 0, seg, h);
      sportText(ctx, 'OCTAGON LEGENDS', x0 + seg / 2, h / 2, h * 0.62, { color: '#f4d27a' });
    } else {
      ctx.fillStyle = s.bg;
      ctx.fillRect(x0, 0, seg, h);
      sportText(ctx, s.name, x0 + seg * 0.42, h * 0.5, h * 0.66, { color: s.fg });
      sportText(ctx, s.sub, x0 + seg * 0.82, h * 0.5, h * 0.22, { color: s.accent, condense: 1, skew: 0, font: FONT_PLAIN, weight: '700' });
    }
    ctx.fillStyle = '#000';
    ctx.fillRect(x0, 0, 6, h);
  }
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  for (let x = 0; x < w; x += 4) ctx.fillRect(x, 0, 1, h);
  for (let y = 0; y < h; y += 4) ctx.fillRect(0, y, w, 1);
  const t = canvasTex(c, { repeat: true });
  t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

// Lens dirt for the bloom-driven dirt overlay in the grade pass.
export function makeLensDirtTexture(size = 512) {
  const c = makeCanvas(size);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, size, size);
  const R = rng(4242);
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 70; i++) {
    const x = R() * size;
    const y = R() * size;
    const r = 6 + R() * 40;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const a = 0.05 + R() * 0.18;
    g.addColorStop(0, `rgba(255,240,220,${a})`);
    g.addColorStop(0.7, `rgba(255,240,220,${a * 0.6})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  for (let i = 0; i < 300; i++) {
    ctx.fillStyle = `rgba(255,250,240,${0.1 + R() * 0.4})`;
    ctx.beginPath();
    ctx.arc(R() * size, R() * size, 0.5 + R() * 2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = 'rgba(255,245,230,0.08)';
  for (let i = 0; i < 12; i++) {
    ctx.lineWidth = 2 + R() * 6;
    ctx.beginPath();
    const x = R() * size;
    const y = R() * size;
    ctx.moveTo(x, y);
    ctx.bezierCurveTo(x + (R() - 0.5) * 200, y + (R() - 0.5) * 200, x + (R() - 0.5) * 200, y + (R() - 0.5) * 200, x + (R() - 0.5) * 300, y + (R() - 0.5) * 300);
    ctx.stroke();
  }
  return canvasTex(c, { srgb: false });
}
