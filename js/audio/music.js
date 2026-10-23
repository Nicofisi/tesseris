// Procedural music: a cozy Korobeiniki arrangement for the game and a slow ambient loop for the menu.
// Tracks are scheduled step by step (16th notes) on the AudioContext clock by Sound's lookahead loop.
import { kalimba, marimba, glock, musicbox, pad, bass, flute, kick, hat, brush, shaker, rim } from './synth.js';

const MAJOR = [0, 2, 4, 5, 7, 9, 11];

// The key the music is in right now, bent to fit the current chord (E7 brings in G#).
// Degree 0 is the tonic in octave 4 (C4 for C major).
export class Harmony {
  constructor(tonic, scale, root, tones) {
    this.tonic = tonic;
    const rel = (pc) => (((pc - tonic) % 12) + 12) % 12;
    const sc = scale.slice();
    for (const pc of tones) {
      const r = rel(pc);
      if (sc.includes(r)) continue;
      const j = sc.findIndex((x) => x === (r + 11) % 12 || x === (r + 1) % 12);
      if (j >= 0) sc[j] = r;
    }
    sc.sort((a, b) => a - b);
    this.scale = sc;
    this.rootDeg = Math.max(0, sc.indexOf(rel(root)));
  }
  pitch(d) {
    const o = Math.floor(d / 7);
    return 60 + this.tonic + 12 * o + this.scale[d - 7 * o];
  }
  // The degree d (mod 7) placed at or just above midi note lo.
  degAbove(d, lo) {
    while (this.pitch(d) < lo) d += 7;
    while (this.pitch(d - 7) >= lo) d -= 7;
    return d;
  }
}

export const DEFAULT_HARMONY = new Harmony(0, MAJOR, 0, [0, 4, 7, 11]);

function chordSet(tonic, defs) {
  for (const c of Object.values(defs)) c.harmony = new Harmony(tonic, MAJOR, c.root, [c.root, ...c.pad]);
  return defs;
}

// A minor / C major. Rootless pad voicings around middle C; the bass plays the root.
const CH = chordSet(0, {
  Am9: { root: 45, pad: [60, 64, 67, 71] },
  Fmaj7: { root: 41, pad: [57, 60, 64, 67] },
  G6: { root: 43, pad: [59, 62, 64, 67] },
  E7: { root: 40, pad: [56, 59, 62, 64] },
  Dm9: { root: 38, pad: [53, 57, 60, 64] },
  Cmaj7: { root: 36, pad: [55, 59, 62, 64] },
  Em7: { root: 40, pad: [52, 55, 59, 62] },
  Esus4: { root: 40, pad: [57, 59, 62, 64] },
});

// F major for the menu: I–vi–IV–V.
const MENU_CH = Object.values(
  chordSet(5, {
    Fmaj9: { root: 41, pad: [57, 60, 64, 67] },
    Dm9: { root: 38, pad: [53, 57, 60, 64] },
    Bbmaj9: { root: 46, pad: [57, 60, 62, 65] },
    C9: { root: 48, pad: [52, 58, 62, 67] },
  }),
);

