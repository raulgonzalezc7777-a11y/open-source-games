// Custom full-screen shaders for the post chain.
//  GradeShader  runs in linear HDR before OutputPass: impact radial blur + chromatic aberration,
//               exposure kick, bloom-driven lens dirt, warm/teal split grade, slow-mo and KO grades, vignette.
//  FinishShader runs after tone mapping + SMAA: luminance-weighted film grain and dithering.
import * as THREE from 'three';

export const GradeShader = {
  name: 'OctagonGradeShader',
  uniforms: {
    tDiffuse: { value: null },
    tBloom: { value: null },
    tDirt: { value: null },
    uTime: { value: 0 },
    uImpact: { value: 0 },
    uImpactPos: { value: new THREE.Vector2(0.5, 0.5) },
    uSlowMo: { value: 0 },
    uKO: { value: 0 },
    uExposure: { value: 1 },
    uAspect: { value: 16 / 9 },
    uDirt: { value: 0.9 },
    uVignette: { value: 0.32 },
    uCA: { value: 0.0012 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform sampler2D tBloom;
    uniform sampler2D tDirt;
    uniform float uTime, uImpact, uSlowMo, uKO, uExposure, uAspect, uDirt, uVignette, uCA;
    uniform vec2 uImpactPos;
    varying vec2 vUv;

    float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

    vec3 sampleCA(vec2 uv, vec2 dir, float amt) {
      vec3 c;
      c.r = texture2D(tDiffuse, uv + dir * amt).r;
      c.g = texture2D(tDiffuse, uv).g;
      c.b = texture2D(tDiffuse, uv - dir * amt).b;
      return c;
    }

    void main() {
      vec2 uv = vUv;
      vec2 fromCentre = uv - 0.5;
      float edge = dot(fromCentre * vec2(uAspect, 1.0), fromCentre * vec2(uAspect, 1.0));
      float ca = uCA * (0.4 + edge * 3.0) + uImpact * 0.010;
      vec3 col;
      if (uImpact > 0.01) {
        // radial zoom blur pulled toward the impact point
        vec2 d = uv - uImpactPos;
        float blur = uImpact * 0.075;
        col = vec3(0.0);
        float wsum = 0.0;
        for (int i = 0; i < 10; i++) {
          float t = float(i) / 9.0;
          float w = 1.0 - t * 0.6;
          vec2 p = uImpactPos + d * (1.0 - blur * t);
          col += sampleCA(p, fromCentre, ca) * w;
          wsum += w;
        }
        col /= wsum;
      } else {
        col = sampleCA(uv, fromCentre, ca);
      }

      // exposure kick on impact (a quick flash) and slight dip on KO
      col *= uExposure * (1.0 + uImpact * 0.55) * (1.0 - uKO * 0.25);

      // lens dirt lit by the bloom buffer
      vec3 bloom = texture2D(tBloom, uv).rgb;
      vec3 dirt = texture2D(tDirt, uv).rgb;
      col += bloom * dirt * uDirt;

      // split grade: cool navy shadows, warm tungsten highlights
      float l = luma(col);
      float hi = smoothstep(0.02, 0.9, l);
      col *= mix(vec3(0.93, 0.98, 1.08), vec3(1.05, 1.0, 0.93), hi);
      // gentle contrast around mid grey in log space
      col = max(col, 0.0);

      // slow-mo: desaturated cool; KO: heavy desaturation, red-crushed shadows
      l = luma(col);
      float desat = max(uSlowMo * 0.55, uKO * 0.82);
      col = mix(col, vec3(l), desat);
      col *= mix(vec3(1.0), vec3(0.92, 0.97, 1.08), uSlowMo);
      col = mix(col, col * vec3(1.12, 0.92, 0.88), uKO * 0.6);

      // vignette
      float v = length(fromCentre * vec2(uAspect * 0.75, 1.0));
      float vig = smoothstep(0.35, 1.05, v);
      float vAmt = uVignette + uSlowMo * 0.35 + uKO * 0.55 + uImpact * 0.15;
      col *= 1.0 - vig * vAmt;

      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

export const FinishShader = {
  name: 'OctagonFinishShader',
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uGrain: { value: 0.045 },
    uResolution: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime, uGrain;
    uniform vec2 uResolution;
    varying vec2 vUv;
    float hash(vec3 p) {
      p = fract(p * 0.1031);
      p += dot(p, p.zyx + 31.32);
      return fract((p.x + p.y) * p.z);
    }
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      vec2 px = floor(vUv * uResolution);
      float t = floor(uTime * 24.0);
      // two octaves of grain, strongest in the mid tones (like film)
      float n = hash(vec3(px, t)) + hash(vec3(floor(px * 0.5) + 17.0, t)) - 1.0;
      float l = dot(c.rgb, vec3(0.299, 0.587, 0.114));
      float w = 1.0 - abs(l - 0.45) * 1.4;
      c.rgb += n * uGrain * clamp(w, 0.25, 1.0);
      // 8-bit dither to kill banding in the dark haze gradients
      c.rgb += (hash(vec3(px, t + 3.0)) - 0.5) / 255.0;
      gl_FragColor = c;
    }
  `,
};
