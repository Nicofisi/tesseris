// A small synth kit on Web Audio. Every voice is scheduled at time t on a destination
// { dry, wet } (wet = optional reverb send) and disconnects its nodes when it ends.
export const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

const kits = new WeakMap();

// Per-context shared resources: a noise buffer and a few soft waveforms.
export function kit(ctx) {
  let k = kits.get(ctx);
  if (k) return k;
  const rate = ctx.sampleRate;
  const noise = ctx.createBuffer(1, rate * 2, rate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const wave = (amps) => {
    const real = new Float32Array(amps.length + 1);
    const imag = new Float32Array(amps.length + 1);
    amps.forEach((a, i) => (imag[i + 1] = a));
    return ctx.createPeriodicWave(real, imag);
  };
  k = {
    noise,
    // A saw with fewer, gentler harmonics: warm even before the filter, no aliasing.
    saw: wave(Array.from({ length: 12 }, (_, i) => 1 / Math.pow(i + 1, 1.3))),
    // Round bass: a sine with just enough overtones to be heard on small speakers.
    bass: wave([1, 0.5, 0.2, 0.07]),
    panner: typeof ctx.createStereoPanner === 'function',
  };
  kits.set(ctx, k);
  return k;
}

// Reverb impulse: stereo noise with an exponential decay that gets darker over time.
export function impulse(ctx, seconds = 1.8) {
  const rate = ctx.sampleRate;
  const len = Math.floor(rate * seconds);
  const pre = Math.floor(rate * 0.012);
  const buf = ctx.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    for (let i = pre; i < len; i++) {
      const x = i / len;
      lp += (0.6 - 0.45 * x) * (Math.random() * 2 - 1 - lp);
      const fadeIn = Math.min(1, (i - pre) / (rate * 0.006));
      d[i] = lp * Math.exp(-6.5 * x) * fadeIn;
    }
  }
  return buf;
}

export function connect(node, dest) {
  node.connect(dest.dry);
  if (dest.wet) node.connect(dest.wet);
}

function cleanup(src, nodes) {
  src.onended = () => {
    for (const n of nodes) {
      try {
        n.disconnect();
      } catch {
        /* already gone */
      }
    }
  };
}

function outGain(ctx, dest, vel, pan) {
  const out = ctx.createGain();
  out.gain.value = vel;
  if (pan && kit(ctx).panner) {
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    out.connect(p);
    connect(p, dest);
    return [out, p];
  }
  connect(out, dest);
  return [out];
}

