// POLLEN DRIFT -- the fixed scenes behind ?shot=start|play|end. Each one plays the real rules
// forward from a fresh world with a deterministic autopilot at the controls, so what a screenshot
// catches is a game that really happened, and the same seed always gives the same frame.
import { FIXED_STEP, NECTAR, STING, SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE } from './config.js';

export const SHOT_START = 'start';
export const SHOT_PLAY = 'play';
export const SHOT_END = 'end';

/** Seconds of play the 'play' scene runs for, and the most the 'end' scene will ever run. */
const PLAY_SECONDS = 18;
const END_STEPS_MAX = 60 * 300;
/** How full the pockets must be before the autopilot takes them home. */
const CARRY_FULL = 0.98;

/**
 * One step of a plain, honest pilot: sting a wasp that is in reach, else drink at the nearest
 * flower still holding nectar, else carry what it has back to the nest. It only ever reads the
 * world's own state, so it is deterministic and cannot cheat the rules.
 */
function fly(world) {
  const bee = world.bee;
  let target = world.nestPoint();
  let wasp = null;
  let nearest = STING.RANGE;
  for (const hunted of world.wasps) {
    const distance = Math.hypot(hunted.x - bee.x, hunted.y - bee.y);
    if (distance < nearest) {
      nearest = distance;
      wasp = hunted;
    }
  }
  if (wasp !== null) {
    world.setAim(wasp.x, wasp.y);
    world.sting();
    target = wasp;
  } else if (world.nestCarried() < world.nestCapacity() * CARRY_FULL) {
    let nearestFlower = null;
    let nearestDistance = Infinity;
    for (const flower of world.flowers) {
      if (flower.nectar <= 0.05) continue;
      const distance = Math.hypot(flower.x - bee.x, flower.y - bee.y);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestFlower = flower;
      }
    }
    if (nearestFlower !== null) target = nearestFlower;
  }
  const dx = target.x - bee.x;
  const dy = target.y - bee.y;
  const length = Math.hypot(dx, dy) || 1;
  bee.stickX = dx / length;
  bee.stickY = dy / length;
  return world.step(FIXED_STEP);
}

/** Run the pilot for `seconds` of fixed steps, or until the run ends; returns the last events. */
function run(world, seconds) {
  let events = 0;
  for (let i = 0; i < seconds / FIXED_STEP && !world.isOver(); i += 1) events = fly(world);
  return events;
}

/**
 * Set the world up as the named scene and paint it, returning { screen, info } for the caller to
 * paint again when it likes. An unknown name is the title scene.
 */
export function stageShot(world, renderer, name) {
  world.reset();
  let screen = SCREEN_TITLE;
  if (name === SHOT_PLAY) {
    run(world, PLAY_SECONDS);
    screen = SCREEN_PLAY;
  } else if (name === SHOT_END) {
    // Play on until the run is over -- with this pilot that is the energy running out -- and show
    // the end screen the score it earned, as a player who flew well but carried too much would.
    let steps = 0;
    while (!world.isOver() && steps < END_STEPS_MAX) {
      fly(world);
      steps += 1;
    }
    screen = SCREEN_OVER;
  } else {
    // The title scene still needs a living meadow behind it: a couple of seconds of the pilot.
    run(world, 2.5);
  }
  const info = {
    shot: name,
    best: 0,
    score: world.score(),
    level: world.level(),
    cause: world.overCause(),
    nestFull: world.nestFill() >= 1,
  };
  if (renderer !== undefined) renderer.draw(world, screen, info);
  return { screen, info };
}

export { NECTAR };
