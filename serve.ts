// POLLEN DRIFT -- a tiny static server for game/, so the entry can be played locally without a build
// step or a dependency: `node serve.ts`, then open the address it prints. Node 22, standard library
// only. It sends the MIME types a browser game needs, refuses any path outside game/, and does nothing
// else clever: this is a development convenience, not a server for the internet.
//
// Before the resolution check below, every request path is already normalised: the URL parser collapses
// `..` inside a path, and decodeURIComponent plus normalize resolves whatever is left, so a traversal
// arrives here as a path outside root and is answered 403 rather than followed.
import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The directory served: game/ beside this file, and nothing above it. */
const root = resolve(fileURLToPath(new URL('./game', import.meta.url)));
const DEFAULT_PORT = 8080;

/** The port to listen on: the --port flag, else 8080; anything else falls back to 8080. */
function chosenPort(): number {
  const args = process.argv.slice(2);
  const flag = args.indexOf('--port');
  const asked = flag === -1 ? DEFAULT_PORT : Number(args[flag + 1]);
  return Number.isInteger(asked) && asked > 0 && asked < 65536 ? asked : DEFAULT_PORT;
}

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.wav': 'audio/wav',
  '.txt': 'text/plain; charset=utf-8',
};

const server = createServer((request, response) => {
  const path = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname.replace(/\/+$/, ''));
  const wanted = path === '' ? 'index.html' : path.replace(/^\/+/, '');
  const file = resolve(join(root, normalize(wanted)));
  // Nothing outside game/ is ever read: a request that climbs out with .. is refused, not followed.
  if (file !== root && !file.startsWith(root + sep)) {
    response.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' }).end('forbidden');
    return;
  }
  let size: number;
  try {
    const stats = statSync(file);
    if (!stats.isFile()) throw new Error('not a file');
    size = stats.size;
  } catch {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('not found');
    return;
  }
  response.writeHead(200, {
    'content-type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
    'content-length': size,
    'cache-control': 'no-store',
  });
  createReadStream(file).pipe(response);
});

const port = chosenPort();
server.listen(port, '127.0.0.1', () => {
  console.log(`POLLEN DRIFT is served on http://localhost:${port} -- open it and fly`);
  console.log(`serving ${root}`);
});
