// Country flags drawn purely with CSS gradients (no image assets, works offline).
// flagHTML(country) accepts ISO-2, ISO-3 or an English/Spanish country name.

const H = (...c) => `linear-gradient(180deg, ${stripes(c)})`; // horizontal stripes
const V = (...c) => `linear-gradient(90deg, ${stripes(c)})`; // vertical stripes
function stripes(cols) {
  const n = cols.length;
  return cols.map((c, i) => `${c} ${(i / n) * 100}% ${((i + 1) / n) * 100}%`).join(', ');
}
const disc = (col, size = '30%', at = '50% 50%') => `radial-gradient(circle at ${at}, ${col} ${size}, transparent calc(${size} + 1px))`;

// Each entry: CSS background layers (first = top-most).
const FLAGS = {
  US: [
    'linear-gradient(#2a3a7a, #2a3a7a) 0 0 / 42% 54% no-repeat',
    'repeating-linear-gradient(180deg, #c8102e 0 7.7%, #fff 7.7% 15.4%)',
  ],
  BR: [
    disc('#1f3c8f', '18%'),
    'linear-gradient(135deg, transparent 30%, #ffdf00 30% 70%, transparent 70%) center / 70% 70% no-repeat',
    '#009b3a',
  ],
  MX: [disc('#7a5a2a', '12%'), V('#006847', '#fff', '#ce1126')],
  ES: ['linear-gradient(180deg, #c60b1e 0 25%, #ffc400 25% 75%, #c60b1e 75%)'],
  IE: [V('#169b62', '#fff', '#ff883e')],
  FR: [V('#0055a4', '#fff', '#ef4135')],
  IT: [V('#009246', '#fff', '#ce2b37')],
  DE: [H('#111', '#dd0000', '#ffce00')],
  RU: [H('#fff', '#0039a6', '#d52b1e')],
  NL: [H('#ae1c28', '#fff', '#21468b')],
  PL: [H('#fff', '#dc143c')],
  UA: [H('#0057b7', '#ffd700')],
  AR: [disc('#f6b40e', '10%'), H('#74acdf', '#fff', '#74acdf')],
  CO: ['linear-gradient(180deg, #fcd116 0 50%, #003893 50% 75%, #ce1126 75%)'],
  CU: [
    'linear-gradient(60deg, #cf142b 0 32%, transparent 32%) 0 0 / 100% 50% no-repeat',
    'linear-gradient(120deg, #cf142b 0 32%, transparent 32%) 0 100% / 100% 50% no-repeat',
    'repeating-linear-gradient(180deg, #002a8f 0 20%, #fff 20% 40%)',
  ],
  JP: [disc('#bc002d', '28%'), '#fff'],
  KR: [disc('#cd2e3a', '22%'), '#fff'],
  CN: [disc('#ffde00', '12%', '22% 30%'), '#de2910'],
  NG: [V('#008751', '#fff', '#008751')],
  CM: [disc('#fcd116', '8%'), V('#007a5e', '#ce1126', '#fcd116')],
  GB: [
    'linear-gradient(90deg, transparent 43%, #c8102e 43% 57%, transparent 57%)',
    'linear-gradient(180deg, transparent 40%, #c8102e 40% 60%, transparent 60%)',
    'linear-gradient(90deg, transparent 38%, #fff 38% 62%, transparent 62%)',
    'linear-gradient(180deg, transparent 33%, #fff 33% 67%, transparent 67%)',
    'linear-gradient(33deg, transparent 45%, #fff 45% 55%, transparent 55%)',
    'linear-gradient(-33deg, transparent 45%, #fff 45% 55%, transparent 55%)',
    '#012169',
  ],
  CA: ['linear-gradient(90deg, #d52b1e 0 25%, #fff 25% 75%, #d52b1e 75%)', disc('#d52b1e', '14%')].reverse(),
  AU: [disc('#fff', '6%', '25% 72%'), 'linear-gradient(#012169,#012169)'],
  NZ: [disc('#cc142b', '5%', '75% 40%'), disc('#cc142b', '5%', '80% 70%'), '#012169'],
  SE: [
    'linear-gradient(90deg, transparent 31%, #fecc02 31% 43%, transparent 43%)',
    'linear-gradient(180deg, transparent 42%, #fecc02 42% 58%, transparent 58%)',
    '#006aa7',
  ],
  GE: [
    'linear-gradient(90deg, transparent 43%, #ff0000 43% 57%, transparent 57%)',
    'linear-gradient(180deg, transparent 40%, #ff0000 40% 60%, transparent 60%)',
    '#fff',
  ],
  KZ: [disc('#ffd700', '14%'), '#00afca'],
  CH: [
    'linear-gradient(90deg, transparent 42%, #fff 42% 58%, transparent 58%) center / 60% 60% no-repeat',
    'linear-gradient(180deg, transparent 42%, #fff 42% 58%, transparent 58%) center / 60% 60% no-repeat',
    '#d52b1e',
  ],
  PT: ['linear-gradient(90deg, #006600 0 40%, #ff0000 40%)'],
  CL: ['linear-gradient(180deg, transparent 50%, #d52b1e 50%)', 'linear-gradient(90deg, #0039a6 0 33%, #fff 33%) 0 0 / 100% 50% no-repeat'],
  PE: [V('#d91023', '#fff', '#d91023')],
  VE: [H('#ffcc00', '#00247d', '#cf142b')],
  TH: ['linear-gradient(180deg, #a51931 0 16.6%, #fff 16.6% 33.3%, #2d2a4a 33.3% 66.6%, #fff 66.6% 83.3%, #a51931 83.3%)'],
  PH: ['linear-gradient(180deg, #0038a8 0 50%, #ce1126 50%)'],
  ZA: [H('#e03c31', '#fff', '#007749', '#fff', '#001489')],
  SN: [V('#00853f', '#fdef42', '#e31b23')],
  DO: [H('#002d62', '#ce1126')],
  PR: [H('#ed0000', '#fff', '#ed0000', '#fff', '#ed0000')],
};

