// Server entry point.
//  • On Vercel this module is imported and the default-exported app becomes a
//    Vercel Function; data lives in Upstash Redis.
//  • Locally (`npm start`) it seeds sample data on first run and listens on PORT,
//    storing data in data/db.json (or Redis, if its credentials are in .env).

import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createApp } from './create-app.js';
import { storeFromEnv } from './store.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const onVercel = !!process.env.VERCEL;
if (!onVercel) {
  try {
    process.loadEnvFile?.(path.join(ROOT, '.env'));
  } catch {
    /* no .env file — rely on the real environment */
  }
}

const env = process.env;
const dataDir = path.resolve(ROOT, env.DATA_DIR || 'data');
const store = await storeFromEnv(env, { file: path.join(dataDir, 'db.json') });

const app = createApp({ store, env });
export default app;

if (!onVercel) {
  // Local-only conveniences: generated images and sample data
  const { ensureAssets } = await import('../scripts/assets.js');
  await ensureAssets();
  if (store.kind === 'file' && !store.exists() && env.NODE_ENV !== 'production') {
    console.log('[seed] No database found — creating sample data…');
    const { seed } = await import('./seed.js');
    await seed(store);
  }

  const port = Number(env.PORT || 3000);
  const server = app.listen(port, () => {
    const { baseUrl } = app.locals.deps;
    console.log(`\n  ${baseUrl}  (admin: ${baseUrl}/admin)  [store: ${store.kind}]`);
    if (env.NODE_ENV !== 'production' && store.data.guests.length) {
      const sample = store.data.guests.slice(0, 3).map((g) => `  ${g.name.padEnd(28)} ${baseUrl}/i/${g.token}`);
      console.log(`\n  Sample guest links:\n${sample.join('\n')}\n  (all links: data/demo-links.txt or the admin Guests page)\n`);
      fs.mkdirSync(dataDir, { recursive: true });
      fs.writeFileSync(path.join(dataDir, 'demo-links.txt'), store.data.guests.map((g) => `${g.name}\t${baseUrl}/i/${g.token}`).join('\n') + '\n');
    }
    if (!env.ADMIN_PASSWORD) console.warn('  ⚠ ADMIN_PASSWORD is not set — the admin area is locked.');
    if (!env.ANTHROPIC_API_KEY) console.log('  ℹ ANTHROPIC_API_KEY not set — concierge widget hidden.');
  });

  const shutdown = () => {
    store.flush();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2000).unref();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
