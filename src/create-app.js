// Application factory. Everything environmental (store, clock, env, paths)
// is injected so tests can build isolated instances.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import express from 'express';
import compression from 'compression';
import defaultConfig from '../config/wedding.js';
import defaultI18n from '../config/i18n.js';
import { securityHeaders, sameOrigin, createRateLimiter } from './lib/security.js';
import { verify, parseCookies, tokenTag } from './lib/session.js';
import { siteMode, mainEvent } from './lib/visibility.js';
import { conciergeEnabled } from './lib/concierge.js';
import { siteRoutes } from './routes/site.js';
import { apiRoutes } from './routes/api.js';
import { adminRoutes } from './routes/admin.js';
import { notFoundPage } from './views/pages/home.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PUBLIC_DIR = path.join(ROOT, 'public');

// Cache-busting token for /assets URLs. On Vercel the deployment's commit is
// the natural version (the CDN serves public/, so the files aren't on disk).
function assetVersion(env) {
  if (env.VERCEL_GIT_COMMIT_SHA) return env.VERCEL_GIT_COMMIT_SHA.slice(0, 10);
  if (env.VERCEL_DEPLOYMENT_ID) return env.VERCEL_DEPLOYMENT_ID.slice(-10);
  const h = crypto.createHash('sha1');
  for (const f of ['site.css', 'site.js', 'admin.js']) {
    const p = path.join(PUBLIC_DIR, 'assets', f);
    if (fs.existsSync(p)) h.update(fs.readFileSync(p));
  }
  return h.digest('hex').slice(0, 10);
}

export function createApp({
  store,
  config = defaultConfig,
  i18n = defaultI18n,
  env = process.env,
  now = () => (env.SIMULATE_NOW ? Date.parse(env.SIMULATE_NOW) : Date.now()),
} = {}) {
  if (!store) throw new Error('createApp needs a store');
  const secret = env.SESSION_SECRET || (env.NODE_ENV === 'production' ? null : 'dev-secret-change-me');
  if (!secret) throw new Error('SESSION_SECRET must be set in production');

  const app = express();
  // Public URL for share links, QR codes and Open Graph tags. On Vercel, fall
  // back to the project's production domain when BASE_URL isn't set.
  const fallbackUrl = env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}` : `http://localhost:${env.PORT || 3000}`;
  const baseUrl = (env.BASE_URL || fallbackUrl).replace(/\/$/, '');
  const https = baseUrl.startsWith('https://');
  const limiter = createRateLimiter({ now });
  const version = assetVersion(env);
  const deps = { store, config, i18n, env, now, limiter, secret, baseUrl, https };

  app.disable('x-powered-by');
  // Behind Vercel's (or any) proxy, read the client IP from X-Forwarded-For
  const trust = env.TRUST_PROXY || (env.VERCEL ? 'true' : '');
  if (trust) app.set('trust proxy', trust === 'true' ? true : /^\d+$/.test(trust) ? Number(trust) : trust);
  app.use(compression());
  app.use(securityHeaders({ https }));

  // Static assets (local server only; on Vercel the CDN serves public/ and
  // express.static is ignored). Fingerprinted bundles are immutable.
  app.use('/assets', express.static(path.join(PUBLIC_DIR, 'assets'), { maxAge: '365d', immutable: true, index: false }));
  app.use(express.static(PUBLIC_DIR, { maxAge: '1d', index: false }));

  app.use(express.urlencoded({ extended: false, limit: '32kb', parameterLimit: 100 }));
  app.use(express.json({ limit: '32kb' }));
  app.use(sameOrigin());

  // Refresh the data snapshot (Redis on Vercel; a no-op for the file store)
  app.use(async (req, res, next) => {
    await store.load();
    next();
  });

  // Per-request context: who's visiting, which language, what mode the site is in
  app.use((req, res, next) => {
    const cookies = parseCookies(req.headers.cookie);
    const t0 = now();
    const sess = verify(cookies.g, secret, t0);
    let guest = sess?.gid ? store.guestById(sess.gid) : null;
    if (guest && sess.tv !== tokenTag(guest.token)) guest = null;
    req.guest = guest;
    const adm = verify(cookies.a, secret, t0);
    req.role = adm?.role || null;

    const acceptHi = /^hi\b/i.test(req.get('accept-language') || '');
    const lang = config.languages.includes(cookies.lang) ? cookies.lang : guest?.lang || (acceptHi ? 'hi' : config.defaultLanguage);
    const dict = i18n[lang] || i18n.en;
    const t = (key, vars) => {
      const s = dict[key] ?? i18n.en[key] ?? key;
      return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? String(vars[k]) : m)) : s;
    };
    const tr = (v) => (v && typeof v === 'object' ? v[lang] || v.en || '' : v ?? '');
    let mode = siteMode(config, t0);
    if (req.role === 'admin' && req.query.preview === 'thankyou') mode = 'thankyou';

    res.locals.c = {
      lang, t, tr, config, guest, now: t0, mode, path: req.path, baseUrl,
      nonce: res.locals.nonce, assetVersion: version,
      isAdmin: req.role === 'admin',
      isStaff: req.role === 'admin' || req.role === 'staff',
      conciergeOn: conciergeEnabled(env),
      mainEvent: mainEvent(config),
    };
    // Personal pages must never be indexed or cached by shared caches
    if (guest || req.role) {
      res.setHeader('X-Robots-Tag', 'noindex, nofollow');
      res.setHeader('Cache-Control', 'private, no-store');
    }
    next();
  });

  siteRoutes(app, deps);
  apiRoutes(app, deps);
  adminRoutes(app, deps);

  app.use((req, res) => {
    if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'not_found' });
    res.status(404).type('html').send(String(notFoundPage(res.locals.c)));
  });

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error('[error]', req.method, req.path, err);
    if (res.headersSent) return;
    if (req.path.startsWith('/api/') || req.get('accept')?.includes('json')) return res.status(500).json({ error: 'server_error' });
    res.status(500).type('text').send('Something went wrong. Please try again in a moment.');
  });

  app.locals.deps = deps;
  return app;
}
