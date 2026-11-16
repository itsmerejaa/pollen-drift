// Verify the hand-in the way the scorer would: recompute the dossier from the output directory with the
// vendored library and compare it byte for byte with the file main.ts wrote, and check every cap the
// gate applies. Node 22, standard library only.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { buildDossier, readGameTree } from './vendor/makefun-game.ts';

const CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

const out = process.argv[2] ?? 'out';
const written = new Uint8Array(readFileSync(join(out, 'dossier.json')));
const rebuilt = buildDossier(out, CAPS);
const equal = written.length === rebuilt.length && written.every((byte, i) => byte === rebuilt[i]);
console.log(`dossier reproducible: ${equal ? 'YES' : 'NO'} (${written.length} bytes written, ${rebuilt.length} rebuilt)`);

const tree = readGameTree(join(out, 'game'), CAPS);
console.log(`game/ entries ${tree.count} (cap ${CAPS.game_max_files}), bytes ${tree.totalBytes} (cap ${CAPS.game_max_bytes})`);
const longest = tree.files.reduce((n, f) => Math.max(n, f.path.length), 0);
console.log(`longest path under game/: ${longest} bytes (cap ${CAPS.game_path_max_bytes})`);

const shots = readdirSync(join(out, 'screenshots')).sort();
for (const name of shots) {
  const bytes = statSync(join(out, 'screenshots', name)).size;
  const head = new Uint8Array(readFileSync(join(out, 'screenshots', name)));
  const png = head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47;
  // PNG: width and height are the two big-endian 32-bit words after the IHDR tag.
  const width = (head[16] << 24) | (head[17] << 16) | (head[18] << 8) | head[19];
  const height = (head[20] << 24) | (head[21] << 16) | (head[22] << 8) | head[23];
  const longSide = Math.max(width, height);
  const shortSide = Math.min(width, height);
  const ok = png && bytes <= CAPS.screenshots.max_bytes && longSide <= 1280 && shortSide >= 480;
  console.log(
    `screenshot ${name}: ${png ? 'png' : 'not png'} ${(bytes / 1024).toFixed(1)} KiB ` +
    `(cap ${(CAPS.screenshots.max_bytes / 1024).toFixed(0)} KiB), ${width}x${height} ` +
    `long ${longSide} <= 1280, short ${shortSide} >= 480  -> ${ok ? 'OK' : 'FAIL'}`,
  );
}

const doc = JSON.parse(new TextDecoder().decode(written));
console.log(`dossier: schema ${doc.schema}, cover ${doc.cover}, images ${doc.images.length}`);
console.log(`text bytes: ${new TextEncoder().encode(doc.text).length} (cap ${CAPS.text_max_bytes})`);
const headers = doc.text.split('\n').filter((line) => line.startsWith('### game/'));
console.log(`sources in the dossier: ${headers.length}`);
for (const line of headers) console.log(`   ${line.trim()}`);
