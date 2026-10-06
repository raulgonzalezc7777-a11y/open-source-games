// Progression: XP, fighter levels, rank ladder, career mode, unlocks, daily challenge,
// win streaks and achievements. Persisted in localStorage (every access wrapped).
//
// recordFight(result) expects (all optional except winner):
// {
//   winner: 0|1|-1 (side index, -1/null = draw), playerSide: 0,
//   method: 'KO'|'TKO'|'DEC'|..., round: 1.., time: seconds elapsed in the finishing round,
//   rounds: 3, mode: 'quick'|'career'|'training', difficulty: 'easy'|'normal'|'hard'|'legend',
//   p1Index, p2Index, finishMove: anim id of the finishing strike (e.g. 'headKick'),
//   stats: [{ landed, thrown, knockdowns, damage, counters, maxCombo, specials, headKicks }, {...}]
// }

const KEY = 'octagon-legends.progression.v1';
const VERSION = 1;

export const RANKS = [
  { id: 'amateur', name: 'Amateur', xp: 0 },
  { id: 'regional', name: 'Regional', xp: 600 },
  { id: 'contender', name: 'Contendiente', xp: 1600 },
  { id: 'top5', name: 'Top 5', xp: 3200 },
  { id: 'champion', name: 'Campeón', xp: 5500 },
  { id: 'legend', name: 'Leyenda', xp: 9000 },
];

// Career: 8 escalating bouts. Opponents are picked from the roster by stage.
export const CAREER_STAGES = [
  { title: 'Debut profesional', event: 'Noche de Promesas', difficulty: 'easy', rounds: 3 },
  { title: 'Circuito regional', event: 'Copa Regional', difficulty: 'easy', rounds: 3 },
  { title: 'Combate co-estelar', event: 'Fight Night', difficulty: 'normal', rounds: 3 },
  { title: 'Entrada al ranking', event: 'Fight Night', difficulty: 'normal', rounds: 3 },
  { title: 'Eliminatoria', event: 'Evento numerado', difficulty: 'hard', rounds: 3 },
  { title: 'Top 5', event: 'Evento numerado', difficulty: 'hard', rounds: 3 },
  { title: 'Pelea por el título interino', event: 'Evento estelar', difficulty: 'hard', rounds: 5 },
  { title: 'Pelea por el campeonato', event: 'Evento estelar', difficulty: 'legend', rounds: 5 },
];

const DIFF_MULT = { easy: 0.75, normal: 1, hard: 1.3, legend: 1.7 };
const BASE_UNLOCKED = 4;

// Daily challenge pool; check(r, me, them) receives the fight result and the player/opponent stats.
const CHALLENGES = [
  { id: 'kohead', text: 'Gana por K.O. con una patada a la cabeza', xp: 350,
    check: (r) => won(r) && isKO(r) && /kick|heel|Kick/.test(r.finishMove || '') && !/legKick|frontKick/.test(r.finishMove || '') },
  { id: 'r1', text: 'Gana en el primer asalto', xp: 300, check: (r) => won(r) && isKO(r) && (r.round || 9) === 1 },
  { id: 'clean', text: 'Gana sin sufrir ningún derribo', xp: 250, check: (r, me, them) => won(r) && !(them.knockdowns > 0) },
  { id: 'counter3', text: 'Conecta 3 contragolpes en una pelea', xp: 250, check: (r, me) => (me.counters || 0) >= 3 },
  { id: 'combo5', text: 'Encadena un combo de 5 golpes', xp: 250, check: (r, me) => (me.maxCombo || 0) >= 5 },
  { id: 'special', text: 'Gana conectando tu movimiento especial', xp: 300, check: (r, me) => won(r) && (me.specials || 0) > 0 },
  { id: 'hardko', text: 'Noquea a un rival en Difícil o Leyenda', xp: 400, check: (r) => won(r) && isKO(r) && ['hard', 'legend'].includes(r.difficulty) },
  { id: 'volume', text: 'Conecta 40 golpes en una sola pelea', xp: 250, check: (r, me) => (me.landed || 0) >= 40 },
  { id: 'sniper', text: 'Gana con más del 60% de precisión', xp: 300, check: (r, me) => won(r) && me.thrown >= 15 && me.landed / me.thrown > 0.6 },
  { id: 'kd2', text: 'Derriba a tu rival 2 veces en una pelea', xp: 300, check: (r, me) => (me.knockdowns || 0) >= 2 },
  { id: 'decision', text: 'Gana por decisión unánime de los jueces', xp: 250, check: (r) => won(r) && /DEC|UD|SD|MD/i.test(r.method || '') },
];