// Additive mallet / pluck voice. partials: [ratio, amp, decay time constant (s)].
// o: attack, pan, detune (cents), bend [start ratio, time], type (oscillator type).
export function pluck(ctx, dest, t, freq, vel, partials, o = {}) {
  const outs = outGain(ctx, dest, vel, o.pan);
  const atk = o.attack ?? 0.003;
  let longest = null;
  let end = 0;
  const voices = [];
  for (const [ratio, amp, tau] of partials) {
    const f = freq * ratio;
    if (f > 9000 || amp <= 0) continue;
    const osc = ctx.createOscillator();
    if (o.type) osc.type = o.type;
    if (o.bend) {
      osc.frequency.setValueAtTime(f * o.bend[0], t);
      osc.frequency.exponentialRampToValueAtTime(f, t + o.bend[1]);
    } else osc.frequency.value = f;
    if (o.detune) osc.detune.value = o.detune;
    const g = ctx.createGain();
    g.gain.value = 0;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(amp, t + atk);
    g.gain.setTargetAtTime(0, t + atk, tau);
    osc.connect(g).connect(outs[0]);
    const stop = t + atk + tau * 7;
    osc.start(t);
    osc.stop(stop);
    voices.push([osc, g]);
    if (stop > end) {
      end = stop;
      longest = osc;
    }
  }
  for (const [osc, g] of voices) cleanup(osc, osc === longest ? [osc, g, ...outs] : [osc, g]);
  if (!longest) outs.forEach((n) => n.disconnect());
  return end;
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const partialsScaled = (list, bright = 1) => list.map(([r, a, d], i) => [r, i === 0 ? a : a * bright, d]);

export function kalimba(ctx, dest, t, midi, vel, o = {}) {
  const d = o.decay ?? clamp(0.5 - (midi - 60) * 0.015, 0.16, 0.7);
  const p = [[1, 1, d], [2, 0.07, d * 0.3], [5.95, 0.12, 0.04]];
  return pluck(ctx, dest, t, mtof(midi), vel, partialsScaled(p, o.bright), { attack: 0.003, ...o });
}

export function marimba(ctx, dest, t, midi, vel, o = {}) {
  const d = o.decay ?? clamp(0.34 - (midi - 60) * 0.01, 0.1, 0.5);
  const p = [[1, 1, d], [4, 0.2, d * 0.25], [9.9, 0.04, 0.015]];
  return pluck(ctx, dest, t, mtof(midi), vel, partialsScaled(p, o.bright), { attack: 0.004, ...o });
}

export function glock(ctx, dest, t, midi, vel, o = {}) {
  const d = o.decay ?? clamp(0.9 - (midi - 72) * 0.02, 0.3, 1.1);
  const p = [[1, 1, d], [2.76, 0.22, d * 0.35], [5.4, 0.08, d * 0.15]];
  return pluck(ctx, dest, t, mtof(midi), vel, partialsScaled(p, o.bright), { attack: 0.003, ...o });
}

export function musicbox(ctx, dest, t, midi, vel, o = {}) {
  const d = o.decay ?? clamp(0.7 - (midi - 72) * 0.015, 0.25, 0.9);
  const p = [[1, 1, d], [2, 0.16, d * 0.5], [6.3, 0.07, 0.05]];
  return pluck(ctx, dest, t, mtof(midi), vel, partialsScaled(p, o.bright), { attack: 0.004, ...o });
}

// Short knock: two partials with a quick downward bend.
export function wood(ctx, dest, t, freq, vel, o = {}) {
  const d = o.decay ?? 0.018;
  return pluck(ctx, dest, t, freq, vel, [[1, 1, d], [2.6, 0.35, d * 0.5]], { attack: 0.002, bend: [1.12, 0.01], ...o });
}

// Soft pad: two detuned soft saws per note through one breathing lowpass.
export function pad(ctx, dest, t, dur, midis, vel, o = {}) {
  const k = kit(ctx);
  const atk = Math.min(o.attack ?? 0.4, dur * 0.8);
  const rel = o.release ?? 0.8;
  const cut = o.cutoff ?? 1100;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = 0.5;
  lp.frequency.setValueAtTime(cut * 0.45, t);
  lp.frequency.linearRampToValueAtTime(cut, t + atk * 1.4 + 0.05);
  lp.frequency.setTargetAtTime(cut * 0.65, t + atk * 1.4 + 0.05, Math.max(0.3, dur * 0.6));
  const g = ctx.createGain();
  const peak = vel / Math.max(1, midis.length);
  g.gain.value = 0;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + atk);
  g.gain.setValueAtTime(peak, t + dur);
  g.gain.setTargetAtTime(0, t + dur, rel / 3);
  lp.connect(g);
  connect(g, dest);
  const end = t + dur + rel * 2.2;
  const oscs = [];
  for (const m of midis) {
    for (const det of [-7, 6]) {
      const osc = ctx.createOscillator();
      osc.setPeriodicWave(k.saw);
      osc.frequency.value = mtof(m);
      osc.detune.value = det + (Math.random() - 0.5) * 4;
      osc.connect(lp);
      osc.start(t);
      osc.stop(end);
      oscs.push(osc);
    }
  }
  oscs.forEach((osc, i) => cleanup(osc, i === oscs.length - 1 ? [osc, lp, g] : [osc]));
  return end;
}

export function bass(ctx, dest, t, dur, midi, vel) {
  const osc = ctx.createOscillator();
  osc.setPeriodicWave(kit(ctx).bass);
  osc.frequency.value = mtof(midi);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 700;
  lp.Q.value = 0.4;
  const g = ctx.createGain();
  g.gain.value = 0;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vel, t + 0.008);
  g.gain.setTargetAtTime(vel * 0.6, t + 0.008, 0.25);
  g.gain.setTargetAtTime(0, t + dur, 0.05);
  osc.connect(lp).connect(g);
  connect(g, dest);
  osc.start(t);
  osc.stop(t + dur + 0.4);
  cleanup(osc, [osc, lp, g]);
}

// Breathy sustained voice (counter-melodies, the slow B section): sine + triangle with late vibrato.
export function flute(ctx, dest, t, dur, midi, vel, o = {}) {
  const f = mtof(midi);
  const atk = o.attack ?? 0.06;
  const rel = o.release ?? 0.18;
  const a = ctx.createOscillator();
  const b = ctx.createOscillator();
  b.type = 'triangle';
  a.frequency.value = f;
  b.frequency.value = f;
  const bg = ctx.createGain();
  bg.gain.value = 0.25;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 4.8;
  const depth = ctx.createGain();
  depth.gain.value = 0;
  depth.gain.setValueAtTime(0, t);
  depth.gain.linearRampToValueAtTime(0, t + Math.min(0.25, dur * 0.4));
  depth.gain.linearRampToValueAtTime(9, t + Math.min(0.7, dur * 0.8) + 0.01);
  lfo.connect(depth);
  depth.connect(a.detune);
  depth.connect(b.detune);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = o.cutoff ?? 2400;
  lp.Q.value = 0.5;
  const g = ctx.createGain();
  g.gain.value = 0;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vel, t + atk);
  g.gain.setValueAtTime(vel, t + Math.max(atk, dur));
  g.gain.setTargetAtTime(0, t + Math.max(atk, dur), rel / 3);
  a.connect(lp);
  b.connect(bg).connect(lp);
  lp.connect(g);
  connect(g, dest);
  const end = t + Math.max(atk, dur) + rel * 2.5;
  for (const o2 of [a, b, lfo]) {
    o2.start(t);
    o2.stop(end);
  }
  cleanup(a, [a, b, bg, lfo, depth, lp, g]);
}

