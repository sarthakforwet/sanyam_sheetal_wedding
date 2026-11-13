import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import config from '../config/wedding.js';
import { visibleEvents, invitedEvents, canSeeEvent, siteMode, nextEvent, matchesAudience, announcementsFor, programme } from '../src/lib/visibility.js';

const guest = (over = {}) => ({ id: 'g1', side: 'bride', groups: ['friends'], events: ['sangeet', 'reception'], ...over });
const ids = (evs) => evs.map((e) => e.id);

describe('guest visibility', () => {
  test('visitors without an invite see only public events', () => {
    assert.deepEqual(ids(visibleEvents(config, null)), ['reception']);
  });

  test('guests see public events plus their invited events, in order', () => {
    assert.deepEqual(ids(visibleEvents(config, guest({ events: ['baraat', 'haldi'] }))), ['haldi', 'baraat', 'reception']);
  });

  test('a guest cannot see an event they are not invited to', () => {
    const g = guest();
    assert.equal(canSeeEvent(config, g, 'haldi'), false);
    assert.equal(canSeeEvent(config, g, 'sangeet'), true);
    assert.equal(canSeeEvent(config, g, 'reception'), true);
    assert.equal(canSeeEvent(config, g, 'does-not-exist'), false);
  });

  test('invitedEvents ignores public events the guest was not invited to', () => {
    assert.deepEqual(ids(invitedEvents(config, guest({ events: ['haldi'] }))), ['haldi']);
    assert.deepEqual(invitedEvents(config, null), []);
  });
});

describe('site mode', () => {
  test('switches from upcoming → live → thankyou around the events', () => {
    assert.equal(siteMode(config, Date.parse('2026-11-20T10:00:00+05:30')), 'upcoming');
    assert.equal(siteMode(config, Date.parse('2026-12-02T10:00:00+05:30')), 'live');
    assert.equal(siteMode(config, Date.parse('2026-12-03T23:29:00+05:30')), 'live');
    assert.equal(siteMode(config, Date.parse('2026-12-03T23:30:00+05:30')), 'thankyou');
  });

  test('nextEvent returns the current or next event', () => {
    const evs = visibleEvents(config, guest({ events: config.events.map((e) => e.id) }));
    assert.equal(nextEvent(evs, Date.parse('2026-12-02T15:30:00+05:30')).id, 'chaak');
    assert.equal(nextEvent(evs, Date.parse('2026-12-02T20:00:00+05:30')).id, 'sangeet');
    assert.equal(nextEvent(evs, Date.parse('2026-12-03T14:00:00+05:30')).id, 'reception');
    assert.equal(nextEvent(evs, Date.parse('2026-12-05T00:00:00+05:30')), null);
  });
});

describe('announcement targeting', () => {
  test('public announcements reach visitors and guests', () => {
    assert.equal(matchesAudience({ type: 'public' }, null), true);
    assert.equal(matchesAudience({ type: 'public' }, guest()), true);
  });

  test('every non-public audience excludes visitors without an invite', () => {
    for (const type of ['guests', 'events', 'sides', 'groups', 'individuals']) {
      assert.equal(matchesAudience({ type, values: ['sangeet', 'bride', 'friends', 'g1'] }, null), false, type);
    }
  });

  test('"events" targets guests invited to any listed event', () => {
    assert.equal(matchesAudience({ type: 'events', values: ['sangeet'] }, guest()), true);
    assert.equal(matchesAudience({ type: 'events', values: ['haldi', 'baraat'] }, guest()), false);
    assert.equal(matchesAudience({ type: 'events', values: ['sangeet'] }, guest({ events: [] })), false);
  });

  test('"sides" matches the guest side; "both"-side guests match either', () => {
    assert.equal(matchesAudience({ type: 'sides', values: ['bride'] }, guest()), true);
    assert.equal(matchesAudience({ type: 'sides', values: ['groom'] }, guest()), false);
    assert.equal(matchesAudience({ type: 'sides', values: ['groom'] }, guest({ side: 'both' })), true);
    assert.equal(matchesAudience({ type: 'sides', values: [] }, guest({ side: 'both' })), false);
  });

  test('"groups" matches any overlap', () => {
    assert.equal(matchesAudience({ type: 'groups', values: ['outstation', 'friends'] }, guest()), true);
    assert.equal(matchesAudience({ type: 'groups', values: ['outstation'] }, guest()), false);
    assert.equal(matchesAudience({ type: 'groups', values: ['outstation'] }, guest({ groups: undefined })), false);
  });

  test('"individuals" matches by guest id only', () => {
    assert.equal(matchesAudience({ type: 'individuals', values: ['g1'] }, guest()), true);
    assert.equal(matchesAudience({ type: 'individuals', values: ['g2'] }, guest()), false);
  });

  test('unknown audience types match nobody', () => {
    assert.equal(matchesAudience({ type: 'everyone-lol' }, guest()), false);
  });

  test('announcementsFor applies the time window and sorts pinned, then newest', () => {
    const now = Date.parse('2026-11-20T12:00:00+05:30');
    const list = [
      { id: 'old', audience: { type: 'guests' }, createdAt: '2026-11-01T00:00:00Z' },
      { id: 'new', audience: { type: 'guests' }, createdAt: '2026-11-10T00:00:00Z' },
      { id: 'pinned', pinned: true, audience: { type: 'guests' }, createdAt: '2026-10-01T00:00:00Z' },
      { id: 'future', audience: { type: 'guests' }, startsAt: '2026-11-25T00:00:00Z', createdAt: '2026-11-11T00:00:00Z' },
      { id: 'expired', audience: { type: 'guests' }, endsAt: '2026-11-15T00:00:00Z', createdAt: '2026-11-12T00:00:00Z' },
      { id: 'groom-only', audience: { type: 'sides', values: ['groom'] }, createdAt: '2026-11-12T00:00:00Z' },
    ];
    assert.deepEqual(announcementsFor(list, guest(), { now }).map((a) => a.id), ['pinned', 'new', 'old']);
    assert.deepEqual(announcementsFor(list, null, { now }).map((a) => a.id), []);
  });
});

describe('programme', () => {
  test('groups visible functions and meals by day, in order', () => {
    const days = programme(config, visibleEvents(config, guest({ events: config.events.map((e) => e.id) })));
    assert.deepEqual(days.map((d) => d.date), ['2026-12-02', '2026-12-03']);
    assert.deepEqual(days[0].items.map((i) => i.event?.id || i.name.en), ['haldi', 'Lunch', 'sagai', 'chaak', 'bhaat', 'sangeet']);
    assert.deepEqual(days[1].items.map((i) => i.event?.id), ['baraat', 'reception']);
  });

  test('visitors see only public functions, and no meals for days they have nothing on', () => {
    const days = programme(config, visibleEvents(config, null));
    assert.deepEqual(days.map((d) => d.items.map((i) => i.event?.id || i.name.en)), [['reception']]);
  });
});
