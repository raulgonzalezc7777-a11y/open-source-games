// Instanced crowd: low-poly seated/standing silhouettes with per-instance colour, idle bobbing,
// standing up and fist pumping on excitement (all in the vertex shader), plus a points layer
// for camera flash pops and phone screens.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { rng } from './textures.js';

function part(geo, id) {
  const n = geo.attributes.position.count;
  geo.setAttribute('aPart', new THREE.Float32BufferAttribute(new Float32Array(n).fill(id), 1));
  if (geo.index) geo = geo.toNonIndexed();
  geo.deleteAttribute('uv');
  return geo;
}

// Local space: feet at y = 0 on the tread, +z faces the cage.
function personGeometry() {
  const parts = [];
  // legs / lap block (seated)
  const lap = new THREE.BoxGeometry(0.36, 0.42, 0.42);
  lap.translate(0, 0.21, 0.08);
  parts.push(part(lap, 4));
  // torso, tapered
  const torso = new THREE.CylinderGeometry(0.19, 0.16, 0.56, 7, 1, false);
  torso.scale(1, 1, 0.68);
  torso.translate(0, 0.42 + 0.28, 0);
  parts.push(part(torso, 0));
  // neck + head
  const head = new THREE.IcosahedronGeometry(0.105, 1);
  head.scale(0.92, 1.1, 1);
  head.translate(0, 1.12, 0.01);
  parts.push(part(head, 1));
  // arms (hanging down from shoulders at y = 0.94)
  for (const s of [-1, 1]) {
    const arm = new THREE.CylinderGeometry(0.05, 0.045, 0.52, 5);
    arm.translate(0, -0.26, 0);
    arm.translate(s * 0.215, 0.94, 0.02);
    parts.push(part(arm, s < 0 ? 2 : 3));
  }
  const g = mergeGeometries(parts);
  g.computeBoundingSphere();
  return g;
}

const SHIRTS = [
  [0.05, 0.05, 0.06], [0.08, 0.08, 0.09], [0.6, 0.6, 0.62], [0.35, 0.36, 0.4], [0.03, 0.06, 0.18],
  [0.45, 0.05, 0.05], [0.1, 0.2, 0.45], [0.55, 0.4, 0.2], [0.12, 0.3, 0.14], [0.7, 0.68, 0.6],
  [0.2, 0.2, 0.22], [0.5, 0.12, 0.3], [0.04, 0.04, 0.04], [0.3, 0.22, 0.16], [0.75, 0.2, 0.08],
];

