// POLLEN DRIFT -- all the state and all the rules, and no drawing: the bee, the meadow of flowers,
// the golden nest, the wasps that hunt it, the spider webs and the wind. step(dt) advances one fixed
// step and returns that step's events as bit flags, so the caller can play a sound or flash the screen
// without the world knowing what a screen or a sound is.
import { BEE, CANVAS, ENERGY, FIXED_STEP, FLOWER, HIVE, LEVEL, NECTAR, NEST, SCORE, STING, WEB, WIND } from './config.js';
import { createRandom, range } from './random.js';

export const EVENT_NECTAR = 1;
export const EVENT_DEPOSIT = 2;
export const EVENT_STING = 4;
export const EVENT_LEVEL = 8;
export const EVENT_OVER = 16;

/** Why a run ended: the bee ran out of energy, or the wasps got it a third time. */
export const OVER_ENERGY = 'energy';
export const OVER_STINGS = 'stings';

/** What a wasp is doing: hunting the bee, running from the first sting, or sitting out one it gave. */
export const WASP_HUNT = 'hunt';
export const WASP_FLEE = 'flee';
export const WASP_RESTING = 'resting';
const FLEE_TIME = 1.6;
const REST_TIME = 1.4;

export function createWorld(seed) {
  // The meadow is laid out once, from a shuffled jittered grid: evenly spread, never a neat row.
  // Rejection sampling draws a number for every flower it turns down, so the layout runs on its own
  // stream seeded from the player's seed -- the served pattern is still exactly repeatable.
  const layout = createRandom(seed ^ 0x9e3779b9);
  // Every rule that draws while the game runs shares one stream, so no path changes the count.
  const random = createRandom(seed);
  // The step's events, as the caller can also read them back without watching the return value.
  const world = { events: 0 };

  const bee = {
    x: NEST.START_X, y: NEST.START_Y, vx: 0, vy: 0, carried: 0,
    capacity: NECTAR.PER_FLOWER * NECTAR.CARRY, energy: ENERGY.MAX, stings: NECTAR.LIVES,
    invuln: 0, stuck: 0, cooldown: 0, aim: 0, stickX: 0, stickY: 0, flap: 0, energyGlow: 0,
  };
  const nest = { x: NEST.START_X, y: NEST.START_Y, fill: 0, deposited: 0 };
  const flowers = [];
  const wasps = [];
  const webs = [];
  const wind = { x: 0, y: 0, strength: WIND.MIN, time: 0 };
  const state = { score: 0, level: 1, time: 0, levelTime: 0, over: false, cause: null, deliveries: 0 };

  // A shuffled jittered grid, one flower per cell, each nudged inside its own cell and kept out of
  // the nest's mouth (a flower there would be drinkable without ever being deposited).
  {
    const columns = Math.max(1, Math.round(Math.sqrt(FLOWER.COUNT * (CANVAS.width / CANVAS.height))));
    const rows = Math.ceil(FLOWER.COUNT / columns);
    const cells = [];
    for (let r = 0; r < rows; r += 1) for (let c = 0; c < columns; c += 1) cells.push([c, r]);
    for (let i = cells.length - 1; i > 0; i -= 1) {
      const j = Math.floor(layout() * (i + 1));
      const held = cells[i];
      cells[i] = cells[j];
      cells[j] = held;
    }
    const cellW = CANVAS.width / columns;
    const top = 130 + FLOWER.SPAWN_PAD;
    const cellH = (CANVAS.height - top - FLOWER.SPAWN_PAD * 0.4) / rows;
    const placed = [];
    for (let i = 0; i < FLOWER.COUNT; i += 1) {
      const [c, r] = cells[i];
      const spot = { x: cellW * (c + 0.22 + layout() * 0.56), y: top + cellH * (r + 0.28 + layout() * 0.44) };
      if (Math.hypot(spot.x - NEST.START_X, spot.y - NEST.START_Y) < NEST.DEPOSIT_RANGE + 18) {
        spot.x = Math.min(CANVAS.width - FLOWER.SPAWN_PAD, NEST.START_X + NEST.DEPOSIT_RANGE + 40);
      }
      for (let guard = 0; guard < 8; guard += 1) {
        let clear = true;
        for (let j = 0; j < placed.length && clear; j += 1) {
          if (Math.hypot(spot.x - placed[j].x, spot.y - placed[j].y) < 46) clear = false;
        }
        if (clear) break;
        spot.x = range(layout, FLOWER.SPAWN_PAD, CANVAS.width - FLOWER.SPAWN_PAD);
        spot.y = range(layout, top, CANVAS.height - FLOWER.SPAWN_PAD * 0.4);
      }
      placed.push(spot);
      flowers.push({
        x: spot.x, y: spot.y, nectar: 0.6 + layout() * 0.4, bloom: 0.4 + layout() * 0.6,
        grow: 0, sway: layout() * Math.PI * 2, kind: Math.floor(layout() * 3), size: 0.85 + layout() * 0.35,
      });
    }
  }

  /** An open spot clear of the nest, the flowers and the webs already there; null when there is none. */
  function openSpot(radius, tries) {
    for (let i = 0; i < tries; i += 1) {
      const x = range(random, radius + 12, CANVAS.width - radius - 12);
      const y = range(random, 150, CANVAS.height - radius - 12);
      if (Math.hypot(x - nest.x, y - nest.y) < NEST.RADIUS * 2.2) continue;
      let clear = true;
      for (let f = 0; f < flowers.length && clear; f += 1) {
        if (Math.hypot(x - flowers[f].x, y - flowers[f].y) < radius + FLOWER.RADIUS) clear = false;
      }
      for (let w = 0; w < webs.length && clear; w += 1) {
        if (Math.hypot(x - webs[w].x, y - webs[w].y) < radius + webs[w].radius) clear = false;
      }
      if (clear) return { x, y };
    }
    return null;
  }

  /** The wind: a new strength and heading, up to WIND_MAX and a little past it with each level. */
  function turnWind() {
    wind.strength = range(random, WIND.MIN, Math.min(WIND.MAX, WIND.MAX * (1 + (state.level - 1) * 0.06)));
    const angle = random() * Math.PI * 2;
    wind.x = Math.cos(angle) * wind.strength;
    wind.y = Math.sin(angle) * wind.strength;
    wind.time = WIND.CHANGE * (0.6 + random() * 0.8);
  }

  /** A wasp enters from a random edge, so it is never on top of the bee at the moment it arrives. */
  function addWasp() {
    const edge = Math.floor(random() * 4);
    const x = edge === 1 ? CANVAS.width + 30 : edge === 3 ? -30 : range(random, 0, CANVAS.width);
    const y = edge === 0 ? -30 : edge === 2 ? CANVAS.height + 30 : range(random, 0, CANVAS.height);
    wasps.push({
      x, y, vx: 0, vy: 0, mode: WASP_HUNT, hold: 0, hurt: 0, wander: random() * Math.PI * 2,
      speed: HIVE.SPEED + (state.level - 1) * HIVE.SPEED_PER_LEVEL,
    });
  }

  /** A web at an open spot; a crowded meadow settles for anywhere clear of the nest, not nothing. */
  function addWeb() {
    const spot = openSpot(WEB.RADIUS, 24) ?? openSpot(WEB.RADIUS * 0.6, 24);
    if (spot !== null) webs.push({ x: spot.x, y: spot.y, radius: WEB.RADIUS, spin: random() * Math.PI * 2 });
  }

  /** How much of each the meadow holds this level, and how long the next wasp waits. */
  const waspTarget = () => Math.min(HIVE.COUNT_MAX, HIVE.COUNT_START + state.level - 1);
  const webTarget = () => Math.min(WEB.COUNT_MAX, WEB.COUNT_START + state.level - 1);
  const waspDelay = () => Math.max(HIVE.DELAY_MIN, HIVE.OPENING_GRACE - state.level * HIVE.DELAY_PER_LEVEL);

  let waspTimer = HIVE.FIRST_DELAY;

  /** A new round: the bee at its nest, the meadow full of nectar, the first wasps already on their way. */
  function reset() {
    bee.x = NEST.START_X; bee.y = NEST.START_Y; bee.vx = 0; bee.vy = 0;
    bee.carried = 0; bee.capacity = NECTAR.PER_FLOWER * NECTAR.CARRY; bee.energy = ENERGY.MAX;
    bee.stings = NECTAR.LIVES; bee.invuln = 0; bee.stuck = 0; bee.cooldown = 0;
    bee.stickX = 0; bee.stickY = 0; bee.flap = 0; bee.energyGlow = 0;
    nest.fill = 0; nest.deposited = 0;
    state.score = 0; state.level = 1; state.time = 0; state.levelTime = 0;
    state.over = false; state.cause = null; state.deliveries = 0;
    world.events = 0;
    for (let i = 0; i < flowers.length; i += 1) {
      flowers[i].nectar = range(random, 0.7, 1);
      flowers[i].bloom = 1;
      flowers[i].grow = 0;
    }
    wasps.length = 0;
    webs.length = 0;
    turnWind();
    for (let i = 0; i < WEB.COUNT_START; i += 1) addWeb();
    waspTimer = waspDelay();
  }

  /** One wasp's step: hunt, run from the first sting, or sit out one it has just given the bee. */
  function stepWasp(wasp, dt, events) {
    if (wasp.mode === WASP_RESTING) {
      wasp.hold -= dt;
      wasp.x += wasp.vx * dt;
      wasp.y += wasp.vy * dt;
      wasp.vx *= 0.9;
      wasp.vy *= 0.9;
      if (wasp.hold <= 0) { wasp.mode = WASP_HUNT; wasp.hurt = 0; }
      return events;
    }
    wasp.wander += dt;
    let heading = Math.atan2(bee.y - wasp.y, bee.x - wasp.x);
    if (wasp.mode === WASP_FLEE) {
      wasp.hold -= dt;
      heading += Math.PI;
      if (wasp.hold <= 0) wasp.mode = WASP_HUNT;
    } else {
      heading += Math.sin(wasp.wander * 2.1) * HIVE.WANDER;
    }
    wasp.vx += (Math.cos(heading) * wasp.speed * 3.4 + wind.x * 0.4) * dt;
    wasp.vy += (Math.sin(heading) * wasp.speed * 3.4 + wind.y * 0.4) * dt;
    const damped = Math.exp(-3.4 * dt);
    wasp.vx *= damped;
    wasp.vy *= damped;
    const speed = Math.hypot(wasp.vx, wasp.vy);
    if (speed > wasp.speed) {
      wasp.vx = (wasp.vx / speed) * wasp.speed;
      wasp.vy = (wasp.vy / speed) * wasp.speed;
    }
    wasp.x = Math.min(CANVAS.width + 40, Math.max(-40, wasp.x + wasp.vx * dt));
    wasp.y = Math.min(CANVAS.height + 40, Math.max(-40, wasp.y + wasp.vy * dt));
    // Only a hunting wasp stings: one running away or recovering cannot touch the bee.
    if (wasp.mode !== WASP_HUNT || bee.invuln > 0) return events;
    if (Math.hypot(bee.x - wasp.x, bee.y - wasp.y) >= BEE.RADIUS + 9) return events;
    bee.stings -= 1;
    bee.invuln = BEE.INVULN;
    bee.energy = Math.max(0, bee.energy - HIVE.STING_ENERGY);
    bee.energyGlow = 0.6;
    wasp.mode = WASP_RESTING;
    wasp.hold = REST_TIME;
    const away = Math.atan2(bee.y - wasp.y, bee.x - wasp.x);
    bee.vx = Math.cos(away) * HIVE.KNOCKBACK;
    bee.vy = Math.sin(away) * HIVE.KNOCKBACK;
    wasp.vx = -Math.cos(away) * 120;
    wasp.vy = -Math.sin(away) * 120;
    events |= EVENT_STING;
    if (bee.energy === 0) { state.over = true; state.cause = OVER_ENERGY; return events | EVENT_OVER; }
    if (bee.stings <= 0) { state.over = true; state.cause = OVER_STINGS; return events | EVENT_OVER; }
    return events;
  }

  /** One fixed step of the whole world: wind, flowers, the bee, the nest, the wasps. */
  function advance(dt) {
    if (state.over) return 0;
    let events = 0;
    state.time += dt;
    state.levelTime += dt;

    wind.time -= dt;
    if (wind.time <= 0) turnWind();

    // Flowers open while there is nectar in them, close when picked, and grow back a few seconds on.
    for (let i = 0; i < flowers.length; i += 1) {
      const flower = flowers[i];
      flower.bloom += ((flower.nectar > 0.02 ? 1 : 0.18) - flower.bloom) * Math.min(1, dt / FLOWER.BLOOM_TIME) * 1.6;
      flower.sway += dt * (0.7 + wind.strength / 120);
      if (flower.grow > 0) {
        flower.grow = Math.max(0, flower.grow - dt);
        if (flower.grow === 0) flower.nectar = range(random, 0.7, 1);
      }
    }

    // The bee: the stick pushes, the wind carries, the air drags it back down to its top speed.
    const steering = Math.hypot(bee.stickX, bee.stickY) > 0;
    const control = bee.stuck > 0 ? 0.35 : 1;
    bee.vx += (bee.stickX * BEE.ACCEL * control + wind.x) * dt;
    bee.vy += (bee.stickY * BEE.ACCEL * control + wind.y) * dt;
    const damped = Math.exp(-BEE.DRAG * dt);
    bee.vx *= damped;
    bee.vy *= damped;
    const speed = Math.hypot(bee.vx, bee.vy);
    if (speed > BEE.MAX_SPEED) {
      bee.vx = (bee.vx / speed) * BEE.MAX_SPEED;
      bee.vy = (bee.vy / speed) * BEE.MAX_SPEED;
    }
    bee.x = Math.min(CANVAS.width - BEE.RADIUS, Math.max(BEE.RADIUS, bee.x + bee.vx * dt));
    bee.y = Math.min(CANVAS.height - BEE.RADIUS, Math.max(BEE.RADIUS, bee.y + bee.vy * dt));
    bee.flap += dt * BEE.WING_HZ * (steering ? 1 : 0.35);
    if (bee.cooldown > 0) bee.cooldown = Math.max(0, bee.cooldown - dt);
    if (bee.invuln > 0) bee.invuln = Math.max(0, bee.invuln - dt);
    if (bee.energyGlow > 0) bee.energyGlow = Math.max(0, bee.energyGlow - dt);

    // Webs: a sticky patch cuts the bee to a crawl for a moment and costs it a little energy.
    for (let i = 0; i < webs.length; i += 1) webs[i].spin += dt * 0.4;
    if (bee.stuck > 0) {
      bee.stuck = Math.max(0, bee.stuck - dt);
    } else {
      for (let i = 0; i < webs.length; i += 1) {
        const web = webs[i];
        if (Math.hypot(bee.x - web.x, bee.y - web.y) > web.radius * 0.8) continue;
        bee.vx *= WEB.SPEED_FACTOR;
        bee.vy *= WEB.SPEED_FACTOR;
        bee.stuck = WEB.SLOW_TIME;
        bee.energy = Math.max(0, bee.energy - WEB.ENERGY_COST);
        bee.energyGlow = 0.4;
        events |= EVENT_STING;
        break;
      }
    }

    // Drinking: the flower the bee is standing on, and a drink buys a little energy back.
    for (let i = 0; i < flowers.length; i += 1) {
      const flower = flowers[i];
      if (flower.nectar <= 0.02) continue;
      if (Math.hypot(bee.x - flower.x, bee.y - flower.y) > NECTAR.PICK_RANGE) continue;
      const sip = Math.min(
        (NECTAR.PER_FLOWER / NECTAR.DRINK_TIME) * dt,
        flower.nectar * NECTAR.PER_FLOWER,
        bee.capacity - bee.carried,
      );
      if (sip > 0) {
        flower.nectar -= sip / NECTAR.PER_FLOWER;
        bee.carried += sip;
        bee.energy = Math.min(ENERGY.MAX, bee.energy + sip * NECTAR.ENERGY_GAIN);
        events |= EVENT_NECTAR;
        if (flower.nectar <= 0.02) {
          flower.nectar = 0;
          flower.grow = range(random, FLOWER.REGROW_MIN, FLOWER.REGROW_MAX);
        }
      }
      break;
    }

    // The nest takes what the bee carries; a full nest is a level, and the level closes with harder.
    if (bee.carried > 0 && Math.hypot(bee.x - nest.x, bee.y - nest.y) < NEST.DEPOSIT_RANGE) {
      nest.deposited += bee.carried;
      nest.fill = Math.min(NECTAR.HIVE_CAPACITY, nest.fill + bee.carried);
      state.score += Math.round(bee.carried * SCORE.DEPOSIT);
      bee.carried = 0;
      state.deliveries += 1;
      bee.energyGlow = 0.5;
      events |= EVENT_DEPOSIT;
      if (nest.fill >= NECTAR.HIVE_CAPACITY) {
        // The time left on the round's clock is worth points, and then the meadow turns harder.
        state.score += SCORE.NEST + SCORE.CLOCK * Math.round(Math.max(0, NECTAR.LEVEL_TIME - state.levelTime));
        nest.fill = 0;
        state.level = Math.min(LEVEL.MAX, state.level + 1);
        state.levelTime = 0;
        while (wasps.length < waspTarget()) addWasp();
        while (webs.length < webTarget()) addWeb();
        for (let i = 0; i < wasps.length; i += 1) {
          wasps[i].speed = HIVE.SPEED + (state.level - 1) * HIVE.SPEED_PER_LEVEL;
        }
        turnWind();
        waspTimer = waspDelay();
        events |= EVENT_LEVEL;
      }
    }

    // Energy is the clock: it always drains, faster while the bee is steering, and zero ends the run.
    const drain = (steering ? 1 + ENERGY.BOOST : 1) * ENERGY.DRAIN * (1 + (state.level - 1) * 0.05);
    bee.energy = Math.max(0, bee.energy - drain * dt);
    if (bee.energy === 0) {
      state.over = true;
      state.cause = OVER_ENERGY;
      return events | EVENT_OVER;
    }

    // One more wasp drifts in now and then; the count is the level's, and the first is held back by
    // the opening grace so a new round always begins with the meadow to itself.
    waspTimer -= dt;
    if (waspTimer <= 0 && wasps.length < waspTarget()) {
      addWasp();
      while (wasps.length < waspTarget()) addWasp();
      waspTimer = Math.max(HIVE.DELAY_MIN, HIVE.OPENING_GRACE - state.level);
    }
    for (let i = 0; i < wasps.length; i += 1) {
      if (wasps[i].hurt > 0) wasps[i].hurt = Math.max(0, wasps[i].hurt - dt);
      events = stepWasp(wasps[i], dt, events);
      if (state.over) return events;
    }
    return events;
  }

  /** Advance the world one fixed step; the events are returned and also left on world.events. */
  function step(dt) {
    world.events = advance(dt);
    return world.events;
  }

  /** Point the sting at the mouse, in world coordinates. */
  function setAim(x, y) {
    bee.aim = Math.atan2(y - bee.y, x - bee.x);
  }

  /** The wasp in range and in front of the aim, or null; the nearest one when several qualify. */
  function stingingRange() {
    let target = null;
    let nearest = Infinity;
    for (let i = 0; i < wasps.length; i += 1) {
      const wasp = wasps[i];
      if (wasp.mode === WASP_RESTING) continue;
      const dx = wasp.x - bee.x;
      const dy = wasp.y - bee.y;
      const distance = Math.hypot(dx, dy);
      if (distance > STING.RANGE || distance >= nearest) continue;
      const off = Math.abs(Math.atan2(Math.sin(Math.atan2(dy, dx) - bee.aim), Math.cos(Math.atan2(dy, dx) - bee.aim)));
      if (off > STING.ARC) continue;
      target = wasp;
      nearest = distance;
    }
    return target;
  }

  /** Whether a wasp is in front of the aim right now: the HUD draws its sting ready only when one is. */
  function stingReady() {
    return bee.cooldown === 0 && !state.over && stingingRange() !== null;
  }

  /**
   * Throw the sting: the wasp in range and in front of the aim is hit. The first sting sends it
   * running, the second clears it from the meadow; a throw that hits nothing costs nothing. While the
   * sting is recovering, nothing happens at all. Returns whether a wasp was hit.
   */
  function sting() {
    if (bee.cooldown > 0 || state.over) return false;
    const target = stingingRange();
    if (target === null) return false;
    bee.cooldown = STING.COOLDOWN;
    const away = Math.atan2(target.y - bee.y, target.x - bee.x);
    bee.energyGlow = 0.4;
    if (target.mode === WASP_FLEE) {
      const index = wasps.indexOf(target);
      if (index >= 0) wasps.splice(index, 1);
      state.score += HIVE.STING_SCORE;
      return true;
    }
    target.mode = WASP_FLEE;
    target.hold = FLEE_TIME;
    target.hurt = 1;
    target.vx = Math.cos(away) * 420;
    target.vy = Math.sin(away) * 420;
    state.score += 10;
    return true;
  }

  /** Whether the mouse points at the nest: there a click means "set down", never "sting". */
  function nestAimed(x, y) {
    return Math.hypot(x - nest.x, y - nest.y) < NEST.RADIUS * 1.3;
  }

  reset();

  // Every query the renderer, the HUD and the screenshot scenes need, and nothing they could break.
  return Object.assign(world, {
    step,
    reset,
    setAim,
    sting,
    stingReady,
    nestAimed,
    bee,
    nest,
    flowers,
    wasps,
    webs,
    wind,
    state,
    hive: wasps,
    beeState: () => bee,
    nestFill: () => nest.fill / NECTAR.HIVE_CAPACITY,
    nestDeposited: () => nest.deposited,
    nestCarried: () => bee.carried,
    nestCapacity: () => bee.capacity,
    nestPoint: () => ({ x: nest.x, y: nest.y }),
    waspCount: () => wasps.length,
    windVector: () => ({ x: wind.x, y: wind.y, strength: wind.strength }),
    score: () => state.score,
    level: () => state.level,
    lives: () => bee.stings,
    energy01: () => bee.energy / ENERGY.MAX,
    timeLeft: () => Math.max(0, NECTAR.LEVEL_TIME - state.levelTime),
    isOver: () => state.over,
    overCause: () => state.cause,
  });
}

export { FIXED_STEP };
