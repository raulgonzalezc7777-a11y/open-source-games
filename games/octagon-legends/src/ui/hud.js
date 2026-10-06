// Broadcast-style fight HUD (DOM overlay). See createHUD() for the API.
import { flagHTML } from './flags.js';
import {
  esc, el, lastName, firstName, recordText, fmtClock, clamp01, ensureUIRoot, portraitHTML, methodLabel,
} from './common.js';

const BODY_SVG = (side) => `
<svg class="hud-body" viewBox="0 0 64 128" aria-hidden="true">
  <defs>
    <linearGradient id="olBodyShade${side}" x1="0" x2="1">
      <stop offset="0" stop-color="#000" stop-opacity=".0"/>
      <stop offset=".65" stop-color="#000" stop-opacity=".0"/>
      <stop offset="1" stop-color="#000" stop-opacity=".35"/>
    </linearGradient>
  </defs>
  <g class="hud-body-arms">
    <path d="M14 30 C8 34 6 46 6 58 L5 74 C5 77 10 77 10 74 L12 58 C13 50 15 44 17 40 Z"/>
    <path d="M50 30 C56 34 58 46 58 58 L59 74 C59 77 54 77 54 74 L52 58 C51 50 49 44 47 40 Z"/>
  </g>
  <path class="z z-legs" d="M19 66 L45 66 L46 80 L43 120 C43 124 35 124 35 120 L33 84 L31 84 L29 120 C29 124 21 124 21 120 L18 80 Z"/>
  <path class="z z-body" d="M24 22 L40 22 C46 24 51 27 51 31 L48 46 L46 64 L18 64 L16 46 L13 31 C13 27 18 24 24 22 Z"/>
  <path class="z z-head" d="M32 1 C38 1 42 5.5 42 11.5 C42 17 38.5 21 32 21 C25.5 21 22 17 22 11.5 C22 5.5 26 1 32 1 Z"/>
  <path d="M13 31 L16 46 L18 64 L46 64 L48 46 L51 31 L18 64 Z" fill="url(#olBodyShade${side})" opacity=".0"/>
</svg>`;

