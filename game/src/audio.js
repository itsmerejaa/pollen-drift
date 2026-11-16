// POLLEN DRIFT -- every sound is synthesised with the Web Audio API. No audio file, no fetch, nothing
// to load, and it works offline forever.
//
// Browsers refuse to start audio before a real gesture, so createAudio() builds nothing: unlock(),
// called from the first key or click, builds the graph. Every method is safe to call before that, after
// it, or on a browser with no Web Audio at all -- a sound that cannot be played is not played, and
// never throws into the game loop.
//
// Three voices live while a run is on: the wings (a sawtooth with an LFO fluttering inside it), the
// dusk drone (two sines whose pitch climbs as the bee's energy falls, so the player hears the clock),
// and the wind (noise, as loud as the wind is strong). The rest are one-shots with an envelope each.
const WING_BASE = 132;
const WING_LFO = 23;
const WING_RISE = 52;
const DRONE_LOW = 56;
const DRONE_RISE = 48;
const MASTER = 0.5;

export function createAudio() {
  let ctx = null;
  let master = null;
  let wing = null;
  let wingGain = null;
  let drone = null;
  let droneA = null;
  let droneB = null;
  let windGain = null;
  let windFilter = null;
  let energy = 1;

  /** Whether the graph exists and is still worth speaking to. */
  const live = () => ctx !== null && ctx.state !== 'closed' && master !== null;
  /** A glide rather than a jump, so nothing clicks. */
  const glide = (param, value, seconds = 0.06) => { try { param.setTargetAtTime(value, ctx.currentTime, seconds); } catch { /* ignore */ } };

  /** Two seconds of white noise, made once, for the wind to blow through. */
  function noise() {
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < channel.length; i += 1) channel[i] = Math.random() * 2 - 1;
    return buffer;
  }

  /** Build the graph: the master, the three living voices, and their starting levels. */
  function build() {
    master = ctx.createGain();
    master.gain.value = MASTER;
    master.connect(ctx.destination);

    // The wings: a low sawtooth with an LFO pushing its pitch, so it buzzes instead of droning.
    wing = ctx.createOscillator();
    wing.type = 'sawtooth';
    wing.frequency.value = WING_BASE;
    const flutter = ctx.createOscillator();
    flutter.frequency.value = WING_LFO;
    const depth = ctx.createGain();
    depth.gain.value = 14;
    flutter.connect(depth).connect(wing.frequency);
    const wingTone = ctx.createBiquadFilter();
    wingTone.type = 'lowpass';
    wingTone.frequency.value = 900;
    wingGain = ctx.createGain();
    wingGain.gain.value = 0;
    wing.connect(wingTone).connect(wingGain).connect(master);

    // The dusk drone: two sines a fifth apart. Its pitch is the argument for going home.
    drone = ctx.createGain();
    drone.gain.value = 0.055;
    droneA = ctx.createOscillator();
    droneA.frequency.value = DRONE_LOW;
    droneB = ctx.createOscillator();
    droneB.frequency.value = DRONE_LOW * 1.5;
    droneA.connect(drone).connect(master);
    droneB.connect(drone);

    // The wind: noise through a soft band, and its gain is how hard the wind blows.
    const source = ctx.createBufferSource();
    source.buffer = noise();
    source.loop = true;
    windFilter = ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 340;
    windFilter.Q.value = 0.7;
    windGain = ctx.createGain();
    windGain.gain.value = 0;
    source.connect(windFilter).connect(windGain).connect(master);
    flutter.start();
    wing.start();
    droneA.start();
    droneB.start();
    source.start();
  }

  /** One note: an oscillator, a short envelope, a scheduled stop, and then let go of. */
  function tone(type, from, to, duration, level, delay = 0) {
    try {
      if (!live()) return;
      const at = ctx.currentTime + delay;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(Math.max(20, from), at);
      if (to !== from) osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), at + duration);
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(level, at + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
      osc.connect(gain).connect(master);
      osc.start(at);
      osc.stop(at + duration + 0.04);
    } catch {
      // A sound that fails is a sound nobody hears; the game keeps flying.
    }
  }

  return {
    /** Build the graph on the first real gesture; later calls only wake a sleeping context. */
    unlock() {
      try {
        if (ctx !== null) {
          if (ctx.state === 'suspended') ctx.resume();
          return;
        }
        const Ctor = window.AudioContext ?? window.webkitAudioContext;
        if (Ctor === undefined) return;
        ctx = new Ctor();
        build();
        if (ctx.state === 'suspended') ctx.resume();
      } catch {
        ctx = null;
        master = null;
      }
    },
    /** The wings: rate is how hard the bee is flying, 0 to 1. */
    wing(rate) {
      if (!live() || wingGain === null) return;
      const effort = Math.max(0, Math.min(1, rate));
      glide(wingGain.gain, 0.02 + effort * 0.075, 0.05);
      glide(wing.frequency, WING_BASE + effort * WING_RISE, 0.08);
    },
    /** A short rising note: a flower gives up its nectar. */
    nectar() { tone('triangle', 520, 880, 0.10, 0.16); },
    /** Two notes, the second higher: the nest takes a load. */
    deposit() {
      tone('triangle', 660, 660, 0.10, 0.16, 0);
      tone('triangle', 990, 990, 0.13, 0.14, 0.10);
    },
    /** A fast low pulse: a sting lands, given or taken. */
    sting() { for (let i = 0; i < 3; i += 1) tone('square', 170, 88, 0.05, 0.19, i * 0.055); },
    /** Three notes up: the nest is full and the meadow turns harder. */
    level() {
      tone('triangle', 523, 523, 0.12, 0.17, 0);
      tone('triangle', 659, 659, 0.12, 0.17, 0.11);
      tone('triangle', 784, 784, 0.20, 0.17, 0.22);
    },
    /** One long note falling away: dusk takes the meadow. */
    over() {
      tone('sawtooth', 330, 66, 1.5, 0.20);
      tone('sine', 220, 44, 1.7, 0.14, 0.08);
    },
    /** A soft click: a warning, not an alarm. */
    tick() { tone('triangle', 1900, 1500, 0.028, 0.06); },
    /** How hard the wind blows, so the noise bed follows the arrow the HUD draws. */
    setWind(strength) {
      const wind = Math.max(0, Math.min(120, strength));
      if (!live() || windGain === null) return;
      glide(windGain.gain, (wind / 120) * 0.05, 0.25);
      glide(windFilter.frequency, 240 + (wind / 120) * 420, 0.25);
    },
    /** The bee's energy, 0 to 1: the lower it falls, the higher and louder the drone climbs. */
    updateEnergy(value) {
      energy = Math.max(0, Math.min(1, value));
      if (!live() || droneA === null) return;
      const pitch = DRONE_LOW + (1 - energy) * DRONE_RISE;
      glide(droneA.frequency, pitch, 0.4);
      glide(droneB.frequency, pitch * 1.5, 0.4);
      glide(drone.gain, 0.035 + (1 - energy) * 0.05, 0.4);
    },
    /** Silence without losing the graph: a hidden tab, or the pause screen. */
    suspend() { try { if (ctx !== null && ctx.state === 'running') ctx.suspend(); } catch { /* nothing to do */ } },
    /** Wake the graph again, inside whatever gesture brought the player back. */
    resume() { try { if (ctx !== null && ctx.state === 'suspended') ctx.resume(); } catch { /* nothing to do */ } },
  };
}
