// Haze and volumetric shafts (additive cones with a soft noise shader) and floating dust motes.
import * as THREE from 'three';
import { rng } from './textures.js';

const NOISE = /* glsl */ `
  float hash3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float vnoise(vec3 x) {
    vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash3(i + vec3(0,0,0)), hash3(i + vec3(1,0,0)), f.x),
                   mix(hash3(i + vec3(0,1,0)), hash3(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(hash3(i + vec3(0,0,1)), hash3(i + vec3(1,0,1)), f.x),
                   mix(hash3(i + vec3(0,1,1)), hash3(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  float fbm(vec3 p) { return vnoise(p) * 0.6 + vnoise(p * 2.03 + 7.1) * 0.3 + vnoise(p * 4.1 + 3.3) * 0.1; }
`;

const shaftVert = /* glsl */ `
  uniform float uHeight;
  varying float vH;
  varying vec3 vWorld;
  varying vec3 vNormal;
  void main() {
    vH = clamp(-position.y / uHeight, 0.0, 1.0);
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    vNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const shaftFrag = /* glsl */ `
  uniform vec3 uColor;
  uniform float uIntensity, uTime, uFloorFade;
  varying float vH;
  varying vec3 vWorld;
  varying vec3 vNormal;
  ${NOISE}
  void main() {
    vec3 V = normalize(cameraPosition - vWorld);
    float facing = abs(dot(normalize(vNormal), V));
    float soft = pow(facing, 2.2);
    float top = smoothstep(0.0, 0.18, vH);
    float bottom = smoothstep(0.0, uFloorFade, vWorld.y);
    float fall = mix(1.0, 0.45, vH);
    float n = fbm(vWorld * vec3(0.55, 0.25, 0.55) + vec3(uTime * 0.03, -uTime * 0.06, uTime * 0.02));
    float camFade = smoothstep(0.6, 3.5, length(cameraPosition - vWorld));
    float a = uIntensity * soft * top * bottom * fall * (0.35 + 1.1 * n) * camFade;
    gl_FragColor = vec4(uColor * a, 1.0);
  }
`;

export function createShaft({ top, bottomRadius = 2.2, topRadius = 0.35, height = 9, color = new THREE.Color(1, 0.86, 0.66), intensity = 0.06, floorFade = 1.2 }) {
  const geo = new THREE.CylinderGeometry(topRadius, bottomRadius, height, 40, 12, true);
  geo.translate(0, -height / 2, 0);
  const mat = new THREE.ShaderMaterial({
    vertexShader: shaftVert,
    fragmentShader: shaftFrag,
    uniforms: {
      uHeight: { value: height },
      uColor: { value: color },
      uIntensity: { value: intensity },
      uTime: { value: 0 },
      uFloorFade: { value: floorFade },
    },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(top);
  mesh.userData.noAO = true;
  mesh.renderOrder = 5;
  return mesh;
}

const dustVert = /* glsl */ `
  attribute vec4 aSeed;
  uniform float uTime, uScale, uConeTop, uConeR;
  varying float vI;
  void main() {
    vec3 p = position;
    float t = uTime * (0.4 + aSeed.x * 0.6);
    p.x += sin(t * 0.21 + aSeed.y * 40.0) * 0.35 + sin(t * 0.07 + aSeed.z * 10.0) * 0.6;
    p.z += cos(t * 0.17 + aSeed.z * 30.0) * 0.35 + cos(t * 0.05 + aSeed.y * 12.0) * 0.6;
    p.y += sin(t * 0.11 + aSeed.w * 20.0) * 0.4 + uTime * 0.02 * (aSeed.x - 0.5);
    p.y = mod(p.y - 0.2, 8.3) + 0.2;
    // brighter inside the key light cone
    float coneR = mix(uConeR, 0.6, clamp(p.y / uConeTop, 0.0, 1.0));
    float inside = 1.0 - smoothstep(coneR * 0.55, coneR, length(p.xz));
    float glint = 0.35 + 0.65 * pow(0.5 + 0.5 * sin(uTime * (1.0 + aSeed.w * 3.0) + aSeed.y * 60.0), 6.0);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    float camFade = smoothstep(0.4, 2.0, -mv.z);
    vI = inside * glint * camFade;
    gl_PointSize = vI > 0.01 ? max(1.0, (0.012 + aSeed.x * 0.018) * uScale / -mv.z) : 0.0;
    gl_Position = projectionMatrix * mv;
  }
`;

const dustFrag = /* glsl */ `
  uniform vec3 uColor;
  varying float vI;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.0, d) * vI;
    if (a < 0.003) discard;
    gl_FragColor = vec4(uColor * a, 1.0);
  }
`;

export function createDust(count = 1600, { radius = 6, top = 8.5 } = {}) {
  const R = rng(77);
  const pos = new Float32Array(count * 3);
  const seed = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    const r = Math.sqrt(R()) * radius;
    const a = R() * Math.PI * 2;
    pos[i * 3] = Math.cos(a) * r;
    pos[i * 3 + 1] = 0.2 + R() * (top - 0.2);
    pos[i * 3 + 2] = Math.sin(a) * r;
    for (let k = 0; k < 4; k++) seed[i * 4 + k] = R();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
  const mat = new THREE.ShaderMaterial({
    vertexShader: dustVert,
    fragmentShader: dustFrag,
    uniforms: {
      uTime: { value: 0 },
      uScale: { value: 700 },
      uConeTop: { value: top },
      uConeR: { value: 5.5 },
      uColor: { value: new THREE.Color(1.4, 1.2, 0.95) },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.userData.noAO = true;
  return pts;
}
