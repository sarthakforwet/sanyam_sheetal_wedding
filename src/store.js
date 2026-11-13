// A small JSON document store with two backends:
//
//  • File (local dev / a server with a disk): the dataset lives in memory and
//    is flushed to data/db.json atomically (temp file + rename), debounced.
//  • Redis (Vercel): the dataset is one JSON document in Upstash Redis plus a
//    version counter. Each serverless instance keeps a short-lived snapshot for
//    reads; every write is an atomic compare-and-swap on the version, retried on
//    conflict, so concurrent writers (two staff checking guests in) never lose
//    each other's changes.
//
// For a wedding (hundreds of guests, a few thousand rows) one document is plenty.
//
// Interface (both backends):
//   store.data                 current snapshot (read-only by convention)
//   await store.load()         refresh the snapshot (no-op for the file store)
//   await store.update(fn)     apply fn(draft) atomically and persist; returns fn's result
//   await store.replace(data)  overwrite everything (seeding)

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const emptyData = () => ({
  version: 1,
  guests: [],
  checkins: [], // { id, guestId, eventId, count, at, by }
  announcements: [],
});

// Lookups shared by both backends
function accessors(get) {
  return {
    guestById: (id) => get().guests.find((g) => g.id === id) || null,
    guestByToken: (token) => {
      if (typeof token !== 'string' || !token) return null;
      // constant-time-ish compare to avoid leaking token prefixes via timing
      const buf = Buffer.from(token);
      return get().guests.find((g) => {
        const other = Buffer.from(g.token);
        return other.length === buf.length && crypto.timingSafeEqual(other, buf);
      }) || null;
    },
    guestByCheckin: (code) => get().guests.find((g) => g.checkinCode === code) || null,
  };
}

export function createStore({ file = null, data = null } = {}) {
  let state = data || emptyData();
  if (!data && file && fs.existsSync(file)) {
    state = { ...emptyData(), ...JSON.parse(fs.readFileSync(file, 'utf8')) };
  }
  let timer = null;

  function flush() {
    if (!file) return;
    clearTimeout(timer);
    timer = null;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(state, null, 1));
    fs.renameSync(tmp, file);
  }

  function save() {
    if (!file || timer) return;
    timer = setTimeout(flush, 150);
    timer.unref?.();
  }

  return {
    kind: 'file',
    get data() { return state; },
    async load() {},
    async update(fn) {
      const result = fn(state);
      save();
      return result;
    },
    async replace(next) { state = next; save(); },
    flush,
    exists: () => !!file && fs.existsSync(file),
    ...accessors(() => state),
  };
}

// Compare-and-swap: write only if nobody else wrote since we read
const CAS = `
local v = redis.call('GET', KEYS[2])
if (v or '0') ~= ARGV[1] then return -1 end
redis.call('SET', KEYS[1], ARGV[2])
return redis.call('INCR', KEYS[2])`;

export function createRedisStore({ redis, key = 'wedding:db', maxAgeMs = 2000, now = () => Date.now() }) {
  const vkey = `${key}:v`;
  let state = emptyData();
  let version = '0';
  let loadedAt = 0;
  let inflight = null;

  async function fetchState() {
    const [json, v] = await redis.mget(key, vkey);
    state = json ? { ...emptyData(), ...JSON.parse(json) } : emptyData();
    version = v == null ? '0' : String(v);
    loadedAt = now();
  }

  // Coalesce concurrent refreshes within one instance
  function refresh() {
    inflight ||= fetchState().finally(() => { inflight = null; });
    return inflight;
  }

  return {
    kind: 'redis',
    get data() { return state; },
    async load({ force = false } = {}) {
      if (force || now() - loadedAt > maxAgeMs) await refresh();
    },
    async update(fn, { retries = 15 } = {}) {
      for (let attempt = 0; attempt <= retries; attempt++) {
        // On a conflict, back off with jitter so competing writers spread out
        if (attempt) await new Promise((r) => setTimeout(r, Math.random() * Math.min(200, 20 * attempt)));
        await refresh();
        const draft = structuredClone(state);
        const result = fn(draft);
        const next = await redis.eval(CAS, [key, vkey], [version, JSON.stringify(draft)]);
        if (Number(next) !== -1) {
          state = draft;
          version = String(next);
          loadedAt = now();
          return result;
        }
      }
      throw new Error('store: too many concurrent writes, please retry');
    },
    async replace(next) {
      await redis.set(key, JSON.stringify(next));
      version = String(await redis.incr(vkey));
      state = next;
      loadedAt = now();
    },
    flush() {},
    exists: () => true,
    ...accessors(() => state),
  };
}

// Pick the backend from the environment: Upstash Redis when its credentials are
// present (the Vercel Marketplace integration sets KV_REST_API_*), else a file.
export async function storeFromEnv(env, { file }) {
  const url = env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN;
  if (url && token) {
    const { Redis } = await import('@upstash/redis');
    return createRedisStore({ redis: new Redis({ url, token, automaticDeserialization: false }), key: env.STORE_KEY || 'wedding:db' });
  }
  return createStore({ file });
}

const ALPHABET = '23456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
// Unambiguous base-55 tokens (no 0/O/1/l/I) — friendly for printed cards
export function newToken(len = 12) {
  const bytes = crypto.randomBytes(len * 2);
  let out = '';
  for (let i = 0; i < bytes.length && out.length < len; i++) {
    // rejection sampling keeps the distribution uniform
    if (bytes[i] < 220) out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return out.length === len ? out : newToken(len);
}

export const newId = (prefix = '') => prefix + crypto.randomBytes(6).toString('hex');
