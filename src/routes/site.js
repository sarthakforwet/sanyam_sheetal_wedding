// Page routes for guests and visitors.

import { cookieHeader, sign } from '../lib/session.js';
import { visibleEvents, invitedEvents, announcementsFor, nextEvent } from '../lib/visibility.js';
import { buildIcs } from '../lib/calendar.js';
import { qrSvg } from '../lib/qr.js';
import { googleWalletSaveUrl } from '../lib/wallet.js';
import { tokenTag } from '../lib/session.js';
import { homePage, thankYouPage, notFoundPage } from '../views/pages/home.js';
import { eventsPage, stylePage, travelPage } from '../views/pages/info.js';
import { passPage } from '../views/pages/guest.js';
import { storyPage, familyPage, checkinPublicPage } from '../views/pages/content.js';
import { checkinGuestPage } from '../views/admin.js';
import { layout } from '../views/layout.js';
import { signInNeeded } from '../views/components.js';
import { html } from '../lib/html.js';

const send = (res, page, status = 200) => res.status(status).type('html').send(String(page));

export function guestOnly(req, res, next) {
  if (req.guest) return next();
  const c = res.locals.c;
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  send(res, layout(c, { body: html`<div class="container narrow">${signInNeeded(c)}</div>`, title: c.t('sign_in_needed_title'), noindex: true }), 401);
}

export function siteRoutes(app, deps) {
  const { store, config, limiter, secret, baseUrl, https, now, env } = deps;

  // ── Invite link → session ───────────────────────────────────────────────
  app.get('/i/:token', limiter.limit('invite', 30, 10 * 60_000), (req, res) => {
    const guest = store.guestByToken(req.params.token);
    if (!guest) return send(res, notFoundPage(res.locals.c, res.locals.c.t('invalid_link')), 404);
    const cookies = [cookieHeader('g', sign({ gid: guest.id, tv: tokenTag(guest.token) }, secret), { maxAge: 180 * 86400, secure: https })];
    if (guest.lang) cookies.push(cookieHeader('lang', guest.lang, { maxAge: 365 * 86400, secure: https }));
    res.setHeader('Set-Cookie', cookies);
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    // Drop the token from the address bar (screenshots, shoulder-surfing)
    res.redirect(303, '/');
  });

  app.get('/logout', (req, res) => {
    res.setHeader('Set-Cookie', cookieHeader('g', '', { maxAge: 0, secure: https }));
    res.redirect(303, '/');
  });

  app.get('/lang/:code', (req, res) => {
    const code = config.languages.includes(req.params.code) ? req.params.code : config.defaultLanguage;
    res.setHeader('Set-Cookie', cookieHeader('lang', code, { maxAge: 365 * 86400, secure: https }));
    const next = typeof req.query.next === 'string' && /^\/(?!\/)/.test(req.query.next) ? req.query.next : '/';
    res.redirect(303, next);
  });

  // ── Pages ───────────────────────────────────────────────────────────────
  app.get('/', async (req, res) => {
    const c = res.locals.c;
    if (c.mode === 'thankyou') {
      const photos = config.story.gallery.map((g) => ({ full: g.src, thumb: g.thumb, alt: c.tr(g.alt) }));
      const link = config.thankYou.photosLink;
      return send(res, thankYouPage(c, { photos, photosQr: link?.url ? await qrSvg(link.url) : '' }));
    }
    const events = visibleEvents(config, req.guest);
    const t = c.now;
    const liveEvent = events.find((e) => Date.parse(e.start) <= t && t < Date.parse(e.end)) || null;
    send(res, homePage(c, {
      events,
      announcements: announcementsFor(store.data.announcements, req.guest, { now: t }),
      liveEvent,
      upNext: nextEvent(events, t),
    }));
  });

  app.get('/events', (req, res) => send(res, eventsPage(res.locals.c, { events: visibleEvents(config, req.guest) })));
  app.get('/style', (req, res) => {
    const events = req.guest ? invitedEvents(config, req.guest) : visibleEvents(config, null);
    send(res, stylePage(res.locals.c, { events }));
  });
  app.get('/travel', (req, res) => send(res, travelPage(res.locals.c)));
  app.get('/story', (req, res) => send(res, storyPage(res.locals.c)));
  app.get('/family', (req, res) => send(res, familyPage(res.locals.c)));

  app.get('/pass', guestOnly, async (req, res) => {
    const c = res.locals.c;
    const checkinUrl = `${baseUrl}/c/${req.guest.checkinCode}`;
    const events = invitedEvents(config, req.guest);
    send(res, passPage(c, {
      events,
      qrSvg: await qrSvg(checkinUrl),
      walletUrl: googleWalletSaveUrl({ env, baseUrl, guest: req.guest, config, events, tr: c.tr, checkinUrl }),
      checkins: store.data.checkins.filter((k) => k.guestId === req.guest.id),
    }));
  });

  // ── Calendar files (only events this visitor may see) ───────────────────
  app.get('/cal/:file', (req, res) => {
    const c = res.locals.c;
    const id = req.params.file.replace(/\.ics$/, '');
    const events = id === 'all' ? (req.guest ? invitedEvents(config, req.guest) : visibleEvents(config, null)) : visibleEvents(config, req.guest).filter((e) => e.id === id);
    if (!events.length) return send(res, notFoundPage(c), 404);
    res.type('text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${id}.ics"`);
    res.send(buildIcs(config, events, { tr: c.tr, host: new URL(baseUrl).host, now: now() }));
  });

  // ── Pass scan landing (staff see the check-in screen) ───────────────────
  app.get('/c/:code', limiter.limit('scan', 60, 60_000), (req, res) => {
    const c = res.locals.c;
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    if (!c.isStaff) return send(res, checkinPublicPage(c));
    const guest = store.guestByCheckin(req.params.code);
    if (!guest) return send(res, notFoundPage(c, 'No guest with that pass code.'), 404);
    send(res, checkinGuestPage(c, {
      guest,
      events: invitedEvents(config, guest),
      defaultEvent: nextEvent(invitedEvents(config, guest), c.now),
      checkins: store.data.checkins.filter((k) => k.guestId === guest.id),
      msg: req.query.msg === 'ok' ? 'Checked in ✓' : '',
    }));
  });

  // ── Misc ────────────────────────────────────────────────────────────────
  app.get('/robots.txt', (req, res) => {
    res.type('text').send(config.indexable
      ? 'User-agent: *\nDisallow: /i/\nDisallow: /c/\nDisallow: /admin\nDisallow: /api/\nDisallow: /pass\n'
      : 'User-agent: *\nDisallow: /\n');
  });

  app.get('/manifest.webmanifest', (req, res) => {
    res.type('application/manifest+json').send(JSON.stringify({
      name: `${config.couple.names.en} · ${config.hashtag}`,
      short_name: config.couple.names.en,
      start_url: '/',
      display: 'standalone',
      background_color: '#170406',
      theme_color: '#170406',
      icons: [{ src: '/img/icon-192.png', sizes: '192x192', type: 'image/png' }, { src: '/img/icon-512.png', sizes: '512x512', type: 'image/png' }],
    }));
  });
}