export const ACHIEVEMENTS = [
  { id: 'firstWin', name: 'Primera sangre', desc: 'Gana tu primera pelea.' },
  { id: 'firstKO', name: 'Noqueador', desc: 'Gana una pelea por K.O.' },
  { id: 'flash', name: 'Relámpago', desc: 'Noquea en los primeros 30 segundos.' },
  { id: 'streak5', name: 'Imparable', desc: 'Encadena 5 victorias seguidas.' },
  { id: 'streak10', name: 'Leyenda viva', desc: 'Encadena 10 victorias seguidas.' },
  { id: 'combo6', name: 'Maestro del combo', desc: 'Conecta un combo de 6 golpes.' },
  { id: 'counter5', name: 'Contragolpeador', desc: 'Conecta 5 contragolpes en una pelea.' },
  { id: 'ironChin', name: 'Mandíbula de hierro', desc: 'Gana en Difícil sin ser derribado.' },
  { id: 'special10', name: 'Especialista', desc: 'Conecta 10 movimientos especiales.' },
  { id: 'headhunter', name: 'Cazacabezas', desc: 'Gana por K.O. con patada a la cabeza.' },
  { id: 'sniper', name: 'Precisión quirúrgica', desc: 'Gana con 70% de precisión (mín. 30 golpes).' },
  { id: 'giant', name: 'Matagigantes', desc: 'Vence en dificultad Leyenda.' },
  { id: 'champ', name: 'Campeón del mundo', desc: 'Completa el modo Carrera.' },
  { id: 'veteran', name: 'Veterano', desc: 'Disputa 25 peleas.' },
  { id: 'daily5', name: 'Constancia', desc: 'Completa 5 desafíos diarios.' },
  { id: 'collector', name: 'Coleccionista', desc: 'Desbloquea a todos los luchadores.' },
];

function won(r) { return r.winner === (r.playerSide ?? 0); }
function isKO(r) { return /KO|TKO/i.test(r.method || ''); }

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fresh() {
  return {
    version: VERSION, xp: 0, rank: 0,
    fighters: {}, // index -> { xp, level, wins, losses }
    career: { stage: 0, wins: 0, losses: 0, champion: false, defenses: 0, fighter: null, history: [] },
    streak: 0, bestStreak: 0,
    totals: { fights: 0, wins: 0, losses: 0, draws: 0, kos: 0, specials: 0, dailies: 0 },
    achievements: {}, // id -> ISO date
    daily: { date: '', done: false },
    unlockedExtra: [], // indices unlocked by career rewards
    options: null,
  };
}

function storageGet() {
  try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; }
}
function storageSet(d) {
  try { localStorage.setItem(KEY, JSON.stringify(d)); return true; } catch { return false; }
}

export function rankIndexForXP(xp) {
  let r = 0;
  for (let i = 0; i < RANKS.length; i++) if (xp >= RANKS[i].xp) r = i;
  return r;
}
export function fighterLevelForXP(xp) { return Math.min(50, Math.floor(Math.sqrt(Math.max(0, xp) / 60)) + 1); }

/**
 * @param {number} [rosterSize] number of fighter profiles (for unlock and career logic). Default 8.
 */