// health 1 -> white, 0.5 -> yellow, 0 -> red
function healthColor(h) {
  h = clamp01(h);
  const W = [246, 248, 252], Y = [255, 206, 46], R = [228, 30, 44];
  let a, b, t;
  if (h >= 0.5) { a = Y; b = W; t = (h - 0.5) / 0.5; } else { a = R; b = Y; t = h / 0.5; }
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

const MSG_DEFAULTS = {
  ko: { text: 'K.O.!', dur: 3400 },
  knockdown: { text: 'DERRIBO', dur: 2100 },
  counter: { text: 'CONTRAGOLPE', dur: 1300 },
  combo: { text: 'COMBO', dur: 1300 },
  special: { text: 'ESPECIAL', dur: 1700 },
  round: { text: '¡PELEEN!', dur: 1600 },
};

export function createHUD(root) {
  ensureUIRoot(root);
  const hud = el('div', 'ol-hud');
  hud.innerHTML = `
    <div class="hud-top">
      <div class="hud-plate hud-plate--0"><span class="hud-plate-shine"></span><div class="hud-plate-id"></div></div>
      <div class="hud-bug">
        <div class="hud-bug-round"><span>ASALTO</span><b class="hud-round">1</b><em class="hud-rounds">/3</em></div>
        <div class="hud-bug-clock">5:00</div>
      </div>
      <div class="hud-plate hud-plate--1"><span class="hud-plate-shine"></span><div class="hud-plate-id"></div></div>
    </div>
    ${[0, 1].map((s) => `
    <div class="hud-status hud-status--${s}">
      <div class="hud-body-wrap">${BODY_SVG(s)}
        <div class="hud-body-tags"><span class="t-head">100</span><span class="t-body">100</span><span class="t-legs">100</span></div>
      </div>
      <div class="hud-meters">
        <div class="hud-meter-label">RESISTENCIA</div>
        <div class="hud-bar hud-stamina"><i></i></div>
        <div class="hud-special">
          <div class="hud-bar hud-special-bar"><i></i></div>
          <div class="hud-special-label"><span class="lbl">ESPECIAL</span><span class="key">${s === 0 ? 'ESPACIO' : ''}</span></div>
        </div>
      </div>
    </div>
    <div class="hud-combo hud-combo--${s}"><b>0</b><span>GOLPES</span><em>COMBO</em></div>`).join('')}
    <div class="hud-popups"></div>
    <div class="hud-msgs"></div>
  `;
  root.appendChild(hud);

  const q = (s) => hud.querySelector(s);
  const status = [0, 1].map((s) => {
    const box = q(`.hud-status--${s}`);
    return {
      box,
      head: box.querySelector('.z-head'), body: box.querySelector('.z-body'), legs: box.querySelector('.z-legs'),
      tHead: box.querySelector('.t-head'), tBody: box.querySelector('.t-body'), tLegs: box.querySelector('.t-legs'),
      stamina: box.querySelector('.hud-stamina i'),
      special: box.querySelector('.hud-special-bar i'),
      specialWrap: box.querySelector('.hud-special'),
      specialLbl: box.querySelector('.hud-special-label .lbl'),
      combo: q(`.hud-combo--${s}`),
      comboNum: q(`.hud-combo--${s} b`),
      last: { head: -1, body: -1, legs: -1, stamina: -1, special: -1, combo: 0 },
      comboTimer: 0,
    };
  });
  const roundEl = q('.hud-round'), roundsEl = q('.hud-rounds'), clockEl = q('.hud-bug-clock');
  const popups = q('.hud-popups'), msgs = q('.hud-msgs');
  let profiles = [null, null];
  let lastClock = '', lastRound = -1;

  function restartAnim(node, cls) {
    node.classList.remove(cls);
    void node.offsetWidth; // reflow so the animation restarts
    node.classList.add(cls);
  }

  function setZone(st, zone, v) {
    v = clamp01(v);
    if (Math.abs(st.last[zone] - v) < 0.002) return;
    const dropped = st.last[zone] >= 0 && v < st.last[zone] - 0.01;
    st.last[zone] = v;
    st[zone].style.fill = healthColor(v);
    st[zone].classList.toggle('crit', v < 0.22);
    if (dropped) restartAnim(st[zone], 'hit');
    const tag = st['t' + zone[0].toUpperCase() + zone.slice(1)];
    tag.textContent = Math.round(v * 100);
    tag.style.color = healthColor(v);
  }

  function plateHTML(p, side) {
    const fn = firstName(p), ln = lastName(p);
    return `
      ${flagHTML(p?.country)}
      <div class="hud-plate-names">
        <small>${esc(fn)}${p?.nickname ? ` <i>“${esc(p.nickname)}”</i>` : ''}</small>
        <b>${esc(ln)}</b>
      </div>
      <div class="hud-plate-rec">${esc(recordText(p?.record))}</div>
      <div class="hud-plate-corner">${side === 0 ? 'ROJA' : 'AZUL'}</div>`;
  }

  const api = {
    el: hud,
    setFighters(p0, p1) {
      profiles = [p0, p1];
      q('.hud-plate--0 .hud-plate-id').innerHTML = plateHTML(p0, 0);
      q('.hud-plate--1 .hud-plate-id').innerHTML = plateHTML(p1, 1);
    },

    update(sim) {
      if (!sim) return;
      const fs = sim.fighters || [];
      for (let s = 0; s < 2; s++) {
        const f = fs[s];
        if (!f) continue;
        const st = f.state || f;
        const h = st.health || f.health || {};
        const S = status[s];
        setZone(S, 'head', h.head ?? 1);
        setZone(S, 'body', h.body ?? 1);
        setZone(S, 'legs', h.legs ?? 1);
        const sta = clamp01(st.stamina ?? f.stamina ?? 1);
        if (Math.abs(sta - S.last.stamina) > 0.002) {
          S.last.stamina = sta;
          S.stamina.style.transform = `scaleX(${sta})`;
          S.box.classList.toggle('low-stamina', sta < 0.25);
        }
        let sp = st.specialMeter ?? f.specialMeter ?? 0;
        if (sp > 1.0001) sp /= 100;
        sp = clamp01(sp);
        if (Math.abs(sp - S.last.special) > 0.002) {
          const wasReady = S.last.special >= 0.999;
          S.last.special = sp;
          S.special.style.transform = `scaleX(${sp})`;
          const ready = sp >= 0.999;
          if (ready !== wasReady) {
            S.specialWrap.classList.toggle('ready', ready);
            S.specialLbl.textContent = ready ? 'ESPECIAL LISTO' : 'ESPECIAL';
          }
        }
        const combo = st.comboCount ?? f.comboCount ?? 0;
        if (combo !== S.last.combo) {
          if (combo >= 2) {
            S.comboNum.textContent = combo;
            S.combo.classList.add('show');
            S.combo.classList.toggle('hot', combo >= 5);
            restartAnim(S.combo, 'bump');
            clearTimeout(S.comboTimer);
            S.comboTimer = setTimeout(() => S.combo.classList.remove('show'), 1800);
          } else if (S.last.combo >= 2) {
            clearTimeout(S.comboTimer);
            S.comboTimer = setTimeout(() => S.combo.classList.remove('show'), 700);
          }
          S.last.combo = combo;
        }
      }
      const r = sim.round ?? 1;
      if (r !== lastRound) {
        lastRound = r;
        roundEl.textContent = r;
        const total = sim.rounds ?? sim.totalRounds ?? sim.opts?.rounds ?? 3;
        roundsEl.textContent = `/${total}`;
      }
      const c = fmtClock(sim.clock);
      if (c !== lastClock) {
        lastClock = c;
        clockEl.textContent = c;
        clockEl.classList.toggle('urgent', (sim.clock ?? 99) <= 10.0001);
      }
    },

    /** Big diagonal "ASALTO N" card. Resolves when it has played out. */
    showRoundCard(round, totalRounds) {
      const final = totalRounds && round >= totalRounds && round > 1;
      const card = el('div', 'hud-roundcard');
      card.innerHTML = `
        <div class="rc-band"><span class="rc-shine"></span></div>
        <div class="rc-text">
          <small>${final ? 'ÚLTIMO ASALTO' : 'OCTAGON LEGENDS · EN VIVO'}</small>
          <div class="rc-main"><span>ASALTO</span><b>${final ? 'FINAL' : esc(round)}</b></div>
        </div>`;
      hud.appendChild(card);
      return new Promise((res) => setTimeout(() => { card.remove(); res(); }, 2300));
    },

    /** Cinematic centre text. style: 'knockdown'|'ko'|'counter'|'combo'|'special'|'round'. */
    showMessage(text, style = 'round') {
      const d = MSG_DEFAULTS[style] || MSG_DEFAULTS.round;
      const t = text || d.text;
      if (style === 'ko' || style === 'knockdown' || style === 'round') {
        msgs.querySelectorAll('.hud-msg--ko, .hud-msg--knockdown, .hud-msg--round').forEach((n) => n.remove());
      } else {
        msgs.querySelectorAll(`.hud-msg--${style}`).forEach((n) => n.remove());
      }
      const m = el('div', `hud-msg hud-msg--${style}`);
      const letters = [...t].map((ch, i) => `<span style="--i:${i}">${ch === ' ' ? '&nbsp;' : esc(ch)}</span>`).join('');
      m.innerHTML = `<div class="msg-slash"></div><div class="msg-text" data-text="${esc(t)}">${letters}</div>`;
      if (style === 'ko') m.insertAdjacentHTML('beforeend', '<div class="msg-sub">FIN DE LA PELEA</div>');
      if (style === 'knockdown') m.insertAdjacentHTML('beforeend', '<div class="msg-sub">¡A LA LONA!</div>');
      msgs.appendChild(m);
      setTimeout(() => m.remove(), d.dur);
      return m;
    },

    /** Floating damage number at screen pixel coords. amount <= 1 is treated as a fraction (x100). */
    damagePopup(x, y, amount, isCounter = false) {
      const v = amount <= 1 ? Math.round(amount * 100) : Math.round(amount);
      if (!v) return;
      const p = el('div', 'hud-pop' + (isCounter ? ' counter' : '') + (v >= 15 ? ' big' : ''));
      p.style.left = `${x}px`;
      p.style.top = `${y}px`;
      p.style.setProperty('--dx', `${(Math.random() - 0.5) * 6}`);
      p.innerHTML = `${isCounter ? '<small>CONTRA</small>' : ''}<b>${v}</b>`;
      popups.appendChild(p);
      while (popups.children.length > 14) popups.firstChild.remove();
      setTimeout(() => p.remove(), 1100);
    },

    /** Fight results screen. Resolves when the player dismisses it. */
    showResults(result) {
      return showResultsScreen(root, result, profiles);
    },

    hide() { hud.classList.add('hidden'); },
    show() { hud.classList.remove('hidden'); },
    dispose() { hud.remove(); },
  };
  return api;
}

function statRows(stats) {
  const a = stats?.[0] || {}, b = stats?.[1] || {};
  const acc = (s) => (s.thrown ? Math.round((100 * (s.landed || 0)) / s.thrown) : 0);
  const rows = [
    ['GOLPES CONECTADOS', a.landed || 0, b.landed || 0],
    ['GOLPES LANZADOS', a.thrown || 0, b.thrown || 0],
    ['PRECISIÓN', acc(a), acc(b), '%'],
    ['DERRIBOS', a.knockdowns || 0, b.knockdowns || 0],
    ['DAÑO CAUSADO', Math.round(a.damage <= 3 ? a.damage * 100 : a.damage || 0), Math.round(b.damage <= 3 ? b.damage * 100 : b.damage || 0)],
  ];
  return rows.map(([label, x, y, unit = ''], i) => {
    const m = Math.max(x, y, 1);
    const lead = x === y ? '' : x > y ? 'l' : 'r';
    return `<div class="rs-row" style="--d:${i}">
      <span class="rs-v rs-v--l ${lead === 'l' ? 'lead' : ''}">${x}${unit}</span>
      <div class="rs-bar rs-bar--l"><i style="--w:${x / m}"></i></div>
      <span class="rs-label">${label}</span>
      <div class="rs-bar rs-bar--r"><i style="--w:${y / m}"></i></div>
      <span class="rs-v rs-v--r ${lead === 'r' ? 'lead' : ''}">${y}${unit}</span>
    </div>`;
  }).join('');
}

function showResultsScreen(root, r = {}, profiles) {
  const w = r.winner;
  const hasWinner = w === 0 || w === 1;
  const wp = hasWinner ? profiles[w] : null;
  const playerWon = hasWinner && w === (r.playerSide ?? 0);
  const method = methodLabel(r.method);
  const mins = r.time != null ? (typeof r.time === 'number' ? fmtClock(r.time) : r.time) : '';
  const prog = r.progress || {};
  const xp = Math.round(r.xpGained || 0);
  const from = clamp01(prog.before ?? 0);
  const to = clamp01(prog.after ?? Math.min(1, from + xp / 1000));
  const wrapped = prog.rankUp || r.rankUp || (prog.levelUp && to < from);
  const breakdown = (r.breakdown || []).slice(0, 6);
  const unlocked = [].concat(r.unlocked || []).filter((u) => u != null && u !== '');
  const ach = [].concat(r.achievements || []);
  const challenge = r.dailyCompleted;

  const scr = el('div', 'ol-screen ol-results ' + (playerWon ? 'won' : hasWinner ? 'lost' : 'draw'));
  scr.innerHTML = `
    <div class="rs-bg"></div>
    <div class="rs-wrap">
      <div class="rs-head">
        <div class="rs-kicker"><span>RESULTADO OFICIAL</span></div>
        <div class="rs-winner">
          ${wp ? portraitHTML(wp, 'rs-portrait corner-' + w) : ''}
          <div class="rs-winner-txt">
            <div class="rs-verdict">${hasWinner ? (playerWon ? 'VICTORIA' : 'DERROTA') : 'EMPATE'}</div>
            <div class="rs-name">${wp ? esc(wp.name) : 'SIN GANADOR'}</div>
            <div class="rs-method">${hasWinner ? `GANA POR <b>${esc(method)}</b>` : esc(method || 'DECISIÓN')}${r.round ? ` <span>·</span> ASALTO ${esc(r.round)}` : ''}${mins ? ` <span>·</span> ${esc(mins)}` : ''}</div>
          </div>
        </div>
      </div>
      <div class="rs-stats">
        <div class="rs-stats-head">
          <span class="rs-corner rs-corner--0">${flagHTML(profiles[0]?.country)} ${esc(lastName(profiles[0]))}</span>
          <span class="rs-stats-title">ESTADÍSTICAS</span>
          <span class="rs-corner rs-corner--1">${esc(lastName(profiles[1]))} ${flagHTML(profiles[1]?.country)}</span>
        </div>
        ${statRows(r.stats)}
      </div>
      <div class="rs-xp">
        <div class="rs-xp-top">
          <div class="rs-rank"><small>RANGO</small><b>${esc(prog.rankName || r.rank || 'AMATEUR')}</b></div>
          <div class="rs-xp-gain"><b class="rs-xp-num">+0</b><span>XP</span></div>
          <div class="rs-rank rs-rank--next"><small>SIGUIENTE</small><b>${esc(prog.nextRankName || '—')}</b></div>
        </div>
        <div class="rs-xp-bar"><i class="rs-xp-before" style="--w:${wrapped ? 0 : from}"></i><i class="rs-xp-fill" style="--from:${wrapped ? 0 : from};--to:${to}"></i><span class="rs-xp-shine"></span></div>
        ${breakdown.length ? `<div class="rs-breakdown">${breakdown.map((b, i) => `<span style="--d:${i}">${esc(b.label)} <b>+${Math.round(b.xp)}</b></span>`).join('')}</div>` : ''}
        <div class="rs-awards">
          ${r.rankUp || prog.rankUp ? `<div class="rs-award rs-award--rank"><small>¡ASCENSO DE RANGO!</small><b>${esc(r.rankUp && r.rankUp !== true ? r.rankUp : prog.rankName)}</b></div>` : ''}
          ${prog.levelUp || r.levelUp ? `<div class="rs-award"><small>¡SUBES DE NIVEL!</small><b>NIVEL ${esc(prog.level ?? r.level ?? '')}</b></div>` : ''}
          ${unlocked.map((u) => `<div class="rs-award rs-award--unlock"><small>NUEVO LUCHADOR</small><b>${esc(typeof u === 'object' ? u.name : u)}</b></div>`).join('')}
          ${challenge ? `<div class="rs-award rs-award--daily"><small>DESAFÍO DIARIO</small><b>COMPLETADO</b></div>` : ''}
          ${ach.map((a) => `<div class="rs-award rs-award--ach"><small>LOGRO</small><b>${esc(typeof a === 'object' ? a.name : a)}</b></div>`).join('')}
        </div>
      </div>
      <button class="ol-btn ol-btn--primary rs-continue" data-nav>CONTINUAR <kbd>ENTER</kbd></button>
    </div>`;
  root.appendChild(scr);

  // XP counter
  const num = scr.querySelector('.rs-xp-num');
  const t0 = performance.now() + 900;
  let raf = 0;
  const tick = (t) => {
    const k = clamp01((t - t0) / 1400);
    num.textContent = '+' + Math.round(xp * (1 - Math.pow(1 - k, 3)));
    if (k < 1) raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);

  return new Promise((resolve) => {
    const openedAt = performance.now();
    let padPrev = true, poll = 0;
    const done = () => {
      if (performance.now() - openedAt < 700) return;
      removeEventListener('keydown', onKey, true);
      cancelAnimationFrame(raf);
      cancelAnimationFrame(poll);
      scr.classList.add('out');
      setTimeout(() => { scr.remove(); resolve(); }, 350);
    };
    const onKey = (e) => {
      if (['Enter', 'Space', 'Escape', 'NumpadEnter'].includes(e.code)) { e.preventDefault(); e.stopPropagation(); done(); }
    };
    addEventListener('keydown', onKey, true);
    scr.querySelector('.rs-continue').addEventListener('click', done);
    const padLoop = () => {
      const p = navigator.getGamepads ? [...navigator.getGamepads()].find(Boolean) : null;
      const a = !!(p && (p.buttons[0]?.pressed || p.buttons[9]?.pressed));
      if (a && !padPrev) { done(); return; }
      padPrev = a;
      poll = requestAnimationFrame(padLoop);
    };
    poll = requestAnimationFrame(padLoop);
  });
}
