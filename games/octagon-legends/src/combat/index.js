// Public entry for the combat module. See DESIGN.md "src/combat/index.js".
export { MOVES, SPECIAL_IDS, CHAIN_WINDOW, getMoveForInput, specialFor, moveDuration } from './moves.js';
export { FightSim, TUNING, ZONE_HEIGHT } from './sim.js';
export { DIFFICULTY } from './ai.js';
export { styleFor, normStats } from './fighter.js';
export { makeRng } from './rng.js';