export function loadProgression(rosterSize = 8) {
  const stored = storageGet();
  const data = Object.assign(fresh(), stored && stored.version === VERSION ? stored : {});
  data.career = Object.assign(fresh().career, data.career || {});
  data.totals = Object.assign(fresh().totals, data.totals || {});

  /** Rank required to unlock fighter i (null = always unlocked). */
  function unlockRank(i) {
    if (i < BASE_UNLOCKED) return null;
    return Math.min(RANKS.length - 1, i - BASE_UNLOCKED + 1);
  }
  function isUnlocked(i) {
    const r = unlockRank(i);
    return r == null || data.rank >= r || data.unlockedExtra.includes(i);
  }
  function unlockText(i) {
    const r = unlockRank(i);
    return r == null ? '' : `Alcanza el rango ${RANKS[r].name.toUpperCase()}`;
  }

  function rankProgress(xp = data.xp) {
    const r = rankIndexForXP(xp);
    const cur = RANKS[r], next = RANKS[r + 1];
    return {
      rank: r, rankName: cur.name, nextRankName: next ? next.name : '—',
      frac: next ? (xp - cur.xp) / (next.xp - cur.xp) : 1,
      toNext: next ? next.xp - xp : 0,
    };
  }

  function dailyChallenge(date = today()) {
    const c = CHALLENGES[hash('ol-daily-' + date) % CHALLENGES.length];
    return { id: c.id, text: c.text, xp: c.xp, date, done: data.daily.date === date && data.daily.done };
  }

  function nextCareerOpponent(playerIndex = data.career.fighter ?? 0) {
    const stage = Math.min(data.career.stage, CAREER_STAGES.length - 1);
    const s = CAREER_STAGES[stage];
    // Escalate through the roster: later stages draw from the back half (tougher, unlockable fighters).
    const pool = [];
    for (let i = 0; i < rosterSize; i++) if (i !== playerIndex) pool.push(i);
    const pos = Math.round((stage / (CAREER_STAGES.length - 1)) * (pool.length - 1));
    const index = pool[(pos + (data.career.champion ? data.career.defenses : 0)) % pool.length];
    return {
      index, stage, totalStages: CAREER_STAGES.length, title: data.career.champion ? 'Defensa del título' : s.title,
      event: s.event, difficulty: s.difficulty, rounds: s.rounds, champion: data.career.champion,
    };
  }

  function grant(id, list) {
    if (data.achievements[id]) return;
    data.achievements[id] = today();
    const a = ACHIEVEMENTS.find((x) => x.id === id);
    if (a) list.push(a);
  }

  function recordFight(r = {}) {
    const side = r.playerSide ?? 0;
    const me = (r.stats && r.stats[side]) || {};
    const them = (r.stats && r.stats[1 - side]) || {};
    const didWin = r.winner === side;
    const draw = !(r.winner === 0 || r.winner === 1);
    const ko = isKO(r);
    const training = r.mode === 'training';
    const breakdown = [];
    const add = (label, xp) => { if (xp > 0) breakdown.push({ label, xp: Math.round(xp) }); };

    add('Pelea completada', 60);
    if (didWin) add('Victoria', 150);
    else if (draw) add('Empate', 60);
    if (didWin && ko) add('Victoria por K.O.', 120);
    if (didWin && ko && (r.round || 9) === 1) add('Final en el 1.er asalto', 100);
    else if (didWin && ko && (r.round || 9) === 2) add('Final rápido', 50);
    if ((me.maxCombo || 0) >= 3) add(`Combo x${me.maxCombo}`, Math.min(100, me.maxCombo * 12));
    if (me.counters) add(`Contragolpes x${me.counters}`, Math.min(120, me.counters * 15));
    if (didWin && !(them.knockdowns > 0)) add('Sin derribos recibidos', 60);
    if (me.specials) add('Especial conectado', 40 * Math.min(3, me.specials));
    if (didWin && data.streak >= 1) add(`Racha x${data.streak + 1}`, Math.min(200, (data.streak + 1) * 25));

    const daily = dailyChallenge();
    let dailyCompleted = false;
    if (!training && !daily.done) {
      const c = CHALLENGES.find((x) => x.id === daily.id);
      try { dailyCompleted = !!c.check(r, me, them); } catch { dailyCompleted = false; }
      if (dailyCompleted) {
        add('Desafío diario', daily.xp);
        data.daily = { date: daily.date, done: true };
        data.totals.dailies++;
      }
    }

    const mult = (DIFF_MULT[r.difficulty] ?? 1) * (training ? 0.25 : 1);
    for (const b of breakdown) b.xp = Math.round(b.xp * mult);
    const xpGained = breakdown.reduce((s, b) => s + b.xp, 0);

    // totals and streak
    if (!training) {
      data.totals.fights++;
      if (didWin) { data.totals.wins++; data.streak++; } else if (draw) { data.totals.draws++; } else { data.totals.losses++; data.streak = 0; }
      if (didWin && ko) data.totals.kos++;
      data.bestStreak = Math.max(data.bestStreak, data.streak);
    }
    data.totals.specials += me.specials || 0;

    // fighter level
    const fi = side === 0 ? r.p1Index : r.p2Index;
    let levelUp = false, level = 1;
    if (fi != null) {
      const f = (data.fighters[fi] = data.fighters[fi] || { xp: 0, level: 1, wins: 0, losses: 0 });
      const before = f.level;
      f.xp += xpGained;
      f.level = fighterLevelForXP(f.xp);
      if (!training) { if (didWin) f.wins++; else if (!draw) f.losses++; }
      levelUp = f.level > before;
      level = f.level;
    }

    // rank
    const before = rankProgress();
    const unlockedBefore = [];
    for (let i = 0; i < rosterSize; i++) if (isUnlocked(i)) unlockedBefore.push(i);
    data.xp += xpGained;
    data.rank = rankIndexForXP(data.xp);
    const after = rankProgress();
    const rankUp = after.rank > before.rank ? RANKS[after.rank].name : null;

    // career
    let career = null;
    if (r.mode === 'career' && !training) {
      const c = data.career;
      c.fighter = fi ?? c.fighter;
      c.history.push({ stage: c.stage, opp: side === 0 ? r.p2Index : r.p1Index, win: didWin, method: r.method || '', date: today() });
      if (c.history.length > 40) c.history.shift();
      if (didWin) {
        c.wins++;
        if (c.champion) c.defenses++;
        else if (c.stage >= CAREER_STAGES.length - 1) { c.champion = true; }
        else c.stage++;
      } else if (!draw) c.losses++;
      // Career reward: winning stage 4+ unlocks the opponent you beat.
      const opp = side === 0 ? r.p2Index : r.p1Index;
      if (didWin && opp != null && c.stage >= 4 && !data.unlockedExtra.includes(opp)) data.unlockedExtra.push(opp);
      career = { stage: c.stage, champion: c.champion, wonTitle: didWin && c.champion && c.defenses === 0 };
    }

    const unlocked = [];
    for (let i = 0; i < rosterSize; i++) if (isUnlocked(i) && !unlockedBefore.includes(i)) unlocked.push(i);

    // achievements
    const achievements = [];
    if (!training) {
      if (didWin) grant('firstWin', achievements);
      if (didWin && ko) grant('firstKO', achievements);
      if (didWin && ko && (r.round || 9) === 1 && (r.time ?? 99) <= 30) grant('flash', achievements);
      if (data.streak >= 5) grant('streak5', achievements);
      if (data.streak >= 10) grant('streak10', achievements);
      if ((me.maxCombo || 0) >= 6) grant('combo6', achievements);
      if ((me.counters || 0) >= 5) grant('counter5', achievements);
      if (didWin && ['hard', 'legend'].includes(r.difficulty) && !(them.knockdowns > 0)) grant('ironChin', achievements);
      if (data.totals.specials >= 10) grant('special10', achievements);
      if (didWin && ko && /headKick|HeelKick|roundhouse/i.test(r.finishMove || '')) grant('headhunter', achievements);
      if (didWin && (me.thrown || 0) >= 30 && me.landed / me.thrown >= 0.7) grant('sniper', achievements);
      if (didWin && r.difficulty === 'legend') grant('giant', achievements);
      if (data.career.champion) grant('champ', achievements);
      if (data.totals.fights >= 25) grant('veteran', achievements);
      if (data.totals.dailies >= 5) grant('daily5', achievements);
      if (Array.from({ length: rosterSize }, (_, i) => isUnlocked(i)).every(Boolean)) grant('collector', achievements);
    }

    save();
    return {
      xpGained, breakdown, levelUp, level, rankUp, rank: after.rankName,
      unlocked, achievements, dailyCompleted, streak: data.streak, career,
      // for hud.showResults(): spread this result in, it reads `progress`.
      progress: {
        rankName: after.rankName, nextRankName: after.nextRankName,
        before: before.frac, after: after.frac, rankUp: !!rankUp, levelUp, level,
      },
    };
  }

  function save() {
    data.version = VERSION;
    return storageSet(data);
  }

  function reset() {
    Object.assign(data, fresh());
    save();
  }

  return {
    data,
    recordFight,
    isUnlocked,
    unlockText,
    nextCareerOpponent,
    dailyChallenge,
    rankProgress,
    fighterLevel: (i) => data.fighters[i]?.level || 1,
    achievementList: () => ACHIEVEMENTS.map((a) => ({ ...a, unlocked: !!data.achievements[a.id], date: data.achievements[a.id] || null })),
    setCareerFighter(i) { data.career.fighter = i; save(); },
    save,
    reset,
  };
}
