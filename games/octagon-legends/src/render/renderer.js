// WebGL renderer, procedural PMREM environment and the broadcast post-processing chain.
//
// Chain: RenderPass -> GTAO (contact AO) -> UnrealBloom (lights only) -> Grade (impact blur/CA,
// exposure kick, lens dirt, split grade, slow-mo, KO, vignette) -> OutputPass (ACES + sRGB)
// -> SMAA -> Finish (film grain + dither).
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { buildArenaEnvironment } from './env.js';
import { GradeShader, FinishShader } from './postfx.js';
import { makeLensDirtTexture } from './textures.js';

const QUALITY = {
  high: { pixelRatio: 1.5, ao: true, bloom: true, smaa: true, grain: true },
  medium: { pixelRatio: 1.25, ao: false, bloom: true, smaa: true, grain: true },
  low: { pixelRatio: 1.0, ao: false, bloom: false, smaa: false, grain: false },
};

export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false, // SMAA in the composer instead
    powerPreference: 'high-performance',
    stencil: false,
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(0x020306, 1);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x020306);
  scene.environment = buildArenaEnvironment(renderer);
  scene.environmentIntensity = 0.55;

  const camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.05, 400);
  camera.position.set(0, 2.2, 7.5);
  camera.lookAt(0, 1.2, 0);

  // --- composer
  const size = new THREE.Vector2();
  const composer = new EffectComposer(renderer);
  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  const gtao = new GTAOPass(scene, camera, 16, 16);
  gtao.output = GTAOPass.OUTPUT.Default;
  gtao.blendIntensity = 0.85;
  gtao.updateGtaoMaterial({ radius: 0.45, distanceExponent: 1.5, thickness: 1.2, scale: 1.0, samples: 12, distanceFallOff: 1.0 });
  gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
  // AO only from solid, nearby geometry: hide additive haze, transparent fence and anything flagged noAO.
  const baseOverride = gtao.overrideVisibility.bind(gtao);
  gtao.overrideVisibility = function () {
    baseOverride();
    scene.traverse((o) => {
      if (!o.visible) return;
      if (o.userData.noAO || (o.material && o.material.transparent)) o.visible = false;
    });
  };
  composer.addPass(gtao);

  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.55, 0.62, 1.6);
  composer.addPass(bloom);

  const grade = new ShaderPass(GradeShader);
  grade.uniforms.tDirt.value = makeLensDirtTexture();
  composer.addPass(grade);

  const output = new OutputPass();
  composer.addPass(output);

  const smaa = new SMAAPass(16, 16);
  composer.addPass(smaa);

  const finish = new ShaderPass(FinishShader);
  composer.addPass(finish);

  // --- state
  let quality = 'high';
  let impactAmt = 0;
  let impactTarget = 0;
  const impactPos = new THREE.Vector2(0.5, 0.5);
  let slowMo = 0;
  let slowMoTarget = 0;
  let ko = 0;
  let koTarget = 0;
  let koHold = 0;
  let time = 0;

  function applyQuality() {
    const q = QUALITY[quality];
    gtao.enabled = q.ao;
    bloom.enabled = q.bloom;
    smaa.enabled = q.smaa;
    finish.uniforms.uGrain.value = q.grain ? 0.045 : 0.0;
    grade.uniforms.uDirt.value = q.bloom ? 0.9 : 0.0;
    resize();
  }

  function resize() {
    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);
    const pr = Math.min(window.devicePixelRatio || 1, QUALITY[quality].pixelRatio);
    renderer.setPixelRatio(pr);
    renderer.setSize(w, h, false);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    composer.setPixelRatio(pr);
    composer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.getDrawingBufferSize(size);
    grade.uniforms.uAspect.value = w / h;
    finish.uniforms.uResolution.value.copy(size);
    // bloom composite lives in the first horizontal blur target; reference it for lens dirt
    grade.uniforms.tBloom.value = bloom.renderTargetsHorizontal[0].texture;
  }

  window.addEventListener('resize', resize);
  applyQuality();

  // NDC {x,y} in [-1,1] -> uv
  function impact(strength = 0.5, screenPos = null) {
    const s = THREE.MathUtils.clamp(strength, 0, 1);
    impactTarget = Math.max(impactTarget, s);
    impactAmt = Math.max(impactAmt, s * 0.6);
    if (screenPos) impactPos.set(screenPos.x * 0.5 + 0.5, screenPos.y * 0.5 + 0.5);
    else impactPos.set(0.5, 0.5);
  }
  function setSlowMo(f) {
    slowMoTarget = THREE.MathUtils.clamp(f, 0, 1);
  }
  function setKOFade(f) {
    koTarget = THREE.MathUtils.clamp(f, 0, 1);
    koHold = 4.0; // auto-release if the caller stops driving it
  }
  function setQuality(q) {
    if (!QUALITY[q]) return;
    quality = q;
    applyQuality();
  }

  function render(dt = 1 / 60) {
    dt = Math.min(Math.max(dt, 0), 0.1);
    time += dt;
    // impact: fast attack toward target, then exponential decay of both
    impactAmt += (impactTarget - impactAmt) * Math.min(1, dt * 40);
    impactTarget *= Math.exp(-dt * 16);
    if (impactTarget < 0.002) impactTarget = 0;
    if (impactAmt < 0.002) impactAmt = 0;
    // slow-mo eases toward its target, target relaxes so a forgotten call decays out
    slowMo += (slowMoTarget - slowMo) * Math.min(1, dt * 6);
    slowMoTarget *= Math.exp(-dt * 0.6);
    // KO fade eases in and holds while being driven
    ko += (koTarget - ko) * Math.min(1, dt * 3);
    koHold -= dt;
    if (koHold <= 0) koTarget *= Math.exp(-dt * 1.5);

    const u = grade.uniforms;
    u.uTime.value = time;
    u.uImpact.value = impactAmt;
    u.uImpactPos.value.copy(impactPos);
    u.uSlowMo.value = slowMo;
    u.uKO.value = ko;
    finish.uniforms.uTime.value = time;
    composer.render(dt);
  }

  return {
    renderer,
    scene,
    camera,
    composer,
    render,
    resize,
    impact,
    setSlowMo,
    setKOFade,
    setQuality,
    get quality() {
      return quality;
    },
  };
}
