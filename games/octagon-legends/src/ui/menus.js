// Menus: title, main menu, fighter select, opponent + difficulty, career ladder, controls,
// options and pause. Keyboard, mouse and gamepad navigation. See createMenus() for the API.
import { flagHTML, countryCode } from './flags.js';
import {
  esc, el, recordText, specialName, BUILD_NAMES, DIFFICULTIES, ensureUIRoot, portraitHTML, lastName, firstName, clamp01,
} from './common.js';
import { CAREER_STAGES } from '../progression.js';

const CONTROLS = [
  ['Moverse', 'W A S D', 'Stick izq.'],
  ['Jab / Directo', 'J / K', 'X / Y'],
  ['Gancho / Uppercut', 'U / I', 'LB / RB'],
  ['Modificador al cuerpo (mantener)', 'Shift izq.', 'LT'],
  ['Patada baja / alta / frontal', 'L / O / Ñ', 'A / B / RS'],
  ['Movimiento especial', 'Espacio', 'RT + B'],
  ['Bloquear (mantener)', 'Q', 'LT + RT'],
  ['Esquivar', 'E', 'Stick der.'],
  ['Provocar', 'T', 'Cruceta ↑'],
  ['Pausa', 'Esc', 'Start'],
];

const MAIN_ITEMS = [
  { id: 'quick', label: 'Pelea rápida', desc: 'Elige luchador, rival y dificultad. Directo al octágono.' },
  { id: 'career', label: 'Carrera', desc: 'Ocho combates desde tu debut hasta el cinturón de campeón.' },
  { id: 'training', label: 'Entrenamiento', desc: 'Practica combos y contragolpes sin presión.' },
  { id: 'controls', label: 'Controles', desc: 'Teclado y mando.' },
  { id: 'options', label: 'Opciones', desc: 'Calidad gráfica, volumen y cámara.' },
];

const STAT_LABELS = [['power', 'Potencia'], ['speed', 'Velocidad'], ['chin', 'Mandíbula'], ['cardio', 'Cardio']];

const DEFAULT_OPTIONS = { quality: 'high', master: 0.8, music: 0.6, sfx: 0.9, shake: 1 };
const QUALITY = [['low', 'Baja'], ['medium', 'Media'], ['high', 'Alta']];

let lastInstance = null;
/** Module-level helpers that drive the most recently created menus. */
export function showPause() { lastInstance?.showPause(); }
export function hidePause() { lastInstance?.hidePause(); }

function ovr(p) {
  const s = p?.stats || {};
  return Math.round(((s.power ?? 50) + (s.speed ?? 50) + (s.chin ?? 50) + (s.cardio ?? 50)) / 4);
}

/**
 * @param {HTMLElement} root  the #ui overlay
 * @param {object} cfg
 *   profiles: FIGHTER_PROFILES, progression: loadProgression() result,
 *   onStart({p1Index, p2Index, difficulty, mode, rounds, careerStage?}),
 *   onResume(), onQuit(), onOptions(options), audio (createAudio() result, optional)
 */
