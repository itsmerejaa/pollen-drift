// POLLEN DRIFT -- boot and the one loop. Input is read once a frame, the world advances in fixed
// 1/60 s steps (never more than four in a frame, so a slow frame slows the game instead of skipping
// it), the sounds the world's events ask for are played, and the renderer paints what is there.
//
// The game moves between four screens: title, play, paused and over. ?seed=N fixes the meadow and the
// wasps, so a run can be repeated. ?shot=start|play|end stages one fixed scene instead of running the
// loop and sets window.__shotReady when the frame is on the canvas, which is how a screenshot is taken.
import { BEST_KEY, FIXED_STEP, MAX_FRAME } from './config.js';
import {
  EVENT_DEPOSIT, EVENT_LEVEL, EVENT_NECTAR, EVENT_OVER, EVENT_STING, createWorld,
} from './world.js';
import {
  ACTION_BOOST, ACTION_CONFIRM, ACTION_DOWN, ACTION_LEFT, ACTION_PAUSE, ACTION_RIGHT, ACTION_STING,
  ACTION_UP, createInput,
} from './input.js';
import { SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, createRenderer } from './render.js';
import { createAudio } from './audio.js';
import { stageShot } from './shots.js';

/** The most fixed steps one frame may run: past this the game slows rather than lurching. */
const MAX_STEPS = 4;
/** How hard a sting shakes the camera, and how strong its flash is. */
const STING_SHAKE = 11;
const STING_FLASH = 0.4;
/** The bee's top speed, for turning its velocity into how hard the wings are working (0 to 1). */
const TOP_SPEED = 340;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const input = createInput(canvas);
const renderer = createRenderer(canvas);
const audio = createAudio();
const world = createWorld(seed);
/** ui carries what the picture should do this frame: the step it took, and any shake or flash. */
const ui = { dt: FIXED_STEP, shake: 0, flash: 0 };

let screen = SCREEN_TITLE;
let accumulator = 0;
let last = performance.now();
let best = readBest();

/** The best score on this browser, and nothing more: a private window simply has no history. */
function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off: the best score then lasts this visit only.
  }
}

/**
 * The sounds one step of the world asks for. The world reports what happened as bits and knows nothing
 * about audio, so this is the only place the two meet.
 */
function play(events) {
  if (events & EVENT_NECTAR) audio.nectar();
  if (events & EVENT_DEPOSIT) audio.deposit();
  if (events & EVENT_STING) {
    audio.sting();
    ui.shake = STING_SHAKE;
    ui.flash = STING_FLASH;
  }
  if (events & EVENT_LEVEL) audio.level();
  if (events & EVENT_OVER) audio.over();
}

/** Start a round from the top: a fresh meadow, and sound awake. */
function startRound() {
  world.reset();
  accumulator = 0;
  screen = SCREEN_PLAY;
  audio.resume();
}

/** End a round: bank the score, and remember it when it is the best this browser has seen. */
function endRound() {
  screen = SCREEN_OVER;
  if (world.score() > best) {
    best = world.score();
    saveBest(best);
  }
}

/** The keys that move between screens, in the order the screens go: title, play, paused, over. */
function changeScreen() {
  if (screen === SCREEN_TITLE) {
    if (input.wasPressed(ACTION_CONFIRM) || input.wasPressed(ACTION_STING)) startRound();
  } else if (screen === SCREEN_OVER) {
    // "Fly again" is a new round; pause is there for anyone who wants the title screen first.
    if (input.wasPressed(ACTION_CONFIRM)) startRound();
    else if (input.wasPressed(ACTION_PAUSE)) {
      screen = SCREEN_TITLE;
      audio.suspend();
    }
  } else if (screen === SCREEN_PLAY && input.wasPressed(ACTION_PAUSE)) {
    screen = SCREEN_PAUSED;
    audio.suspend();
  } else if (screen === SCREEN_PAUSED && (input.wasPressed(ACTION_PAUSE) || input.wasPressed(ACTION_CONFIRM))) {
    screen = SCREEN_PLAY;
    audio.resume();
  }
}

