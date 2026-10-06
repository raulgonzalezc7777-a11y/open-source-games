// Shared helpers for HUD and menus: profile formatting, Spanish labels, DOM utils.

export const SPECIAL_NAMES = {
  superman: 'Superman Punch',
  flyingKnee: 'Rodilla voladora',
  spinningBackfist: 'Puño giratorio',
  spinningHeelKick: 'Patada giratoria',
  headKick: 'Patada a la cabeza',
  uppercut: 'Uppercut demoledor',
};

export const BUILD_NAMES = { light: 'Peso ligero', middle: 'Peso medio', heavy: 'Peso pesado' };

export const DIFFICULTIES = [
  { id: 'easy', label: 'Fácil', desc: 'La IA reacciona lento y casi no bloquea.' },
  { id: 'normal', label: 'Normal', desc: 'Un rival equilibrado que castiga errores claros.' },
  { id: 'hard', label: 'Difícil', desc: 'Bloquea, esquiva y contragolpea con frecuencia.' },
  { id: 'legend', label: 'Leyenda', desc: 'Lectura perfecta. Solo para campeones.' },
];

export const METHOD_NAMES = {
  KO: 'K.O.', TKO: 'K.O. TÉCNICO', DEC: 'DECISIÓN', UD: 'DECISIÓN UNÁNIME', SD: 'DECISIÓN DIVIDIDA',
  MD: 'DECISIÓN MAYORITARIA', DRAW: 'EMPATE', SUB: 'SUMISIÓN', DQ: 'DESCALIFICACIÓN',
};

export function methodLabel(m) {
  if (!m) return '';
  const k = String(m).toUpperCase().replace(/[^A-Z]/g, '');
  return METHOD_NAMES[k] || String(m).toUpperCase();
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function initials(p) {
  const n = String(p?.name || '?').trim().split(/\s+/);
  return ((n[0]?.[0] || '') + (n.length > 1 ? n[n.length - 1][0] : n[0]?.[1] || '')).toUpperCase();
}

export function lastName(p) {
  const n = String(p?.name || '').trim().split(/\s+/);
  return n.length > 1 ? n.slice(1).join(' ') : n[0] || '';
}

export function firstName(p) {
  const n = String(p?.name || '').trim().split(/\s+/);
  return n.length > 1 ? n[0] : '';
}

export function recordText(r) {
  if (!r) return '0-0-0';
  if (typeof r === 'string') return r;
  if (Array.isArray(r)) return r.join('-');
  return `${r.w ?? r.wins ?? 0}-${r.l ?? r.losses ?? 0}-${r.d ?? r.draws ?? 0}`;
}

export function cssColor(c, fallback = '#c8102e') {
  if (c == null) return fallback;
  if (typeof c === 'number') return '#' + c.toString(16).padStart(6, '0');
  if (typeof c === 'object' && 'r' in c) return `rgb(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)})`;
  return String(c);
}

export function specialName(id) {
  if (!id) return '—';
  return SPECIAL_NAMES[id] || String(id).replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
}

export function fmtClock(sec) {
  sec = Math.max(0, Math.ceil(sec ?? 0));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

export function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}

export const clamp01 = (v) => Math.max(0, Math.min(1, v));

/** Ensures the stylesheet and font class are applied once. Detects if the web font loaded. */
let fontChecked = false;
export function ensureUIRoot(root) {
  root.classList.add('ol-ui');
  if (!fontChecked && document.fonts) {
    fontChecked = true;
    const mark = () => {
      const ok = document.fonts.check('900 italic 20px "Barlow Condensed"');
      document.documentElement.classList.toggle('ol-nofont', !ok);
    };
    document.documentElement.classList.add('ol-nofont');
    document.fonts.ready.then(mark);
    document.fonts.load('900 italic 20px "Barlow Condensed"').then(mark, mark);
  }
}

let bustId = 0;
/** Stylised fighter bust (head, traps, raised gloves) tinted by the profile's colours. */
export function portraitHTML(p, cls = '') {
  const a = cssColor(p?.shortsColor, '#c8102e');
  const g = cssColor(p?.gloveColor, '#b01020');
  const skin = cssColor(p?.skinTone, '#b07a55');
  const id = 'olb' + bustId++;
  const heavy = p?.build === 'heavy' ? 6 : p?.build === 'light' ? -4 : 0;
  return `<span class="ol-portrait ${cls}" style="--pa:${a};--pb:${g}">
    <i>${esc(initials(p))}</i>
    <svg class="ol-bust" viewBox="0 0 100 100" preserveAspectRatio="xMidYMax meet" aria-hidden="true">
      <defs>
        <linearGradient id="${id}s" x1="0" y1="0" x2="1" y2="0.3">
          <stop offset="0" stop-color="${skin}" stop-opacity=".95"/>
          <stop offset=".55" stop-color="#05070c" stop-opacity=".9"/>
          <stop offset="1" stop-color="${skin}" stop-opacity=".55"/>
        </linearGradient>
        <linearGradient id="${id}g" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#fff" stop-opacity=".55"/>
          <stop offset=".25" stop-color="${g}"/>
          <stop offset="1" stop-color="#000" stop-opacity=".9"/>
        </linearGradient>
      </defs>
      <path fill="url(#${id}s)" d="M${2 - heavy} 100 C${4 - heavy} 82 ${16 - heavy} 72 34 68 C40 66 42 62 42 58 L58 58 C58 62 60 66 66 68 C${84 + heavy} 72 ${96 + heavy} 82 ${98 + heavy} 100 Z"/>
      <path fill="url(#${id}s)" d="M50 18 C61 18 66 27 65 38 C64 48 60 58 50 60 C40 58 36 48 35 38 C34 27 39 18 50 18 Z"/>
      <path fill="rgba(0,0,0,.55)" d="M35 34 C36 22 44 17 50 17 C58 17 65 22 65 34 C62 27 57 24 50 24 C43 24 38 27 35 34 Z"/>
      <rect x="${18 - heavy / 2}" y="60" width="20" height="24" rx="9" fill="url(#${id}g)"/>
      <rect x="${62 + heavy / 2}" y="60" width="20" height="24" rx="9" fill="url(#${id}g)"/>
    </svg>
  </span>`;
}
