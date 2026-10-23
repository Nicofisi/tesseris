// All game audio: procedural music and synthesized effects, no audio files.
// Graph: music (dry + reverb send) → pause lowpass ┐
//        effects (dry + reverb send)              ├→ gentle compressor → master → speakers
//        shared reverb ───────────────────────────┘
// Without Web Audio (or before the first user gesture) every method is a quiet no-op.
import { impulse } from './synth.js';
import { GameTrack, MenuTrack, DEFAULT_HARMONY } from './music.js';
import { Sfx } from './sfx.js';

const MUSIC_LEVEL = 0.5;
const SFX_LEVEL = 0.8;
const clamp01 = (v, d) => (typeof v === 'number' && isFinite(v) ? Math.max(0, Math.min(1, v)) : d);
const curve = (v) => v * v;
const hidden = () => typeof document !== 'undefined' && document.hidden;

export class Sound {
  constructor(settings, opts = {}) {
    this.vol = { music: clamp01(settings?.music, 0.6), sfx: clamp01(settings?.sfx, 0.8) };
    this.ctx = null;
    this.dead = false;
    this.resuming = false;
    this.want = null;
    this.current = null;
    this.tracks = [];
    this.level = 1;
    this.paused = false;
    this.timer = null;
    this.manual = false;
    if (opts?.context) this.attach(opts.context, true);
  }

  // ---- context and graph ----
  unlock() {
    const c = this.ctx;
    if ((c && c.state === 'running') || this.dead) return;
    try {
      if (!c) {
        const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
        if (!AC) {
          this.dead = true;
          return;
        }
        let ctx;
        try {
          ctx = new AC({ latencyHint: 'interactive' });
        } catch {
          ctx = new AC();
        }
        this.attach(ctx);
        // iOS: a silent buffer inside the gesture wakes the output.
        const s = ctx.createBufferSource();
        s.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
        s.connect(ctx.destination);
        s.onended = () => s.disconnect();
        s.start(0);
      }
      const ctx = this.ctx;
      if (ctx.state !== 'running' && ctx.state !== 'closed' && !this.resuming) {
        this.resuming = true;
        const done = () => {
          this.resuming = false;
          this.applyMusic(false);
        };
        const p = ctx.resume();
        if (p && p.then) p.then(done, done);
        else done();
      }
      if (ctx.state === 'running') this.applyMusic(false);
    } catch {
      if (!this.fx) {
        this.ctx = null;
        this.dead = true;
      }
    }
  }

  // Builds the graph on a context. manual = no timer (offline rendering drives scheduleUntil itself).
  attach(ctx, manual = false) {
    this.ctx = ctx;
    this.manual = manual;
    const gain = (v = 1) => {
      const g = ctx.createGain();
      g.gain.value = v;
      return g;
    };
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.knee.value = 6;
    comp.ratio.value = 4;
    comp.attack.value = 0.003;
    comp.release.value = 0.2;
    this.master = gain(0.9);
    comp.connect(this.master).connect(ctx.destination);
    this.comp = comp;

    this.reverb = ctx.createConvolver();
    this.reverb.buffer = impulse(ctx, 1.8);
    const ret = gain(0.7);
    this.reverb.connect(ret).connect(comp);

    // Music: dry and reverb send both pass a fader and a lowpass that muffles it in the pause menu.
    const lowpass = () => {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 18000;
      f.Q.value = 0.6;
      return f;
    };
    this.mIn = gain(0);
    this.mRev = gain(0);
    this.mLP = [lowpass(), lowpass()];
    this.mIn.connect(this.mLP[0]).connect(comp);
    this.mRev.connect(this.mLP[1]).connect(this.reverb);

    this.sIn = gain(0);
    this.sRev = gain(0);
    this.sIn.connect(comp);
    this.sRev.connect(this.reverb);

    this.fx = new Sfx(this);
    this.applyGains(0);
  }

  applyGains(tau = 0.06) {
    const ctx = this.ctx;
    if (!ctx || !this.mIn) return;
    const now = ctx.currentTime;
    const set = (param, v) => {
      if (tau > 0) param.setTargetAtTime(v, now, tau);
      else param.setValueAtTime(v, now);
    };
    const m = curve(this.vol.music) * MUSIC_LEVEL * (this.paused ? 0.45 : 1);
    const s = curve(this.vol.sfx) * SFX_LEVEL;
    set(this.mIn.gain, m);
    set(this.mRev.gain, m);
    set(this.sIn.gain, s);
    set(this.sRev.gain, s);
    for (const f of this.mLP) set(f.frequency, this.paused ? 650 : 18000);
  }

  // ---- public controls ----
  setVolumes(v) {
    try {
      this.vol.music = clamp01(v?.music, this.vol.music);
      this.vol.sfx = clamp01(v?.sfx, this.vol.sfx);
      this.applyGains(0.05);
      this.ensureTimer();
    } catch {
      /* never break the game */
    }
  }

  music(name) {
    try {
      this.want = name === 'game' || name === 'menu' ? name : null;
      if (this.paused) {
        this.paused = false;
        this.applyGains(0.1);
      }
      this.applyMusic(true);
    } catch {
      /* never break the game */
    }
  }

