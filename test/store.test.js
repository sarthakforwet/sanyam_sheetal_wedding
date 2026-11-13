// The Redis-backed store, as used on Vercel: several serverless instances
// share one database and must never lose each other's writes.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRedisStore, createStore, storeFromEnv, emptyData } from '../src/store.js';
import { startApp, fakeRedis } from './helpers.js';

describe('redis store', () => {
  test('starts empty and round-trips data between instances', async () => {
    const redis = fakeRedis();
    const a = createRedisStore({ redis });
    const b = createRedisStore({ redis });
    await a.load();
    assert.deepEqual(a.data, emptyData());
    await a.update((d) => { d.guests.push({ id: 'g1', name: 'Mehta family', token: 'tok', checkinCode: 'cc' }); });
    await b.load({ force: true });
    assert.equal(b.guestByToken('tok').name, 'Mehta family');
    assert.equal(b.guestByCheckin('cc').id, 'g1');
  });

  test('concurrent writes from different instances are all kept', async () => {
    const redis = fakeRedis({ delay: 2 });
    const instances = Array.from({ length: 4 }, () => createRedisStore({ redis }));
    await Promise.all(instances.map((s, i) => Promise.all(
      Array.from({ length: 5 }, (_, j) => s.update((d) => { d.checkins.push({ id: `k${i}-${j}` }); })),
    )));
    const check = createRedisStore({ redis });
    await check.load();
    assert.equal(check.data.checkins.length, 20);
    assert.equal(new Set(check.data.checkins.map((k) => k.id)).size, 20);
  });

  test('reads are cached briefly, then refreshed', async () => {
    const redis = fakeRedis();
    let t = 0;
    const a = createRedisStore({ redis, maxAgeMs: 2000, now: () => t });
    const b = createRedisStore({ redis, now: () => t });
    await a.load({ force: true });
    await b.update((d) => { d.announcements.push({ id: 'x' }); });
    t = 1000;
    await a.load();
    assert.equal(a.data.announcements.length, 0, 'still within the cache window');
    t = 2500;
    await a.load();
    assert.equal(a.data.announcements.length, 1);
  });

  test('a failed update leaves the stored data untouched', async () => {
    const redis = fakeRedis();
    const a = createRedisStore({ redis });
    await a.update((d) => { d.guests.push({ id: 'g1' }); });
    await assert.rejects(a.update((d) => { d.guests.length = 0; throw new Error('boom'); }));
    const b = createRedisStore({ redis });
    await b.load();
    assert.equal(b.data.guests.length, 1);
  });

  test('environment picks Redis only when credentials are present', async () => {
    assert.equal((await storeFromEnv({}, { file: null })).kind, 'file');
    assert.equal((await storeFromEnv({ KV_REST_API_URL: 'https://x.upstash.io', KV_REST_API_TOKEN: 't' }, { file: null })).kind, 'redis');
    assert.equal((await storeFromEnv({ UPSTASH_REDIS_REST_URL: 'https://x.upstash.io', UPSTASH_REDIS_REST_TOKEN: 't' }, { file: null })).kind, 'redis');
    assert.equal(createStore().kind, 'file');
  });
});

describe('the app on a shared Redis (two Vercel instances)', () => {
  test('a guest added on one instance can log in through another', async () => {
    const redis = fakeRedis();
    const one = await startApp({ store: createRedisStore({ redis, maxAgeMs: 0 }) });
    const two = await startApp({ store: createRedisStore({ redis, maxAgeMs: 0 }), seeded: false });
    try {
      const admin = await one.loginAdmin();
      const res = await one.request('/admin/guests', { cookie: admin, method: 'POST', body: new URLSearchParams({ name: 'Sharma ji', maxGuests: '3', side: 'groom', events: 'reception' }), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
      assert.equal(res.status, 303);
      await two.store.load({ force: true });
      const g = two.guest('Sharma ji');
      assert.ok(g, 'visible on the other instance');
      const cookie = await two.loginGuest(g);
      assert.ok(cookie);
      assert.equal((await two.request('/pass', { cookie })).status, 200);
    } finally {
      await one.close();
      await two.close();
    }
  });

  test('simultaneous check-ins at the venue are all recorded', async () => {
    const redis = fakeRedis({ delay: 1 });
    const one = await startApp({ store: createRedisStore({ redis }) });
    const two = await startApp({ store: createRedisStore({ redis }), seeded: false });
    try {
      await two.store.load({ force: true });
      const [s1, s2] = [await one.loginAdmin('9999'), await two.loginAdmin('9999')];
      const guests = one.store.data.guests.filter((g) => g.events.includes('reception')).slice(0, 6);
      await Promise.all(guests.map((g, i) => (i % 2 ? two : one).request('/admin/checkin', {
        cookie: i % 2 ? s2 : s1, method: 'POST',
        body: new URLSearchParams({ guestId: g.id, eventId: 'reception', count: '2' }),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      })));
      const check = createRedisStore({ redis });
      await check.load();
      assert.equal(check.data.checkins.filter((k) => k.eventId === 'reception').length, guests.length);
    } finally {
      await one.close();
      await two.close();
    }
  });
});
