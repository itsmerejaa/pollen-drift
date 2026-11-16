// POLLEN DRIFT -- handing the entry in. This program is the whole submission step: it copies the game
// and its screenshots to the output directory and writes dossier.json, the summary the judge reads.
// Node 22, standard library only, and erasable TypeScript so `node main.ts` runs it with no build.
//
// Outside the grader's container MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier, readGameTree } from './vendor/makefun-game.ts';

/** The directory this file sits in: game/ and screenshots/ are its neighbours. */
const here = fileURLToPath(new URL('.', import.meta.url));
/** Where the judge reads the entry from; MAKEFUN_OUTPUT_DIR is the way to run it anywhere else. */
const output = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const gameDir = join(here, 'game');
const shotsDir = join(here, 'screenshots');
const outGame = join(output, 'game');
const outShots = join(output, 'screenshots');

/** The judge's own caps (its gate.json): the text cap shapes the dossier, the rest refuse an entry the
 * judge would refuse -- more than 4 screenshots or one over 256 KiB, more than 993 entries or 48 MiB
 * under game/, or a path under game/ longer than 1000 bytes. */
const CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

/** Every file under a directory, by relative path, so what was handed in can be counted and printed. */
function filesUnder(dir: string, prefix = ''): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) found.push(...filesUnder(join(dir, entry.name), path));
    else if (entry.isFile()) found.push(path);
    else throw new Error(`${dir}/${path}: a symbolic link or special file (the entry holds plain files only)`);
  }
  return found;
}

/** The entry's own checks, run before anything is copied: a failure here is better than a rejection. */
function checkEntry(): void {
  const index = join(gameDir, 'index.html');
  if (!existsSync(index)) throw new Error('game/index.html: missing (the game is a directory of static files)');
  const bytes = statSync(index).size;
  if (bytes > 1024 * 1024) throw new Error(`game/index.html: ${bytes} bytes, over the 1 MiB a page may be`);
  const shots = existsSync(shotsDir) ? filesUnder(shotsDir) : [];
  if (shots.length === 0) throw new Error('screenshots/: no images (3 or 4 are handed in, the first by name the cover)');
  if (shots.length > CAPS.screenshots.max) throw new Error(`screenshots/: ${shots.length} files, more than the ${CAPS.screenshots.max} allowed`);
  console.log(`game/index.html ${(bytes / 1024).toFixed(1)} KiB, ${shots.length} screenshots`);
}

checkEntry();

// Copy the entry into the output directory. rmSync is left out on purpose: nothing is deleted that the
// caller did not ask to be replaced, so a mistake here cannot destroy a directory it was not given.
mkdirSync(outGame, { recursive: true });
mkdirSync(outShots, { recursive: true });
cpSync(gameDir, outGame, { recursive: true });
cpSync(shotsDir, outShots, { recursive: true });

// What was actually copied, and what the judge will read: the tree read back from the output directory,
// so the dossier describes the bytes on disk rather than the ones intended.
const tree = readGameTree(outGame, CAPS);
const dossier = buildDossier(output, CAPS);
writeFileSync(join(output, 'dossier.json'), dossier);

const sources = tree.files.filter((file) => file.cls === 'source');
const vendored = tree.files.filter((file) => file.cls === 'vendored');
const assets = tree.files.filter((file) => file.cls === 'asset');
console.log(`game/  ${tree.files.length} files in ${tree.directories.length} directories, ${(tree.totalBytes / 1024).toFixed(1)} KiB`);
console.log(`       ${sources.length} source, ${vendored.length} vendored, ${assets.length} assets`);
console.log(`screenshots/ ${filesUnder(outShots).length} files`);
const readBack = JSON.parse(readFileSync(join(output, 'dossier.json'), 'utf8'));
console.log(`dossier.json  ${(dossier.byteLength / 1024).toFixed(1)} KiB, ${dossier.byteLength} bytes, schema ${readBack.schema}, ${readBack.images.length} images`);