  setLevel(level) {
    const l = typeof level === 'number' ? level : 1;
    this.level = isFinite(l) ? Math.max(1, Math.min(30, Math.round(l))) : 1;
  }

  setPaused(on) {
    try {
      this.paused = !!on;
      this.applyGains(0.12);
    } catch {
      /* never break the game */
    }
  }

  ui(name) {
    try {
      this.unlock();
      const ctx = this.ctx;
      if (!ctx || ctx.state === 'closed' || this.vol.sfx <= 0) return;
      this.fx.ui(ctx.currentTime + 0.005, name);
    } catch {
      /* never break the game */
    }
  }

  onEvents(events, game) {
    if (!events || !events.length) return;
    try {
      let has = null;
      for (const e of events) {
        if (!e) continue;
        (has ??= {})[e.type] = e;
      }
      if (!has) return;
      if (has.gameOver || has.timeUp) this.endMusic();
      const ctx = this.ctx;
      if (!ctx || ctx.state !== 'running' || this.vol.sfx <= 0) return;
      const fx = this.fx;
      const t = ctx.currentTime + 0.005;
      let moved = false;
      let clearLen = 0;
      for (const e of events) {
        switch (e?.type) {
          case 'move':
            if (!moved) fx.move(t, e);
            moved = true;
            break;
          case 'bump':
            if (!moved) fx.bump(t, e);
            break;
          case 'rotate':
            fx.rotate(t, e);
            break;
          case 'rotateFail':
            fx.rotateFail(t, e);
            break;
          case 'fall':
            if (e.soft && !has.hardDrop && !has.lock) fx.softFall(t, e);
            break;
          case 'hardDrop':
            fx.hardDrop(t, e);
            break;
          case 'lock':
            fx.lock(t, e, has.clear ? 0.35 : has.hardDrop ? 0.6 : 1);
            break;
          case 'clear':
            clearLen = Math.max(clearLen, fx.clear(t, e));
            break;
          case 'hold':
            fx.hold(t, e);
            break;
          case 'gameOver':
            fx.gameOver(t, e);
            break;
          case 'timeUp':
            fx.timeUp(t, e);
            break;
        }
      }
      if (has.levelUp) fx.levelUp(t + (clearLen ? clearLen + 0.08 : 0), has.levelUp, game);
    } catch {
      /* never break the game */
    }
  }

  // ---- music ----
  // The key and chord sounding right now (effects pick their notes from it).
  harmony() {
    const ctx = this.ctx;
    return (ctx && this.current?.harmonyAt(ctx.currentTime)) || DEFAULT_HARMONY;
  }

  endMusic() {
    this.want = null;
    const ctx = this.ctx;
    if (!ctx || !this.current) return;
    this.current.fadeOut(ctx.currentTime, 1.8);
    this.current = null;
  }

  // fresh: a new request from the game (restarts the game track); otherwise only fills a gap.
  applyMusic(fresh) {
    const ctx = this.ctx;
    if (!ctx || ctx.state === 'closed') return;
    const name = this.want;
    const cur = this.current;
    if (cur && cur.name === name && !(fresh && name === 'game')) return this.ensureTimer();
    if (!cur && !name) return;
    const now = ctx.currentTime;
    if (cur) {
      cur.fadeOut(now, name ? 1 : 1.2);
      this.current = null;
    }
    if (name) {
      const Track = name === 'game' ? GameTrack : MenuTrack;
      const tr = new Track(this, now + (name === 'game' ? 0.3 : 0.1));
      this.current = tr;
      this.tracks.push(tr);
    }
    this.ensureTimer();
  }

  ensureTimer() {
    if (this.timer || this.manual || !this.ctx || !this.tracks.length) return;
    if (this.vol.music <= 0) return this.freeze();
    this.timer = setTimeout(() => this.tick(), 0);
  }

  // Music muted: drop fading tracks and stop scheduling; the current track resumes where it was.
  freeze() {
    this.tracks = this.tracks.filter((tr) => {
      if (tr === this.current) return true;
      tr.dispose();
      return false;
    });
  }

  tick() {
    this.timer = null;
    if (!this.ctx) return;
    try {
      if (this.vol.music <= 0) return this.freeze();
      this.scheduleUntil(this.ctx.currentTime + (hidden() ? 1.5 : 0.2));
    } catch {
      /* keep the loop alive */
    }
    if (this.tracks.length && this.vol.music > 0) this.timer = setTimeout(() => this.tick(), 40);
  }

  scheduleUntil(until) {
    const now = this.ctx.currentTime;
    for (const tr of this.tracks) {
      // Fell behind (throttled timer, suspended context): skip ahead instead of a burst of notes.
      if (tr.next < now) tr.next = now + 0.03;
      try {
        tr.schedule(until);
      } catch {
        tr.endAt = 0;
      }
    }
    this.tracks = this.tracks.filter((tr) => {
      if (tr === this.current || now < tr.endAt + 3) return true;
      tr.dispose();
      return false;
    });
  }
}
