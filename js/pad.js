// Gamepad input with a guard against non-gamepad devices (wheels, joysticks, tablets) that the
// browser reports as gamepads and whose resting axes would otherwise spin the camera.
//   - only pads with mapping === 'standard', and none whose id looks like a wheel/joystick/etc.
//   - an axis only counts after it has been seen centred (|v| < 0.2)
//   - we switch to a pad only on a fresh button press, or a stick that was centred and then moved
const BAD_ID = /wheel|joystick|flight|pedal|tablet|throttle|rudder|hotas|yoke|stick/i;
const DEAD = 0.16;

export class Pad {
  constructor() { this.index = -1; this.prevButtons = []; this.centred = [false, false, false, false]; this.enabled = true; }
  candidates() {
    if (!navigator.getGamepads) return [];
    return [...navigator.getGamepads()].filter((p) => p && p.connected && p.mapping === 'standard' && !BAD_ID.test(p.id));
  }
  // returns null when no trusted pad is active
  poll() {
    if (!this.enabled) { this.index = -1; return null; }
    const pads = this.candidates();
    // adopt a pad only on a deliberate action
    for (const p of pads) {
      if (p.index === this.index) continue;
      const pressed = p.buttons.some((b, i) => b.pressed && !(this.prevButtons[p.index] || [])[i]);
      const moved = p.axes.slice(0, 4).some((v) => Math.abs(v) > 0.6); // only counts if it was centred last poll (below)
      if (pressed || (moved && this.wasCentred && this.wasCentred[p.index])) { this.index = p.index; this.centred = [false, false, false, false]; }
      this.wasCentred = this.wasCentred || {};
      this.wasCentred[p.index] = p.axes.slice(0, 4).every((v) => Math.abs(v) < 0.2);
    }
    for (const p of pads) this.prevButtonsSnap(p);
    const pad = pads.find((p) => p.index === this.index);
    if (!pad) { this.index = -1; return null; }
    const ax = pad.axes.slice(0, 4).map((v, i) => {
      if (!this.centred[i]) { if (Math.abs(v) < 0.2) this.centred[i] = true; return 0; }
      return Math.abs(v) < DEAD ? 0 : (v - Math.sign(v) * DEAD) / (1 - DEAD);
    });
    const down = pad.buttons.map((b) => b.pressed || b.value > 0.5);
    const was = this.lastDown || [];
    this.lastDown = down;
    return {
      lx: ax[0], ly: ax[1], rx: ax[2], ry: ax[3],
      down: (i) => !!down[i],
      pressed: (i) => !!down[i] && !was[i],
    };
  }
  prevButtonsSnap(p) { this.prevButtons[p.index] = p.buttons.map((b) => b.pressed); }
}
// standard mapping: 0 A · 1 B · 2 X · 3 Y · 4 LB · 5 RB · 6 LT · 7 RT · 8 Back · 9 Start · 10 L3 · 11 R3 · 12-15 D-pad up/down/left/right
export const BTN = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, BACK: 8, START: 9, L3: 10, R3: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };
