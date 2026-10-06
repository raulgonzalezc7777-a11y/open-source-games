import * as THREE from 'three';

// Third-person fight camera. Modes:
//  'fight'  over-the-shoulder behind the player, framing both fighters
//  'orbit'  slow cinematic orbit around a point (menus, walkouts, round cards)
//  'ko'     low dramatic angle on the knocked-out fighter
//  'victory' close hero shot on the winner
const _v = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _mid = new THREE.Vector3();

export function createFightCamera(camera) {
  const pos = new THREE.Vector3(0, 2.4, 8);
  const look = new THREE.Vector3(0, 1.2, 0);
  const goalPos = new THREE.Vector3();
  const goalLook = new THREE.Vector3();
  let mode = 'orbit';
  let t = 0;
  let shake = 0;
  let shakeScale = 1;
  let fovKick = 0;
  let side = 1; // which shoulder (+1 right, -1 left)
  let target = null; // {a: Vector3, b: Vector3} or focus point
  const baseFov = camera.fov;

  function computeFight(p, o) {
    // Player p, opponent o (positions on the floor).
    _v.subVectors(o, p); _v.y = 0;
    const dist = Math.max(0.6, _v.length());
    _v.normalize();
    const right = _a.set(_v.z, 0, -_v.x); // right of the player's facing
    _mid.addVectors(p, o).multiplyScalar(0.5);
    const back = 2.6 + dist * 0.55;
    goalPos.copy(p)
      .addScaledVector(_v, -back)
      .addScaledVector(right, side * (1.35 + dist * 0.25));
    goalPos.y = 1.95 + dist * 0.08;
    // Stay inside the arena-ish bounds so the fence doesn't fill the frame.
    const r = Math.hypot(goalPos.x, goalPos.z);
    const maxR = 7.2;
    if (r > maxR) { goalPos.x *= maxR / r; goalPos.z *= maxR / r; }
    goalLook.copy(_mid).addScaledVector(_v, 0.35);
    goalLook.y = 1.25;
  }

  return {
    camera,
    get mode() { return mode; },
    setMode(m, tgt) { mode = m; target = tgt || target; t = 0; },
    snap() { pos.copy(goalPos); look.copy(goalLook); },
    shake(amount) { shake = Math.min(1.2, shake + amount * shakeScale); },
    kickFov(amount) { fovKick = Math.max(fovKick, amount); },
    setShakeScale(s) { shakeScale = s; },
    /** p: player position, o: opponent position (Vector3s). */
    update(dt, p, o, extra = {}) {
      t += dt;
      let lerp = 1 - Math.exp(-dt * 4.5);
      if (mode === 'fight') {
        computeFight(p, o);
      } else if (mode === 'orbit') {
        const c = extra.center || _mid.set(0, 0, 0);
        const ang = t * (extra.speed ?? 0.12) + (extra.phase ?? 0.6);
        const rad = extra.radius ?? 7.5;
        goalPos.set(c.x + Math.sin(ang) * rad, extra.height ?? 2.6, c.z + Math.cos(ang) * rad);
        goalLook.set(c.x, extra.lookY ?? 1.2, c.z);
        lerp = 1 - Math.exp(-dt * 2);
      } else if (mode === 'ko') {
        // Low angle across the downed fighter, slowly pushing in.
        const down = extra.down || o; const winner = extra.winner || p;
        _v.subVectors(winner, down).setY(0).normalize();
        const right = _a.set(_v.z, 0, -_v.x);
        const push = Math.min(1, t / 3);
        goalPos.copy(down).addScaledVector(right, 3.2 - push * 0.9).addScaledVector(_v, -1.2);
        goalPos.y = 0.55 + push * 0.15;
        goalLook.copy(down).addScaledVector(_v, 0.6); goalLook.y = 0.6 + push * 0.4;
        lerp = 1 - Math.exp(-dt * 3);
      } else if (mode === 'victory') {
        const w = extra.winner || p;
        const ang = t * 0.25 + (extra.phase ?? 0);
        goalPos.set(w.x + Math.sin(ang) * 2.6, 1.45, w.z + Math.cos(ang) * 2.6);
        goalLook.set(w.x, 1.45, w.z);
        lerp = 1 - Math.exp(-dt * 2.5);
      }
      pos.lerp(goalPos, lerp);
      look.lerp(goalLook, 1 - Math.exp(-dt * 6));

      shake = Math.max(0, shake - dt * 2.8);
      const s = shake * shake * 0.09;
      const tt = performance.now() * 0.001;
      camera.position.set(
        pos.x + (Math.sin(tt * 47.1) + Math.sin(tt * 83.3) * 0.5) * s,
        pos.y + (Math.sin(tt * 59.7) + Math.sin(tt * 91.9) * 0.5) * s,
        pos.z + Math.sin(tt * 71.3) * s,
      );
      // Subtle handheld breathing so the broadcast camera never feels locked off.
      camera.position.y += Math.sin(tt * 0.9) * 0.012;
      _b.copy(look);
      camera.lookAt(_b);
      fovKick = Math.max(0, fovKick - dt * 3);
      const fov = baseFov - fovKick * 6;
      if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
    },
  };
}