const ALIASES = {
  USA: 'US', 'UNITED STATES': 'US', EEUU: 'US', 'ESTADOS UNIDOS': 'US', AMERICA: 'US',
  BRA: 'BR', BRAZIL: 'BR', BRASIL: 'BR',
  MEX: 'MX', MEXICO: 'MX', 'MÉXICO': 'MX',
  ESP: 'ES', SPAIN: 'ES', 'ESPAÑA': 'ES', ESPANA: 'ES',
  IRL: 'IE', IRELAND: 'IE', IRLANDA: 'IE',
  FRA: 'FR', FRANCE: 'FR', FRANCIA: 'FR',
  ITA: 'IT', ITALY: 'IT', ITALIA: 'IT',
  DEU: 'DE', GER: 'DE', GERMANY: 'DE', ALEMANIA: 'DE',
  RUS: 'RU', RUSSIA: 'RU', RUSIA: 'RU', DAGESTAN: 'RU',
  NLD: 'NL', NED: 'NL', NETHERLANDS: 'NL', HOLANDA: 'NL', 'PAÍSES BAJOS': 'NL',
  POL: 'PL', POLAND: 'PL', POLONIA: 'PL',
  UKR: 'UA', UKRAINE: 'UA', UCRANIA: 'UA',
  ARG: 'AR', ARGENTINA: 'AR',
  COL: 'CO', COLOMBIA: 'CO',
  CUB: 'CU', CUBA: 'CU',
  JPN: 'JP', JAPAN: 'JP', 'JAPÓN': 'JP', JAPON: 'JP',
  KOR: 'KR', KOREA: 'KR', 'SOUTH KOREA': 'KR', COREA: 'KR',
  CHN: 'CN', CHINA: 'CN',
  NGA: 'NG', NIGERIA: 'NG',
  CMR: 'CM', CAMEROON: 'CM', 'CAMERÚN': 'CM',
  GBR: 'GB', UK: 'GB', ENG: 'GB', ENGLAND: 'GB', 'UNITED KINGDOM': 'GB', 'REINO UNIDO': 'GB', INGLATERRA: 'GB',
  CAN: 'CA', CANADA: 'CA', 'CANADÁ': 'CA',
  AUS: 'AU', AUSTRALIA: 'AU',
  NZL: 'NZ', 'NEW ZEALAND': 'NZ', 'NUEVA ZELANDA': 'NZ',
  SWE: 'SE', SWEDEN: 'SE', SUECIA: 'SE',
  GEO: 'GE', GEORGIA: 'GE',
  KAZ: 'KZ', KAZAKHSTAN: 'KZ', 'KAZAJISTÁN': 'KZ',
  CHE: 'CH', SUI: 'CH', SWITZERLAND: 'CH', SUIZA: 'CH',
  POR: 'PT', PRT: 'PT', PORTUGAL: 'PT',
  CHL: 'CL', CHI: 'CL', CHILE: 'CL',
  PER: 'PE', PERU: 'PE', 'PERÚ': 'PE',
  VEN: 'VE', VENEZUELA: 'VE',
  THA: 'TH', THAILAND: 'TH', TAILANDIA: 'TH',
  PHI: 'PH', PHL: 'PH', PHILIPPINES: 'PH', FILIPINAS: 'PH',
  RSA: 'ZA', ZAF: 'ZA', 'SOUTH AFRICA': 'ZA', 'SUDÁFRICA': 'ZA',
  SEN: 'SN', SENEGAL: 'SN',
  DOM: 'DO', 'DOMINICAN REPUBLIC': 'DO', 'REPÚBLICA DOMINICANA': 'DO',
  PUR: 'PR', 'PUERTO RICO': 'PR',
};

export function countryCode(country) {
  if (!country) return '';
  const k = String(country).trim().toUpperCase();
  if (FLAGS[k]) return k;
  return ALIASES[k] || (k.length <= 3 ? k : k.slice(0, 3));
}

export function flagBackground(country) {
  const code = countryCode(country);
  const layers = FLAGS[code];
  if (!layers) return 'linear-gradient(135deg, #3a4256, #1b2030)';
  return layers.join(', ');
}

/** Returns an HTML string for a flag chip. `size` is a CSS class modifier ('', 'lg'). */
export function flagHTML(country, size = '') {
  const code = countryCode(country);
  const known = !!FLAGS[code];
  return `<span class="ol-flag ${size ? 'ol-flag--' + size : ''}" style="background:${flagBackground(country)}" title="${code}">${known ? '' : `<b>${code}</b>`}</span>`;
}
