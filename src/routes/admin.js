// Admin & staff routes: guest management, invitation reports, announcements
// and venue check-in. Every write goes through store.update (atomic on Redis).

import { cookieHeader, sign, safeEqual } from '../lib/session.js';
import { invitedEvents, nextEvent } from '../lib/visibility.js';
import { qrSvg, qrPng } from '../lib/qr.js';
import { newId, newToken } from '../store.js';
import * as V from '../views/admin.js';

const send = (res, page, status = 200) => res.status(status).type('html').send(String(page));
const arr = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);
const clean = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

// CSV cell with spreadsheet formula-injection guard
const csvCell = (v) => {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function adminRoutes(app, deps) {
  const { store, config, limiter, env, secret, https, baseUrl, now } = deps;

  const requireAdmin = (req, res, next) => (req.role === 'admin' ? next() : res.redirect(303, `/admin/login?next=${encodeURIComponent(req.originalUrl)}`));
  const requireStaff = (req, res, next) => (req.role === 'admin' || req.role === 'staff' ? next() : res.redirect(303, `/admin/login?next=${encodeURIComponent(req.originalUrl)}`));
  const safeNext = (n, fallback) => (typeof n === 'string' && /^\/(?!\/)/.test(n) ? n : fallback);

  // ── Auth ────────────────────────────────────────────────────────────────
  app.get('/admin/login', (req, res) => send(res, V.loginPage(res.locals.c, { next: req.query.next })));

  app.post('/admin/login', limiter.limit('admin-login', 10, 15 * 60_000), (req, res) => {
    const pw = String(req.body.password || '');
    let role = null;
    if (env.ADMIN_PASSWORD && pw && safeEqual(pw, env.ADMIN_PASSWORD)) role = 'admin';
    else if (env.STAFF_PIN && pw && safeEqual(pw, env.STAFF_PIN)) role = 'staff';
    if (!role) return send(res, V.loginPage(res.locals.c, { error: env.ADMIN_PASSWORD ? 'That password didn’t match.' : 'ADMIN_PASSWORD is not set on the server.', next: req.body.next }), 401);
    const maxAge = role === 'admin' ? 12 * 3600 : 24 * 3600;
    res.setHeader('Set-Cookie', cookieHeader('a', sign({ role, exp: now() + maxAge * 1000 }, secret), { maxAge, secure: https }));
    res.redirect(303, safeNext(req.body.next, role === 'admin' ? '/admin' : '/admin/checkin'));
  });

  app.get('/admin/logout', (req, res) => {
    res.setHeader('Set-Cookie', cookieHeader('a', '', { maxAge: 0, secure: https }));
    res.redirect(303, '/admin/login');
  });

  // ── Dashboard ───────────────────────────────────────────────────────────
  // Per event: households invited, the most people that could come (sum of
  // invitation sizes), and who has actually checked in at the venue.
  function eventSummary() {
    const { guests, checkins } = store.data;
    return config.events.map((ev) => {
      const invited = guests.filter((g) => (g.events || []).includes(ev.id));
      const done = checkins.filter((k) => k.eventId === ev.id);
      return {
        id: ev.id, name: ev.name, start: ev.start,
        households: invited.length,
        maxHeads: invited.reduce((n, g) => n + (g.maxGuests || 0), 0),
        checkedInHouseholds: done.length,
        checkedInHeads: done.reduce((n, k) => n + k.count, 0),
      };
    });
  }

  app.get('/admin', requireAdmin, (req, res) => {
    const d = store.data;
    send(res, V.dashboardPage(res.locals.c, {
      households: d.guests.length,
      events: eventSummary(),
    }));
  });

  app.get('/admin/guests.csv', requireAdmin, (req, res) => {
    const { guests, checkins } = store.data;
    const evs = config.events;
    const head = ['name', 'phone', 'side', 'groups', 'max_guests', ...evs.map((e) => `${e.id}_invited`), ...evs.map((e) => `${e.id}_checked_in`), 'hotel', 'room', 'invite_link', 'pass_code'];
    const rows = guests.map((g) => [
      g.name, g.phone, g.side, (g.groups || []).join(' '), g.maxGuests,
      ...evs.map((e) => ((g.events || []).includes(e.id) ? 'yes' : '')),
      ...evs.map((e) => checkins.find((k) => k.guestId === g.id && k.eventId === e.id)?.count ?? ''),
      g.stay?.hotel, g.stay?.room, `${baseUrl}/i/${g.token}`, g.checkinCode,
    ]);
    res.type('text/csv; charset=utf-8').setHeader('Content-Disposition', 'attachment; filename="guests.csv"');
    res.send('﻿' + [head, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n'));
  });

  // ── Guests ──────────────────────────────────────────────────────────────
  function guestFromForm(body, prev = {}) {
    const events = arr(body.events).filter((id) => config.events.some((e) => e.id === id));
    const groups = arr(body.groups).filter((g) => config.groups.includes(g));
    const hotel = clean(body.hotel, 80);
    return {
      ...prev,
      name: clean(body.name, 80) || prev.name || 'Guest',
      phone: clean(body.phone, 20),
      side: config.sides.includes(body.side) ? body.side : 'both',
      maxGuests: Math.min(20, Math.max(1, Number.parseInt(body.maxGuests, 10) || 1)),
      events,
      groups,
      stay: hotel || body.room ? { hotel, room: clean(body.room, 20), checkIn: clean(body.checkIn, 40), checkOut: clean(body.checkOut, 40) } : null,
      transportNote: clean(body.transportNote, 200),
      notes: clean(body.notes, 300),
    };
  }

  app.get('/admin/guests', requireAdmin, (req, res) => {
    const q = clean(req.query.q, 60).toLowerCase();
    const guests = store.data.guests
      .filter((g) => !q || [g.name, g.phone, g.side, ...(g.groups || []), g.stay?.room].join(' ').toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
    send(res, V.guestsPage(res.locals.c, { guests, q, msg: req.query.msg === 'added' ? 'Guest added.' : req.query.msg === 'deleted' ? 'Guest deleted.' : '' }));
  });

  app.post('/admin/guests', requireAdmin, async (req, res) => {
    const g = guestFromForm(req.body, { id: newId('g'), token: newToken(10), checkinCode: newToken(8), createdAt: new Date(now()).toISOString() });
    await store.update((d) => { d.guests.push(g); });
    res.redirect(303, '/admin/guests?msg=added');
  });

  app.get('/admin/guests/:id', requireAdmin, async (req, res) => {
    const guest = store.guestById(req.params.id);
    if (!guest) return res.redirect(303, '/admin/guests');
    send(res, V.guestEditPage(res.locals.c, { guest, qrSvg: await qrSvg(`${baseUrl}/i/${guest.token}`) }));
  });

  app.post('/admin/guests/:id', requireAdmin, async (req, res) => {
    const found = await store.update((d) => {
      const i = d.guests.findIndex((g) => g.id === req.params.id);
      if (i >= 0) d.guests[i] = guestFromForm(req.body, d.guests[i]);
      return i >= 0;
    });
    res.redirect(303, found ? `/admin/guests/${req.params.id}` : '/admin/guests');
  });

  app.post('/admin/guests/:id/rotate', requireAdmin, async (req, res) => {
    const token = newToken(10);
    await store.update((d) => {
      const g = d.guests.find((x) => x.id === req.params.id);
      if (g) g.token = token;
    });
    res.redirect(303, `/admin/guests/${req.params.id}`);
  });

  app.post('/admin/guests/:id/delete', requireAdmin, async (req, res) => {
    const id = req.params.id;
    await store.update((d) => {
      d.guests = d.guests.filter((g) => g.id !== id);
      d.checkins = d.checkins.filter((k) => k.guestId !== id);
    });
    res.redirect(303, '/admin/guests?msg=deleted');
  });

  app.get('/admin/guests/:id/qr.png', requireAdmin, async (req, res) => {
    const guest = store.guestById(req.params.id);
    if (!guest) return res.sendStatus(404);
    res.type('png').setHeader('Content-Disposition', `attachment; filename="invite-${guest.name.replace(/[^\w-]+/g, '_')}.png"`);
    res.send(await qrPng(`${baseUrl}/i/${guest.token}`, { width: 900 }));
  });

  app.get('/admin/qr-sheet', requireAdmin, async (req, res) => {
    const cards = await Promise.all(store.data.guests.map(async (guest) => ({ guest, svg: await qrSvg(`${baseUrl}/i/${guest.token}`) })));
    send(res, V.qrSheetPage(res.locals.c, { cards }));
  });

  // ── Announcements ───────────────────────────────────────────────────────
  app.get('/admin/announcements', requireAdmin, (req, res) => {
    send(res, V.announcementsAdminPage(res.locals.c, { items: [...store.data.announcements].sort((a, b) => b.createdAt.localeCompare(a.createdAt)), msg: req.query.msg === 'ok' ? 'Published.' : '' }));
  });

  app.post('/admin/announcements', requireAdmin, async (req, res) => {
    const b = req.body;
    const type = ['public', 'guests', 'events', 'sides', 'groups'].includes(b.type) ? b.type : 'guests';
    const values = type === 'events' ? arr(b.values_events) : type === 'sides' ? arr(b.values_sides) : type === 'groups' ? arr(b.values_groups) : [];
    // Datetime-local inputs are entered in IST
    const istIso = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v) ? new Date(`${v}:00+05:30`).toISOString() : null);
    const titleEn = clean(b.title_en, 100);
    const bodyEn = clean(b.body_en, 600);
    if (!titleEn || !bodyEn) return res.redirect(303, '/admin/announcements');
    const announcement = {
      id: newId('a'),
      title: { en: titleEn, hi: clean(b.title_hi, 100) },
      body: { en: bodyEn, hi: clean(b.body_hi, 600) },
      audience: { type, values },
      startsAt: istIso(b.startsAt),
      endsAt: istIso(b.endsAt),
      pinned: b.pinned === 'on',
      createdAt: new Date(now()).toISOString(),
    };
    await store.update((d) => { d.announcements.push(announcement); });
    res.redirect(303, '/admin/announcements?msg=ok');
  });

  app.post('/admin/announcements/:id/delete', requireAdmin, async (req, res) => {
    await store.update((d) => { d.announcements = d.announcements.filter((a) => a.id !== req.params.id); });
    res.redirect(303, '/admin/announcements');
  });

  // ── Check-in (staff or admin) ───────────────────────────────────────────
  app.get('/admin/checkin', requireStaff, (req, res) => {
    const stats = {};
    for (const k of store.data.checkins) {
      stats[k.eventId] ||= { households: 0, heads: 0 };
      stats[k.eventId].households++;
      stats[k.eventId].heads += k.count;
    }
    send(res, V.checkinPage(res.locals.c, { stats, events: config.events, defaultEvent: nextEvent(config.events, now()), msg: req.query.msg === 'notfound' ? 'No pass with that code.' : '' }));
  });

  app.get('/admin/checkin/lookup', requireStaff, (req, res) => {
    const code = clean(req.query.code, 20);
    // Accept either the bare code or a scanned URL
    const m = /\/c\/([A-Za-z0-9]+)/.exec(code);
    const g = store.guestByCheckin(m ? m[1] : code);
    res.redirect(303, g ? `/c/${g.checkinCode}` : '/admin/checkin?msg=notfound');
  });

  app.post('/admin/checkin', requireStaff, async (req, res) => {
    const guest = store.guestById(String(req.body.guestId || ''));
    const eventId = String(req.body.eventId || '');
    if (!guest || !invitedEvents(config, guest).some((e) => e.id === eventId)) return res.status(422).type('text').send('Guest is not invited to that event.');
    const count = Math.min(guest.maxGuests + 2, Math.max(1, Number.parseInt(req.body.count, 10) || 1));
    const record = { id: newId('k'), guestId: guest.id, eventId, count, at: new Date(now()).toISOString(), by: req.role };
    await store.update((d) => {
      const existing = d.checkins.find((k) => k.guestId === guest.id && k.eventId === eventId);
      if (existing) existing.count = count;
      else d.checkins.push(record);
    });
    res.redirect(303, `/c/${guest.checkinCode}?msg=ok`);
  });
}