// Korobeiniki, [step, length, midi] per bar (16 steps = one 4/4 bar).
const A_MEL = [
  [[0, 4, 76], [4, 2, 71], [6, 2, 72], [8, 4, 74], [12, 2, 72], [14, 2, 71]],
  [[0, 4, 69], [4, 2, 69], [6, 2, 72], [8, 4, 76], [12, 2, 74], [14, 2, 72]],
  [[0, 6, 71], [6, 2, 72], [8, 4, 74], [12, 4, 76]],
  [[0, 4, 72], [4, 4, 69], [8, 6, 69]],
  [[2, 4, 74], [6, 2, 77], [8, 4, 81], [12, 2, 79], [14, 2, 77]],
  [[0, 6, 76], [6, 2, 72], [8, 4, 76], [12, 2, 74], [14, 2, 72]],
  [[0, 4, 71], [4, 2, 71], [6, 2, 72], [8, 4, 74], [12, 4, 76]],
  [[0, 4, 72], [4, 4, 69], [8, 6, 69]],
];
const B_MEL = [
  [[0, 8, 76], [8, 8, 72]],
  [[0, 8, 74], [8, 8, 71]],
  [[0, 8, 72], [8, 8, 69]],
  [[0, 8, 68], [8, 8, 71]],
  [[0, 8, 76], [8, 8, 72]],
  [[0, 8, 74], [8, 8, 71]],
  [[0, 4, 72], [4, 4, 76], [8, 8, 81]],
  [[0, 16, 80]],
];
const A_CH = [['Am9'], ['Fmaj7'], ['G6', 'E7'], ['Am9'], ['Dm9'], ['Cmaj7'], ['G6', 'E7'], ['Am9']];
const A_ALT = [['Cmaj7'], ['Fmaj7'], ['G6', 'E7'], ['Fmaj7'], ['Dm9'], ['Cmaj7'], ['G6', 'E7'], ['Am9']];
const B_CH = [['Am9'], ['G6'], ['Fmaj7'], ['E7'], ['Am9'], ['G6'], ['Fmaj7'], ['E7']];
const I_CH = [['Fmaj7'], ['Em7'], ['Dm9'], ['Cmaj7'], ['Fmaj7'], ['G6'], ['Esus4'], ['E7']];
// Counter-melody under the A theme: half notes (one entry = whole note).
const COUNTER = [[69, 67], [65, 64], [62, 68], [64, 67], [65, 69], [67, 64], [62, 68], [69]];

// Form of one loop, 8 bars each: A, A', B, A'', calm interlude.
const SECTIONS = ['A1', 'A2', 'B', 'A3', 'I'];
const LOOP = SECTIONS.length * 8;

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The scale note just above / below m (grace notes, bass approach notes); C major by default.
const scaleStep = (m, dir, h = DEFAULT_HARMONY) => {
  let n = m + dir;
  while (!h.scale.includes((((n - h.tonic) % 12) + 12) % 12)) n += dir;
  return n;
};

class Track {
  constructor(sound, name, start) {
    const ctx = (this.ctx = sound.ctx);
    this.sound = sound;
    this.name = name;
    this.dry = ctx.createGain();
    this.wet = ctx.createGain();
    this.dry.connect(sound.mIn);
    this.wet.connect(sound.mRev);
    this.sends = new Map();
    this.next = start;
    this.step = 0;
    this.endAt = Infinity;
    this.fading = false;
    this.harm = [];
    this.bar = null;
  }
  // Destination with a given reverb amount.
  out(wet) {
    let d = this.sends.get(wet);
    if (!d) {
      const g = this.ctx.createGain();
      g.gain.value = wet;
      g.connect(this.wet);
      d = { dry: this.dry, wet: g };
      this.sends.set(wet, d);
    }
    return d;
  }
  schedule(until) {
    while (this.next < until && this.next < this.endAt) {
      const sd = this.stepDur();
      const s = this.step % 16;
      if (s === 0) this.bar = this.compile(Math.floor(this.step / 16));
      const evs = this.bar?.[s];
      if (evs) for (const fn of evs) fn(this.next, sd);
      this.next += sd;
      this.step++;
    }
  }
  fadeOut(t, dur) {
    this.fading = true;
    this.endAt = Math.min(this.endAt, t + dur);
    for (const g of [this.dry, this.wet]) {
      const v = g.gain.value;
      g.gain.cancelScheduledValues(t);
      g.gain.setValueAtTime(v, t);
      g.gain.linearRampToValueAtTime(0, t + dur);
    }
  }
  dispose() {
    this.dry.disconnect();
    this.wet.disconnect();
    for (const d of this.sends.values()) d.wet.disconnect();
    this.sends.clear();
  }
  setChord(t, h) {
    this.harm.push({ t, h });
    if (this.harm.length > 8) this.harm.shift();
  }
  harmonyAt(now) {
    let h = this.harm[0]?.h ?? null;
    for (const e of this.harm) if (e.t <= now + 0.03) h = e.h;
    return h;
  }
}

