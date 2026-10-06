// The event venue: octagon platform + painted canvas, padded posts and chain-link cage with gate
// and steps, ringside tables, tiered bowl with an instanced crowd, overhead lighting truss with
// emissive fixtures, broadcast lights, volumetric shafts, dust, jumbotron, wall screens and LED ribbons.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';
import {
  rng, makeMatTextures, makeChainLinkAlpha, makePostPadTexture, makeSkirtTexture, makeScreenTexture,
  makeRibbonTexture, makeGrainNormal,
} from './textures.js';
import { createCrowd } from './crowd.js';
import { createShaft, createDust } from './atmosphere.js';

const INRADIUS = 4.6; // usable radius / cage inradius
const FENCE_IN = 4.66; // fence plane inradius
const APRON_IN = 5.75; // platform edge inradius
const DECK = -1.2; // arena floor height (platform is raised)
const TRUSS_Y = 9.0;
const C8 = Math.cos(Math.PI / 8);

function octVerts(inr, y = 0) {
  const R = inr / C8;
  const v = [];
  for (let k = 0; k < 8; k++) {
    const a = Math.PI / 8 + (k * Math.PI) / 4;
    v.push(new THREE.Vector3(Math.cos(a) * R, y, Math.sin(a) * R));
  }
  return v;
}

// cylinder between two points
const _up = new THREE.Vector3(0, 1, 0);
function cylBetween(a, b, r, seg = 6, open = true) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const g = new THREE.CylinderGeometry(r, r, len, seg, 1, open);
  const q = new THREE.Quaternion().setFromUnitVectors(_up, dir.normalize());
  g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)));
  return g;
}

function boxAt(w, h, d, x, y, z, rotY = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rotY) g.rotateY(rotY);
  g.translate(x, y, z);
  return g;
}

function stripUV(g) {
  if (g.index) g = g.toNonIndexed();
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  return g;
}
function mergeAll(list) {
  return mergeGeometries(list.map(stripUV));
}

