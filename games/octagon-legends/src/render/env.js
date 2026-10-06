// Procedural PMREM environment: a dark arena bowl with a bright overhead light rig,
// warm crowd glow at seat level, red/blue corner accents and a bounce-lit canvas floor.
// The env scene is offset so its origin sits at fighter chest height.
import * as THREE from 'three';

export function buildArenaEnvironment(renderer) {
  const env = new THREE.Scene();
  const chestY = 1.3;
  const add = (mesh, y = 0) => {
    mesh.position.y -= chestY - y;
    env.add(mesh);
    return mesh;
  };
  const emissive = (r, g, b) => new THREE.MeshBasicMaterial({ color: new THREE.Color(r, g, b), side: THREE.DoubleSide });

  // dark navy dome
  const dome = new THREE.Mesh(new THREE.SphereGeometry(60, 32, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.006, 0.009, 0.018), side: THREE.BackSide }));
  add(dome);

  // crowd band: warm, dim, slightly noisy ring at seat height
  const band = new THREE.Mesh(new THREE.CylinderGeometry(30, 30, 14, 48, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.05, 0.035, 0.03), side: THREE.BackSide }));
  band.position.y = 6;
  add(band);
  // LED ribbon rings
  const ribbon = new THREE.Mesh(new THREE.CylinderGeometry(13, 13, 1, 48, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.6, 0.35, 0.2), side: THREE.BackSide }));
  ribbon.position.y = -0.7;
  add(ribbon);

  // canvas floor: bounce light
  const floor = new THREE.Mesh(new THREE.CircleGeometry(5.5, 8), emissive(0.42, 0.4, 0.36));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.01;
  add(floor);

  // overhead rig: a grid of bright warm-white panels
  const panelMat = emissive(14, 12.5, 10.5);
  for (let i = -2; i <= 2; i++) {
    for (const z of [-2.6, 0, 2.6]) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.6), panelMat);
      p.rotation.x = Math.PI / 2;
      p.position.set(i * 2.1, 9, z);
      add(p);
    }
  }
  // long thin strip softboxes (give elongated speculars on skin and gloves)
  const stripMat = emissive(6, 5.8, 5.4);
  for (const x of [-5.5, 5.5]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 9), stripMat);
    p.rotation.x = Math.PI / 2;
    p.position.set(x, 8, 0);
    add(p);
  }
  // corner accents
  const red = emissive(5, 0.4, 0.3);
  const blue = emissive(0.4, 1.2, 6);
  const accentGeo = new THREE.PlaneGeometry(1.5, 1.5);
  const r1 = new THREE.Mesh(accentGeo, red);
  r1.position.set(-6, 5, -4);
  r1.lookAt(0, chestY, 0);
  add(r1, 0);
  const b1 = new THREE.Mesh(accentGeo, blue);
  b1.position.set(6, 5, -4);
  b1.lookAt(0, chestY, 0);
  add(b1, 0);
  // big screens on the walls
  const scr = emissive(0.6, 0.5, 0.7);
  for (let i = 0; i < 4; i++) {
    const s = new THREE.Mesh(new THREE.PlaneGeometry(9, 5), scr);
    const a = (i * Math.PI) / 2;
    s.position.set(Math.cos(a) * 30, 11, Math.sin(a) * 30);
    s.lookAt(0, 11, 0);
    add(s);
  }

  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = pmrem.fromScene(env, 0.035, 0.1, 200);
  pmrem.dispose();
  env.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) o.material.dispose();
  });
  return rt.texture;
}