export class GameTrack extends Track {
  constructor(sound, start) {
    super(sound, 'game', start);
    this.dLead = this.out(0.22);
    this.dSoft = this.out(0.35);
    this.dPad = this.out(0.3);
    this.dBass = this.out(0.04);
    this.dDrum = this.out(0.08);
    this.dSpark = this.out(0.6);
  }

  stepDur() {
    const lv = this.sound.level;
    return 15 / (124 * (1 + Math.min(0.3, 0.02 * (lv - 1))));
  }

  chordsOf(bar) {
    const L = Math.floor(bar / LOOP);
    const b = bar % LOOP;
    const sec = SECTIONS[b >> 3];
    const i = b & 7;
    const odd = L % 2 === 1;
    if (sec === 'B') return B_CH[i];
    if (sec === 'I') return I_CH[i];
    if ((sec === 'A2' && !odd) || (sec === 'A3' && odd)) return A_ALT[i];
    return A_CH[i];
  }

  compile(bar) {
    const ctx = this.ctx;
    const L = Math.floor(bar / LOOP);
    const b = bar % LOOP;
    const sec = SECTIONS[b >> 3];
    const i = b & 7;
    const odd = L % 2 === 1;
    const lv = this.sound.level;
    const r = rng(bar * 7919 + 13);
    const ev = Array.from({ length: 16 }, () => []);
    const at = (s, fn) => ev[s].push(fn);
    const sw = (s, t, sd) => t + (s % 4 === 2 ? sd * 0.12 : 0);

    // Harmony: pads and bass.
    const names = this.chordsOf(bar);
    const span = 16 / names.length;
    const nextRoot = CH[this.chordsOf(bar + 1)[0]].root;
    names.forEach((name, k) => {
      const c = CH[name];
      const s0 = k * span;
      at(s0, (t, sd) => {
        this.setChord(t, c.harmony);
        if (sec === 'I') pad(ctx, this.dPad, t, span * sd, [c.root + 12, ...c.pad], 0.17, { attack: 0.5, release: 1.4, cutoff: 1000 });
        else pad(ctx, this.dPad, t, span * sd - 0.02, c.pad, sec === 'B' ? 0.12 : 0.1, { attack: 0.08, release: 0.5, cutoff: 900 });
      });
      if (sec === 'I') return;
      const bv = 0.22;
      if (sec === 'B') {
        at(s0, (t, sd) => bass(ctx, this.dBass, t, 11 * sd, c.root, bv));
        at(s0 + 12, (t, sd) => bass(ctx, this.dBass, sw(12, t, sd), 3.5 * sd, c.root + 7, bv * 0.8));
        return;
      }
      const last = k === names.length - 1;
      at(s0, (t, sd) => bass(ctx, this.dBass, t, 5.5 * sd, c.root, bv));
      at(s0 + 6, (t, sd) => bass(ctx, this.dBass, sw(6, t, sd), 1.6 * sd, c.root, bv * 0.7));
      if (span === 16) at(8, (t, sd) => bass(ctx, this.dBass, t, 5.5 * sd, c.root + 7, bv * 0.85));
      if (last) {
        const target = nextRoot + (nextRoot - c.root > 6 ? -12 : nextRoot - c.root < -6 ? 12 : 0);
        const appr = target === c.root ? c.root + 7 : scaleStep(target, target > c.root ? -1 : 1, c.harmony);
        at(14, (t, sd) => bass(ctx, this.dBass, sw(14, t, sd), 1.6 * sd, appr, bv * 0.75));
      }
    });
    const chordAt = (s) => CH[names[Math.min(names.length - 1, Math.floor(s / span))]];

    // Melody.
    if (sec === 'I') this.interlude(at, i, L, r, chordAt);
    else if (sec === 'B') this.bSection(at, i, odd, chordAt);
    else this.aSection(at, sec, i, odd, r, sw);

    // Drums.
    if (sec !== 'I') {
      if (sec === 'B') {
        at(0, (t) => kick(ctx, this.dDrum, t, 0.42));
        at(8, (t) => rim(ctx, this.dDrum, t, 0.16));
        for (const s of [0, 4, 8, 12]) at(s, (t) => brush(ctx, this.dDrum, t, s % 8 === 4 ? 0.07 : 0.045));
      } else {
        const intro = L === 0 && sec === 'A1' && i < 4;
        if (!intro) {
          at(0, (t) => kick(ctx, this.dDrum, t, 0.48));
          at(8, (t) => kick(ctx, this.dDrum, t, 0.4));
          if (r() < 0.3) at(10, (t, sd) => kick(ctx, this.dDrum, sw(10, t, sd), 0.2));
          at(4, (t) => rim(ctx, this.dDrum, t, 0.14));
          at(12, (t) => rim(ctx, this.dDrum, t, 0.14));
        }
        for (let s = 0; s < 16; s += 2) at(s, (t, sd) => hat(ctx, this.dDrum, sw(s, t, sd), s % 4 === 2 ? 0.05 : 0.03));
        if (sec === 'A3' && i === 7) {
          [10, 12, 13, 14, 15].forEach((s, k) => at(s, (t, sd) => rim(ctx, this.dDrum, sw(s, t, sd), 0.06 + k * 0.03)));
        }
      }
      // From level 5: a soft shaker layer.
      if (lv >= 5) {
        const acc = [0.035, 0.015, 0.028, 0.015];
        for (let s = 0; s < 16; s += sec === 'B' ? 2 : 1) at(s, (t, sd) => shaker(ctx, this.dDrum, sw(s, t, sd), acc[s % 4]));
      }
    }
    // From level 9: sparkles high above the chords.
    if (lv >= 9 && sec !== 'I') {
      for (const s of [2, 6, 10, 14]) {
        if (r() > 0.4) continue;
        const c = chordAt(s);
        const m = c.pad[Math.floor(r() * c.pad.length)] + 24;
        const pan = r() * 1.2 - 0.6;
        at(s, (t, sd) => glock(ctx, this.dSpark, sw(s, t, sd), m, 0.045, { pan, decay: 0.5 }));
      }
    }
    return ev;
  }

