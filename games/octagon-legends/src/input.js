// Keyboard + gamepad → raw InputState. Movement is reported in screen space
// (x right, z away from camera); main.js converts it to fighter-local space.

const EDGE_ACTIONS = ['jab', 'cross', 'hook', 'uppercut', 'frontKick', 'legKick', 'roundhouse', 'special', 'dodge', 'taunt'];

const KEYMAP = {
  KeyJ: 'jab', KeyK: 'cross', KeyU: 'hook', KeyI: 'uppercut',
  KeyL: 'legKick', KeyO: 'roundhouse', Semicolon: 'frontKick', KeyP: 'frontKick',
  Space: 'special', KeyE: 'dodge', KeyT: 'taunt',
};

export function createInput() {
  const held = new Set();
  const pressed = new Set();
  let padPrev = {};

  addEventListener('keydown', (e) => {
    if (e.repeat) return;
    held.add(e.code);
    const a = KEYMAP[e.code];
    if (a) pressed.add(a);
    if (e.code === 'Space') e.preventDefault();
  });
  addEventListener('keyup', (e) => held.delete(e.code));
  addEventListener('blur', () => held.clear());

  function readPad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const p = [...pads].find(Boolean);
    if (!p) return null;
    const b = (i) => !!(p.buttons[i] && p.buttons[i].pressed);
    const now = {
      jab: b(2), cross: b(3), hook: b(4), uppercut: b(5), legKick: b(0), roundhouse: b(1) && !(p.buttons[7]?.value > 0.5),
      frontKick: b(11), special: b(1) && p.buttons[7]?.value > 0.5, taunt: b(12),
      dodge: Math.hypot(p.axes[2] || 0, p.axes[3] || 0) > 0.7,
    };
    for (const k of EDGE_ACTIONS) if (now[k] && !padPrev[k]) pressed.add(k);
    padPrev = now;
    const lt = p.buttons[6]?.value || 0, rt = p.buttons[7]?.value || 0;
    const dz = (v) => (Math.abs(v) < 0.18 ? 0 : v);
    return {
      x: dz(p.axes[0] || 0), z: -dz(p.axes[1] || 0),
      bodyMod: lt > 0.5 && rt < 0.5, block: lt > 0.5 && rt > 0.5,
      dodgeX: p.axes[2] || 0,
    };
  }

  return {
    /** Returns this frame's state and clears edge-triggered presses. */
    poll() {
      const pad = readPad();
      let x = (held.has('KeyD') || held.has('ArrowRight') ? 1 : 0) - (held.has('KeyA') || held.has('ArrowLeft') ? 1 : 0);
      let z = (held.has('KeyW') || held.has('ArrowUp') ? 1 : 0) - (held.has('KeyS') || held.has('ArrowDown') ? 1 : 0);
      if (pad && (pad.x || pad.z)) { x = pad.x; z = pad.z; }
      const len = Math.hypot(x, z);
      if (len > 1) { x /= len; z /= len; }
      const s = {
        moveX: x, moveZ: z,
        bodyMod: held.has('ShiftLeft') || held.has('ShiftRight') || !!pad?.bodyMod,
        block: held.has('KeyQ') || !!pad?.block,
      };
      for (const a of EDGE_ACTIONS) s[a] = pressed.has(a);
      pressed.clear();
      return s;
    },
    anyKey(cb) {
      const h = () => { removeEventListener('keydown', h); removeEventListener('pointerdown', h); cb(); };
      addEventListener('keydown', h); addEventListener('pointerdown', h);
    },
    clear() { pressed.clear(); },
  };
}
