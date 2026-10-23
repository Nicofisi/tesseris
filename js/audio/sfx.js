// Game sound effects. Every method takes the start time t; notes come from the music's current key.
import { mtof, pluck, kalimba, marimba, glock, musicbox, wood, pad, flute, noise, bloom, bass } from './synth.js';

export class Sfx {
  constructor(sound) {
    this.sound = sound;
    this.ctx = sound.ctx;
    const send = (w) => {
      const g = this.ctx.createGain();
      g.gain.value = w;
      g.connect(sound.sRev);
      return { dry: sound.sIn, wet: g };
    };
    this.dry = { dry: sound.sIn };
    this.room = send(0.12);
    this.hall = send(0.3);
    this.halo = send(0.55);
    this.last = {};
    this.rot = 0;
  }

  gate(name, t, gap) {
    const l = this.last[name];
    if (l !== undefined && t - l < gap && t >= l) return false;
    this.last[name] = t;
    return true;
  }

  // Triad on the current chord, from midi note lo upwards: [root, 3rd, 5th, octave].
  chordTones(h, lo) {
    const d = h.degAbove(h.rootDeg, lo);
    return [0, 2, 4, 7].map((k) => h.pitch(d + k));
  }

  move(t, e) {
    if (!this.gate('move', t, 0.04)) return;
    const base = [1180, 1180, 1000, 1380, 1560][e.axis] ?? 1180;
    const f = base * (1 + (Math.random() - 0.5) * 0.06);
    wood(this.ctx, this.room, t, f, 0.06, { pan: e.axis === 0 ? 0.25 * Math.sign(e.dir || 0) : 0 });
  }

  bump(t) {
    if (!this.gate('bump', t, 0.11)) return;
    pluck(this.ctx, this.dry, t, 150, 0.11, [[1, 1, 0.035], [2.2, 0.25, 0.012]], { bend: [1.4, 0.03], attack: 0.003 });
  }

  rotate(t, e) {
    if (!this.gate('rotate', t, 0.03)) return;
    const tones = this.chordTones(this.sound.harmony(), 72);
    const seq = [0, 1, 2, 3, 2, 1];
    const m = tones[seq[this.rot++ % seq.length]];
    const p = [[1, 1, 0.05], [2, 0.12, 0.02]];
    pluck(this.ctx, this.room, t, mtof(m), 0.1, p, { bend: [0.76, 0.045], attack: 0.004 });
    if (e.kick > 0) pluck(this.ctx, this.room, t + 0.05, mtof(m + 12), 0.04, p, { bend: [0.8, 0.03], attack: 0.004 });
  }

  rotateFail(t) {
    if (!this.gate('rotateFail', t, 0.06)) return;
    pluck(this.ctx, this.dry, t, 420, 0.06, [[1, 1, 0.016], [2.5, 0.2, 0.007]], { bend: [1.25, 0.02], attack: 0.002 });
  }

  softFall(t) {
    if (!this.gate('fall', t, 0.05)) return;
    wood(this.ctx, this.dry, t, 1750, 0.02, { decay: 0.008 });
  }

  hardDrop(t, e) {
    const d = Math.max(0, Math.min(20, e.distance | 0));
    if (d > 0) {
      const len = 0.07 + d * 0.011;
      noise(this.ctx, this.room, t, 0.07 + d * 0.004, { sweep: [2600, 380], q: 0.8, len, shape: 'swell', peak: 0.25 });
    }
    const thump = [[1, 1, 0.09], [2, 0.45, 0.05], [3.1, 0.15, 0.02]];
    pluck(this.ctx, this.room, t + 0.006, 72, 0.36, thump, { bend: [2.2, 0.07], attack: 0.004 });
  }

  lock(t, e, level = 1) {
    if (!this.gate('lock', t, 0.03)) return;
    const h = this.sound.harmony();
    const c = Math.max(0, e.color | 0) % 10;
    const d = h.degAbove(h.rootDeg, 57) + [0, 2, 4, 1, 3, 0, 2, 4, 1, 3][c];
    const p = [[1, 1, 0.06], [2.7, 0.25, 0.018]];
    pluck(this.ctx, this.room, t, mtof(h.pitch(d)), 0.2 * level, p, { bend: [1.1, 0.012], attack: 0.0025 });
    noise(this.ctx, this.dry, t, 0.05 * level, { freq: 1300, q: 1, attack: 0.002, decay: 0.008, len: 0.06 });
  }