  aSection(at, sec, i, odd, r, sw) {
    const ctx = this.ctx;
    const notes = A_MEL[i];
    const ornament = sec === 'A3';
    // Voices per pass: [instrument, octave shift, level].
    let voices;
    if (sec === 'A1') voices = odd ? [[marimba, -12, 1.1], [glock, 0, 0.25]] : [[kalimba, 0, 1]];
    else if (sec === 'A2') voices = odd ? [[glock, 0, 0.6], [kalimba, -12, 0.55]] : [[kalimba, 0, 1], [glock, 12, 0.14]];
    else voices = [[kalimba, 0, 1]];
    for (const [s, len, m] of notes) {
      const accent = s % 8 === 0 ? 1 : s % 4 === 0 ? 0.9 : 0.8;
      const human = 0.95 + r() * 0.1;
      const grace = ornament && len >= 4 && r() < 0.35;
      const mordent = ornament && odd && len >= 6 && !grace;
      at(s, (t, sd) => {
        t = sw(s, t, sd);
        for (const [inst, oct, lvl] of voices) inst(ctx, this.dLead, t, m + oct, 0.3 * lvl * accent * human);
        if (grace) kalimba(ctx, this.dLead, Math.max(ctx.currentTime, t - 0.05), scaleStep(m, 1), 0.11);
        if (mordent) {
          kalimba(ctx, this.dLead, t + sd * 0.5, scaleStep(m, -1), 0.13);
          kalimba(ctx, this.dLead, t + sd, m, 0.17);
        }
      });
    }
    const counter = (sec === 'A2' && !odd) || (sec === 'A3' && odd);
    if (counter) {
      const line = COUNTER[i];
      const len = 16 / line.length;
      line.forEach((m, k) => at(k * len, (t, sd) => flute(ctx, this.dSoft, t, len * sd * 0.92, m, 0.075, { attack: 0.09 })));
    }
  }

