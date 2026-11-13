// Who-sees-what rules. Kept pure (no I/O) so they're easy to test.

const ts = (iso) => new Date(iso).getTime();
const byStart = (a, b) => ts(a.start) - ts(b.start);

// Events a visitor may see: public events for everyone, plus the events the
// signed-in guest is invited to. Order: chronological.
export function visibleEvents(config, guest) {
  const invited = new Set(guest?.events || []);
  return config.events.filter((e) => e.public || invited.has(e.id)).sort(byStart);
}

export const canSeeEvent = (config, guest, eventId) =>
  visibleEvents(config, guest).some((e) => e.id === eventId);

// Events the guest is formally invited to
export function invitedEvents(config, guest) {
  if (!guest) return [];
  const invited = new Set(guest.events || []);
  return config.events.filter((e) => invited.has(e.id)).sort(byStart);
}

// 'upcoming' before the first event, 'live' during the wedding,
// 'thankyou' once the final event has ended.
export function siteMode(config, now = Date.now()) {
  const sorted = [...config.events].sort(byStart);
  if (!sorted.length) return 'upcoming';
  const lastEnd = Math.max(...sorted.map((e) => ts(e.end)));
  if (now >= lastEnd) return 'thankyou';
  if (now >= ts(sorted[0].start)) return 'live';
  return 'upcoming';
}

export function nextEvent(events, now = Date.now()) {
  return [...events].sort(byStart).find((e) => ts(e.end) > now) || null;
}

export const mainEvent = (config) => config.events.find((e) => e.id === config.mainEventId) || config.events[0];

// An event's dress code: its own, or the wedding-wide one
export const dressFor = (config, ev) => ev.dress || config.dressCode;

// Day-by-day programme: visible functions plus non-function items (meals),
// grouped by IST date, chronological.
export function programme(config, events) {
  const items = [
    ...events.map((e) => ({ time: e.start, name: e.name, tagline: e.tagline, event: e })),
    ...(config.programmeExtras || []).filter((x) => events.some((e) => e.start.slice(0, 10) === x.time.slice(0, 10))).map((x) => ({ time: x.time, name: x.name })),
  ].sort((a, b) => ts(a.time) - ts(b.time));
  const days = new Map();
  for (const it of items) {
    const key = it.time.slice(0, 10);
    if (!days.has(key)) days.set(key, []);
    days.get(key).push(it);
  }
  return [...days].map(([date, list]) => ({ date, items: list }));
}

// ── Announcement targeting ────────────────────────────────────────────────
// audience.type:
//   'public'      everyone, including visitors without an invite link
//   'guests'      every signed-in guest
//   'events'      guests invited to any of audience.values (event ids)
//   'sides'       guests on any of audience.values ('bride' | 'groom'); a
//                 guest whose side is 'both' matches either
//   'groups'      guests in any of audience.values (e.g. 'outstation')
//   'individuals' specific guest ids
export function matchesAudience(audience, guest) {
  const type = audience?.type || 'public';
  const values = audience?.values || [];
  if (type === 'public') return true;
  if (!guest) return false;
  switch (type) {
    case 'guests':
      return true;
    case 'events':
      return (guest.events || []).some((id) => values.includes(id));
    case 'sides':
      return guest.side === 'both' ? values.length > 0 : values.includes(guest.side);
    case 'groups':
      return (guest.groups || []).some((g) => values.includes(g));
    case 'individuals':
      return values.includes(guest.id);
    default:
      return false;
  }
}

export function isActive(a, now = Date.now()) {
  if (a.startsAt && ts(a.startsAt) > now) return false;
  if (a.endsAt && ts(a.endsAt) <= now) return false;
  return true;
}

export function announcementsFor(announcements, guest, { now = Date.now() } = {}) {
  return announcements
    .filter((a) => isActive(a, now) && matchesAudience(a.audience, guest))
    .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || ts(b.createdAt) - ts(a.createdAt));
}