export function createArena(scene, rendererOrBundle) {
  const renderer = rendererOrBundle && rendererOrBundle.isWebGLRenderer ? rendererOrBundle : rendererOrBundle && rendererOrBundle.renderer;
  const maxAniso = renderer ? renderer.capabilities.getMaxAnisotropy() : 8;
  RectAreaLightUniformsLib.init();

  const root = new THREE.Group();
  root.name = 'arena';
  scene.add(root);
  scene.fog = new THREE.FogExp2(0x04060c, 0.0125);
  const R = rng(2026);
  const disposables = [];

  // ------------------------------------------------------------------ materials
  const vinylNormal = makeGrainNormal(256, 5, 1.2, 1.5);
  vinylNormal.repeat.set(6, 6);
  const vinylBlack = new THREE.MeshPhysicalMaterial({
    color: 0x0b0c10, roughness: 0.42, metalness: 0, clearcoat: 0.4, clearcoatRoughness: 0.28,
    normalMap: vinylNormal, normalScale: new THREE.Vector2(0.15, 0.15),
  });
  const steelBlack = new THREE.MeshStandardMaterial({ color: 0x15171b, roughness: 0.45, metalness: 0.75 });
  const trussMat = new THREE.MeshStandardMaterial({ color: 0x5a5f68, roughness: 0.38, metalness: 0.9 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xc9a24a, roughness: 0.28, metalness: 1 });
  const darkFloor = new THREE.MeshStandardMaterial({ color: 0x06080d, roughness: 0.55, metalness: 0.0 });

  // ------------------------------------------------------------------ platform top: canvas + apron
  const S = 6.3;
  const matTex = makeMatTextures({ size: 4096, S, inradius: INRADIUS, apronIn: APRON_IN });
  matTex.map.anisotropy = maxAniso;
  matTex.roughnessMap.anisotropy = maxAniso;
  matTex.normalMap.repeat.set(260, 260);
  matTex.normalMap.anisotropy = maxAniso;
  {
    // octagon fan with rings so vertex-based effects (fog, shadows) are well sampled
    const rings = 6;
    const pos = [];
    const uv = [];
    const idx = [];
    pos.push(0, 0, 0);
    uv.push(0.5, 0.5);
    const outer = octVerts(APRON_IN);
    for (let r = 1; r <= rings; r++) {
      const t = r / rings;
      for (let k = 0; k < 8; k++) {
        const v = outer[k];
        const x = v.x * t;
        const z = v.z * t;
        pos.push(x, 0, z);
        uv.push((x + S) / (2 * S), 1 - (z + S) / (2 * S));
      }
    }
    for (let k = 0; k < 8; k++) idx.push(0, 1 + ((k + 1) % 8), 1 + k);
    for (let r = 1; r < rings; r++) {
      const a0 = 1 + (r - 1) * 8;
      const b0 = 1 + r * 8;
      for (let k = 0; k < 8; k++) {
        const k1 = (k + 1) % 8;
        idx.push(a0 + k, a0 + k1, b0 + k);
        idx.push(a0 + k1, b0 + k1, b0 + k);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    // ensure up-facing normals
    const n = g.attributes.normal;
    for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
    const mat = new THREE.MeshPhysicalMaterial({
      map: matTex.map,
      roughnessMap: matTex.roughnessMap,
      roughness: 1,
      metalness: 0,
      normalMap: matTex.normalMap,
      normalScale: new THREE.Vector2(0.45, 0.45),
      sheen: 0.35,
      sheenRoughness: 0.6,
      sheenColor: new THREE.Color(0.9, 0.88, 0.82),
      envMapIntensity: 0.6,
    });
    const mat0 = new THREE.Mesh(g, mat);
    mat0.receiveShadow = true;
    mat0.name = 'canvas';
    root.add(mat0);
    // (side check) flip winding if needed so the top faces up
    g.computeVertexNormals();
    const nn = g.attributes.normal.getY(0);
    if (nn < 0) {
      const ix = g.index.array;
      for (let i = 0; i < ix.length; i += 3) {
        const t = ix[i + 1];
        ix[i + 1] = ix[i + 2];
        ix[i + 2] = t;
      }
      g.index.needsUpdate = true;
    }
    for (let i = 0; i < n.count; i++) g.attributes.normal.setXYZ(i, 0, 1, 0);
  }

  // skirt panels on the 8 platform sides
  {
    const top = octVerts(APRON_IN, 0);
    const pos = [];
    const uv = [];
    const g = new THREE.BufferGeometry();
    const mats = [0, 1, 2, 3].map((v) => {
      const t = makeSkirtTexture(v);
      t.anisotropy = maxAniso;
      return new THREE.MeshPhysicalMaterial({ map: t, roughness: 0.35, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.15 });
    });
    for (let k = 0; k < 8; k++) {
      const a = top[k];
      const b = top[(k + 1) % 8];
      const d = a.clone().setY(DECK);
      const c = b.clone().setY(DECK);
      // two triangles, outward facing: (a,b,d) (b,c,d) -- u runs b->a so text reads from outside
      pos.push(...a.toArray(), ...b.toArray(), ...d.toArray(), ...b.toArray(), ...c.toArray(), ...d.toArray());
      uv.push(1, 1, 0, 1, 1, 0, 0, 1, 0, 0, 1, 0);
      g.addGroup(k * 6, 6, (k + 1) % 4);
    }
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    const skirt = new THREE.Mesh(g, mats);
    skirt.receiveShadow = true;
    root.add(skirt);
    // gold trim along the apron edge
    const trims = [];
    for (let k = 0; k < 8; k++) {
      const a = top[k].clone().multiplyScalar(1.004).setY(-0.03);
      const b = top[(k + 1) % 8].clone().multiplyScalar(1.004).setY(-0.03);
      trims.push(cylBetween(a, b, 0.035, 8, false));
    }
    const trim = new THREE.Mesh(mergeAll(trims), gold);
    root.add(trim);
  }

  // ------------------------------------------------------------------ cage
  const postV = octVerts(FENCE_IN, 0);
  {
    // padded posts with caps, stripe facing the centre
    const padTex = makePostPadTexture();
    padTex.anisotropy = maxAniso;
    const padMat = new THREE.MeshPhysicalMaterial({
      map: padTex, roughness: 0.4, clearcoat: 0.45, clearcoatRoughness: 0.25,
      normalMap: vinylNormal, normalScale: new THREE.Vector2(0.12, 0.12),
    });
    const posts = [];
    const caps = [];
    for (let k = 0; k < 8; k++) {
      const v = postV[k];
      const phi = Math.atan2(v.z, v.x);
      const rot = Math.PI / 2 - phi;
      const g = new THREE.CylinderGeometry(0.155, 0.16, 1.92, 32, 1, true);
      g.translate(0, 0.96, 0);
      g.rotateY(rot);
      g.translate(v.x, 0, v.z);
      posts.push(g);
      const c = new THREE.SphereGeometry(0.155, 24, 8, 0, Math.PI * 2, 0, Math.PI / 2);
      c.scale(1, 0.55, 1);
      c.translate(v.x, 1.92, v.z);
      caps.push(c);
    }
    const postMesh = new THREE.Mesh(mergeGeometries(posts), padMat);
    postMesh.castShadow = true;
    postMesh.receiveShadow = true;
    root.add(postMesh);
    const capMesh = new THREE.Mesh(mergeGeometries(caps), vinylBlack);
    capMesh.castShadow = true;
    root.add(capMesh);

    // top rail pads and bottom pads
    const rails = [];
    const bottoms = [];
    for (let k = 0; k < 8; k++) {
      const a = postV[k];
      const b = postV[(k + 1) % 8];
      rails.push(cylBetween(a.clone().setY(1.86), b.clone().setY(1.86), 0.085, 16, false));
      const mid = a.clone().add(b).multiplyScalar(0.5);
      const len = a.distanceTo(b) - 0.3;
      const ang = Math.atan2(b.z - a.z, b.x - a.x);
      const inward = mid.clone().setY(0).normalize().multiplyScalar(-0.06);
      const bg = new THREE.BoxGeometry(len, 0.26, 0.12, 1, 1, 1);
      bg.rotateY(-ang);
      bg.translate(mid.x + inward.x, 0.13, mid.z + inward.z);
      bottoms.push(bg);
    }
    const railMesh = new THREE.Mesh(mergeAll(rails), vinylBlack);
    railMesh.castShadow = true;
    root.add(railMesh);
    const botMesh = new THREE.Mesh(mergeAll(bottoms), vinylBlack);
    botMesh.castShadow = true;
    botMesh.receiveShadow = true;
    root.add(botMesh);

    // chain-link panels
    const alpha = makeChainLinkAlpha(128);
    alpha.anisotropy = maxAniso;
    const cell = 0.065;
    const pos = [];
    const uv = [];
    const y0 = 0.2;
    const y1 = 1.82;
    for (let k = 0; k < 8; k++) {
      const a = postV[k];
      const b = postV[(k + 1) % 8];
      const len = a.distanceTo(b);
      const A0 = a.clone().setY(y0);
      const B0 = b.clone().setY(y0);
      const A1 = a.clone().setY(y1);
      const B1 = b.clone().setY(y1);
      pos.push(...A0.toArray(), ...B0.toArray(), ...A1.toArray(), ...B0.toArray(), ...B1.toArray(), ...A1.toArray());
      const U = len / cell;
      const V = (y1 - y0) / cell;
      uv.push(0, 0, U, 0, 0, V, U, 0, U, V, 0, V);
    }
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    fg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    fg.computeVertexNormals();
    const fenceMat = new THREE.MeshStandardMaterial({
      color: 0x24272d,
      metalness: 0.85,
      roughness: 0.32,
      alphaMap: alpha,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      envMapIntensity: 1.4,
    });
    fenceMat.onBeforeCompile = (sh) => {
      sh.uniforms.uTexSize = { value: 128 };
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uTexSize;')
        .replace(
          '#include <alphamap_fragment>',
          /* glsl */ `
          float aRaw = texture2D( alphaMap, vAlphaMapUv ).g;
          vec2 tp = vAlphaMapUv * uTexSize;
          float texPerPx = max(length(dFdx(tp)), length(dFdy(tp)));
          float aw = max(fwidth(aRaw), 1e-4);
          float aSharp = clamp((aRaw - 0.5) / aw + 0.5, 0.0, 1.0);
          float aMix = smoothstep(0.6, 2.2, texPerPx);
          diffuseColor.a *= mix(aSharp, min(aRaw * 1.2, 1.0), aMix);
          `,
        );
    };
    fenceMat.customProgramCacheKey = () => 'chainlink-aa';
    const fence = new THREE.Mesh(fg, fenceMat);
    fence.renderOrder = 2;
    root.add(fence);

    // gate on the +x side (side 7): frame tubes, brace, latch, hinges
    const a = postV[7];
    const b = postV[0];
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const tan = b.clone().sub(a).normalize();
    const inset = mid.clone().setY(0).normalize().multiplyScalar(-0.03);
    const gate = [];
    for (const s of [-0.55, 0.55]) {
      const p = mid.clone().add(tan.clone().multiplyScalar(s)).add(inset);
      gate.push(cylBetween(p.clone().setY(0.25), p.clone().setY(1.8), 0.028, 10, false));
    }
    const pL = mid.clone().add(tan.clone().multiplyScalar(-0.55)).add(inset);
    const pR = mid.clone().add(tan.clone().multiplyScalar(0.55)).add(inset);
    gate.push(cylBetween(pL.clone().setY(1.0), pR.clone().setY(1.0), 0.022, 8, false));
    gate.push(cylBetween(pL.clone().setY(0.3), pR.clone().setY(1.75), 0.016, 6, false));
    const latch = boxAt(0.08, 0.16, 0.1, pR.x + inset.x * 2, 1.0, pR.z + inset.z * 2);
    gate.push(latch);
    for (const y of [0.5, 1.5]) gate.push(boxAt(0.07, 0.1, 0.07, pL.x, y, pL.z));
    const gateMesh = new THREE.Mesh(mergeAll(gate), steelBlack);
    gateMesh.castShadow = true;
    root.add(gateMesh);
  }

  // ------------------------------------------------------------------ steps up to the gate (+x)
  {
    const steps = [];
    const nosing = [];
    const n = 5;
    const run = 0.34;
    const rise = -DECK / n;
    for (let i = 0; i < n; i++) {
      const topY = -rise * (i + 1) + rise; // first step just below the apron
      const x0 = APRON_IN + 0.02 + i * run;
      const h = topY - DECK;
      steps.push(boxAt(run, h, 1.4, x0 + run / 2, DECK + h / 2 - 0.0001, 0));
      nosing.push(boxAt(0.03, 0.03, 1.4, x0 + 0.015, topY - 0.015, 0));
    }
    // handrails
    const rails = [];
    for (const z of [-0.72, 0.72]) {
      const pA = new THREE.Vector3(APRON_IN + 0.05, 0.95, z);
      const pB = new THREE.Vector3(APRON_IN + n * run, DECK + 0.95 + rise, z);
      rails.push(cylBetween(pA, pB, 0.022, 8, false));
      rails.push(cylBetween(new THREE.Vector3(pA.x, 0, z), pA, 0.022, 8, false));
      rails.push(cylBetween(new THREE.Vector3(pB.x, DECK, z), pB, 0.022, 8, false));
    }
    const stepMesh = new THREE.Mesh(mergeAll(steps), new THREE.MeshStandardMaterial({ color: 0x0c0e14, roughness: 0.6, metalness: 0.3 }));
    stepMesh.receiveShadow = true;
    stepMesh.castShadow = true;
    root.add(stepMesh);
    root.add(new THREE.Mesh(mergeAll(nosing), gold));
    root.add(new THREE.Mesh(mergeAll(rails), steelBlack));
  }

  // ------------------------------------------------------------------ arena floor + ringside
  {
    const floor = new THREE.Mesh(new THREE.CircleGeometry(60, 96), darkFloor);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = DECK;
    floor.receiveShadow = true;
    root.add(floor);

    // ringside tables with glowing laptops
    const tables = [];
    const lids = [];
    const screens = [];
    const tr = 7.7;
    const nT = 26;
    for (let i = 0; i < nT; i++) {
      const a = (i / nT) * Math.PI * 2 + 0.06;
      if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < 0.32) continue; // keep the steps clear
      const x = Math.cos(a) * tr;
      const z = Math.sin(a) * tr;
      const yaw = Math.atan2(-Math.cos(a), -Math.sin(a));
      tables.push(boxAt(1.55, 0.74, 0.7, 0, DECK + 0.37, 0).applyMatrix4(new THREE.Matrix4().makeRotationY(yaw).setPosition(x, 0, z)));
      for (const off of [-0.4, 0.4]) {
        const m = new THREE.Matrix4().makeRotationY(yaw).setPosition(x, 0, z);
        const lid = boxAt(0.34, 0.24, 0.015, off, DECK + 0.74 + 0.12, -0.12);
        lid.rotateX(0);
        lids.push(lid.applyMatrix4(m));
        const sc = new THREE.PlaneGeometry(0.31, 0.2);
        sc.rotateY(Math.PI); // screen faces the press seat (away from the cage)
        sc.translate(off, DECK + 0.74 + 0.12, -0.13 - 0.009);
        screens.push(sc.applyMatrix4(m));
      }
    }
    const tableMesh = new THREE.Mesh(mergeAll(tables), new THREE.MeshStandardMaterial({ color: 0x07080c, roughness: 0.5 }));
    tableMesh.receiveShadow = true;
    root.add(tableMesh);
    root.add(new THREE.Mesh(mergeAll(lids), steelBlack));
    root.add(new THREE.Mesh(mergeAll(screens), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.9, 1.1, 1.6) })));
  }

  // ------------------------------------------------------------------ seating bowl
  const seats = [];
  const LOWER = { r0: 13.6, y0: -0.25, rows: 20, depth: 0.85, rise: 0.5 };
  const UPPER = { r0: 31.2, y0: 11.7, rows: 18, depth: 0.9, rise: 0.64 };
  {
    const prof = [];
    prof.push(new THREE.Vector2(12.6, DECK));
    prof.push(new THREE.Vector2(12.6, -0.25));
    const addTier = (T) => {
      for (let i = 0; i < T.rows; i++) {
        const r = T.r0 + i * T.depth;
        const y = T.y0 + i * T.rise;
        prof.push(new THREE.Vector2(r - T.depth / 2, y));
        prof.push(new THREE.Vector2(r + T.depth / 2 - 0.001, y));
        prof.push(new THREE.Vector2(r + T.depth / 2, y + T.rise));
      }
    };
    addTier(LOWER);
    const lastLower = LOWER.r0 + (LOWER.rows - 0.5) * LOWER.depth;
    prof.push(new THREE.Vector2(lastLower + 0.4, LOWER.y0 + LOWER.rows * LOWER.rise));
    prof.push(new THREE.Vector2(lastLower + 0.4, UPPER.y0));
    prof.push(new THREE.Vector2(UPPER.r0 - UPPER.depth / 2, UPPER.y0));
    addTier(UPPER);
    const lastUpper = UPPER.r0 + (UPPER.rows - 0.5) * UPPER.depth;
    prof.push(new THREE.Vector2(lastUpper + 0.5, UPPER.y0 + UPPER.rows * UPPER.rise));
    prof.push(new THREE.Vector2(lastUpper + 0.5, 40));
    const bowl = new THREE.Mesh(
      new THREE.LatheGeometry(prof, 128),
      new THREE.MeshStandardMaterial({ color: 0x0a0d15, roughness: 0.9, metalness: 0, envMapIntensity: 0.15, side: THREE.DoubleSide }),
    );
    bowl.userData.noAO = true;
    root.add(bowl);

    const seatW = 0.56;
    const aisles = 14;
    const makeRows = (T, tunnel) => {
      for (let i = 0; i < T.rows; i++) {
        const r = T.r0 + i * T.depth - 0.1;
        const y = T.y0 + i * T.rise;
        const n = Math.floor((2 * Math.PI * r) / seatW);
        for (let s = 0; s < n; s++) {
          const a = (s / n) * Math.PI * 2;
          const sec = (a / (Math.PI * 2)) * aisles;
          const f = sec - Math.floor(sec);
          if (f < (0.9 / r) * (aisles / (Math.PI * 2)) * 1.0) continue; // aisle gap ~0.9 m
          if (tunnel && i < 8 && Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < 2.4 / r) continue;
          if (R() < 0.07) continue; // empty seat
          seats.push({ x: Math.cos(a) * r, y, z: Math.sin(a) * r, yaw: Math.atan2(-Math.cos(a), -Math.sin(a)) });
        }
      }
    };
    makeRows(LOWER, true);
    makeRows(UPPER, false);
    // floor rows (VIP / cornermen area) and press behind the tables
    for (const r of [8.45, 9.6, 10.4, 11.2, 12.0]) {
      const n = Math.floor((2 * Math.PI * r) / (r < 9 ? 0.8 : 0.6));
      for (let s = 0; s < n; s++) {
        const a = (s / n) * Math.PI * 2 + 0.02;
        if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < (r < 9 ? 0.34 : 0.16)) continue;
        if (R() < 0.12) continue;
        seats.push({ x: Math.cos(a) * r, y: DECK, z: Math.sin(a) * r, yaw: Math.atan2(-Math.cos(a), -Math.sin(a)) });
      }
    }

    // walkout tunnel portal on +x (lower bowl)
    const portal = new THREE.Group();
    const pr = LOWER.r0 + 0.2;
    const black = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 3.4), new THREE.MeshBasicMaterial({ color: 0x000000 }));
    black.position.set(pr + 0.6, DECK + 1.7, 0);
    black.rotation.y = -Math.PI / 2;
    portal.add(black);
    const glowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.5, 2.6, 1.2) });
    const glow = mergeAll([
      boxAt(0.08, 3.5, 0.08, pr + 0.55, DECK + 1.75, -2.15),
      boxAt(0.08, 3.5, 0.08, pr + 0.55, DECK + 1.75, 2.15),
      boxAt(0.08, 0.08, 4.38, pr + 0.55, DECK + 3.5, 0),
    ]);
    portal.add(new THREE.Mesh(glow, glowMat));
    root.add(portal);
  }

  // ------------------------------------------------------------------ crowd
  const crowd = createCrowd(root, seats);

  // ------------------------------------------------------------------ LED ribbons
  const ribbons = [];
  {
    const mk = (r, h, y, repeat, seed, speed) => {
      const t = makeRibbonTexture(seed);
      t.repeat.set(repeat, 1);
      t.anisotropy = maxAniso;
      const m = new THREE.MeshBasicMaterial({ map: t, color: new THREE.Color(1.6, 1.6, 1.6), side: THREE.BackSide });
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 160, 1, true), m);
      mesh.position.y = y;
      mesh.userData.noAO = true;
      root.add(mesh);
      ribbons.push({ tex: t, speed });
    };
    mk(12.56, 0.72, DECK + 0.62, 6, 0, 0.012);
    const fasciaR = LOWER.r0 + (LOWER.rows - 0.5) * LOWER.depth + 0.38;
    mk(fasciaR, 1.1, UPPER.y0 - 1.0, 12, 3, -0.006);
  }

  // ------------------------------------------------------------------ screens
  const screenTex = [makeScreenTexture(0), makeScreenTexture(1)];
  const screenMats = [];
  {
    // wall screens hanging in front of the upper bowl
    const frameGeo = [];
    for (const deg of [-90 - 34, -90 + 34, 90 - 38, 90 + 38, 0, 180]) {
      const a = THREE.MathUtils.degToRad(deg);
      const r = 30.4;
      const m = new THREE.MeshBasicMaterial({ map: screenTex[deg === -124 || deg === 52 ? 1 : 0], color: new THREE.Color(1.25, 1.25, 1.25) });
      screenMats.push(m);
      const s = new THREE.Mesh(new THREE.PlaneGeometry(9, 5.06), m);
      s.position.set(Math.cos(a) * r, 15.2, Math.sin(a) * r);
      s.lookAt(0, 13, 0);
      s.userData.noAO = true;
      root.add(s);
      const f = new THREE.BoxGeometry(9.4, 5.46, 0.3);
      f.applyMatrix4(new THREE.Matrix4().makeTranslation(0, 0, -0.17));
      f.applyMatrix4(s.matrix.clone().compose(s.position, s.quaternion, new THREE.Vector3(1, 1, 1)));
      frameGeo.push(f);
    }
    root.add(new THREE.Mesh(mergeAll(frameGeo), steelBlack));

    // centre-hung jumbotron
    const jy = 14.2;
    const jw = 5.6;
    const jh = 3.2;
    const box = new THREE.Mesh(new THREE.BoxGeometry(jw, jh + 0.3, jw), steelBlack);
    box.position.y = jy;
    root.add(box);
    for (let i = 0; i < 4; i++) {
      const m = new THREE.MeshBasicMaterial({ map: screenTex[i % 2], color: new THREE.Color(1.3, 1.3, 1.3) });
      screenMats.push(m);
      const s = new THREE.Mesh(new THREE.PlaneGeometry(jw - 0.2, jh), m);
      const a = (i * Math.PI) / 2;
      s.position.set(Math.sin(a) * (jw / 2 + 0.01), jy, Math.cos(a) * (jw / 2 + 0.01));
      s.rotation.y = a;
      root.add(s);
    }
    const rt = makeRibbonTexture(5);
    rt.repeat.set(2, 1);
    ribbons.push({ tex: rt, speed: 0.02 });
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 3.6, 0.45, 96, 1, true), new THREE.MeshBasicMaterial({ map: rt, color: new THREE.Color(1.5, 1.5, 1.5) }));
    ring.position.y = jy - jh / 2 - 0.55;
    root.add(ring);
    const cables = [];
    for (const [x, z] of [[-2.4, -2.4], [2.4, -2.4], [-2.4, 2.4], [2.4, 2.4]]) cables.push(cylBetween(new THREE.Vector3(x, jy + jh / 2, z), new THREE.Vector3(x * 0.6, 40, z * 0.6), 0.02, 4, true));
    root.add(new THREE.Mesh(mergeAll(cables), steelBlack));
  }

  // ------------------------------------------------------------------ lighting truss + fixtures
  const fixtures = []; // {pos, dir}
  {
    const parts = [];
    const H = 0.42; // truss section
    const beam = (a, b) => {
      const dir = new THREE.Vector3().subVectors(b, a);
      const len = dir.length();
      dir.normalize();
      // local frame: along = dir, side = horizontal perpendicular, up = y
      const side = new THREE.Vector3(-dir.z, 0, dir.x);
      const corners = [
        [-1, -1], [1, -1], [1, 1], [-1, 1],
      ].map(([s, u]) => side.clone().multiplyScalar((s * H) / 2).add(new THREE.Vector3(0, (u * H) / 2, 0)));
      for (const c of corners) parts.push(cylBetween(a.clone().add(c), b.clone().add(c), 0.028, 6, true));
      const segs = Math.max(1, Math.round(len / H));
      for (let i = 0; i < segs; i++) {
        const p0 = a.clone().addScaledVector(dir, (i / segs) * len);
        const p1 = a.clone().addScaledVector(dir, ((i + 1) / segs) * len);
        for (let f = 0; f < 4; f++) {
          const c0 = corners[f];
          const c1 = corners[(f + 1) % 4];
          const flip = i % 2 === 0;
          parts.push(cylBetween(p0.clone().add(flip ? c0 : c1), p1.clone().add(flip ? c1 : c0), 0.012, 4, true));
        }
      }
    };
    const E = 6.4;
    const Y = TRUSS_Y;
    for (const z of [-E, -2.2, 2.2, E]) beam(new THREE.Vector3(-E, Y, z), new THREE.Vector3(E, Y, z));
    for (const x of [-E, E]) beam(new THREE.Vector3(x, Y, -E), new THREE.Vector3(x, Y, E));
    const truss = new THREE.Mesh(mergeAll(parts), trussMat);
    truss.userData.noAO = true;
    root.add(truss);
    // chain hoists up into the dark
    const hoists = [];
    for (const x of [-E, E]) for (const z of [-E, -2.2, 2.2, E]) hoists.push(cylBetween(new THREE.Vector3(x, Y + H / 2, z), new THREE.Vector3(x, 40, z), 0.018, 4, true));
    root.add(new THREE.Mesh(mergeAll(hoists), steelBlack));

    // fixtures under the inner beams (straight down) and outer beams (tilted inward)
    for (const z of [-2.2, 2.2]) for (let i = -3; i <= 3; i++) fixtures.push({ p: new THREE.Vector3(i * 1.55, Y - H / 2 - 0.2, z), tilt: 0, inner: true });
    for (const z of [-E, E]) for (let i = -3; i <= 3; i++) fixtures.push({ p: new THREE.Vector3(i * 1.55, Y - H / 2 - 0.2, z), tiltX: -Math.sign(z) * 0.45 });
    for (const x of [-E, E]) for (let i = -2; i <= 2; i++) fixtures.push({ p: new THREE.Vector3(x, Y - H / 2 - 0.2, i * 1.8), tiltZ: Math.sign(x) * 0.45 });

    const housingGeo = new THREE.BoxGeometry(0.62, 0.3, 0.44);
    const yokeGeo = new THREE.TorusGeometry(0.28, 0.02, 4, 16, Math.PI);
    const faceGeo = new THREE.PlaneGeometry(0.54, 0.36);
    faceGeo.rotateX(Math.PI / 2); // faces down
    faceGeo.translate(0, -0.151, 0);
    const n = fixtures.length;
    const housings = new THREE.InstancedMesh(housingGeo, steelBlack, n);
    const yokes = new THREE.InstancedMesh(yokeGeo, steelBlack, n);
    const faceMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(9, 8.2, 6.8) });
    const faces = new THREE.InstancedMesh(faceGeo, faceMat, n);
    const m = new THREE.Matrix4();
    const e = new THREE.Euler();
    const q = new THREE.Quaternion();
    const one = new THREE.Vector3(1, 1, 1);
    fixtures.forEach((f, i) => {
      e.set(f.tiltX || 0, 0, f.tiltZ || 0);
      q.setFromEuler(e);
      m.compose(f.p, q, one);
      housings.setMatrixAt(i, m);
      faces.setMatrixAt(i, m);
      m.compose(f.p.clone().add(new THREE.Vector3(0, 0.15, 0)), new THREE.Quaternion(), one);
      yokes.setMatrixAt(i, m);
      f.dir = new THREE.Vector3(0, -1, 0).applyQuaternion(q);
    });
    housings.userData.noAO = faces.userData.noAO = yokes.userData.noAO = true;
    root.add(housings, yokes, faces);
  }

  // ------------------------------------------------------------------ lights
  const lights = new THREE.Group();
  root.add(lights);
  {
    const key = new THREE.SpotLight(0xfff0dc, 520, 0, 0.6, 0.55, 2);
    key.position.set(0, TRUSS_Y - 0.4, 0.8);
    key.target.position.set(0, 0, 0);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.near = 5;
    key.shadow.camera.far = 13;
    key.shadow.focus = 0.82;
    key.shadow.bias = -0.00012;
    key.shadow.normalBias = 0.015;
    lights.add(key, key.target);

    // broad soft rig panels (broadcast look: big soft speculars, soft fill)
    for (const z of [-2.2, 2.2]) {
      const ra = new THREE.RectAreaLight(0xffe9d0, 5.5, 9.5, 0.9);
      ra.position.set(0, TRUSS_Y - 0.5, z);
      ra.lookAt(0, 0, z * 0.25);
      lights.add(ra);
    }

    // corner rims: red and blue
    const rim = (color, pos, intensity) => {
      const s = new THREE.SpotLight(color, intensity, 0, 0.42, 0.85, 2);
      s.position.copy(pos);
      s.target.position.set(0, 1.2, 0);
      lights.add(s, s.target);
      return s;
    };
    rim(0xff2a1c, new THREE.Vector3(-6.2, 4.8, -4.6), 260);
    rim(0x2a62ff, new THREE.Vector3(6.2, 4.8, -4.6), 300);
    rim(0xff3a28, new THREE.Vector3(-6.0, 3.2, 5.6), 70);
    rim(0x3a70ff, new THREE.Vector3(6.0, 3.2, 5.6), 80);

    // camera-side front fill (broadcast)
    const front = new THREE.SpotLight(0xfff4e8, 110, 0, 0.5, 0.9, 2);
    front.position.set(0, 7.5, 11);
    front.target.position.set(0, 1, 0);
    lights.add(front, front.target);

    const hemi = new THREE.HemisphereLight(0x1c2640, 0x2a2420, 0.35);
    lights.add(hemi);
  }

  // ------------------------------------------------------------------ atmosphere
  const fx = new THREE.Group();
  fx.userData.noAO = true;
  root.add(fx);
  const shafts = [];
  {
    const warm = new THREE.Color(1.0, 0.85, 0.66);
    // the main volume under the rig
    shafts.push(createShaft({ top: new THREE.Vector3(0, TRUSS_Y - 0.4, 0.4), topRadius: 1.2, bottomRadius: 6.2, height: TRUSS_Y - 0.4, intensity: 0.018, color: warm, floorFade: 2.5 }));
    // individual fixture beams
    const pick = fixtures.filter((f) => f.inner);
    pick.forEach((f, i) => {
      if (i % 2 === 1) return;
      const s = createShaft({ top: f.p.clone().add(new THREE.Vector3(0, -0.16, 0)), topRadius: 0.28, bottomRadius: 1.5 + R() * 0.6, height: f.p.y, intensity: 0.022 + R() * 0.02, color: warm, floorFade: 1.6 });
      shafts.push(s);
    });
    // tilted outer beams aimed into the cage
    fixtures.filter((f) => f.tiltX || f.tiltZ).forEach((f, i) => {
      if (i % 3 !== 0) return;
      const s = createShaft({ top: f.p.clone(), topRadius: 0.26, bottomRadius: 1.6, height: 9.2, intensity: 0.02, color: warm, floorFade: 1.4 });
      s.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), f.dir);
      shafts.push(s);
    });
    shafts.forEach((s) => fx.add(s));
  }
  const dust = createDust(1800, { radius: 6.2, top: TRUSS_Y - 0.5 });
  fx.add(dust);

  // ------------------------------------------------------------------ runtime
  const tmpSize = new THREE.Vector2();
  let screenTimer = 0;
  let screenFlip = 0;
  let autoFlash = 0;
  function update(dt = 1 / 60, time = 0) {
    let scale = 700;
    if (renderer) {
      renderer.getDrawingBufferSize(tmpSize);
      scale = tmpSize.y / (2 * Math.tan(THREE.MathUtils.degToRad(42) / 2));
    }
    crowd.update(dt, time, scale);
    dust.material.uniforms.uTime.value = time;
    dust.material.uniforms.uScale.value = scale;
    for (const s of shafts) s.material.uniforms.uTime.value = time;
    for (const r of ribbons) r.tex.offset.x = (r.tex.offset.x + dt * r.speed) % 1;
    screenTimer += dt;
    if (screenTimer > 9) {
      screenTimer = 0;
      screenFlip ^= 1;
      screenMats.forEach((m, i) => (m.map = screenTex[(i + screenFlip) % 2]));
    }
    autoFlash -= dt;
    if (autoFlash <= 0) {
      autoFlash = 0.6 + Math.random() * 1.6;
      crowd.flash(1 + ((Math.random() * 2) | 0));
    }
  }

  function crowdExcite(amount = 1) {
    const a = THREE.MathUtils.clamp(amount, 0, 1);
    crowd.excite(a);
    crowd.flash(Math.round(a * 45));
  }
  function flashBulbs(count = 20) {
    crowd.flash(count);
  }

  return {
    radius: INRADIUS,
    root,
    update,
    crowdExcite,
    flashBulbs,
    dispose() {
      scene.remove(root);
      root.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
      });
      disposables.forEach((d) => d.dispose());
    },
  };
}