const crowdVert = /* glsl */ `
  #include <common>
  #include <fog_pars_vertex>
  attribute float aPart;
  attribute vec4 aData;   // phase, energy, seatedStanding(0/1), armStyle
  attribute vec3 aColor;  // shirt
  attribute float aSkin;
  uniform float uTime;
  uniform float uExcite;
  varying vec3 vColor;
  varying float vLight;

  vec2 rot2(vec2 v, float a) { float c = cos(a), s = sin(a); return vec2(c * v.x - s * v.y, s * v.x + c * v.y); }

  void main() {
    vec3 p = position;
    vec3 n = normal;
    float phase = aData.x * 6.2831853;
    float energy = aData.y;
    float ex = clamp(uExcite * (0.35 + energy * 1.1), 0.0, 1.0);
    // stand up when excited (enthusiastic people first)
    float stand = max(aData.z, smoothstep(0.35, 0.75, ex));
    if (aPart < 3.5) p.y += stand * 0.42;
    else p.y += stand * 0.2;

    // arms: raise and pump
    if (aPart > 1.5 && aPart < 3.5) {
      float side = aPart < 2.5 ? -1.0 : 1.0;
      float wants = step(fract(aData.w * 3.7 + side * 0.13), ex * 1.1);
      float pump = 0.5 + 0.5 * sin(uTime * (5.0 + energy * 3.0) + phase + side);
      float clap = (1.0 - wants) * step(0.55, energy) * step(0.25, uExcite);
      float a = wants * mix(2.3, 2.95, pump) + clap * (0.35 + 0.3 * pump);
      vec2 pivot = vec2(side * 0.215, 0.94 + stand * 0.42);
      p.xy = pivot + rot2(p.xy - pivot, side * a);
      n.xy = rot2(n.xy, side * a);
      // forward reach for clapping
      p.z += clap * (p.y < pivot.y ? (pivot.y - p.y) * 0.8 : 0.0);
    }

    // idle bob + sway, bigger when excited
    float bob = (0.5 + 0.5 * sin(uTime * (1.3 + energy * 2.5 + ex * 4.0) + phase));
    p.y += bob * (0.012 + ex * 0.09);
    p.x += sin(uTime * 0.6 + phase * 1.7) * (0.015 + ex * 0.03) * smoothstep(0.4, 1.2, p.y);

    vec4 wp = modelMatrix * instanceMatrix * vec4(p, 1.0);
    vec3 wn = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * n);

    // colour: shirt, skin for head and bare arms, dark trousers
    vec3 skin = mix(vec3(0.42, 0.26, 0.17), vec3(0.09, 0.05, 0.03), aSkin);
    vec3 col = aColor;
    if (aPart > 0.5 && aPart < 1.5) col = mix(skin, vec3(0.03), step(1.18 + stand * 0.42, p.y) * 0.85);
    if (aPart > 1.5 && aPart < 3.5) col = mix(aColor, skin, step(0.5, fract(aData.w * 7.0)) * step(p.y, 0.86 + stand * 0.42 + 0.05));
    if (aPart > 3.5) col = vec3(0.04, 0.045, 0.06);
    vColor = col;

    // spill light from the cage, falling off with distance; faint house light from above
    vec3 toCage = vec3(0.0, 4.0, 0.0) - wp.xyz;
    float d = length(toCage);
    float diff = max(dot(wn, toCage / d), 0.0);
    float spill = 0.55 * (14.0 * 14.0) / (d * d);
    float top = max(wn.y, 0.0) * 0.035;
    float rim = pow(1.0 - abs(dot(wn, normalize(cameraPosition - wp.xyz))), 3.0) * 0.06;
    vLight = 0.018 + diff * spill + top + rim;

    vec4 mvPosition = viewMatrix * wp;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const crowdFrag = /* glsl */ `
  #include <common>
  #include <fog_pars_fragment>
  varying vec3 vColor;
  varying float vLight;
  void main() {
    gl_FragColor = vec4(vColor * vLight, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

const flashVert = /* glsl */ `
  attribute vec4 aSeed;   // x: rand, y: phase, z: type (0 flash, 1 phone), w: rand2
  attribute float aTrig;  // time of a triggered flash
  uniform float uTime, uExcite, uRate, uScale;
  varying float vI;
  varying float vType;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float I = 0.0;
    float size = 0.0;
    if (aSeed.z < 0.5) {
      // random camera flash pops
      float P = 3.0 + aSeed.x * 14.0;
      float t = mod(uTime + aSeed.y * P, P);
      float gate = step(aSeed.w, uRate + uExcite * 0.5);
      float pop = exp(-t * 22.0) * gate;
      float dt = uTime - aTrig;
      float trig = dt >= 0.0 ? exp(-dt * 20.0) : 0.0;
      I = max(pop, trig);
      size = 0.55;
    } else {
      // phone screens held up
      float on = step(aSeed.w, 0.12 + uExcite * 0.55);
      I = on * (0.05 + 0.02 * sin(uTime * 2.0 + aSeed.y * 30.0));
      size = 0.12;
    }
    vI = I;
    vType = aSeed.z;
    gl_PointSize = I > 0.001 ? max(1.5, size * uScale / -mv.z) : 0.0;
    gl_Position = projectionMatrix * mv;
  }
`;

const flashFrag = /* glsl */ `
  varying float vI;
  varying float vType;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    float core = exp(-d * d * 90.0);
    float glow = exp(-d * d * 14.0) * 0.25;
    float star = exp(-abs(c.x) * 60.0) * exp(-abs(c.y) * 6.0) + exp(-abs(c.y) * 60.0) * exp(-abs(c.x) * 6.0);
    vec3 col;
    float a;
    if (vType < 0.5) {
      col = vec3(1.0, 0.97, 0.92) * 40.0;
      a = (core + glow + star * 0.35) * vI;
    } else {
      col = vec3(0.75, 0.85, 1.0) * 6.0;
      a = smoothstep(0.5, 0.2, d) * vI;
    }
    if (a < 0.002) discard;
    gl_FragColor = vec4(col * a, 1.0);
  }
`;

// seats: array of {x, y, z, yaw}; returns {mesh, flashes, update, excite, flash}
export function createCrowd(scene, seats, { seed = 11 } = {}) {
  const R = rng(seed);
  const geo = personGeometry();
  const count = seats.length;
  const data = new Float32Array(count * 4);
  const colors = new Float32Array(count * 3);
  const skin = new Float32Array(count);
  const mat = new THREE.ShaderMaterial({
    vertexShader: crowdVert,
    fragmentShader: crowdFrag,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 }, uExcite: { value: 0 } }]),
    fog: true,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.frustumCulled = false;
  mesh.userData.noAO = true;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const heads = [];
  for (let i = 0; i < count; i++) {
    const st = seats[i];
    const sc = 0.9 + R() * 0.22;
    s.set(sc * (0.9 + R() * 0.25), sc, sc);
    q.setFromAxisAngle(up, st.yaw + (R() - 0.5) * 0.35);
    m.compose(new THREE.Vector3(st.x, st.y, st.z), q, s);
    mesh.setMatrixAt(i, m);
    data[i * 4] = R();
    data[i * 4 + 1] = Math.pow(R(), 1.6);
    data[i * 4 + 2] = R() < 0.06 ? 1 : 0; // a few people already standing
    data[i * 4 + 3] = R();
    const c = SHIRTS[(R() * SHIRTS.length) | 0];
    const v = 0.75 + R() * 0.5;
    colors[i * 3] = c[0] * v;
    colors[i * 3 + 1] = c[1] * v;
    colors[i * 3 + 2] = c[2] * v;
    skin[i] = R();
    heads.push(new THREE.Vector3(st.x + Math.sin(st.yaw) * 0.25, st.y + 1.15 + (data[i * 4 + 2] ? 0.42 : 0), st.z + Math.cos(st.yaw) * 0.25));
  }
  geo.setAttribute('aData', new THREE.InstancedBufferAttribute(data, 4));
  geo.setAttribute('aColor', new THREE.InstancedBufferAttribute(colors, 3));
  geo.setAttribute('aSkin', new THREE.InstancedBufferAttribute(skin, 1));
  mesh.instanceMatrix.needsUpdate = true;
  scene.add(mesh);

  // flashes / phones: one point per ~3 spectators
  const fCount = Math.floor(count / 3);
  const fPos = new Float32Array(fCount * 3);
  const fSeed = new Float32Array(fCount * 4);
  const fTrig = new Float32Array(fCount).fill(-100);
  for (let i = 0; i < fCount; i++) {
    const h = heads[(R() * count) | 0];
    fPos[i * 3] = h.x;
    fPos[i * 3 + 1] = h.y + 0.15 + R() * 0.3;
    fPos[i * 3 + 2] = h.z;
    fSeed[i * 4] = R();
    fSeed[i * 4 + 1] = R();
    fSeed[i * 4 + 2] = R() < 0.35 ? 0 : 1;
    fSeed[i * 4 + 3] = R();
  }
  const fGeo = new THREE.BufferGeometry();
  fGeo.setAttribute('position', new THREE.BufferAttribute(fPos, 3));
  fGeo.setAttribute('aSeed', new THREE.BufferAttribute(fSeed, 4));
  const trigAttr = new THREE.BufferAttribute(fTrig, 1);
  trigAttr.setUsage(THREE.DynamicDrawUsage);
  fGeo.setAttribute('aTrig', trigAttr);
  const fMat = new THREE.ShaderMaterial({
    vertexShader: flashVert,
    fragmentShader: flashFrag,
    uniforms: { uTime: { value: 0 }, uExcite: { value: 0 }, uRate: { value: 0.12 }, uScale: { value: 700 } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const flashes = new THREE.Points(fGeo, fMat);
  flashes.frustumCulled = false;
  flashes.userData.noAO = true;
  scene.add(flashes);
  const flashIdx = [];
  for (let i = 0; i < fCount; i++) if (fSeed[i * 4 + 2] === 0) flashIdx.push(i);

  let excite = 0;
  let time = 0;
  return {
    mesh,
    flashes,
    count,
    update(dt, t, scale) {
      time = t;
      excite = Math.max(0, excite - dt * 0.12 * (0.3 + excite));
      const e = 0.08 + excite;
      mat.uniforms.uTime.value = t;
      mat.uniforms.uExcite.value = Math.min(1, e);
      fMat.uniforms.uTime.value = t;
      fMat.uniforms.uExcite.value = Math.min(1, excite);
      fMat.uniforms.uScale.value = scale;
    },
    excite(a) {
      excite = Math.min(1, Math.max(excite, a));
    },
    flash(n) {
      n = Math.min(n | 0, flashIdx.length);
      for (let k = 0; k < n; k++) {
        const i = flashIdx[(Math.random() * flashIdx.length) | 0];
        fTrig[i] = time + Math.random() * 0.8;
      }
      trigAttr.needsUpdate = true;
    },
  };
}