  hold(t) {
    if (!this.gate('hold', t, 0.08)) return;
    noise(this.ctx, this.room, t, 0.06, { sweep: [500, 2400], q: 1.2, len: 0.12, shape: 'swell', peak: 0.6 });
    const m = this.chordTones(this.sound.harmony(), 74)[0];
    pluck(this.ctx, this.room, t + 0.085, mtof(m), 0.1, [[1, 1, 0.045], [2, 0.1, 0.015]], { bend: [0.7, 0.03], attack: 0.004 });
  }

  // The reward. Returns how long the main part lasts, so a level-up can follow it.
  clear(t, e) {
    const ctx = this.ctx;
    const h = this.sound.harmony();
    const n = Math.max(0, e.count | 0);
    const big = n >= 4;
    const climb = Math.min(7, Math.max(0, e.combo | 0));
    const wells = Math.max(1, e.wells | 0);
    let pat = n === 0 ? [0, 2, 4] : big ? [0, 2, 4, 7, 9, 11, 14] : [0, 2, 4, 7, 9].slice(0, n + 2);
    if (n > 4) pat = pat.concat([16, 18].slice(0, n - 4));
    // Combos climb the scale step by step, an octave at most.
    let start = h.degAbove(h.rootDeg + climb, big ? 60 : 67);
    while (h.pitch(start + pat[pat.length - 1]) > 98) start -= 7;
    let tt = t;
    if (e.tspin) {
      [4, 2, 4].forEach((k, i) => marimba(ctx, this.room, t + i * 0.038, h.pitch(start + 7 + k), 0.1 + i * 0.02));
      tt += 0.12;
    }
    const gap = big ? 0.052 : n === 0 ? 0.05 : 0.064;
    const vel = n === 0 ? 0.13 : big ? 0.19 : 0.19 + n * 0.015;
    const bright = 0.7 + Math.min(n, 4) * 0.15;
    pat.forEach((k, i) => {
      const m = h.pitch(start + k);
      const at = tt + i * gap;
      const lastNote = i === pat.length - 1;
      const v = vel * (0.8 + (0.25 * i) / pat.length);
      if (n >= 3) glock(ctx, this.hall, at, m, v, { bright, decay: lastNote ? 1.1 : undefined });
      else if (n === 0) marimba(ctx, this.room, at, m, v);
      else kalimba(ctx, this.hall, at, m, v, { bright, decay: lastNote ? 0.6 : undefined });
      if (n === 2 || big) glock(ctx, this.halo, at, m + 12, v * 0.22);
      if (n === 3) kalimba(ctx, this.room, at, m - 12, v * 0.35);
      if (wells > 1) this.chorus(at, m, v * 0.2 * Math.min(3, wells - 1), wells);
    });
    let end = tt + pat.length * gap;
    if (big) {
      const top = start + pat[pat.length - 1];
      for (const k of [-7, -5, -3, 0]) glock(ctx, this.hall, end, h.pitch(top + k), 0.09, { decay: 1.3 });
      const padNotes = [0, 2, 4, 6].map((k) => h.pitch(h.degAbove(h.rootDeg, 57) + k));
      pad(ctx, this.hall, end - 0.06, 0.45, padNotes, 0.14, { attack: 0.07, release: 1.2, cutoff: 2200 });
      const sparks = 8 + Math.min(4, n - 4) * 2;
      for (let k = 0; k < sparks; k++) {
        const m = h.pitch(h.degAbove(h.rootDeg + [0, 2, 4][k % 3], 84 + (k % 2) * 5));
        glock(ctx, this.halo, end + 0.06 + k * 0.07 + Math.random() * 0.03, m, 0.05 * (1 - k / (sparks + 4)), {
          pan: Math.random() * 1.2 - 0.6,
          decay: 0.5,
        });
      }
      end += 0.35;
    }
    if (e.b2b) bloom(ctx, this.room, t, mtof(h.pitch(h.degAbove(h.rootDeg, 36))), 0.32);
    if (e.perfect) {
      const from = h.degAbove(h.rootDeg, 72);
      for (let k = 0; k <= 14; k++) {
        glock(ctx, this.halo, end + k * 0.03, h.pitch(from + k), 0.05 + k * 0.004, { decay: 0.45, pan: (k / 14 - 0.5) * 0.8 });
      }
      end += 15 * 0.03;
      for (const k of [0, 2, 4, 7]) glock(ctx, this.halo, end + 0.05, h.pitch(from + 14 + k), 0.06, { decay: 1.2 });
      pad(ctx, this.halo, end, 0.6, [0, 2, 4, 7].map((k) => h.pitch(from + k)), 0.1, { attack: 0.15, release: 1.4, cutoff: 3000 });
      end += 0.3;
    }
    return end - t;
  }