export function createMenus(root, cfg = {}) {
  ensureUIRoot(root);
  const profiles = cfg.profiles || [];
  const prog = cfg.progression || null;
  const audio = cfg.audio || null;
  let handlers = { onResume: cfg.onResume || (() => {}), onQuit: cfg.onQuit || (() => {}) };
  const options = Object.assign({}, DEFAULT_OPTIONS, prog?.data?.options || {}, cfg.options || {});

  const wrap = el('div', 'ol-menus hidden');
  wrap.innerHTML = `<div class="mn-vignette"></div><div class="mn-stage"></div><div class="mn-foot"></div>`;
  root.appendChild(wrap);
  const stage = wrap.querySelector('.mn-stage');
  const foot = wrap.querySelector('.mn-foot');

  const state = { screen: null, mode: 'quick', p1: 0, p2: 1, difficulty: 'normal', rounds: 3, paused: false, stack: [] };
  let focusables = [], focusIdx = 0, current = null, backFn = null;

  const isUnlocked = (i) => (prog ? prog.isUnlocked(i) : true);
  const unlockText = (i) => (prog?.unlockText ? prog.unlockText(i) : 'Bloqueado');
  const sfx = (n) => { try { audio?.[n]?.(); } catch { /* audio optional */ } };

  // ---------------- navigation core ----------------
  function setScreen(node, { back = null, hints = 'default', focus = 0 } = {}) {
    if (current) {
      const old = current;
      old.classList.add('out');
      setTimeout(() => old.remove(), 300);
    }
    current = node;
    node.classList.add('ol-screen');
    stage.appendChild(node);
    backFn = back;
    foot.innerHTML = footHTML(hints);
    collect();
    setFocus(typeof focus === 'number' ? focus : Math.max(0, focusables.indexOf(focus)), true);
  }
  function collect() {
    focusables = [...current.querySelectorAll('[data-nav]')].filter((n) => !n.closest('.hidden'));
    focusables.forEach((n, i) => {
      n.onmouseenter = () => setFocus(i);
      if (!n._olClick) {
        n._olClick = true;
        n.addEventListener('click', (e) => { e.stopPropagation(); setFocus(focusables.indexOf(n), true); activate(); });
      }
    });
  }
  function setFocus(i, silent = false) {
    if (!focusables.length) return;
    i = Math.max(0, Math.min(focusables.length - 1, i));
    if (i !== focusIdx && !silent) sfx('uiMove');
    focusables.forEach((n) => n.classList.remove('focus'));
    focusIdx = i;
    const n = focusables[i];
    n.classList.add('focus');
    n.dispatchEvent(new CustomEvent('olfocus'));
    if (n.scrollIntoView && n.closest('.scrolly')) n.scrollIntoView({ block: 'nearest' });
  }
  function move(dx, dy) {
    const cur = focusables[focusIdx];
    if (!cur) return;
    if (dx && cur.dataset.lr != null) { cur.dispatchEvent(new CustomEvent('ollr', { detail: dx })); return; }
    const a = cur.getBoundingClientRect();
    const ax = a.left + a.width / 2, ay = a.top + a.height / 2;
    let best = -1, bestScore = Infinity;
    focusables.forEach((n, i) => {
      if (i === focusIdx) return;
      const b = n.getBoundingClientRect();
      const bx = b.left + b.width / 2, by = b.top + b.height / 2;
      const ddx = bx - ax, ddy = by - ay;
      const along = dx ? ddx * dx : ddy * dy;
      if (along <= 2) return;
      const across = dx ? Math.abs(ddy) : Math.abs(ddx);
      const score = along + across * 2.2;
      if (score < bestScore) { bestScore = score; best = i; }
    });
    if (best >= 0) setFocus(best);
  }
  function activate() {
    const n = focusables[focusIdx];
    if (!n) return;
    if (n.classList.contains('locked')) { sfx('block'); n.classList.remove('deny'); void n.offsetWidth; n.classList.add('deny'); return; }
    sfx('uiSelect');
    n.dispatchEvent(new CustomEvent('olactivate'));
  }
  function back() {
    if (backFn) { sfx('uiMove'); backFn(); }
  }

  function footHTML(kind) {
    if (kind === 'none') return '';
    const k = (key, label) => `<span><kbd>${key}</kbd>${label}</span>`;
    if (kind === 'title') return '';
    const parts = [k('↑↓←→', 'Navegar'), k('Enter', 'Aceptar') + `<span class="pad">Ⓐ</span>`];
    if (kind !== 'main') parts.push(k('Esc', 'Atrás') + `<span class="pad">Ⓑ</span>`);
    if (kind === 'options') parts.splice(1, 0, k('← →', 'Ajustar'));
    return parts.join('');
  }

  // keyboard
  const onKey = (e) => {
    if (wrap.classList.contains('hidden')) return;
    if (document.querySelector('.ol-results')) return; // results screen owns input
    e.stopImmediatePropagation();
    if (state.screen === 'title') { if (!e.repeat) { e.preventDefault(); sfx('uiSelect'); main(); } return; }
    switch (e.code) {
      case 'ArrowUp': case 'KeyW': e.preventDefault(); move(0, -1); break;
      case 'ArrowDown': case 'KeyS': e.preventDefault(); move(0, 1); break;
      case 'ArrowLeft': case 'KeyA': e.preventDefault(); move(-1, 0); break;
      case 'ArrowRight': case 'KeyD': e.preventDefault(); move(1, 0); break;
      case 'Enter': case 'NumpadEnter': case 'Space': if (!e.repeat) { e.preventDefault(); activate(); } break;
      case 'Escape': case 'Backspace': if (!e.repeat) { e.preventDefault(); back(); } break;
      default: break;
    }
  };
  addEventListener('keydown', onKey, true);
  wrap.addEventListener('pointerdown', () => { if (state.screen === 'title') { sfx('uiSelect'); main(); } });

  // gamepad
  let padPrev = {}, padRepeat = 0, padRaf = 0;
  function padLoop(t) {
    padRaf = requestAnimationFrame(padLoop);
    if (wrap.classList.contains('hidden') || document.querySelector('.ol-results')) return;
    const p = navigator.getGamepads ? [...navigator.getGamepads()].find(Boolean) : null;
    if (!p) return;
    const b = (i) => !!p.buttons[i]?.pressed;
    const ax = p.axes[0] || 0, ay = p.axes[1] || 0;
    const now = {
      up: b(12) || ay < -0.6, down: b(13) || ay > 0.6, left: b(14) || ax < -0.6, right: b(15) || ax > 0.6,
      a: b(0), b: b(1), start: b(9), any: p.buttons.some((x) => x.pressed),
    };
    if (state.screen === 'title') { if (now.any && !padPrev.any) { sfx('uiSelect'); main(); } padPrev = now; return; }
    const dirs = [['up', 0, -1], ['down', 0, 1], ['left', -1, 0], ['right', 1, 0]];
    for (const [k, dx, dy] of dirs) {
      if (now[k] && (!padPrev[k] || t > padRepeat)) {
        move(dx, dy);
        padRepeat = t + (padPrev[k] ? 110 : 380);
      }
    }
    if (now.a && !padPrev.a) activate();
    if (now.b && !padPrev.b) back();
    if (now.start && !padPrev.start && state.paused) resume();
    padPrev = now;
  }
  padRaf = requestAnimationFrame(padLoop);

  // ---------------- screens ----------------
  function title() {
    state.screen = 'title';
    const s = el('div', 'mn-title');
    s.innerHTML = `
      <div class="tt-logo">
        <div class="tt-kicker"><span>CAMPEONATO MUNDIAL DE MMA</span></div>
        <h1 class="ol-title-logo"><span class="tt-w1">OCTAGON</span><span class="tt-w2">LEGENDS</span></h1>
        <div class="tt-rule"></div>
      </div>
      <div class="tt-press"><span>PULSA CUALQUIER TECLA</span></div>
      <div class="tt-legal">Versión 0.1 · Todo el contenido generado proceduralmente</div>`;
    setScreen(s, { hints: 'title' });
    wrap.classList.add('is-title');
  }

  function main(focusId) {
    wrap.classList.remove('is-title');
    state.screen = 'main';
    audio?.music?.(true);
    const s = el('div', 'mn-main');
    const rp = prog?.rankProgress ? prog.rankProgress() : { rankName: 'Amateur', nextRankName: 'Regional', frac: 0, toNext: 600 };
    const d = prog?.data;
    const daily = prog?.dailyChallenge ? prog.dailyChallenge() : null;
    const achDone = d ? Object.keys(d.achievements || {}).length : 0;
    const achTotal = prog?.achievementList ? prog.achievementList().length : 0;
    s.innerHTML = `
      <div class="mm-left">
        <div class="mm-logo"><span>OCTAGON</span><b>LEGENDS</b></div>
        <nav class="mm-list">
          ${MAIN_ITEMS.map((it, i) => `<button class="mm-item" data-nav data-id="${it.id}" style="--i:${i}"><span class="mm-idx">0${i + 1}</span><span class="mm-label">${esc(it.label)}</span></button>`).join('')}
        </nav>
        <p class="mm-desc"></p>
      </div>
      <aside class="mm-card">
        <div class="mc-head"><small>TU TRAYECTORIA</small><div class="mc-rank"><b>${esc(rp.rankName)}</b><span>RANGO ${(d?.rank ?? 0) + 1}/6</span></div></div>
        <div class="mc-xp"><div class="mc-xp-bar"><i style="width:${(clamp01(rp.frac) * 100).toFixed(1)}%"></i></div>
          <div class="mc-xp-txt"><span>${d?.xp ?? 0} XP</span><span>${rp.toNext ? `${rp.toNext} XP para <b>${esc(rp.nextRankName)}</b>` : 'RANGO MÁXIMO'}</span></div></div>
        <div class="mc-stats">
          <div><b>${d?.totals.wins ?? 0}</b><small>VICTORIAS</small></div>
          <div><b>${d?.totals.kos ?? 0}</b><small>K.O.</small></div>
          <div><b>${d?.streak ?? 0}</b><small>RACHA</small></div>
          <div><b>${achDone}<em>/${achTotal}</em></b><small>LOGROS</small></div>
        </div>
        ${daily ? `<div class="mc-daily ${daily.done ? 'done' : ''}">
          <div class="mc-daily-h"><small>DESAFÍO DIARIO</small><span>${daily.done ? '✔ COMPLETADO' : `+${daily.xp} XP`}</span></div>
          <p>${esc(daily.text)}</p></div>` : ''}
        ${d ? `<div class="mc-career"><small>CARRERA</small><div class="mc-pips">${Array.from({ length: 8 }, (_, i) => `<i class="${i < d.career.stage || d.career.champion ? 'on' : i === d.career.stage ? 'cur' : ''}"></i>`).join('')}</div><span>${d.career.champion ? 'CAMPEÓN' : `PELEA ${d.career.stage + 1} DE 8`}</span></div>` : ''}
      </aside>`;
    const desc = s.querySelector('.mm-desc');
    s.querySelectorAll('.mm-item').forEach((b) => {
      b.addEventListener('olfocus', () => { desc.textContent = MAIN_ITEMS.find((x) => x.id === b.dataset.id).desc; });
      b.addEventListener('olactivate', () => {
        const id = b.dataset.id;
        if (id === 'quick') { state.mode = 'quick'; select(); }
        else if (id === 'career') { state.mode = 'career'; career(); }
        else if (id === 'training') { state.mode = 'training'; select(); }
        else if (id === 'controls') controls(() => main('controls'));
        else if (id === 'options') optionsScreen(() => main('options'));
      });
    });
    const fi = Math.max(0, MAIN_ITEMS.findIndex((x) => x.id === focusId));
    setScreen(s, { back: title, hints: 'main', focus: fi });
  }

  function statBars(p) {
    const s = p?.stats || {};
    return STAT_LABELS.map(([k, label]) => {
      const v = Math.round(s[k] ?? 50);
      return `<div class="sc-stat"><span>${label}</span><div class="sc-bar"><i style="--v:${v / 100}"></i></div><b>${v}</b></div>`;
    }).join('');
  }

  function bigCard(i, opts = {}) {
    const p = profiles[i] || {};
    const locked = opts.checkLock !== false && !isUnlocked(i);
    const lvl = prog?.fighterLevel ? prog.fighterLevel(i) : 1;
    return `
      <div class="sc-card ${locked ? 'locked' : ''} ${opts.corner === 1 ? 'corner-1' : 'corner-0'}">
        <div class="sc-hero">${portraitHTML(p, 'sc-portrait')}
          <div class="sc-ovr"><b>${ovr(p)}</b><small>GLOBAL</small></div>
          ${locked ? `<div class="sc-lock"><span class="lock-ico"></span><b>BLOQUEADO</b><small>${esc(unlockText(i))}</small></div>` : ''}
        </div>
        <div class="sc-info">
          <div class="sc-country">${flagHTML(p.country)}<span>${esc(countryCode(p.country))}</span><span class="sc-build">${esc(BUILD_NAMES[p.build] || 'Peso medio')}</span>${!locked ? `<span class="sc-lvl">NV ${lvl}</span>` : ''}</div>
          <div class="sc-name"><small>${esc(firstName(p))}</small><b>${esc(lastName(p))}</b></div>
          ${p.nickname ? `<div class="sc-nick">“${esc(p.nickname)}”</div>` : ''}
          <div class="sc-record"><span>RÉCORD</span><b>${esc(recordText(p.record))}</b></div>
          <div class="sc-stats">${statBars(p)}</div>
          <div class="sc-special"><small>MOVIMIENTO ESPECIAL</small><b>${esc(specialName(p.special))}</b></div>
        </div>
      </div>`;
  }

  function gridHTML(opts) {
    return profiles.map((p, i) => {
      const locked = opts.checkLock && !isUnlocked(i);
      return `<button class="fs-cell ${locked ? 'locked' : ''} ${opts.disabled === i ? 'taken' : ''}" data-nav data-i="${i}" style="--i:${i}">
        ${portraitHTML(p, 'fs-portrait')}
        ${flagHTML(p.country)}
        <span class="fs-ovr">${ovr(p)}</span>
        <span class="fs-name">${esc(lastName(p))}</span>
        ${locked ? '<span class="fs-lock"><span class="lock-ico"></span></span>' : ''}
      </button>`;
    }).join('');
  }

  const MODE_LABEL = { quick: 'PELEA RÁPIDA', career: 'CARRERA', training: 'ENTRENAMIENTO' };

  function select() {
    state.screen = 'select';
    const steps = state.mode === 'quick' ? ' · PASO 1 DE 2' : '';
    const s = el('div', 'mn-select');
    s.innerHTML = `
      <header class="mn-head"><small>${MODE_LABEL[state.mode]}${steps}</small><h2>Elige tu luchador</h2></header>
      <div class="fs-body">
        <div class="fs-grid">${gridHTML({ checkLock: true })}</div>
        <div class="fs-detail"></div>
      </div>`;
    const detail = s.querySelector('.fs-detail');
    s.querySelectorAll('.fs-cell').forEach((c) => {
      const i = +c.dataset.i;
      c.addEventListener('olfocus', () => { detail.innerHTML = bigCard(i); });
      c.addEventListener('olactivate', () => {
        state.p1 = i;
        if (state.mode === 'quick') opponent();
        else if (state.mode === 'career') {
          prog?.setCareerFighter?.(i);
          const opp = prog?.nextCareerOpponent ? prog.nextCareerOpponent(i) : { index: (i + 1) % profiles.length, difficulty: 'normal', rounds: 3, stage: 0 };
          start({ p1Index: i, p2Index: opp.index, difficulty: opp.difficulty, mode: 'career', rounds: opp.rounds, careerStage: opp.stage });
        } else {
          start({ p1Index: i, p2Index: (i + 1) % profiles.length, difficulty: 'easy', mode: 'training', rounds: 1 });
        }
      });
    });
    let f = state.p1;
    if (state.mode === 'career' && prog?.data?.career?.fighter != null) f = prog.data.career.fighter;
    if (!isUnlocked(f)) f = 0;
    setScreen(s, { back: state.mode === 'career' ? career : () => main(state.mode), focus: f });
  }

  function opponent() {
    state.screen = 'opponent';
    if (state.p2 === state.p1) state.p2 = (state.p1 + 1) % profiles.length;
    const s = el('div', 'mn-select mn-opp');
    s.innerHTML = `
      <header class="mn-head"><small>PELEA RÁPIDA · PASO 2 DE 2</small><h2>Elige a tu rival</h2></header>
      <div class="fs-body">
        <div class="fs-left">
          <div class="fs-grid fs-grid--sm">${gridHTML({ checkLock: false, disabled: state.p1 })}</div>
          <div class="op-row">
            <div class="op-label">DIFICULTAD</div>
            <div class="op-chips">${DIFFICULTIES.map((d) => `<button class="op-chip ${d.id === state.difficulty ? 'on' : ''} diff-${d.id}" data-nav data-diff="${d.id}">${d.label}</button>`).join('')}</div>
          </div>
          <div class="op-row">
            <div class="op-label">ASALTOS</div>
            <div class="op-chips">${[1, 3, 5].map((r) => `<button class="op-chip ${r === state.rounds ? 'on' : ''}" data-nav data-rounds="${r}">${r}</button>`).join('')}</div>
            <p class="op-desc"></p>
          </div>
          <button class="ol-btn ol-btn--primary op-go" data-nav>¡A pelear! <kbd>ENTER</kbd></button>
        </div>
        <div class="vs-wrap">
          <div class="vs-a">${bigCard(state.p1, { corner: 0 })}</div>
          <div class="vs-badge">VS</div>
          <div class="vs-b"></div>
        </div>
      </div>`;
    const vsb = s.querySelector('.vs-b');
    const desc = s.querySelector('.op-desc');
    const showDiff = () => { desc.textContent = DIFFICULTIES.find((d) => d.id === state.difficulty).desc; };
    showDiff();
    const pick = (i) => {
      state.p2 = i;
      vsb.innerHTML = bigCard(i, { checkLock: false, corner: 1 });
      s.querySelectorAll('.fs-cell').forEach((c) => c.classList.toggle('picked', +c.dataset.i === i));
    };
    pick(state.p2);
    s.querySelectorAll('.fs-cell').forEach((c) => {
      const i = +c.dataset.i;
      if (i === state.p1) { c.removeAttribute('data-nav'); return; }
      c.addEventListener('olfocus', () => pick(i));
      c.addEventListener('olactivate', () => { pick(i); setFocus(focusables.indexOf(s.querySelector('.op-go'))); });
    });
    s.querySelectorAll('[data-diff]').forEach((b) => b.addEventListener('olactivate', () => {
      state.difficulty = b.dataset.diff;
      s.querySelectorAll('[data-diff]').forEach((x) => x.classList.toggle('on', x === b));
      showDiff();
    }));
    s.querySelectorAll('[data-rounds]').forEach((b) => b.addEventListener('olactivate', () => {
      state.rounds = +b.dataset.rounds;
      s.querySelectorAll('[data-rounds]').forEach((x) => x.classList.toggle('on', x === b));
    }));
    s.querySelector('.op-go').addEventListener('olactivate', () => {
      start({ p1Index: state.p1, p2Index: state.p2, difficulty: state.difficulty, mode: 'quick', rounds: state.rounds });
    });
    setScreen(s, { back: select });
    const startCell = s.querySelector(`.fs-cell[data-i="${state.p2}"]`);
    setFocus(Math.max(0, focusables.indexOf(startCell)), true);
  }

  function career() {
    state.screen = 'career';
    const d = prog?.data || { career: { stage: 0, wins: 0, losses: 0, champion: false, history: [] }, streak: 0 };
    const c = d.career;
    const stages = cfg.careerStages || CAREER_STAGES;
    const next = prog?.nextCareerOpponent ? prog.nextCareerOpponent(c.fighter ?? 0) : { index: 1, stage: 0, title: stages[0].title, difficulty: 'easy', rounds: 3, event: '' };
    const opp = profiles[next.index] || {};
    const diffLabel = DIFFICULTIES.find((x) => x.id === next.difficulty)?.label || '';
    const s = el('div', 'mn-career');
    s.innerHTML = `
      <header class="mn-head"><small>MODO CARRERA</small><h2>${c.champion ? 'Campeón del mundo' : 'Camino al título'}</h2></header>
      <div class="cr-body">
        <ol class="cr-ladder">
          ${stages.map((st, i) => {
            const done = i < c.stage || c.champion;
            const cur = !c.champion && i === c.stage;
            const h = [...(c.history || [])].reverse().find((x) => x.stage === i && x.win);
            return `<li class="${done ? 'done' : ''} ${cur ? 'cur' : ''} ${i === stages.length - 1 ? 'title' : ''}" style="--i:${i}">
              <span class="cr-n">${i + 1}</span>
              <span class="cr-t"><b>${esc(st.title)}</b><small>${esc(st.event)}</small></span>
              <span class="cr-r">${done ? (h ? `✔ ${esc(lastName(profiles[h.opp]))}` : '✔') : cur ? 'SIGUIENTE' : ''}</span>
            </li>`;
          }).join('')}
        </ol>
        <div class="cr-next">
          <div class="cr-next-h"><small>${esc(next.event || 'PRÓXIMO COMBATE')}</small><b>${esc(next.title)}</b></div>
          <div class="cr-opp">
            ${portraitHTML(opp, 'cr-portrait')}
            <div class="cr-opp-info">
              <small>RIVAL</small>
              <div class="cr-opp-name">${flagHTML(opp.country)} <b>${esc(opp.name || '')}</b></div>
              ${opp.nickname ? `<div class="sc-nick">“${esc(opp.nickname)}”</div>` : ''}
              <div class="cr-tags"><span>${esc(recordText(opp.record))}</span><span>${esc(diffLabel)}</span><span>${next.rounds} ASALTOS</span></div>
            </div>
          </div>
          <div class="cr-meta">
            <div><b>${c.wins}-${c.losses}</b><small>RÉCORD EN CARRERA</small></div>
            <div><b>${d.streak}</b><small>RACHA</small></div>
            <div><b>${c.fighter != null && profiles[c.fighter] ? esc(lastName(profiles[c.fighter])) : '—'}</b><small>TU LUCHADOR</small></div>
          </div>
          <button class="ol-btn ol-btn--primary cr-go" data-nav>${c.champion ? 'Defender el título' : 'Siguiente pelea'} <kbd>ENTER</kbd></button>
        </div>
      </div>`;
    s.querySelector('.cr-go').addEventListener('olactivate', select);
    setScreen(s, { back: () => main('career') });
  }

  function controls(backTo) {
    state.screen = 'controls';
    const s = el('div', 'mn-controls');
    s.innerHTML = `
      <header class="mn-head"><small>AYUDA</small><h2>Controles</h2></header>
      <div class="ct-table">
        <div class="ct-row ct-hd"><span>ACCIÓN</span><span>TECLADO</span><span>MANDO</span></div>
        ${CONTROLS.map(([a, k, g], i) => `<div class="ct-row" style="--i:${i}"><span>${esc(a)}</span><span>${k.split(' / ').map((x) => `<kbd>${esc(x)}</kbd>`).join('<em>/</em>')}</span><span>${g.split(' / ').map((x) => `<kbd class="pad">${esc(x)}</kbd>`).join('<em>/</em>')}</span></div>`).join('')}
      </div>
      <p class="ct-tip"><b>CONSEJO</b> Mantén el modificador al cuerpo con un golpe para atacar al torso. Golpear justo cuando el rival lanza un golpe cuenta como <b>contragolpe</b> y hace daño extra.</p>
      <button class="ol-btn ct-back" data-nav>Volver <kbd>ESC</kbd></button>`;
    s.querySelector('.ct-back').addEventListener('olactivate', backTo);
    setScreen(s, { back: backTo });
  }

  function emitOptions() {
    if (prog?.data) { prog.data.options = { ...options }; prog.save?.(); }
    try { audio?.setVolume?.(options.master, options.music, options.sfx); } catch { /* optional */ }
    cfg.onOptions?.({ ...options });
  }

  function optionsScreen(backTo) {
    state.screen = 'options';
    const s = el('div', 'mn-options');
    const rows = [
      { key: 'quality', label: 'Calidad gráfica', type: 'enum', values: QUALITY },
      { key: 'master', label: 'Volumen general', type: 'range' },
      { key: 'music', label: 'Música', type: 'range' },
      { key: 'sfx', label: 'Efectos', type: 'range' },
      { key: 'shake', label: 'Vibración de cámara', type: 'range' },
    ];
    s.innerHTML = `
      <header class="mn-head"><small>AJUSTES</small><h2>Opciones</h2></header>
      <div class="op-list">
        ${rows.map((r, i) => `<div class="opt-row" data-nav data-lr data-key="${r.key}" style="--i:${i}">
          <span class="opt-label">${r.label}</span>
          <span class="opt-ctl"><button class="opt-arr" data-d="-1" tabindex="-1">‹</button><span class="opt-val"></span><button class="opt-arr" data-d="1" tabindex="-1">›</button></span>
        </div>`).join('')}
      </div>
      <button class="ol-btn ct-back" data-nav>Volver <kbd>ESC</kbd></button>`;
    const render = (row, r) => {
      const v = options[r.key];
      const out = row.querySelector('.opt-val');
      if (r.type === 'enum') {
        out.innerHTML = `<span class="opt-enum">${r.values.map(([id, l]) => `<i class="${id === v ? 'on' : ''}">${l}</i>`).join('')}</span>`;
      } else {
        const n = Math.round(v * 10);
        out.innerHTML = `<span class="opt-seg">${Array.from({ length: 10 }, (_, k) => `<i class="${k < n ? 'on' : ''}"></i>`).join('')}</span><b>${n * 10}%</b>`;
      }
    };
    s.querySelectorAll('.opt-row').forEach((row) => {
      const r = rows.find((x) => x.key === row.dataset.key);
      render(row, r);
      const step = (dir) => {
        if (r.type === 'enum') {
          const idx = r.values.findIndex(([id]) => id === options[r.key]);
          options[r.key] = r.values[Math.max(0, Math.min(r.values.length - 1, idx + dir))][0];
        } else {
          options[r.key] = Math.round(Math.max(0, Math.min(1, options[r.key] + dir * 0.1)) * 10) / 10;
        }
        sfx('uiMove');
        render(row, r);
        emitOptions();
      };
      row.addEventListener('ollr', (e) => step(e.detail));
      row.addEventListener('olactivate', () => step(1));
      row.querySelectorAll('.opt-arr').forEach((a) => a.addEventListener('click', (e) => { e.stopPropagation(); step(+a.dataset.d); }));
    });
    s.querySelector('.ct-back').addEventListener('olactivate', backTo);
    setScreen(s, { back: backTo, hints: 'options' });
  }

  function pauseScreen(focus = 0) {
    state.screen = 'pause';
    const s = el('div', 'mn-pause');
    s.innerHTML = `
      <div class="ps-panel">
        <div class="ps-head"><small>COMBATE DETENIDO</small><h2>Pausa</h2></div>
        <nav class="ps-list">
          <button class="mm-item" data-nav data-id="resume"><span class="mm-label">Reanudar</span></button>
          <button class="mm-item" data-nav data-id="controls"><span class="mm-label">Controles</span></button>
          <button class="mm-item" data-nav data-id="options"><span class="mm-label">Opciones</span></button>
          <button class="mm-item danger" data-nav data-id="quit"><span class="mm-label">Abandonar</span></button>
        </nav>
        <p class="ps-note">Abandonar cuenta como derrota en el modo Carrera.</p>
      </div>`;
    s.querySelectorAll('.mm-item').forEach((b) => b.addEventListener('olactivate', () => {
      const id = b.dataset.id;
      if (id === 'resume') resume();
      else if (id === 'controls') controls(() => pauseScreen(1));
      else if (id === 'options') optionsScreen(() => pauseScreen(2));
      else if (id === 'quit') { hidePauseInternal(); handlers.onQuit(); }
    }));
    setScreen(s, { back: resume, focus });
  }

  function resume() {
    hidePauseInternal();
    handlers.onResume();
  }
  function hidePauseInternal() {
    if (!state.paused) return;
    state.paused = false;
    wrap.classList.remove('is-pause');
    api.hide();
  }

  function start(sel) {
    api.hide();
    audio?.music?.(false);
    cfg.onStart?.(sel);
  }

  const api = {
    el: wrap,
    options,
    get screen() { return state.screen; },
    showTitle() { wrap.classList.remove('hidden'); title(); },
    showMain() { wrap.classList.remove('hidden'); main(); },
    /** Open a screen by name: 'title'|'main'|'select'|'opponent'|'career'|'controls'|'options'|'pause'. */
    show(name = 'title', mode) {
      wrap.classList.remove('hidden');
      if (mode) state.mode = mode;
      ({
        title, main: () => main(), select, opponent, career,
        controls: () => controls(() => main('controls')), options: () => optionsScreen(() => main('options')),
        pause: () => api.showPause(),
      }[name] || title)();
    },
    hide() {
      wrap.classList.add('hidden');
      wrap.classList.remove('is-title');
      if (current) { current.remove(); current = null; }
      state.screen = null;
    },
    showPause() { state.paused = true; wrap.classList.remove('hidden'); wrap.classList.add('is-pause'); pauseScreen(0); },
    hidePause() { hidePauseInternal(); },
    isPaused: () => state.paused,
    isOpen: () => !wrap.classList.contains('hidden'),
    setPauseHandlers({ onResume, onQuit } = {}) {
      if (onResume) handlers.onResume = onResume;
      if (onQuit) handlers.onQuit = onQuit;
    },
    getOptions: () => ({ ...options }),
    dispose() { removeEventListener('keydown', onKey, true); cancelAnimationFrame(padRaf); wrap.remove(); },
  };
  lastInstance = api;
  return api;
}
