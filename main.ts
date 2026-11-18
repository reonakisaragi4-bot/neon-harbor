// Neon Harbor — make.fun gta6-01 entrypoint (Node 22, standard library only).
//
// The game is plain static files under game/: index.html opens in desktop
// Chrome and plays offline — three.js is vendored as game/vendor/
// three.module.min.js and everything else is original code written for this
// bounty. This program hands the entry in: it copies game/ and screenshots/
// from beside this file to /output and writes /output/dossier.json, the
// summary the judge reads, with the vendored make.fun library.
//
// Serve it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
//
// Neon Harbor is a fully original open-world crime game: a sun-soaked
// coastal city explored on foot and by car, with traffic, pedestrians,
// stealable cars, a 5-star wanted system with Harbor PD pursuit, four story
// missions, combat, a live minimap HUD, save/load and synthesised sound.

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Preflight: refuse to hand in a half-built entry rather than writing a
// dossier over missing files. The grader would refuse it anyway, and a
// loud failure here is cheaper than a silent one there.
const required = [join(here, 'game', 'index.html'), join(here, 'game', 'src', 'main.js')];
for (const file of required) {
  if (!existsSync(file)) throw new Error(`Neon Harbor entry is incomplete: missing ${file}`);
}

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the
// bytes; the others refuse an entry the scorer would refuse (more than 4
// screenshots or one over 256 KiB; more than 993 files in game/ or 48 MiB of
// game files, in all, or a path under game/ over 1000 bytes: game/ counts
// beside /output's own 1000-entry cap, its screenshots/ and dossier.json).
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
