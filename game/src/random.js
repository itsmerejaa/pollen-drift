// A small seeded generator (mulberry32): one number in, the same game out, so a seed can be
// replayed and the screenshot scenes repeat exactly. Nothing here touches the browser.
/** A random function from a seed: () => a number in [0, 1). */
export function createRandom(seed) {
  let a = seed | 0;
  return function random() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One entry of an array, drawn with `rnd`. */
export function pick(list, rnd) {
  return list[Math.min(list.length - 1, Math.floor(rnd() * list.length))];
}

/** A number in [a, b), drawn with `rnd`. */
export function range(rnd, a, b) {
  return a + rnd() * (b - a);
}
