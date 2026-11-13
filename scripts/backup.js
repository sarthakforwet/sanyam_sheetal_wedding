// Export all data to data/backup-<timestamp>.json: `npm run backup`
// Reads from Upstash Redis when its credentials are in the environment
// (.env), otherwise from data/db.json.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { storeFromEnv } from '../src/store.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
try { process.loadEnvFile?.(path.join(ROOT, '.env')); } catch { /* optional */ }

const dataDir = path.resolve(ROOT, process.env.DATA_DIR || 'data');
const store = await storeFromEnv(process.env, { file: path.join(dataDir, 'db.json') });
await store.load({ force: true });

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const out = path.join(dataDir, `backup-${stamp}.json`);
fs.mkdirSync(dataDir, { recursive: true });
fs.writeFileSync(out, JSON.stringify(store.data, null, 1));
const d = store.data;
console.log(`Backed up ${d.guests.length} guests, ${d.checkins.length} check-ins and ${d.announcements.length} announcements from ${store.kind === 'redis' ? 'Redis' : 'data/db.json'}\n→ ${out}`);