function noiseSource(ctx, t, len) {
  const src = ctx.createBufferSource();
  src.buffer = kit(ctx).noise;
  src.start(t, Math.random() * 1.3);
  src.stop(t + len);
  return src;
}

// Filtered noise burst: hats, shakers, brushes, swooshes.
export function noise(ctx, dest, t, vel, o) {
  const len = o.len ?? 0.2;
  const src = noiseSource(ctx, t, len);
  const f = ctx.createBiquadFilter();
  f.type = o.filter ?? 'bandpass';
  f.Q.value = o.q ?? 0.8;
  if (o.sweep) {
    f.frequency.setValueAtTime(o.sweep[0], t);
    f.frequency.exponentialRampToValueAtTime(o.sweep[1], t + len);
  } else f.frequency.value = o.freq ?? 6000;
  const g = ctx.createGain();
  g.gain.value = 0;
  g.gain.setValueAtTime(0, t);
  if (o.shape === 'swell') {
    g.gain.linearRampToValueAtTime(vel, t + len * (o.peak ?? 0.35));
    g.gain.linearRampToValueAtTime(0, t + len);
  } else {
    const atk = o.attack ?? 0.004;
    g.gain.linearRampToValueAtTime(vel, t + atk);
    g.gain.setTargetAtTime(0, t + atk, o.decay ?? 0.04);
  }
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = o.lowpass ?? 8000;
  lp.Q.value = 0.5;
  src.connect(f).connect(lp).connect(g);
  const outs = outGain(ctx, dest, 1, o.pan);
  g.connect(outs[0]);
  cleanup(src, [src, f, lp, g, ...outs]);
}

export function kick(ctx, dest, t, vel) {
  const osc = ctx.createOscillator();
  osc.frequency.setValueAtTime(115, t);
  osc.frequency.exponentialRampToValueAtTime(46, t + 0.11);
  const g = ctx.createGain();
  g.gain.value = 0;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vel, t + 0.005);
  g.gain.setTargetAtTime(0, t + 0.005, 0.085);
  osc.connect(g);
  connect(g, dest);
  osc.start(t);
  osc.stop(t + 0.6);
  cleanup(osc, [osc, g]);
}

export const hat = (ctx, dest, t, vel, open = false) =>
  noise(ctx, dest, t, vel, { freq: 6500, q: 0.7, attack: 0.003, decay: open ? 0.09 : 0.03, len: open ? 0.5 : 0.18 });

export const brush = (ctx, dest, t, vel) =>
  noise(ctx, dest, t, vel, { freq: 4200, q: 0.6, attack: 0.012, decay: 0.07, len: 0.35 });

export const shaker = (ctx, dest, t, vel) =>
  noise(ctx, dest, t, vel, { freq: 5200, q: 1.1, attack: 0.008, decay: 0.022, len: 0.14 });

export function rim(ctx, dest, t, vel) {
  noise(ctx, dest, t, vel, { freq: 2100, q: 1.6, attack: 0.002, decay: 0.022, len: 0.15 });
  pluck(ctx, dest, t, 410, vel * 0.5, [[1, 1, 0.02], [2.3, 0.3, 0.01]], { attack: 0.002 });
}

// Low swell for back-to-back clears: bass tone + sub through an opening/closing lowpass.
export function bloom(ctx, dest, t, freq, vel) {
  const a = ctx.createOscillator();
  a.setPeriodicWave(kit(ctx).bass);
  a.frequency.value = freq;
  const b = ctx.createOscillator();
  b.frequency.value = freq / 2;
  const bg = ctx.createGain();
  bg.gain.value = 0.6;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = 1.2;
  lp.frequency.setValueAtTime(140, t);
  lp.frequency.exponentialRampToValueAtTime(1000, t + 0.14);
  lp.frequency.setTargetAtTime(220, t + 0.14, 0.35);
  const g = ctx.createGain();
  g.gain.value = 0;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vel, t + 0.06);
  g.gain.setTargetAtTime(0, t + 0.12, 0.45);
  a.connect(lp);
  b.connect(bg).connect(lp);
  lp.connect(g);
  connect(g, dest);
  for (const o of [a, b]) {
    o.start(t);
    o.stop(t + 3);
  }
  cleanup(a, [a, b, bg, lp, g]);
}
