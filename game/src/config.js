// POLLEN DRIFT -- every tuning number, colour and screen name in one place. The playfield is a
// fixed 960x540 logical area the renderer scales to the window, so no rule depends on the screen.
/** The logical playfield the simulation and the HUD are laid out in. */
export const CANVAS = { width: 960, height: 540 };
/** The fixed simulation step (60 Hz) and the longest frame the loop replays after a stall. */
export const FIXED_STEP = 1 / 60;
export const MAX_FRAME = 0.25;
/** Dawn meadow: sky warming to the horizon, meadow greens, a black-and-gold bee, a gold nest. */
export const PALETTE = {
  skyTop: '#2b4a6f',
  skyMid: '#f7c98b',
  skyBottom: '#7fb8d4',
  sun: '#fff1c9',
  sunGlow: 'rgba(255, 241, 201, 0.30)',
  hillFar: '#8fb98a',
  hillNear: '#6a994e',
  grass: '#6a994e',
  grassDark: '#4f7942',
  flowerYellow: '#ffd166',
  flowerOrange: '#ff8c42',
  flowerWhite: '#fff3e0',
  flowerCore: '#b06a1f',
  flowerStem: '#4f7942',
  bee: '#2b2b2b',
  beeStripe: '#ffd166',
  beeWing: 'rgba(255, 255, 255, 0.62)',
  eye: '#ff3b30',
  waitTint: 'rgba(0, 0, 0, 0.55)',
  nest: '#f2b134',
  nestDark: '#b87817',
  hive: '#b8434a',
  hiveDark: '#7d2b31',
  web: 'rgba(255, 255, 255, 0.42)',
  pollen: '#ffe9a8',
  ui: '#2b2b2b',
  uiLight: '#fff3e0',
  panel: 'rgba(26, 32, 44, 0.86)',
};
/** The UI font stack: system fonts only, so the page fetches nothing. */
export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
/** The bee answers the stick by accelerating; the air drags it back to a top speed. */
export const BEE = { ACCEL: 1400, DRAG: 3.2, MAX_SPEED: 340, RADIUS: 11, WING_HZ: 22, INVULN: 2 };
/** The sting: aimed with the mouse, thrown on a click, useless while it recovers. */
export const STING = { COOLDOWN: 0.5, RANGE: 52, ARC: 0.85, TIME: 0.16, GLOW_TIME: 0.30 };
/**
 * Energy is the clock of a run. It always drains and drains faster while the bee is steering; a
 * wasp's sting costs a chunk of it; drinking buys it back, so a bee that works survives and an
 * idle one does not.
 */
export const ENERGY = { MAX: 100, DRAIN: 1.5, BOOST: 1.2, LOW: 25 };
/** Nectar: one flower's worth, how many flowers the bee can carry, the nest, lives, the round clock. */
export const NECTAR = {
  PER_FLOWER: 14, CARRY: 3, HIVE_CAPACITY: 120, LIVES: 3, LEVEL_TIME: 75,
  DRINK_TIME: 1, ENERGY_GAIN: 0.3, PICK_RANGE: 22,
};
/** The wind: a steady push that turns every few seconds and grows a little with the level. */
export const WIND = { MIN: 18, MAX: 90, CHANGE: 6 };
/** Flowers: how many, how big, how long a picked one stays empty before it grows back (4 to 7 s). */
export const FLOWER = { COUNT: 22, RADIUS: 13, BLOOM_TIME: 0.7, REGROW_MIN: 4, REGROW_MAX: 7, SPAWN_PAD: 60 };
/** Where a run starts and where it ends: the nest, at the left edge of the meadow. */
export const NEST = { RADIUS: 34, DEPOSIT_RANGE: 42, START_X: 96, START_Y: 300 };
/** The hive stingers that hunt the bee: each level starts them sooner and flies them faster. */
export const HIVE = {
  SPEED: 120, SPEED_PER_LEVEL: 9, WANDER: 0.9, KNOCKBACK: 210, AVOID_WALL: 46,
  COUNT_START: 1, COUNT_PER_LEVEL: 1, COUNT_MAX: 6, FIRST_DELAY: 9, DELAY_PER_LEVEL: 0.6, DELAY_MIN: 3,
  STING_ENERGY: 8, STING_COOLDOWN: 1.4, STING_SCORE: 50,
  /** How long the meadow is left to the bee before the first wasp arrives. */
  OPENING_GRACE: 12,
};
/** Spider webs: sticky polygons that slow the bee for a moment and cost it some of its energy. */
export const WEB = {
  COUNT_START: 2, COUNT_PER_LEVEL: 1, COUNT_MAX: 7, RADIUS: 26,
  SPEED_FACTOR: 0.2, SLOW_TIME: 1.5, ENERGY_COST: 4,
};
/** The last level the speeds, counts and spawn rates grow to. */
export const LEVEL = { MAX: 8 };
/** What nectar pays at the nest, what a full nest pays, and what the round's own clock is worth. */
export const SCORE = { DEPOSIT: 1, NEST: 250, CLOCK: 2 };
/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'pollen-drift.best';
/** The four screens the game moves between. */
export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
