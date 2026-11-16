// POLLEN DRIFT -- drawing only. Part one is the meadow and everything in it; part two is the HUD and
// the four screens. The field is always 960x540 logical pixels; the device pixel ratio only makes them
// sharp. Everything here is read from the world and never written to it.
import { BEE, CANVAS, ENERGY, FONT, NECTAR, NEST, PALETTE, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, WIND } from './config.js';
import { WASP_FLEE, WASP_RESTING } from './world.js';

export { SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE };

/** Where the meadow floor sits: the flowers, the grass and the nest all stand on it. */
const GROUND_Y = 500;
/** A flower at full bloom, before its own size and its bloom are applied. */
const FLOWER_SIZE = 13;
/** Grass in three layers, back to front: dark and short behind, green and tall in front. Each blade
 * leans further as the wind rises, which is the only thing on this screen the player must read fast. */
const GRASS = [
  { y: GROUND_Y - 46, blades: 30, height: 26, colour: PALETTE.grassDark, alpha: 0.6 },
  { y: GROUND_Y - 18, blades: 26, height: 36, colour: PALETTE.grass, alpha: 0.85 },
  { y: GROUND_Y + 24, blades: 22, height: 50, colour: PALETTE.grassDark, alpha: 1 },
];
const POLLEN_LIFE = 0.6;
const POLLEN_PER_SIP = 2;

/** The sky's gradient, built once and kept: dawn above, warm through the middle, blue at the horizon. */
function skyGradient(ctx) {
  const sky = ctx.createLinearGradient(0, 0, 0, GROUND_Y + 40);
  sky.addColorStop(0, PALETTE.skyTop);
  sky.addColorStop(0.55, PALETTE.skyMid);
  sky.addColorStop(1, PALETTE.skyBottom);
  return sky;
}