  // Shimmering detuned doubles for hyper clears across several wells.
  chorus(t, m, v, wells) {
    const p = [[1, 1, 0.35], [2, 0.12, 0.18]];
    const f = mtof(m);
    for (const det of [-14, 13]) pluck(this.ctx, this.halo, t, f, v, p, { attack: 0.018, detune: det, type: 'triangle', pan: det / 30 });
    if (wells >= 3) pluck(this.ctx, this.halo, t + 0.012, f * 2, v * 0.5, p, { attack: 0.02, detune: 7, type: 'triangle' });
  }

  levelUp(t) {
    const ctx = this.ctx;
    const h = this.sound.harmony();
    const d = h.degAbove(0, 72);
    const times = [0, 0.085, 0.17, 0.27];
    [0, 2, 4, 7].forEach((k, i) => {
      const m = h.pitch(d + k);
      const lastNote = i === 3;
      kalimba(ctx, this.hall, t + times[i], m, lastNote ? 0.2 : 0.16, { decay: lastNote ? 0.7 : 0.25 });
      glock(ctx, this.halo, t + times[i], m + 12, lastNote ? 0.07 : 0.04, { decay: lastNote ? 0.9 : 0.3 });
    });
    flute(ctx, this.hall, t + 0.27, 0.35, h.pitch(d + 4), 0.06, { attack: 0.03, release: 0.4 });
    flute(ctx, this.hall, t + 0.27, 0.35, h.pitch(d + 7), 0.05, { attack: 0.03, release: 0.4 });
  }

  gameOver(t) {
    const ctx = this.ctx;
    const mel = [76, 74, 72, 71, 69];
    mel.forEach((m, i) => {
      const at = t + 0.15 + i * 0.27;
      const lastNote = i === mel.length - 1;
      kalimba(ctx, this.hall, at, m, lastNote ? 0.2 : 0.17, { decay: lastNote ? 0.9 : 0.4 });
      flute(ctx, this.hall, at, lastNote ? 1.3 : 0.24, m - 12, 0.05, { attack: 0.04, release: lastNote ? 1 : 0.2 });
    });
    const end = t + 0.15 + 4 * 0.27;
    pad(ctx, this.hall, end, 1.3, [53, 57, 60, 64], 0.1, { attack: 0.25, release: 1.6, cutoff: 900 });
    bass(ctx, this.room, end, 1.4, 41, 0.14);
  }

  timeUp(t) {
    const ctx = this.ctx;
    for (const at of [0, 0.2]) {
      glock(ctx, this.hall, t + at, 84, 0.2, { decay: 0.35 });
      kalimba(ctx, this.room, t + at, 72, 0.08);
    }
    for (const m of [84, 88, 91]) glock(ctx, this.hall, t + 0.4, m, 0.14, { decay: 1.1 });
    kalimba(ctx, this.room, t + 0.4, 72, 0.1, { decay: 0.6 });
  }

  ui(t, name) {
    if (!this.gate('ui', t, 0.045)) return;
    const ctx = this.ctx;
    const h = this.sound.harmony();
    const d = h.degAbove(h.rootDeg, 79);
    if (name === 'select') {
      marimba(ctx, this.room, t, h.pitch(d), 0.11);
    } else if (name === 'start') {
      noise(ctx, this.room, t, 0.04, { sweep: [600, 3000], q: 1, len: 0.25, shape: 'swell', peak: 0.7 });
      [0, 2, 4, 7].forEach((k, i) => musicbox(ctx, this.hall, t + i * 0.06, h.pitch(d - 7 + k), 0.12 + i * 0.02));
    } else if (name === 'save') {
      [2, 4, 7].forEach((k, i) => glock(ctx, this.hall, t + i * 0.08, h.pitch(h.degAbove(0, 72) + k), 0.13, { decay: i === 2 ? 0.8 : 0.3 }));
    } else {
      wood(ctx, this.room, t, 1500, 0.07);
    }
  }
}
