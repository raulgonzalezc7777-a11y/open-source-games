# Faros de Aetheria

A browser game about light, wind and gravity. You are Lumen, a spark inside a glass sphere, and you have to relight seven beacons across a chain of floating islands before night falls.

Open `index.html` in any modern browser with WebGL 2. There is no build step. three.js and cannon-es load from jsDelivr through an import map.

## What is in it

- **Physics** ([cannon-es](https://github.com/pmndrs/cannon-es)). The sphere rolls on island heightfields. Two rope bridges are built from planks joined by point constraints, and they sway under the ball. There are stone ruins and a domino line you can knock over, flowers that launch you along a ballistic arc, and a column of wind that lifts you to the next island. The rope of light is a velocity constraint that reels in while you hold it and lets go with a fling.
- **Procedural models**. Every island, cliff, tree, rock, vine and beacon is generated in code from seeded noise. The sky islands use sandstone strata, the trees are swaying instanced meshes, and about 45,000 grass blades on the GPU bend away from the ball.
- **Rendering**. The sky is physically based and the sun sets in real time from golden hour to night. The sea of clouds and the reflections come from the sky itself. The ball is iridescent transmissive glass. Bloom, colour grading, an aurora that grows with every beacon you light, stars, fireflies, falling petals, waterfalls, and verlet-cloth banners that react to the ball.
- **Sound**. Everything is synthesized with the Web Audio API: ambient chords, birds by day and crickets by night, wind, rolling, impacts, chimes, and a finale.

## Controls

| Action | Keyboard and mouse | Touch |
| --- | --- | --- |
| Roll | W A S D or arrows | Left joystick |
| Look | Mouse (click to lock) or drag; Q and R rotate | Drag on the right side |
| Jump | Space | SALTO |
| Dash (once in the air too) | Shift | IMPULSO |
| Rope of light | Hold E or right click (left click when the pointer is locked) | Hold CUERDA |
| Pause, mute | P or Esc, M | Pause button |

The quality setting (Alta, Media, Baja) changes resolution, shadow resolution, grass density, antialiasing and the glass shader. Resolution also adapts on its own to keep the frame rate up.
