// Spin up an isolated app (in-memory store by default) on a random port.

import { createApp } from '../src/create-app.js';
import { createStore } from '../src/store.js';
import { seed } from '../src/seed.js';

export const BEFORE = Date.parse('2026-11-15T12:00:00+05:30');
export const AFTER_WEDDING = Date.parse('2026-12-04T09:00:00+05:30');

// Minimal stand-in for @upstash/redis covering what the Redis store uses
// (MGET, SET, INCR and the compare-and-swap script), with the same
// semantics, so tests can simulate several serverless instances sharing one
// database. `delay` adds async gaps to make interleavings realistic.
export function fakeRedis({ delay = 0 } = {}) {
  const kv = new Map();
  const wait = () => new Promise((r) => setTimeout(r, delay));
  return {
    kv,
    async mget(...keys) { await wait(); return keys.map((k) => kv.get(k) ?? null); },
    async set(k, v) { await wait(); kv.set(k, String(v)); return 'OK'; },
    async incr(k) { await wait(); const n = Number(kv.get(k) ?? 0) + 1; kv.set(k, String(n)); return n; },
    async eval(_script, [key, vkey], [expected, json]) {
      await wait();
      if ((kv.get(vkey) ?? '0') !== expected) return -1;
      kv.set(key, json);
      const n = Number(kv.get(vkey) ?? 0) + 1;
      kv.set(vkey, String(n));
      return n;
    },
  };
}

export async function startApp({ now = BEFORE, env = {}, store = null, seeded = true } = {}) {
  store ||= createStore();
  if (seeded) await seed(store);
  const clock = { now };
  const app = createApp({
    store,
    now: () => clock.now,
    env: { SESSION_SECRET: 'test-secret', ADMIN_PASSWORD: 'admin-pw', STAFF_PIN: '9999', BASE_URL: 'http://localhost', ...env },
  });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;

  // fetch that sends same-origin headers and a cookie
  const request = (p, { cookie = '', headers = {}, ...opts } = {}) =>
    fetch(base + p, { redirect: 'manual', ...opts, headers: { Origin: base, ...(cookie ? { Cookie: cookie } : {}), ...headers } });

  const cookieFrom = (res, name) => {
    const all = res.headers.getSetCookie?.() || [];
    const c = all.find((x) => x.startsWith(`${name}=`));
    return c ? c.split(';')[0] : '';
  };

  async function loginGuest(guest) {
    const res = await request(`/i/${guest.token}`);
    return cookieFrom(res, 'g');
  }

  async function loginAdmin(password = 'admin-pw') {
    const res = await request('/admin/login', { method: 'POST', body: new URLSearchParams({ password }), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
    return cookieFrom(res, 'a');
  }

  const form = (data) => ({ method: 'POST', body: new URLSearchParams(data), headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' } });

  return {
    app, store, base, clock, request, loginGuest, loginAdmin, form,
    guest: (name) => store.data.guests.find((g) => g.name === name),
    close: () => new Promise((r) => server.close(r)),
  };
}
