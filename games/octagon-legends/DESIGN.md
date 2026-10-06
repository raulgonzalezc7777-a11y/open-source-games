# Octagon Legends — design and module contracts

Third-person MMA fighting game in Three.js (r169, ES modules, Vite). No external assets:
every mesh, texture, sound and animation is generated procedurally at load time, so the
game runs offline from `index.html`.

Units: 1 unit = 1 metre. Y up. Octagon cage inradius 4.6 m, floor at y = 0.
Fighters face each other along their local +Z (a fighter's `root.rotation.y` is set so +Z points at the opponent).

## Files and owners

| File | Owner | Responsibility |
| --- | --- | --- |
| `src/main.js` | lead | bootstrap, game-state machine, loop, `?debug` scenarios for screenshots |
| `src/input.js` | lead | keyboard + gamepad → `InputState` |
| `src/camera.js` | lead | third-person broadcast/over-shoulder camera, shake, KO cinematic |
| `src/render/renderer.js` | agent A | WebGLRenderer, PMREM env, post-processing chain, impact effects |
| `src/render/arena.js` | agent A | octagon, canvas mat, cage, stadium, lights, crowd, atmosphere |
| `src/fighter/*.js` | agent B | procedural body mesh, rig, materials, animation poses, ragdoll |
| `src/combat/*.js` | agent C | moves table, fight state per fighter, hit detection, damage, AI |
| `src/ui/*.js`, `src/audio.js`, `src/progression.js` | agent D | HUD, menus, results, XP/rank/unlocks, SFX |

## Contracts

### `src/render/renderer.js`
```js
export function createRenderer(canvas) // returns:
{
  renderer, scene, camera,           // THREE.WebGLRenderer, THREE.Scene, THREE.PerspectiveCamera (fov 42)
  render(dt),                        // runs the composer
  resize(),
  impact(strength /*0..1*/, screenPos /*{x,y} NDC or null*/), // punch flash: chromatic aberration + radial blur pulse + exposure kick
  setSlowMo(f /*0..1*/),             // desaturate / vignette while slow motion is active
  setKOFade(f /*0..1*/),             // KO grade (desaturation, dark vignette)
  setQuality('high'|'medium'|'low'),
}
```

### `src/render/arena.js`
```js
export function createArena(scene, renderer) // returns:
{
  radius: 4.6,                       // usable radius, fighters are clamped inside this
  update(dt, time),
  crowdExcite(amount /*0..1*/),      // crowd jumps / flashes of phone cameras
  flashBulbs(count),
}
```

### `src/fighter/Fighter.js`
```js
export class Fighter {
  constructor(scene, profile) // profile = one entry of FIGHTER_PROFILES (below)
  root            // THREE.Group placed on the floor; main.js sets root.position / root.rotation.y
  update(dt, fs)  // fs = FighterState from combat (below). Poses the rig for this frame.
  getPoint(name)  // world THREE.Vector3 of 'head','chin','chest','abdomen','hips','fistL','fistR','footL','footR','shinL','shinR','kneeL','kneeR'
  setDamage({head, body, legs}) // 0..1 each: bruising, swelling, cut above eye at head>0.6, red skin on legs
  setSweat(amount)              // 0..1 clearcoat / wetness sheen grows over the fight
  flinch(zone, dirWorld, strength) // additive hit reaction impulse layered on the current pose
  startRagdoll(impulseWorld)    // KO: physics takes over the pose
  dispose()
}
export const FIGHTER_PROFILES // array of at least 6 fighters with name, nickname, country, record, skinTone, hair, beard, tattoos, shortsColor, gloveColor, build ('light'|'middle'|'heavy'), stats {power, speed, chin, cardio} (0..100), special ('superman'|'flyingKnee'|'spinningBackfist'|'spinningHeelKick'|...)
```

### `FighterState` (produced by `src/combat`, consumed by `Fighter.update`)
```js
{
  anim: 'idle'|'walk'|'jab'|'cross'|'leadHook'|'rearHook'|'uppercut'|'bodyHook'|'frontKick'
        |'legKick'|'bodyKick'|'headKick'|'superman'|'flyingKnee'|'spinningBackfist'|'spinningHeelKick'
        |'blockHigh'|'blockLow'|'slip'|'duck'|'hitHead'|'hitBody'|'hitLeg'|'stagger'|'knockdown'|'getUp'
        |'ko'|'taunt'|'victory'|'defeat'|'walkout',
  animTime,        // seconds since this anim started
  phase,           // 0..1 progress through the anim (for moves: windup [0,active0), active [active0,active1), recovery [active1,1])
  active0, active1,// normalized active window (moves only)
  move: {x, z},    // local-space locomotion velocity in m/s (x strafe, z forward) for walk blending
  guard,           // 0..1 how high/tight the guard is (1 = shell block)
  stamina,         // 0..1
  health: {head, body, legs}, // 0..1 remaining
  stunned,         // bool, wobbly legs
  side,            // 0 or 1
}
```

### `src/combat/index.js`
```js
export const MOVES // id -> { anim, damage, stamina, reach, zone:'head'|'body'|'legs', startup, active, recovery (seconds), knockback, special:bool, limb:'fistL'|'fistR'|'footL'|'footR'|'kneeL'|'kneeR' }
export class FightSim {
  constructor({ p1Profile, p2Profile, radius, rounds:3, roundTime:120 })
  fighters     // [F0, F1]; each: { pos: Vector3, facing: yaw, state: FighterState, ... }
  update(dt, inputs /*[InputState|null, InputState|null]; null = CPU*/, getPoint /*(side, name) => Vector3 from Fighter*/)
  events       // array drained by main.js each frame: {type:'hit'|'block'|'whiff'|'knockdown'|'ko'|'roundEnd'|'fightEnd'|'combo'|'special', side, zone, damage, point:Vector3, counter:bool, combo:n}
  round, clock, score, winner
}
```
`InputState`: `{ moveX, moveZ (-1..1, camera-relative already resolved by main.js to fighter-local), jab, cross, hook, uppercut, bodyMod, frontKick, legKick, roundhouse, special, block, dodge, taunt }` (buttons are edge-triggered booleans except `block`, `bodyMod`, which are held).

### UI (`src/ui/hud.js`, `src/ui/menus.js`)
DOM overlay (`#ui`) above the canvas. HUD shows per-fighter name, flag, portrait initials, health bars (head/body/legs silhouettes), stamina bar, round and clock, combo counter, damage popups, "KNOCKDOWN", "K.O.!", round cards, fight results with XP gained.

### Controls
| Action | Keyboard | Gamepad |
| --- | --- | --- |
| Move | WASD | Left stick |
| Jab / Cross | J / K | X / Y |
| Hook / Uppercut | U / I | LB / RB |
| Body modifier (held) | Left Shift | LT |
| Leg kick / Head kick / Front kick | L / O / ; | A / B / RS click |
| Special | Space | RT + B |
| Block (held) | Q | LT + RT |
| Dodge / slip | E | Right stick |
| Taunt | T | D-pad up |

## Art direction
Broadcast-quality night event: dark stadium, strong overhead key light cone over the canvas,
rim lights from cage corners, haze/volumetric shafts, glossy sweat skin, deep contact shadows,
filmic ACES tone mapping, subtle film grain, bloom on lights only. Colour palette: deep navy
arena, warm tungsten overhead, red/blue corner accents, gold championship trim.
