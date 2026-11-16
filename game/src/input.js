// POLLEN DRIFT -- keyboard and pointer input. Held keys are a state the bee reads every frame (fly
// up, down, left, right, boost); one-shot presses are edges it reads once (sting, pause, confirm), so
// a press between two frames is never lost and never counted twice. The mouse gives the sting its
// aim, in the field's own 960x540 coordinates whatever the window is doing.
import { CANVAS } from './config.js';

export const ACTION_UP = 1;
export const ACTION_DOWN = 2;
export const ACTION_LEFT = 4;
export const ACTION_RIGHT = 8;
export const ACTION_BOOST = 16;
export const ACTION_STING = 32;
export const ACTION_PAUSE = 64;
export const ACTION_CONFIRM = 128;

/** The key codes that mean what, by physical key, so the layout of the keyboard does not matter. */
const KEYS = new Map([
  ['KeyW', ACTION_UP], ['ArrowUp', ACTION_UP],
  ['KeyS', ACTION_DOWN], ['ArrowDown', ACTION_DOWN],
  ['KeyA', ACTION_LEFT], ['ArrowLeft', ACTION_LEFT],
  ['KeyD', ACTION_RIGHT], ['ArrowRight', ACTION_RIGHT],
  ['ShiftLeft', ACTION_BOOST], ['ShiftRight', ACTION_BOOST],
  ['Space', ACTION_STING],
  ['KeyP', ACTION_PAUSE], ['Escape', ACTION_PAUSE],
  ['Enter', ACTION_CONFIRM], ['NumpadEnter', ACTION_CONFIRM],
]);
/** The left button, and the only one that stings. */
const LEFT_BUTTON = 0;

export function createInput(canvas) {
  const held = new Set();
  /** Presses since the last update, and the ones the current frame gets to read. */
  let fresh = 0;
  let latched = 0;
  /** Where the mouse is, in client coordinates; null until it has been moved at least once. */
  let pointerX = null;
  let pointerY = null;

  function press(action) {
    if (held.has(action)) return;
    held.add(action);
    fresh |= action;
  }

  function release(action) {
    held.delete(action);
  }

  window.addEventListener('keydown', (event) => {
    const action = KEYS.get(event.code);
    if (action === undefined) return;
    event.preventDefault();
    if (!event.repeat) press(action);
  });
  window.addEventListener('keyup', (event) => {
    const action = KEYS.get(event.code);
    if (action !== undefined) release(action);
  });
  // A key held while the window lost focus never sends keyup: let go of everything instead.
  window.addEventListener('blur', () => {
    held.clear();
    fresh = 0;
    latched = 0;
  });
  window.addEventListener('pointermove', (event) => {
    pointerX = event.clientX;
    pointerY = event.clientY;
  });
  canvas.addEventListener('pointerdown', (event) => {
    if (event.button !== LEFT_BUTTON) return;
    event.preventDefault();
    pointerX = event.clientX;
    pointerY = event.clientY;
    press(ACTION_STING);
  });
  window.addEventListener('pointerup', (event) => {
    if (event.button === LEFT_BUTTON) release(ACTION_STING);
  });
  // Right-clicking the canvas must not open a menu over the meadow.
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  return {
    /** Latch this frame's presses and forget the rest; call once at the top of every frame. */
    update() {
      latched = fresh;
      fresh = 0;
    },
    /** Forget every key and every pending press: a new screen never inherits the last one's keys. */
    clear() {
      held.clear();
      fresh = 0;
      latched = 0;
    },
    /** Whether the action is being held down right now. */
    isDown(action) {
      return held.has(action);
    },
    /** Whether the action was pressed in the frame that is being drawn. */
    wasPressed(action) {
      return (latched & action) !== 0;
    },
    /** The mouse in the field's coordinates: 0,0 the top-left of the meadow, 960,540 the bottom-right. */
    mouseWorld() {
      const rect = canvas.getBoundingClientRect();
      if (pointerX === null) return { x: CANVAS.width / 2, y: CANVAS.height / 2 };
      const scaleX = rect.width === 0 ? 1 : CANVAS.width / rect.width;
      const scaleY = rect.height === 0 ? 1 : CANVAS.height / rect.height;
      return { x: (pointerX - rect.left) * scaleX, y: (pointerY - rect.top) * scaleY };
    },
  };
}
