import { Game } from './core/game.js';
import { modeConfig, MODES } from './core/modes.js';
import { bestMove } from './core/bot.js';
import { GameView } from './render/view.js';
import { Hud } from './ui/hud.js';
import { Controls } from './input/controls.js';
import { TouchControls } from './input/touch.js';
import * as screens from './ui/screens.js';
import { loadSettings, saveSettings } from './ui/scores.js';
import { Sound } from './audio/sound.js';

const AY = 1;

class App {
  constructor() {
    this.settings = loadSettings();
    this.selection = {
      modeId: '3d', presets: {}, gameMode: 'marathon', clearRule: 'well', ...(this.settings.selection ?? {}),
    };
    this.view = new GameView(document.getElementById('stage'));
    this.hud = new Hud(this);
    this.sound = new Sound(this.settings);
    this.controls = new Controls(this);
    this.touch = new TouchControls(this);
    this.state = 'menu';
    this.game = null;
    this.cfg = null;
    this.demo = null;
    this.applyQuality();
    window.addEventListener('resize', () => this.onResize());
    const unlock = () => this.sound.unlock();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'playing') this.pause();
    });
    this.toMenu();
    document.getElementById('loading').hidden = true;
    this.last = performance.now();
    requestAnimationFrame((t) => this.frame(t));
    // For tests and the curious.
    window.tesseris = this;
  }

  isPlaying() {
    return this.state === 'playing';
  }
  isPaused() {
    return this.state === 'paused';
  }

  saveSelection() {
    this.settings.selection = this.selection;
    saveSettings(this.settings);
  }
  saveSettings() {
    saveSettings(this.settings);
  }
  applyQuality() {
    const q = this.settings.quality;
    const dpr = window.devicePixelRatio || 1;
    const lowEnd = q === 'auto' && (navigator.hardwareConcurrency ?? 8) <= 4;
    this.view.renderer.setPixelRatio(q === 'low' || lowEnd ? 1 : Math.min(dpr, 2));
    this.view.shadowsAllowed = q !== 'low' && !lowEnd;
    this.view.resize();
    this.hud.layout();
  }

  onResize() {
    this.touch.measure();
    this.view.resize();
    if (this.game) this.hud.layout();
    else this.layoutDemo();
  }

  // ---------- title screen with a demo game behind it ----------
  toMenu() {
    this.state = 'menu';
    this.game = null;
    this.hud.hide();
    this.touch.hide();
    this.controls.releaseAll();
    this.startDemo();
    this.sound.music('menu');
    screens.showMenu(this);
  }

  startDemo() {
    const cfg = modeConfig('3d', 'classic');
    const g = new Game({ ...cfg, height: 10, size: [5, 15, 5], seed: (Math.random() * 1e9) | 0, lockDelay: 0.3 });
    g.start();
    this.demo = { game: g, plan: null, t: 0 };
    this.view.setGame(g);
    this.view.env.setDayTime(0.05, true);
    this.layoutDemo();
  }

  layoutDemo() {
    const w = window.innerWidth, h = window.innerHeight;
    if (w >= 1100) this.view.setBoardRect({ x: w * 0.58, y: h * 0.06, w: w * 0.4, h: h * 0.9 });
    else this.view.setBoardRect({ x: 0, y: h * 0.05, w, h: h * 0.95 });
  }

  updateDemo(dt) {
    const d = this.demo;
    if (!d) return;
    const g = d.game;
    g.update(dt);
    this.view.handleEvents(g.drainEvents());
    this.view.cam.yawTarget += dt * 0.12;
    if (g.state === 'over' || g.lines > 40) return this.startDemo();
    if (!g.piece) {
      d.plan = null;
      return;
    }
    if (!d.plan || d.plan.piece !== g.piece) {
      const best = bestMove(g);
      if (!best) return;
      d.plan = { piece: g.piece, target: best.pos, t: 0.25 };
      const pos = g.piece.pos.slice();
      if (g.fits(best.cells, pos)) g.piece.cells = best.cells.map((c) => c.slice());
      else {
        g.piece.cells = best.cells.map((c) => c.slice());
        g.piece.pos = [...best.pos.slice(0, AY), pos[AY], ...best.pos.slice(AY + 1)];
        if (!g.fits(g.piece.cells, g.piece.pos)) g.piece.pos = best.pos.slice();
      }
    }
    d.plan.t -= dt;
    if (d.plan.t > 0) return;
    d.plan.t = 0.11;
    let moved = false;
    for (const a of g.horizontal) {
      const diff = d.plan.target[a] - g.piece.pos[a];
      if (diff !== 0) {
        if (g.move(a, Math.sign(diff))) moved = true;
        else g.piece.pos[a] = d.plan.target[a];
        moved = true;
        break;
      }
    }
    if (!moved) {
      d.plan.t = 0.2;
      if (d.plan.ready) g.hardDrop();
      d.plan.ready = true;
    }
    this.view.handleEvents(g.drainEvents());
  }

  // ---------- a real game ----------
  startGame() {
    const sel = this.selection;
    const presetId = sel.presets[sel.modeId] ?? MODES[sel.modeId].default;
    const base = modeConfig(sel.modeId, presetId);
    this.cfg = { modeId: sel.modeId, presetId: base.presetId, gameMode: sel.gameMode, clearRule: base.dim >= 4 ? sel.clearRule : 'well' };
    this.game = new Game({ ...base, mode: sel.gameMode, clearRule: this.cfg.clearRule, timeLimit: 180 });
    this.demo = null;
    this.controls.releaseAll();
    this.view.setGame(this.game);
    this.view.env.setDayTime(0);
    screens.clearScreens();
    this.hud.show(this.game, this.cfg);
    this.touch.show(this.game.dim);
    this.hud.layout();
    this.state = 'playing';
    this.overTimer = 0;
    this.game.start();
    this.sound.music('game');
    this.sound.setLevel(1);
    this.sound.ui('start');
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.controls.releaseAll();
    this.sound.setPaused(true);
    screens.showPause(this);
  }

  resume() {
    if (this.state !== 'paused') return;
    screens.clearScreens();
    this.state = 'playing';
    this.sound.setPaused(false);
  }

  finish() {
    const g = this.game;
    this.state = 'over';
    this.controls.releaseAll();
    this.touch.hide();
    this.sound.music(null);
    screens.showGameOver(this, {
      cfg: this.cfg, dim: g.dim, score: g.score, lines: g.lines, level: g.level, pieces: g.pieces, time: g.time,
      reason: g.overReason, stats: g.stats,
    });
  }

  frame(t) {
    const dt = Math.min(0.05, Math.max(0, (t - this.last) / 1000));
    this.last = t;
    if (this.state === 'playing') {
      const g = this.game;
      this.controls.update(dt);
      g.update(dt);
      const events = g.drainEvents();
      this.view.handleEvents(events);
      this.hud.onEvents(events);
      this.sound.onEvents(events, g);
      for (const e of events) {
        if (e.type === 'levelUp') {
          this.view.env.setDayTime(Math.min(1, (e.level - 1) / 10));
          this.sound.setLevel(e.level);
        }
      }
      if (g.state === 'over') {
        this.state = 'ending';
        this.overTimer = 1.3;
        this.view.collapse?.();
      }
    } else if (this.state === 'ending') {
      this.overTimer -= dt;
      if (this.overTimer <= 0) this.finish();
    } else if (this.state === 'menu') {
      this.updateDemo(dt);
    }
    if (this.state !== 'paused') this.view.update(dt);
    if (this.game) this.hud.update();
    this.view.render();
    requestAnimationFrame((t2) => this.frame(t2));
  }
}

try {
  new App();
} catch (err) {
  console.error(err);
  const l = document.getElementById('loading');
  l.hidden = false;
  l.textContent = 'Nie udało się uruchomić gry (WebGL?): ' + err.message;
}