  bSection(at, i, odd, chordAt) {
    const ctx = this.ctx;
    for (const [s, len, m] of B_MEL[i]) {
      at(s, (t, sd) => {
        if (odd) {
          glock(ctx, this.dLead, t, m, 0.2, { decay: 0.9 });
          flute(ctx, this.dSoft, t, len * sd * 0.9, m - 12, 0.06);
        } else {
          flute(ctx, this.dSoft, t, len * sd * 0.92, m, 0.11, { attack: 0.07 });
          kalimba(ctx, this.dLead, t, m, 0.12);
        }
      });
    }
    // A gentle 8th-note arpeggio underneath.
    const inst = odd ? marimba : kalimba;
    for (let k = 0; k < 8; k++) {
      const s = k * 2;
      const c = chordAt(s);
      const p = c.pad;
      const m = [p[0], p[1], p[2], p[3], p[0] + 12, p[3], p[2], p[1]][k];
      at(s, (t, sd) => inst(ctx, this.dSoft, t + (k % 2 ? sd * 0.12 : 0), m, k === 0 ? 0.11 : 0.08));
    }
  }

  interlude(at, i, L, r, chordAt) {
    const ctx = this.ctx;
    const kind = L % 3;
    for (let k = 0; k < 8; k++) {
      const s = k * 2;
      const p = chordAt(s).pad.map((m) => m + 12);
      let m;
      if (kind === 0) m = [p[0], p[1], p[2], p[3], p[0] + 12, p[1] + 12, p[2] + 12, p[3] + 12][k];
      else if (kind === 1) m = [p[0], p[1], p[2], p[3], p[0] + 12, p[3], p[2], p[1]][k];
      else {
        if (k % 2 === 1 && r() < 0.45) continue;
        m = p[Math.floor(r() * 4)] + (r() < 0.3 ? 12 : 0);
      }
      const v = (k === 0 ? 0.13 : 0.1) * (i === 7 ? 1 - k * 0.05 : 1);
      at(s, (t, sd) => musicbox(ctx, this.dSoft, t + (k % 2 ? sd * 0.12 : 0), m, v));
    }
  }
}

export class MenuTrack extends Track {
  constructor(sound, start) {
    super(sound, 'menu', start);
    this.dPad = this.out(0.4);
    this.dBox = this.out(0.55);
    this.dSub = this.out(0.05);
  }
  stepDur() {
    return 15 / 72;
  }
  compile(bar) {
    const ctx = this.ctx;
    const c = MENU_CH[Math.floor(bar / 4) % 4];
    const r = rng(bar * 104729 + 7);
    const ev = Array.from({ length: 16 }, () => []);
    const at = (s, fn) => ev[s].push(fn);
    if (bar % 4 === 0) {
      at(0, (t, sd) => {
        this.setChord(t, c.harmony);
        pad(ctx, this.dPad, t, 64 * sd, c.pad, 0.26, { attack: 2.2, release: 3, cutoff: 1200 });
        bass(ctx, this.dSub, t, 62 * sd, c.root, 0.15);
      });
    }
    // Sparse music box: a few chord tones on the 8th grid, sometimes a little run.
    if (bar === 0) return ev;
    const tones = [...c.pad.map((m) => m + 12), ...c.pad.map((m) => m + 24)].filter((m) => m <= 91).sort((a, b) => a - b);
    const count = r() < 0.25 ? 1 : 2 + Math.floor(r() * 3);
    const slots = [0, 2, 4, 6, 8, 10, 12, 14].filter(() => r() < 0.6).slice(0, count);
    let idx = Math.floor(r() * (tones.length - 3));
    const up = r() < 0.6;
    for (const s of slots) {
      const m = tones[Math.max(0, Math.min(tones.length - 1, idx))];
      idx += up ? 1 + (r() < 0.3 ? 1 : 0) : -1;
      const pan = r() * 0.8 - 0.4;
      const v = 0.12 + r() * 0.06;
      at(s, (t, sd) => musicbox(ctx, this.dBox, t + r() * 0.02, m, v, { pan }));
    }
    return ev;
  }
}
