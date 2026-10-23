// Gamepads (standard mapping). Buttons press the same actions as the keyboard.
//  2D: d-pad/left stick move, ↓ faster, ↑ drop, A/Y turn right, B/X turn left, LB/RB hold.
//  3D+: d-pad/left stick move, right stick tilts the piece, LB/RB spin, A drop, B faster, X hold,
//       LT held = between wells (4D/5D), RT turns the camera, Back = top view, Start = pause.
const B = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, BACK: 8, START: 9, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };

const MAP_2D = {
  [B.LEFT]: 'left', [B.RIGHT]: 'right', [B.DOWN]: 'soft', [B.UP]: 'hard',
  [B.A]: 'cw', [B.Y]: 'cw', [B.B]: 'ccw', [B.X]: 'ccw', [B.LB]: 'hold', [B.RB]: 'hold',
};
const MAP_ND = {
  [B.LEFT]: 'left', [B.RIGHT]: 'right', [B.UP]: 'up', [B.DOWN]: 'down',
  [B.A]: 'hard', [B.B]: 'soft', [B.X]: 'hold', [B.LB]: 'spinL', [B.RB]: 'spinR', [B.RT]: 'camR', [B.BACK]: 'camTop',
};

export class GamepadInput {
  constructor(app) {
    this.app = app;
    this.prev = new Map(); // id -> pressed
  }

  update() {
    const pads = navigator.getGamepads?.() ?? [];
    for (const gp of pads) {
      if (!gp || !gp.connected) continue;
      const state = new Map();
      gp.buttons.forEach((b, i) => state.set('b' + i, b.pressed || b.value > 0.5));
      const [lx = 0, ly = 0, rx = 0, ry = 0] = gp.axes;
      state.set('ls-left', lx < -0.6);
      state.set('ls-right', lx > 0.6);
      state.set('ls-up', ly < -0.6);
      state.set('ls-down', ly > 0.6);
      state.set('rs-left', rx < -0.7);
      state.set('rs-right', rx > 0.7);
      state.set('rs-up', ry < -0.7);
      state.set('rs-down', ry > 0.7);
      for (const [key, on] of state) {
        const id = `gp${gp.index}-${key}`;
        const was = this.prev.get(id) ?? false;
        if (on && !was) this.down(gp, key);
        if (!on && was) this.app.controls.release(id);
        this.prev.set(id, on);
      }
    }
  }

  down(gp, key) {
    const app = this.app;
    const id = `gp${gp.index}-${key}`;
    if (key === 'b' + B.START) {
      if (app.isPlaying()) app.pause();
      else if (app.isPaused()) app.resume();
      else if (app.state === 'menu') app.startGame();
      return;
    }
    if (!app.isPlaying()) return;
    const dim = app.game.dim;
    const hyper = gp.buttons[B.LT]?.pressed ?? false;
    let action = null;
    if (key.startsWith('b')) action = (dim === 2 ? MAP_2D : MAP_ND)[Number(key.slice(1))];
    else if (key.startsWith('ls-')) action = dim === 2 && key === 'ls-up' ? null : dim === 2 && key === 'ls-down' ? 'soft' : key.slice(3);
    else if (key.startsWith('rs-') && dim >= 3) action = { 'rs-left': 'tipL', 'rs-right': 'tipR', 'rs-up': 'tipF', 'rs-down': 'tipB' }[key];
    if (action) app.controls.press(id, action, hyper);
  }

  rumble(strength = 0.5, ms = 120) {
    for (const gp of navigator.getGamepads?.() ?? []) {
      gp?.vibrationActuator?.playEffect?.('dual-rumble', { duration: ms, strongMagnitude: strength, weakMagnitude: strength * 0.6 }).catch?.(() => {});
    }
  }
}
