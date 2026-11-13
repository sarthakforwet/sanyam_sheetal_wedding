// Reset the database to the sample data: `npm run seed`
// Uses data/db.json, or Upstash Redis when its credentials are in the
// environment. Wiping Redis or a production database needs --yes.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { storeFromEnv } from '../src/store.js';
import { seed } from '../src/seed.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
try { process.loadEnvFile?.(path.join(ROOT, '.env')); } catch { /* optional */ }

const env = process.env;
const dataDir = path.resolve(ROOT, env.DATA_DIR || 'data');
const file = path.join(dataDir, 'db.json');
const store = await storeFromEnv(env, { file });

if ((env.NODE_ENV === 'production' || store.kind === 'redis') && !process.argv.includes('--yes')) {
  console.error(`This would replace ALL data in the ${store.kind === 'redis' ? 'Redis database' : 'production database'} with sample data.\nRe-run with --yes if you really mean it: npm run seed -- --yes`);
  process.exit(1);
}
if (store.kind === 'file') fs.rmSync(file, { force: true });

const d = await seed(store);
const base = (env.BASE_URL || `http://localhost:${env.PORT || 3000}`).replace(/\/$/, '');
console.log(`Seeded ${d.guests.length} households into ${store.kind === 'redis' ? 'Redis' : file}.\n`);
for (const g of d.guests) console.log(`${g.name.padEnd(28)} ${base}/i/${g.token}`);