/** The sun, low over the right-hand hill, with its glow. */
function drawSun(ctx) {
  const x = CANVAS.width * 0.78;
  const y = 224;
  ctx.fillStyle = PALETTE.sunGlow;
  ctx.beginPath();
  ctx.arc(x, y, 94, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = PALETTE.sun;
  ctx.beginPath();
  ctx.arc(x, y, 38, 0, Math.PI * 2);
  ctx.fill();
}

/** Two hills behind the meadow, so the horizon reads at a glance. */
function drawHills(ctx) {
  ctx.fillStyle = PALETTE.hillFar;
  ctx.beginPath();
  ctx.moveTo(0, GROUND_Y - 26);
  ctx.quadraticCurveTo(CANVAS.width * 0.3, GROUND_Y - 112, CANVAS.width * 0.58, GROUND_Y - 30);
  ctx.quadraticCurveTo(CANVAS.width * 0.8, GROUND_Y - 74, CANVAS.width, GROUND_Y - 22);
  ctx.lineTo(CANVAS.width, CANVAS.height);
  ctx.lineTo(0, CANVAS.height);
  ctx.fill();
  ctx.fillStyle = PALETTE.hillNear;
  ctx.beginPath();
  ctx.moveTo(0, GROUND_Y - 4);
  ctx.quadraticCurveTo(CANVAS.width * 0.42, GROUND_Y - 70, CANVAS.width * 0.8, GROUND_Y - 6);
  ctx.quadraticCurveTo(CANVAS.width * 0.93, GROUND_Y - 24, CANVAS.width, GROUND_Y - 2);
  ctx.lineTo(CANVAS.width, CANVAS.height);
  ctx.lineTo(0, CANVAS.height);
  ctx.fill();
}

/** Grass, layer by layer, every blade leaning with the wind and the clock. */
function drawGrass(ctx, time, windStrength) {
  const lean = Math.min(1.6, windStrength / 60);
  for (const layer of GRASS) {
    ctx.globalAlpha = layer.alpha;
    ctx.fillStyle = layer.colour;
    ctx.beginPath();
    ctx.moveTo(0, CANVAS.height);
    ctx.lineTo(0, layer.y);
    for (let i = 0; i < layer.blades; i += 1) {
      const x = (i + 0.5) * (CANVAS.width / layer.blades) + Math.sin(i * 1.7) * 6;
      const sway = Math.sin(time * 1.5 + i * 0.6) * (3 + lean * 11);
      const height = layer.height * (0.72 + 0.28 * Math.sin(i * 2.3));
      ctx.quadraticCurveTo(x + sway * 0.6, layer.y - height * 0.65, x + sway, layer.y - height);
      ctx.quadraticCurveTo(x + sway * 0.4, layer.y - height * 0.5, x, layer.y);
    }
    ctx.lineTo(CANVAS.width, CANVAS.height);
    ctx.closePath();
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/** One flower: a stem, a leaf, and petals that open and shut with the bloom the world keeps. */
function drawFlower(ctx, flower, time) {
  const sway = Math.sin(flower.sway + time * 0.7) * 3;
  const size = FLOWER_SIZE * flower.size * Math.max(0.12, flower.bloom);
  ctx.strokeStyle = PALETTE.flowerStem;
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(flower.x, GROUND_Y + 8);
  ctx.quadraticCurveTo(flower.x + sway * 0.6, flower.y + 30, flower.x + sway, flower.y + 8);
  ctx.stroke();
  ctx.fillStyle = PALETTE.flowerStem;
  ctx.beginPath();
  ctx.ellipse(flower.x + sway + 6, flower.y + 26, 8, 3.2, -0.35, 0, Math.PI * 2);
  ctx.fill();
  const petal = [PALETTE.flowerYellow, PALETTE.flowerOrange, PALETTE.flowerWhite][flower.kind % 3];
  ctx.fillStyle = petal;
  for (let i = 0; i < 6; i += 1) {
    const angle = (i / 6) * Math.PI * 2 + sway * 0.03;
    ctx.beginPath();
    ctx.ellipse(flower.x + sway + Math.cos(angle) * size * 0.6, flower.y + Math.sin(angle) * size * 0.6, size * 0.46, size * 0.3, angle, 0, Math.PI * 2);
    ctx.fill();
  }
  // The heart is where the nectar is: a flower picked bare shows a pale, shrunken middle instead.
  ctx.fillStyle = flower.nectar > 0.02 ? PALETTE.flowerCore : PALETTE.flowerWhite;
  ctx.beginPath();
  ctx.arc(flower.x + sway, flower.y, size * 0.32, 0, Math.PI * 2);
  ctx.fill();
}

/** The nest: a golden hive at the bee's door, its honey rising with the fill. */
function drawNest(ctx, nest, fill, time) {
  const r = NEST.RADIUS;
  ctx.fillStyle = PALETTE.nestDark;
  ctx.beginPath();
  ctx.ellipse(nest.x, nest.y + r * 0.92 + 5, r * 1.14, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = PALETTE.nest;
  ctx.beginPath();
  ctx.ellipse(nest.x, nest.y, r, r * 0.92, 0, 0, Math.PI * 2);
  ctx.fill();
  // The honey, from the bottom of the hive up: the one number a whole run is spent watching.
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(nest.x, nest.y, r - 1, r * 0.92 - 1, 0, 0, Math.PI * 2);
  ctx.clip();
  const bottom = nest.y + r * 0.92;
  const surface = nest.y - r * 0.92 + 2 * r * 0.92 * Math.min(1, Math.max(0, fill));
  ctx.fillStyle = PALETTE.nestDark;
  ctx.fillRect(nest.x - r, surface, r * 2, bottom - surface + r);
  if (fill > 0.02) {
    ctx.fillStyle = PALETTE.flowerYellow;
    ctx.beginPath();
    ctx.ellipse(nest.x, surface, r * 0.88, 4 + Math.sin(time * 3.2) * 1.3, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  ctx.strokeStyle = PALETTE.nestDark;
  ctx.lineWidth = 1.6;
  for (let ring = 1; ring <= 2; ring += 1) {
    ctx.beginPath();
    ctx.ellipse(nest.x, nest.y, (r * ring) / 3, (r * 0.92 * ring) / 3, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = PALETTE.nestDark;
  ctx.beginPath();
  ctx.ellipse(nest.x, nest.y + 7, 8, 10, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** A web: threads out from the middle and three rings around them, turning slowly. */
function drawWeb(ctx, web) {
  const r = web.radius;
  ctx.strokeStyle = PALETTE.web;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  for (let i = 0; i < 8; i += 1) {
    const angle = (i / 8) * Math.PI * 2 + web.spin;
    ctx.moveTo(web.x, web.y);
    ctx.lineTo(web.x + Math.cos(angle) * r, web.y + Math.sin(angle) * r);
  }
  for (let ring = 1; ring <= 3; ring += 1) {
    for (let i = 0; i <= 8; i += 1) {
      const angle = (i / 8) * Math.PI * 2 + web.spin;
      const step = (ring / 3) * r;
      const x = web.x + Math.cos(angle) * step;
      const y = web.y + Math.sin(angle) * step;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
  }
  ctx.stroke();
}

/** A wasp: a narrow body with red bands, a stinger, beating wings and two bright eyes. */
function drawWasp(ctx, wasp, time) {
  const beat = Math.sin(time * 42 + wasp.wander * 3) * 0.5 + 0.5;
  ctx.save();
  ctx.translate(wasp.x, wasp.y);
  ctx.rotate(Math.atan2(wasp.vy, wasp.vx));
  ctx.globalAlpha = wasp.mode === WASP_FLEE ? 0.7 : 1;
  ctx.fillStyle = PALETTE.hiveDark;
  ctx.beginPath();
  ctx.ellipse(-1, 0, 11, 6.4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-11, 0);
  ctx.lineTo(-20, -2.6);
  ctx.lineTo(-20, 2.6);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = PALETTE.hive;
  for (let i = 0; i < 3; i += 1) ctx.fillRect(-9 + i * 5.5, -6.2, 2.4, 12.4);
  ctx.fillStyle = PALETTE.bee;
  ctx.beginPath();
  ctx.arc(8, 0, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = PALETTE.eye;
  ctx.beginPath();
  ctx.arc(10.4, -2.4, 1.9, 0, Math.PI * 2);
  ctx.arc(10.4, 2.4, 1.9, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = PALETTE.beeWing;
  ctx.beginPath();
  ctx.ellipse(-2, -9 - beat * 3, 8, 3.5, -0.5 - beat * 0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(-2, 9 + beat * 3, 8, 3.5, 0.5 + beat * 0.4, 0, Math.PI * 2);
  ctx.fill();
  if (wasp.mode === WASP_RESTING) {
    ctx.strokeStyle = PALETTE.uiLight;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(0, 0, 15, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

/** The bee: a striped body that faces where it is going, wings beating, a sting out in front. */
function drawBee(ctx, bee, time, stingReady) {
  const moving = Math.hypot(bee.vx, bee.vy) > 14;
  const beat = Math.sin(bee.flap * Math.PI * 2) * 0.5 + 0.5;
  ctx.save();
  ctx.translate(bee.x, bee.y);
  ctx.rotate(moving ? Math.atan2(bee.vy, bee.vx) : bee.aim);
  if (bee.energyGlow > 0) {
    ctx.fillStyle = PALETTE.sunGlow;
    ctx.beginPath();
    ctx.arc(0, 0, BEE.RADIUS + 10 + bee.energyGlow * 14, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = PALETTE.beeWing;
  ctx.beginPath();
  ctx.ellipse(-3, -10 - beat * 4, 10, 4.2, -0.55 - beat * 0.45, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(-3, 10 + beat * 4, 10, 4.2, 0.55 + beat * 0.45, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(0, 0, BEE.RADIUS + 2, BEE.RADIUS - 1, 0, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = PALETTE.bee;
  ctx.fillRect(-BEE.RADIUS - 4, -BEE.RADIUS - 4, BEE.RADIUS * 2 + 8, BEE.RADIUS * 2 + 8);
  ctx.fillStyle = PALETTE.beeStripe;
  for (let i = 0; i < 3; i += 1) ctx.fillRect(-8 + i * 6.5, -12, 3.2, 24);
  ctx.restore();
  // The sting: bright gold the moment it is ready and a wasp is in front of it, short and dark while
  // it is still recovering. That is the whole tell for when a click will land.
  ctx.strokeStyle = stingReady ? PALETTE.flowerYellow : PALETTE.bee;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(BEE.RADIUS + 2, 0);
  ctx.lineTo(BEE.RADIUS + (bee.cooldown > 0 ? 5 : 9), 0);
  ctx.stroke();
  ctx.restore();
}

/** Throw pollen up: a puff off a flower being drunk, a shower off a bee that was just stung. */
function spawnPollen(particles, x, y, count) {
  for (let i = 0; i < count; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 26 + Math.random() * 66;
    particles.push({
      x: x + Math.cos(angle) * 8, y: y + Math.sin(angle) * 8,
      vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 18,
      life: POLLEN_LIFE, size: 1.5 + Math.random() * 2.2,
    });
  }
}

function stepPollen(particles, dt) {
  for (let i = particles.length - 1; i >= 0; i -= 1) {
    const speck = particles[i];
    speck.life -= dt;
    if (speck.life <= 0) {
      particles.splice(i, 1);
      continue;
    }
    speck.x += speck.vx * dt;
    speck.y += speck.vy * dt;
    speck.vy += 32 * dt;
    speck.vx *= 0.98;
  }
}

function drawPollen(ctx, particles) {
  ctx.fillStyle = PALETTE.pollen;
  for (const speck of particles) {
    ctx.globalAlpha = Math.max(0, speck.life / POLLEN_LIFE) * 0.9;
    ctx.beginPath();
    ctx.arc(speck.x, speck.y, speck.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// ------------------------------------------------------------------------------- part two: HUD

/** Text in the one font the game uses, at a size, aligned from a point. */
function label(ctx, text, x, y, size, colour, align = 'left', weight = '600') {
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.fillStyle = colour;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(text, x, y);
}

/** A rounded rectangle the same way on every browser: roundRect where it exists, plain edges where not. */
function roundedRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, width, height, radius);
  else {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
  }
}

/** A rounded bar: a dark trough, a coloured fill, and a thin outline. */
function bar(ctx, x, y, width, height, fraction, fill) {
  const r = height / 2;
  roundedRect(ctx, x, y, width, height, r);
  ctx.fillStyle = 'rgba(26, 32, 44, 0.55)';
  ctx.fill();
  const inner = Math.max(0, Math.min(1, fraction));
  if (inner > 0) {
    roundedRect(ctx, x + 1.5, y + 1.5, Math.max(height - 3, (width - 3) * inner), height - 3, r - 1.5);
    ctx.fillStyle = fill;
    ctx.fill();
  }
  ctx.strokeStyle = 'rgba(255, 243, 224, 0.55)';
  ctx.lineWidth = 1.2;
  roundedRect(ctx, x, y, width, height, r);
  ctx.stroke();
}

/** One small bee, for the lives line: body, two stripes, a wing. */
function drawBeeIcon(ctx, x, y, alive) {
  ctx.globalAlpha = alive ? 1 : 0.28;
  ctx.fillStyle = PALETTE.beeWing;
  ctx.beginPath();
  ctx.ellipse(x - 1, y - 6, 5, 2.4, -0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = alive ? PALETTE.bee : PALETTE.uiLight;
  ctx.beginPath();
  ctx.ellipse(x, y, 8, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = alive ? PALETTE.beeStripe : PALETTE.ui;
  ctx.fillRect(x - 3, y - 6, 2.4, 12);
  ctx.fillRect(x + 2, y - 6, 2.4, 12);
  ctx.globalAlpha = 1;
}

/**
 * The HUD: what the player must see without looking away from the bee. The honey bar answers "how
 * close", the energy bar "how long have I got" -- and it turns red and pulses when it is nearly out,
 * which is the only warning the game gives before dusk.
 */
function drawHud(ctx, world, time) {
  const fill = world.nestFill();
  const energy = world.energy01();
  // Honey: the run's clock, top left, with the level it has reached beside it.
  bar(ctx, 24, 26, 230, 20, fill, fill >= 1 ? PALETTE.flowerYellow : PALETTE.nest);
  label(ctx, `HIVE ${Math.round(fill * 100)}%`, 24, 20, 15, PALETTE.uiLight);
  label(ctx, `LV ${world.level()}`, 24, 70, 18, PALETTE.flowerYellow);
  label(ctx, `SCORE ${world.score()}`, 24, 96, 18, PALETTE.uiLight);
  // Lives, top right: one small bee per sting the bee can still take.
  label(ctx, 'LIVES', CANVAS.width - 24, 20, 15, PALETTE.uiLight, 'right');
  for (let i = 0; i < NECTAR.LIVES; i += 1) {
    drawBeeIcon(ctx, CANVAS.width - 34 - i * 30, 48, i < world.lives());
  }
  // Energy, under the lives: gold while it is healthy, red and pulsing when it is not.
  const low = energy <= ENERGY.LOW / ENERGY.MAX;
  const pulse = low ? 0.65 + 0.35 * Math.sin(time * 9) : 1;
  ctx.globalAlpha = 1;
  label(ctx, `ENERGY ${Math.round(energy * 100)}%`, CANVAS.width - 24, 82, 15, PALETTE.uiLight, 'right');
  bar(ctx, CANVAS.width - 254, 88, 230, 18, energy, low ? `rgba(214, 69, 69, ${pulse})` : PALETTE.grass);
  // Carrying: the nectar in the bee's pockets, so a trip home is never a guess.
  if (world.nestCarried() > 0.5) {
    const carried = world.nestCarried() / world.nestCapacity();
    bar(ctx, 24, 108, 130, 12, carried, PALETTE.beeStripe);
    label(ctx, 'CARRY', 24, 104, 12, PALETTE.uiLight);
  }
  // The wind: an arrow that points where it pushes, as long as it blows.
  const wind = world.windVector();
  const cx = CANVAS.width / 2;
  const strength = Math.hypot(wind.x, wind.y);
  if (strength > 0.01) {
    const length = 10 + (strength / WIND.MAX) * 26;
    const angle = Math.atan2(wind.y, wind.x);
    ctx.save();
    ctx.translate(cx, 34);
    ctx.rotate(angle);
    ctx.strokeStyle = PALETTE.uiLight;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(-length, 0);
    ctx.lineTo(length, 0);
    ctx.lineTo(length - 7, -5);
    ctx.moveTo(length, 0);
    ctx.lineTo(length - 7, 5);
    ctx.stroke();
    ctx.restore();
  }
  label(ctx, `WIND ${Math.round(strength)}`, cx + 34, 40, 14, PALETTE.uiLight, 'left');
}

/** A soft dark wash over the meadow, for the screens that sit on top of a paused or finished game. */
function drawPanelBackground(ctx) {
  ctx.fillStyle = PALETTE.panel;
  ctx.fillRect(0, 0, CANVAS.width, CANVAS.height);
}

/** A centred card: a title, then lines of text under it. */
function drawCard(ctx, heading, lines, prompt, time) {
  drawPanelBackground(ctx);
  label(ctx, heading, CANVAS.width / 2, 200, 54, PALETTE.uiLight, 'center', '800');
  lines.forEach((line, i) => label(ctx, line, CANVAS.width / 2, 262 + i * 30, 19, PALETTE.flowerYellow, 'center'));
  const beat = 0.7 + 0.3 * Math.sin(time * 4);
  ctx.globalAlpha = beat;
  label(ctx, prompt, CANVAS.width / 2, 470, 22, PALETTE.uiLight, 'center', '700');
  ctx.globalAlpha = 1;
}

/** The title screen: what this is, who it hunts, and every control in one box. */
function drawTitle(ctx, time) {
  drawPanelBackground(ctx);
  label(ctx, 'POLLEN DRIFT', CANVAS.width / 2, 168, 66, PALETTE.flowerYellow, 'center', '800');
  label(ctx, 'Fill the hive before dusk', CANVAS.width / 2, 210, 24, PALETTE.uiLight, 'center');
  const x = CANVAS.width / 2 - 210;
  const y = 258;
  ctx.fillStyle = 'rgba(26, 32, 44, 0.72)';
  roundedRect(ctx, x, y, 420, 168, 12);
  ctx.fill();
  ctx.strokeStyle = PALETTE.flowerYellow;
  ctx.lineWidth = 1.4;
  ctx.stroke();
  label(ctx, 'WASD / ARROWS  fly', x + 30, y + 42, 20, PALETTE.uiLight);
  label(ctx, 'CLICK  sting what hunts you', x + 30, y + 76, 20, PALETTE.uiLight);
  label(ctx, 'SHIFT  fly faster', x + 30, y + 110, 20, PALETTE.uiLight);
  label(ctx, 'P  pause', x + 30, y + 144, 20, PALETTE.uiLight);
  const beat = 0.7 + 0.3 * Math.sin(time * 4);
  ctx.globalAlpha = beat;
  label(ctx, 'Press Enter', CANVAS.width / 2, 486, 26, PALETTE.flowerYellow, 'center', '700');
  ctx.globalAlpha = 1;
}

/** Paused: the meadow still there, dimmed, with the two keys that matter. */
function drawPaused(ctx) {
  drawPanelBackground(ctx);
  label(ctx, 'PAUSED', CANVAS.width / 2, CANVAS.height / 2 - 6, 56, PALETTE.uiLight, 'center', '800');
  label(ctx, 'Press P to resume', CANVAS.width / 2, CANVAS.height / 2 + 44, 24, PALETTE.flowerYellow, 'center');
}

/** The end screen: why it ended, what it earned, and the one key to go again. */
function drawOver(ctx, world, time) {
  const full = world.nestFill() >= 1 || world.overCause() === 'nest';
  const heading = full ? 'HIVE FULL' : 'DUSK FALLS';
  const reason = full ? 'The nest is full and the light held' : world.overCause() === 'energy' ? 'You ran out of energy' : 'The wasps got you';
  drawCard(ctx, heading, [
    `${reason}.`,
    `Final score  ${world.score()}`,
    `Hive filled  ${Math.round(world.nestFill() * 100)}%   Level ${world.level()}`,
  ], 'Press Enter to fly again', time);
}

/**
 * The renderer for one canvas. paint(world, screen, ui) draws a frame: the world, then the HUD while a
 * run is on, then the screen itself. ui is what the game has just learned -- { dt, shake, flash } --
 * so the picture answers the rules and never the other way round.
 */
export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const particles = [];
  let sky = null;
  let ratio = 0;
  let time = 0;
  let shake = 0;
  let flash = 0;
  let lastCarried = 0;
  let lastStings = -1;

  /** Match the canvas to the window's pixel ratio, so the picture is sharp on any display. */
  function resize() {
    ratio = window.devicePixelRatio || 1;
    const width = Math.round(CANVAS.width * ratio);
    const height = Math.round(CANVAS.height * ratio);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    sky = skyGradient(ctx);
  }

  function paint(world, screen, ui) {
    if (sky === null || ratio !== (window.devicePixelRatio || 1)) resize();
    const dt = Math.min(0.05, ui?.dt ?? 1 / 60);
    time += dt;
    // What the world reports becomes what the picture does: a sting shakes the camera and flashes
    // the frame, and a drink throws pollen. Both decay here, so a held number cannot stick.
    shake = Math.max(shake * 0.86, ui?.shake ?? 0);
    flash = Math.max(flash * 0.82, ui?.flash ?? 0);
    if (world.bee.stings !== lastStings) {
      if (lastStings >= 0 && world.bee.stings < lastStings) {
        shake = 10;
        flash = 0.4;
      }
      lastStings = world.bee.stings;
    }
    if (world.bee.carried > lastCarried + 0.01) spawnPollen(particles, world.bee.x, world.bee.y, POLLEN_PER_SIP);
    lastCarried = world.bee.carried;
    stepPollen(particles, dt);

    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.save();
    if (shake > 0.1) ctx.translate(Math.sin(time * 74) * shake, Math.cos(time * 63) * shake);
    ctx.fillStyle = sky;
    ctx.fillRect(-24, -24, CANVAS.width + 48, CANVAS.height + 48);
    drawSun(ctx);
    drawHills(ctx);
    drawNest(ctx, world.nest, world.nestFill(), time);
    for (const web of world.webs) drawWeb(ctx, web);
    for (const flower of world.flowers) drawFlower(ctx, flower, time);
    drawGrass(ctx, time, world.windVector().strength);
    for (const wasp of world.wasps) drawWasp(ctx, wasp, time);
    drawBee(ctx, world.bee, time, world.stingReady?.() ?? false);
    drawPollen(ctx, particles);
    if (flash > 0.01) {
      ctx.globalAlpha = Math.min(0.45, flash);
      ctx.fillStyle = PALETTE.uiLight;
      ctx.fillRect(0, 0, CANVAS.width, CANVAS.height);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    // The HUD while a run is on, then the screen itself on top of the meadow.
    if (screen === SCREEN_PLAY || screen === SCREEN_PAUSED) drawHud(ctx, world, time);
    if (screen === SCREEN_TITLE) drawTitle(ctx, time);
    else if (screen === SCREEN_PAUSED) drawPaused(ctx);
    else if (screen === SCREEN_OVER) drawOver(ctx, world, time);
  }

  resize();
  window.addEventListener('resize', resize);
  // shots.js paints through draw(): the same call under the name it was written with.
  return { ctx, paint, draw: paint, particles };
}

export { FONT };
