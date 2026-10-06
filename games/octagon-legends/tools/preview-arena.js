// Arena / renderer preview: builds renderer + arena, two stand-in capsule fighters, a camera preset,
// renders a few frames and sets window.__READY__ for tools/shoot.mjs (PAGE=tools/preview-arena.html).
import * as THREE from 'three';
import { createRenderer } from '../src/render/renderer.js';
import { createArena } from '../src/render/arena.js';

const qs = new URLSearchParams(location.search);
// defer the heavy build until after the load event so page.goto() returns promptly
setTimeout(main, 50);
function main() {
const R = createRenderer(document.getElementById('c'));
if (qs.get('q')) R.setQuality(qs.get('q'));
const t0 = performance.now();
const arena = createArena(R.scene, R.renderer);
const buildMs = performance.now() - t0;

// stand-in fighters
function standIn(skin, glove, shorts) {
  const g = new THREE.Group();
  const skinMat = new THREE.MeshPhysicalMaterial({ color: skin, roughness: 0.48, clearcoat: 0.6, clearcoatRoughness: 0.35, sheen: 0.2 });
  const gloveMat = new THREE.MeshPhysicalMaterial({ color: glove, roughness: 0.32, clearcoat: 0.9, clearcoatRoughness: 0.15 });
  const shortsMat = new THREE.MeshStandardMaterial({ color: shorts, roughness: 0.7 });
  const add = (geo, mat, x, y, z, rx = 0, rz = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, 0, rz);
    m.castShadow = m.receiveShadow = true;
    g.add(m);
    return m;
  };
  add(new THREE.CapsuleGeometry(0.2, 0.42, 8, 24), skinMat, 0, 1.35, 0).scale.set(1.15, 1, 0.75);
  add(new THREE.SphereGeometry(0.12, 24, 16), skinMat, 0, 1.78, 0.02);
  add(new THREE.CapsuleGeometry(0.17, 0.12, 6, 20), shortsMat, 0, 0.95, 0).scale.set(1.2, 1, 0.85);
  for (const s of [-1, 1]) {
    add(new THREE.CapsuleGeometry(0.075, 0.68, 6, 16), skinMat, s * 0.13, 0.5, 0.0, 0, s * 0.05);
    add(new THREE.CapsuleGeometry(0.055, 0.32, 6, 16), skinMat, s * 0.27, 1.38, 0.18, -1.0, 0);
    add(new THREE.SphereGeometry(0.075, 20, 14), gloveMat, s * 0.2, 1.55, 0.36);
  }
  R.scene.add(g);
  return g;
}
const f1 = standIn(0xc08a68, 0xb3121f, 0x1a1a1a);
f1.position.set(-0.85, 0, 0.1);
f1.rotation.y = Math.PI / 2;
const f2 = standIn(0x6e4a34, 0x1446a8, 0x8a1010);
f2.position.set(0.85, 0, -0.1);
f2.rotation.y = -Math.PI / 2;

const cams = {
  broadcast: [[0, 2.2, 7.5], [0, 1.2, 0]],
  hero: [[2.6, 0.45, 3.6], [0, 1.9, 0]],
  wide: [[0, 5.5, 13.5], [0, 1.0, 0]],
  cage: [[-3.2, 1.5, 5.8], [1.2, 1.1, -2]],
  crowd: [[0, 3.5, 4], [0, 7, -30]],
  top: [[0.01, 16, 0], [0, 0, 0]],
};
const [p, l] = cams[qs.get('cam') || 'broadcast'] || cams.broadcast;
R.camera.position.set(...p);
R.camera.lookAt(...l);

const excite = Number(qs.get('excite') || 0);
if (excite) arena.crowdExcite(excite);

const frames = Number(qs.get('frames') || 4);
let time = 2.0;
const fx = qs.get('fx');
const info = document.getElementById('info');
R.renderer.info.autoReset = false;
for (let i = 0; i < frames; i++) {
  R.renderer.info.reset();
  const dt = 1 / 60;
  time += dt;
  if (fx === 'impact' && i === frames - 2) R.impact(0.9, { x: 0.05, y: 0.25 });
  if (fx === 'ko') R.setKOFade(1);
  if (fx === 'slowmo') R.setSlowMo(1);
  arena.update(dt, time);
  R.render(i === 0 && fx === 'ko' ? 3 : dt);
}
if (fx === 'ko') for (let i = 0; i < 30; i++) R.render(0.1);
info.textContent = `build ${buildMs.toFixed(0)}ms  calls ${R.renderer.info.render.calls} tris ${R.renderer.info.render.triangles}`;
console.log('[preview]', info.textContent);
window.__READY__ = true;

if (qs.get('live')) {
  let last = performance.now();
  const loop = (now) => {
    const dt = (now - last) / 1000;
    last = now;
    time += dt;
    arena.update(dt, time);
    R.render(dt);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  addEventListener('keydown', (e) => {
    if (e.key === 'i') R.impact(1, { x: 0, y: 0.2 });
    if (e.key === 'e') arena.crowdExcite(1);
    if (e.key === 'k') R.setKOFade(1);
    if (e.key === 's') R.setSlowMo(1);
  });
}
}
