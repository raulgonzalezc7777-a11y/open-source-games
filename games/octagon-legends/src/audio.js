// Fully synthesized WebAudio: impacts, crowd bed, bell, UI blips, menu music, Spanish announcer.
// No audio files. Call unlock() from a user gesture (key press / click) before anything is heard;
// every method is a safe no-op until then.

export function createAudio() {
  let ctx = null, master, musicBus, sfxBus, crowdBus, verb, verbSend, comp;
  let noiseBuf, pinkBuf, brownBuf;
  const vol = { master: 0.8, music: 0.6, sfx: 0.9 };
  let crowdNodes = null, crowdLevel = 0.3;
  let music = null;
  let spanishVoice = null;

  function makeNoise(type, seconds = 2) {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (type === 'white') d[i] = w;
      else if (type === 'pink') {
        b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
      } else { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
    }
    return buf;
  }

  function makeImpulse(seconds = 2.2, decay = 3) {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  function init() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.2;
    master = ctx.createGain(); master.gain.value = vol.master;
    master.connect(comp).connect(ctx.destination);
    musicBus = ctx.createGain(); musicBus.gain.value = vol.music * 0.5; musicBus.connect(master);
    sfxBus = ctx.createGain(); sfxBus.gain.value = vol.sfx; sfxBus.connect(master);
    crowdBus = ctx.createGain(); crowdBus.gain.value = 1; crowdBus.connect(sfxBus);
    verb = ctx.createConvolver(); verb.buffer = makeImpulse(2.6, 3.2);
    verbSend = ctx.createGain(); verbSend.gain.value = 0.22;
    verbSend.connect(verb).connect(sfxBus);
    noiseBuf = makeNoise('white', 2);
    pinkBuf = makeNoise('pink', 4);
    brownBuf = makeNoise('brown', 4);
  }

  const ok = () => ctx && ctx.state !== 'closed';
  const now = () => ctx.currentTime;
  const rnd = (a, b) => a + Math.random() * (b - a);

  function env(g, t, a, peak, d, end = 0.0001) {
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(Math.max(end, 0.0001), t + a + d);
  }

  function noise({ t = now(), dur = 0.2, type = 'bandpass', freq = 1000, q = 1, gain = 0.5, attack = 0.002, buf = noiseBuf, dest = sfxBus, freqEnd, send = 0, rate = 1 }) {
    const src = ctx.createBufferSource();
    src.buffer = buf; src.playbackRate.value = rate;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    const g = ctx.createGain();
    env(g, t, attack, gain, dur);
    src.connect(f).connect(g).connect(dest);
    if (send) { const s = ctx.createGain(); s.gain.value = send; g.connect(s).connect(verbSend); }
    src.start(t, Math.random() * (buf.duration - dur - 0.1 > 0 ? buf.duration - dur - 0.1 : 0));
    src.stop(t + attack + dur + 0.05);
    return g;
  }

  function tone({ t = now(), f0 = 120, f1 = 45, dur = 0.15, type = 'sine', gain = 0.8, attack = 0.002, dest = sfxBus, drive = 0, send = 0 }) {
    const o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    const g = ctx.createGain();
    env(g, t, attack, gain, dur);
    let node = o;
    if (drive) { const ws = ctx.createWaveShaper(); ws.curve = driveCurve(drive); o.connect(ws); node = ws; }
    node.connect(g).connect(dest);
    if (send) { const s = ctx.createGain(); s.gain.value = send; g.connect(s).connect(verbSend); }
    o.start(t); o.stop(t + attack + dur + 0.05);
    return o;
  }

  const curves = {};
  function driveCurve(k) {
    if (curves[k]) return curves[k];
    const n = 1024, c = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = (i / n) * 2 - 1; c[i] = ((1 + k) * x) / (1 + k * Math.abs(x)); }
    return (curves[k] = c);
  }

  // ---------------- impacts ----------------
  function punch(strength = 0.6, zone = 'head') {
    if (!ok()) return;
    const s = Math.max(0.1, Math.min(1, strength));
    const t = now() + 0.005;
    const p = rnd(0.9, 1.12);
    // 1) glove snap: bright noise crack
    noise({ t, dur: 0.035 + 0.02 * s, type: 'bandpass', freq: (zone === 'head' ? 2600 : 1700) * p, q: 0.9, gain: 0.55 * s + 0.15 });
    // 2) low thump with drive, pitch drop
    tone({ t, f0: (zone === 'body' ? 105 : 135) * p, f1: 42, dur: 0.11 + 0.1 * s, gain: 0.9 * s + 0.2, drive: 3, send: 0.15 * s });
    // 3) body slap: mid band noise with fast decay (meat)
    noise({ t: t + 0.003, dur: 0.07 + 0.05 * s, type: 'bandpass', freq: (zone === 'body' ? 520 : zone === 'legs' ? 900 : 760) * p, q: 1.6, gain: 0.7 * s + 0.15, freqEnd: 260, send: 0.25 * s });
    // 4) sub weight for heavy shots
    if (s > 0.55) tone({ t, f0: 70, f1: 30, dur: 0.25 * s, gain: 0.6 * s });
    if (zone === 'body') noise({ t: t + 0.01, dur: 0.18, type: 'lowpass', freq: 380, gain: 0.35 * s, buf: brownBuf }); // exhale / body thud
    if (zone === 'legs') noise({ t, dur: 0.06, type: 'highpass', freq: 3200, gain: 0.35 * s }); // shin slap
  }

  function whoosh(t, dur = 0.22, gain = 0.25, lo = 400, hi = 2200) {
    const src = ctx.createBufferSource(); src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 2.2;
    f.frequency.setValueAtTime(lo, t);
    f.frequency.exponentialRampToValueAtTime(hi, t + dur * 0.55);
    f.frequency.exponentialRampToValueAtTime(lo * 1.2, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + dur * 0.5);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(sfxBus);
    src.start(t, Math.random()); src.stop(t + dur + 0.05);
  }

  function kick(strength = 0.7) {
    if (!ok()) return;
    const s = Math.max(0.1, Math.min(1, strength));
    const t = now();
    // shin crack is louder and deeper than a glove
    noise({ t, dur: 0.05, type: 'highpass', freq: 2200, gain: 0.5 * s + 0.15 });
    tone({ t, f0: 110 * rnd(0.92, 1.08), f1: 36, dur: 0.16 + 0.12 * s, gain: 1.0 * s + 0.2, drive: 4, send: 0.2 });
    noise({ t: t + 0.004, dur: 0.12 + 0.06 * s, type: 'bandpass', freq: 620, q: 1.3, gain: 0.85 * s + 0.15, freqEnd: 220, send: 0.3 * s });
    tone({ t, f0: 62, f1: 28, dur: 0.3 * s + 0.08, gain: 0.7 * s });
  }

  function block() {
    if (!ok()) return;
    const t = now();
    noise({ t, dur: 0.09, type: 'lowpass', freq: 900, gain: 0.55, freqEnd: 300 });
    tone({ t, f0: 180, f1: 90, dur: 0.07, gain: 0.35, type: 'triangle' });
    noise({ t, dur: 0.03, type: 'bandpass', freq: 1500, q: 2, gain: 0.18 }); // leather pat
  }

  function whiff() {
    if (!ok()) return;
    whoosh(now(), rnd(0.18, 0.26), 0.22 * vol.sfx + 0.08, 380, rnd(1800, 2600));
  }

  function bell(count = 1) {
    if (!ok()) return;
    const partials = [[1, 1], [2.76, 0.55], [5.4, 0.32], [8.93, 0.18], [13.34, 0.08]];
    for (let k = 0; k < count; k++) {
      const t = now() + k * 0.42;
      const base = 520;
      for (const [r, a] of partials) {
        const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = base * r * rnd(0.998, 1.002);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.32 * a, t + 0.004);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 2.4 / Math.sqrt(r));
        o.connect(g); g.connect(sfxBus);
        const s = ctx.createGain(); s.gain.value = 0.6; g.connect(s).connect(verbSend);
        o.start(t); o.stop(t + 2.6);
      }
      noise({ t, dur: 0.02, type: 'highpass', freq: 4000, gain: 0.3 }); // clapper strike
    }
  }

  // ---------------- crowd ----------------
  function ensureCrowd() {
    if (crowdNodes || !ok()) return;
    const mk = (buf, type, f, q, g) => {
      const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
      const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
      const gn = ctx.createGain(); gn.gain.value = g;
      src.connect(fl).connect(gn).connect(crowdBus);
      src.start(0, Math.random() * buf.duration);
      return { src, fl, gn };
    };
    // low rumble, mid "voices" band, high hiss of claps
    const low = mk(brownBuf, 'lowpass', 300, 0.7, 0.0);
    const mid = mk(pinkBuf, 'bandpass', 650, 0.8, 0.0);
    const high = mk(noiseBuf, 'bandpass', 2600, 0.6, 0.0);
    // slow LFO wobble on the mid band so the bed "breathes"
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.23;
    const lfoG = ctx.createGain(); lfoG.gain.value = 120;
    lfo.connect(lfoG).connect(mid.fl.frequency); lfo.start();
    crowdNodes = { low, mid, high, lfo };
    setCrowd(crowdLevel, 1.5);
  }

  function setCrowd(level, ramp = 0.6) {
    crowdLevel = Math.max(0, Math.min(1, level));
    if (!crowdNodes) return;
    const t = now(), L = crowdLevel;
    crowdNodes.low.gn.gain.setTargetAtTime(0.18 + 0.25 * L, t, ramp);
    crowdNodes.mid.gn.gain.setTargetAtTime(0.06 + 0.32 * L, t, ramp);
    crowdNodes.mid.fl.frequency.setTargetAtTime(550 + 600 * L, t, ramp);
    crowdNodes.high.gn.gain.setTargetAtTime(0.01 + 0.09 * L * L, t, ramp);
  }

  function roar(amount = 1) {
    if (!ok()) return;
    ensureCrowd();
    const t = now();
    const dur = 2.2 + amount;
    const layer = (buf, f, q, g) => {
      const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
      const fl = ctx.createBiquadFilter(); fl.type = 'bandpass'; fl.Q.value = q;
      fl.frequency.setValueAtTime(f * 0.7, t); fl.frequency.linearRampToValueAtTime(f * 1.25, t + 0.6); fl.frequency.linearRampToValueAtTime(f, t + dur);
      const gn = ctx.createGain();
      gn.gain.setValueAtTime(0.0001, t);
      gn.gain.linearRampToValueAtTime(g * amount, t + 0.35);
      gn.gain.setTargetAtTime(0.0001, t + 0.9, dur / 3.5);
      src.connect(fl).connect(gn).connect(crowdBus);
      const s = ctx.createGain(); s.gain.value = 0.3; gn.connect(s).connect(verbSend);
      src.start(t, Math.random() * 2); src.stop(t + dur + 1.5);
    };
    // formant-ish bands give a "voices" colour rather than plain hiss
    layer(pinkBuf, 520, 1.4, 0.55);
    layer(pinkBuf, 1100, 2.0, 0.35);
    layer(noiseBuf, 2600, 1.2, 0.12);
    layer(brownBuf, 220, 0.8, 0.5);
  }

  function crowd(level) {
    if (!ok()) return;
    ensureCrowd();
    setCrowd(level);
  }

  function knockdown() {
    if (!ok()) return;
    const t = now();
    tone({ t, f0: 90, f1: 25, dur: 0.7, gain: 1.0, drive: 2, send: 0.4 });
    noise({ t, dur: 0.4, type: 'lowpass', freq: 400, gain: 0.6, buf: brownBuf, send: 0.3 }); // body on canvas
    noise({ t: t + 0.08, dur: 0.25, type: 'lowpass', freq: 250, gain: 0.4, buf: brownBuf });
    roar(1.1);
  }

  function ko() {
    if (!ok()) return;
    const t = now();
    // huge sub boom + reverse-ish riser tail
    tone({ t, f0: 75, f1: 18, dur: 1.6, gain: 1.2, drive: 3, send: 0.8 });
    noise({ t, dur: 1.4, type: 'lowpass', freq: 900, freqEnd: 120, gain: 0.7, buf: pinkBuf, send: 0.9 });
    noise({ t: t + 0.25, dur: 0.5, type: 'lowpass', freq: 300, gain: 0.5, buf: brownBuf });
    roar(1.6);
    setTimeout(() => bell(5), 900);
  }

  // ---------------- UI ----------------
  function uiMove() {
    if (!ok()) return;
    const t = now();
    tone({ t, f0: 1400, f1: 1100, dur: 0.045, type: 'triangle', gain: 0.12 });
    noise({ t, dur: 0.02, type: 'highpass', freq: 5000, gain: 0.05 });
  }
  function uiSelect() {
    if (!ok()) return;
    const t = now();
    tone({ t, f0: 660, f1: 660, dur: 0.08, type: 'square', gain: 0.06 });
    tone({ t: t + 0.06, f0: 990, f1: 990, dur: 0.16, type: 'triangle', gain: 0.14 });
    tone({ t, f0: 110, f1: 50, dur: 0.12, gain: 0.35 });
  }

  // ---------------- announcer ----------------
  function pickVoice() {
    try {
      const vs = window.speechSynthesis.getVoices();
      spanishVoice = vs.find((v) => /^es[-_](ES|MX|US)/i.test(v.lang) && /male|jorge|pablo|diego|enrique|carlos/i.test(v.name))
        || vs.find((v) => /^es[-_]ES/i.test(v.lang)) || vs.find((v) => /^es/i.test(v.lang)) || null;
    } catch { spanishVoice = null; }
  }
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    pickVoice();
    try { window.speechSynthesis.onvoiceschanged = pickVoice; } catch { /* ignore */ }
  }
  function announcer(text) {
    try {
      if (!window.speechSynthesis || !text) return;
      if (vol.master * vol.sfx < 0.02) return;
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = spanishVoice?.lang || 'es-ES';
      if (spanishVoice) u.voice = spanishVoice;
      u.pitch = 0.55; u.rate = 0.88; u.volume = Math.min(1, vol.master * vol.sfx * 1.2);
      window.speechSynthesis.speak(u);
    } catch { /* speech optional */ }
  }

  // ---------------- music ----------------
  // 88 BPM dark boom-bap: kick, snare, swung hats, sub bass on A minor, detuned minor pad.
  const BPM = 88;
  const CHORDS = [[57, 60, 64], [53, 57, 60], [50, 53, 57], [52, 56, 59]]; // Am F Dm E
  const BASS = [45, 0, 45, 0, 0, 45, 48, 0, 41, 0, 41, 0, 0, 41, 43, 0, 38, 0, 38, 0, 0, 38, 41, 0, 40, 0, 40, 0, 44, 0, 47, 0];
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

  function startMusic() {
    if (!ok() || music) return;
    const bus = ctx.createGain(); bus.gain.value = 0; bus.connect(musicBus);
    bus.gain.setTargetAtTime(1, now(), 0.8);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400; lp.Q.value = 2;
    const padBus = ctx.createGain(); padBus.gain.value = 0.16; padBus.connect(lp).connect(bus);
    const padVerb = ctx.createGain(); padVerb.gain.value = 0.5; padBus.connect(padVerb).connect(verbSend);
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07; const lfoG = ctx.createGain(); lfoG.gain.value = 700;
    lfo.connect(lfoG).connect(lp.frequency); lfo.start();
    const step = 60 / BPM / 4; // 16th
    let nextT = now() + 0.1, n = 0;
    const m = { bus, lfo, timer: 0 };
    const schedule = () => {
      while (nextT < now() + 0.2) {
        const t = nextT, s = n % 32, bar = Math.floor(n / 16) % 4;
        const swing = s % 2 ? step * 0.12 : 0;
        // kick
        if (s % 16 === 0 || s % 16 === 10 || (s % 32 === 7)) tone({ t, f0: 140, f1: 40, dur: 0.28, gain: 0.85, dest: bus, drive: 1.5 });
        // snare on 2 and 4
        if (s % 8 === 4) {
          noise({ t, dur: 0.18, type: 'bandpass', freq: 1800, q: 0.7, gain: 0.45, dest: bus, send: 0.15 });
          tone({ t, f0: 220, f1: 160, dur: 0.08, type: 'triangle', gain: 0.25, dest: bus });
        }
        // hats
        if (s % 2 === 0 || Math.random() < 0.25) noise({ t: t + swing, dur: s % 4 === 2 ? 0.08 : 0.03, type: 'highpass', freq: 7500, gain: s % 4 === 2 ? 0.1 : 0.06, dest: bus });
        // bass
        const b = BASS[s + (bar % 2 ? 0 : 0)];
        if (b) {
          const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(b - 12 + (bar === 3 && s > 16 ? 0 : 0));
          const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(420, t); f.frequency.exponentialRampToValueAtTime(120, t + step * 2.5);
          const g = ctx.createGain(); env(g, t, 0.005, 0.32, step * 2.6);
          o.connect(f).connect(g).connect(bus); o.start(t); o.stop(t + step * 3);
        }
        // pad: new chord every bar
        if (n % 16 === 0) {
          const chord = CHORDS[Math.floor(n / 16) % 4];
          for (const note of chord) for (const det of [-7, 7]) {
            const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(note); o.detune.value = det;
            const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.18, t + 0.6); g.gain.setTargetAtTime(0.0001, t + step * 14, 0.25);
            o.connect(g).connect(padBus); o.start(t); o.stop(t + step * 16 + 1.2);
          }
        }
        // sparse minor-pentatonic pluck
        if ((s === 14 || s === 30 || s === 22) && Math.random() < 0.7) {
          const mel = [69, 72, 74, 76, 79, 81][Math.floor(Math.random() * 6)];
          tone({ t, f0: mtof(mel), f1: mtof(mel) * 0.995, dur: 0.35, type: 'triangle', gain: 0.07, dest: bus, send: 0.4 });
        }
        nextT += step; n++;
      }
    };
    m.timer = setInterval(schedule, 25);
    schedule();
    music = m;
  }

  function stopMusic(fade = 0.8) {
    if (!music) return;
    const m = music; music = null;
    clearInterval(m.timer);
    if (ok()) m.bus.gain.setTargetAtTime(0, now(), fade / 3);
    setTimeout(() => { try { m.lfo.stop(); m.bus.disconnect(); } catch { /* done */ } }, fade * 1000 + 600);
  }

  return {
    get ctx() { return ctx; },
    unlock() {
      init();
      if (ctx && ctx.state === 'suspended') ctx.resume();
      return ctx;
    },
    punch, kick, block, whiff, bell,
    crowd, roar, knockdown, ko,
    announcer,
    uiMove, uiSelect,
    /** music(true) starts the menu loop, music(false) fades it out. */
    music(on = true) { if (on) startMusic(); else stopMusic(); },
    startMusic, stopMusic,
    setVolume(m = vol.master, mu = vol.music, s = vol.sfx) {
      vol.master = m; vol.music = mu; vol.sfx = s;
      if (!ctx) return;
      const t = now();
      master.gain.setTargetAtTime(m, t, 0.05);
      musicBus.gain.setTargetAtTime(mu * 0.5, t, 0.05);
      sfxBus.gain.setTargetAtTime(s, t, 0.05);
    },
  };
}