/** The bee's stick, from the keys the player is holding, as a direction of at most length one. */
function steer() {
  let x = (input.isDown(ACTION_RIGHT) ? 1 : 0) - (input.isDown(ACTION_LEFT) ? 1 : 0);
  let y = (input.isDown(ACTION_DOWN) ? 1 : 0) - (input.isDown(ACTION_UP) ? 1 : 0);
  const length = Math.hypot(x, y);
  if (length > 0) {
    x /= length;
    y /= length;
  }
  const boost = input.isDown(ACTION_BOOST) ? 1.35 : 1;
  world.bee.stickX = x * boost;
  world.bee.stickY = y * boost;
  // Aim with the mouse; a click (or Space) throws the sting at what it points at.
  const aim = input.mouseWorld();
  world.setAim(aim.x, aim.y);
  if (input.wasPressed(ACTION_STING)) {
    if (world.nestAimed(aim.x, aim.y)) {
      // A click on the nest is a request to set down, not to sting: the bee points itself home.
      const home = world.nestPoint();
      const dx = home.x - world.bee.x;
      const dy = home.y - world.bee.y;
      const span = Math.hypot(dx, dy) || 1;
      world.bee.stickX = dx / span;
      world.bee.stickY = dy / span;
    } else if (world.sting()) {
      audio.sting();
      ui.shake = STING_SHAKE * 0.6;
    }
  }
  // The wings answer the stick: the faster the bee is going, the harder they work.
  audio.wing(Math.min(1, Math.hypot(world.bee.vx, world.bee.vy) / TOP_SPEED + (boost > 1 ? 0.2 : 0)));
}

/** One frame: read the input, advance the world in fixed steps, play the news, paint. */
function frame(now) {
  requestAnimationFrame(frame);
  const elapsed = Math.min((now - last) / 1000, MAX_FRAME);
  last = now;
  ui.shake *= 0.86;
  ui.flash *= 0.82;
  input.update();
  changeScreen();
  // Paused and finished screens hold the world still: only the picture keeps breathing.
  if (screen === SCREEN_PLAY) {
    accumulator += elapsed;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < MAX_STEPS && screen === SCREEN_PLAY) {
      play(world.step(FIXED_STEP));
      accumulator -= FIXED_STEP;
      steps += 1;
      if (world.isOver()) {
        endRound();
        break;
      }
      steer();
      audio.updateEnergy(world.energy01());
      audio.setWind(world.windVector().strength);
    }
    // Whatever the frame could not absorb is dropped, so the game never tries to catch up forever.
    if (accumulator > FIXED_STEP * MAX_STEPS) accumulator = 0;
  } else {
    accumulator = 0;
    audio.wing(0);
  }
  ui.dt = elapsed;
  renderer.paint(world, screen, ui);
}

/** The first real gesture is what lets the browser make a sound at all. */
function unlockAudio() {
  audio.unlock();
}

window.addEventListener('keydown', unlockAudio);
window.addEventListener('pointerdown', unlockAudio);
// A hidden tab is silence, not a bee flying into a wasp nobody can see.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    audio.suspend();
    if (screen === SCREEN_PLAY) screen = SCREEN_PAUSED;
  } else if (screen === SCREEN_PAUSED) {
    audio.resume();
  }
});

if (shot !== null) {
  // A fixed scene for a screenshot: stage it, paint it twice so nothing is half-drawn, and report.
  const staged = stageShot(world, undefined, shot);
  renderer.paint(world, staged.screen, { dt: FIXED_STEP, shake: 0, flash: 0 });
  renderer.paint(world, staged.screen, { dt: FIXED_STEP, shake: 0, flash: 0 });
  window.__shotInfo = { shot, seed, best, ...staged.info };
  window.__shotReady = true;
} else {
  requestAnimationFrame(frame);
}
