// Admin & staff views. English only — the hosts' team uses these.

import { html, raw } from '../lib/html.js';
import { icon } from './motifs.js';
import { fmtDateTime, fmtTime, fmtShortDate } from '../lib/time.js';

const en = (v) => (v && typeof v === 'object' ? v.en : v ?? '');

function shell(c, { title, body, nav = true }) {
  const links = c.isAdmin
    ? [['/admin', 'Dashboard'], ['/admin/guests', 'Guests'], ['/admin/checkin', 'Check-in'], ['/admin/announcements', 'Announcements']]
    : [['/admin/checkin', 'Check-in']];
  return html`<!doctype html>
<html lang="en" class="no-js admin-html">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${title} · Wedding admin</title>
<link rel="icon" href="/img/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600&family=Mulish:wght@400;600;700&display=swapfamily=Poppins:wght@400;500;600https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600&family=Mulish:wght@400;600;700&display=swapdisplay=swap">
<link rel="stylesheet" href="/assets/site.css?v=${c.assetVersion}">
<script nonce="${c.nonce}">document.documentElement.classList.replace('no-js','js')</script>
<script src="/assets/admin.js?v=${c.assetVersion}" defer></script>
</head>
<body class="admin">
<header class="admin-top">
  <a class="brand" href="${c.isAdmin ? '/admin' : '/admin/checkin'}"><span class="brand-text">${en(c.config.couple.names)} · admin</span></a>
  ${nav && (c.isAdmin || c.isStaff) ? html`<nav class="admin-nav" aria-label="Admin">${links.map(([h, l]) => html`<a href="${h}" ${c.path === h ? raw('aria-current="page"') : ''}>${l}</a>`)}<a href="/admin/logout">Sign out</a></nav>` : ''}
</header>
<main id="main" class="admin-main">${body}</main>
</body></html>`;
}

const flashMsg = (msg) => (msg ? html`<p class="flash flash-ok" role="status">${msg}</p>` : '');

export function loginPage(c, { error, next }) {
  return shell(c, {
    title: 'Sign in',
    nav: false,
    body: html`<form class="card narrow-card" method="post" action="/admin/login">
      <h1>Sign in</h1>
      ${error ? html`<p class="flash flash-error" role="alert">${error}</p>` : ''}
      <input type="hidden" name="next" value="${next || ''}">
      <div class="field"><label for="pw">Admin password or staff PIN</label><input id="pw" type="password" name="password" autocomplete="current-password" required autofocus></div>
      <button class="btn btn-primary" type="submit">Sign in</button>
    </form>`,
  });
}

export function dashboardPage(c, { households, events }) {
  const body = html`
<h1>Dashboard</h1>
<div class="stat-row">
  <div class="stat"><strong>${households}</strong><span><a href="/admin/guests">households invited</a></span></div>
</div>
<p class="admin-actions"><a class="btn btn-ghost btn-sm" href="/admin/guests.csv">${icon('download')} Export guest list (CSV)</a> <a class="btn btn-ghost btn-sm" href="/admin/guests">Manage guests</a> <a class="btn btn-ghost btn-sm" href="/?preview=thankyou">Preview thank-you page</a></p>

<h2>Invitations & check-ins by function</h2>
<div class="table-wrap"><table>
<thead><tr><th>Function</th><th>When</th><th>Households invited</th><th>Up to (people)</th><th>Checked in (households)</th><th>Checked in (people)</th></tr></thead>
<tbody>${events.map((r) => html`<tr><th scope="row">${en(r.name)}</th><td>${fmtShortDate(r.start)} ${fmtTime(r.start)}</td><td>${r.households}</td><td>${r.maxHeads}</td><td>${r.checkedInHouseholds}</td><td><strong>${r.checkedInHeads}</strong></td></tr>`)}</tbody>
</table></div>
`;
  return shell(c, { title: 'Dashboard', body });
}

function guestForm(c, g = {}) {
  const { config } = c;
  const has = (arr, v) => (arr || []).includes(v);
  return html`
<div class="row-2">
  <div class="field"><label for="name">Household / display name</label><input id="name" name="name" required maxlength="80" value="${g.name || ''}" placeholder="The Mehta family"></div>
  <div class="field"><label for="phone">WhatsApp number</label><input id="phone" name="phone" maxlength="20" value="${g.phone || ''}" placeholder="+91…"></div>
</div>
<div class="row-2">
  <div class="field"><label for="side">Side</label><select id="side" name="side">${config.sides.map((s) => html`<option ${g.side === s ? raw('selected') : ''}>${s}</option>`)}</select></div>
  <div class="field"><label for="maxGuests">Max guests</label><input id="maxGuests" type="number" name="maxGuests" min="1" max="20" value="${g.maxGuests || 2}"></div>
</div>
<fieldset><legend>Invited to</legend><div class="seg wrap">${config.events.map((e) => html`<label><input type="checkbox" name="events" value="${e.id}" ${has(g.events, e.id) || (!g.id && e.public) ? raw('checked') : ''}><span>${en(e.name)}</span></label>`)}</div></fieldset>
<fieldset><legend>Groups</legend><div class="seg wrap">${config.groups.map((x) => html`<label><input type="checkbox" name="groups" value="${x}" ${has(g.groups, x) ? raw('checked') : ''}><span>${x}</span></label>`)}</div></fieldset>
<div class="row-2">
  <div class="field"><label for="hotel">Hotel</label><input id="hotel" name="hotel" maxlength="80" value="${g.stay?.hotel || ''}"></div>
  <div class="field"><label for="room">Room</label><input id="room" name="room" maxlength="20" value="${g.stay?.room || ''}"></div>
</div>
<div class="row-2">
  <div class="field"><label for="checkIn">Check-in</label><input id="checkIn" name="checkIn" maxlength="40" value="${g.stay?.checkIn || ''}" placeholder="1 Dec, 12 noon"></div>
  <div class="field"><label for="checkOut">Check-out</label><input id="checkOut" name="checkOut" maxlength="40" value="${g.stay?.checkOut || ''}"></div>
</div>
<div class="field"><label for="transportNote">Transport note (shown to the guest)</label><input id="transportNote" name="transportNote" maxlength="200" value="${g.transportNote || ''}"></div>
<div class="field"><label for="notes">Private notes (admin only)</label><input id="notes" name="notes" maxlength="300" value="${g.notes || ''}"></div>`;
}

export function guestsPage(c, { guests, msg, q }) {
  const link = (g) => `${c.baseUrl}/i/${g.token}`;
  const body = html`
<h1>Guests <small class="muted">(${guests.length})</small></h1>
${flashMsg(msg)}
<p class="admin-actions"><a class="btn btn-ghost btn-sm" href="/admin/qr-sheet" target="_blank">Printable QR cards</a> <a class="btn btn-ghost btn-sm" href="/admin/guests.csv">Export CSV</a></p>
<form class="search" method="get"><label class="sr-only" for="q">Search</label><input id="q" name="q" value="${q || ''}" placeholder="Search name, phone, group…"><button class="btn btn-sm">Search</button></form>
<div class="table-wrap"><table class="guest-table">
<thead><tr><th>Name</th><th>Side</th><th>Events</th><th>Max</th><th>Room</th><th>Invite link</th><th></th></tr></thead>
<tbody>${guests.map((g) => html`<tr>
  <td><strong>${g.name}</strong><br><span class="muted small">${g.phone || ''} ${(g.groups || []).join(', ')}</span></td>
  <td>${g.side}</td><td class="small">${(g.events || []).join(', ')}</td><td>${g.maxGuests}</td>
  <td>${g.stay?.room || ''}</td>
  <td><code class="small" data-copy-text>${link(g)}</code> <button type="button" class="link-btn" data-copy>Copy</button>
    · <a href="https://wa.me/${(g.phone || '').replace(/\D/g, '')}?text=${encodeURIComponent(`Namaste! Your invitation to ${en(c.config.couple.names)}'s wedding: ${link(g)}`)}" target="_blank" rel="noopener">WhatsApp</a>
    · <a href="/admin/guests/${g.id}/qr.png" download="invite-${g.id}.png">QR</a></td>
  <td><a href="/admin/guests/${g.id}">Edit</a></td>
</tr>`)}</tbody></table></div>

<details class="card" ${guests.length ? '' : raw('open')}>
<summary><strong>Add a guest / household</strong></summary>
<form method="post" action="/admin/guests">${guestForm(c)}<button class="btn btn-primary" type="submit">Add guest</button></form>
</details>`;
  return shell(c, { title: 'Guests', body });
}

export function guestEditPage(c, { guest, qrSvg }) {
  const body = html`
<p><a href="/admin/guests">← Guests</a></p>
<h1>${guest.name}</h1>
<div class="two-col">
<form class="card" method="post" action="/admin/guests/${guest.id}">${guestForm(c, guest)}<button class="btn btn-primary" type="submit">Save</button></form>
<div>
  <div class="card center"><div class="admin-qr">${raw(qrSvg)}</div><p class="small"><code>${c.baseUrl}/i/${guest.token}</code></p>
  <p><a class="btn btn-ghost btn-sm" href="/admin/guests/${guest.id}/qr.png" download="invite-${guest.id}.png">Download QR (PNG)</a></p>
  <p class="small muted">Check-in code: <code>${guest.checkinCode}</code></p></div>
  <form class="card" method="post" action="/admin/guests/${guest.id}/rotate"><p class="small">Rotating the link invalidates the old one (use if a link was shared by mistake).</p><button class="btn btn-ghost btn-sm" type="submit">Rotate invite link</button></form>
  <form class="card" method="post" action="/admin/guests/${guest.id}/delete" data-confirm="Delete ${guest.name} and their check-ins and bookings?"><button class="btn btn-danger btn-sm" type="submit">Delete guest</button></form>
</div></div>`;
  return shell(c, { title: guest.name, body });
}

export function qrSheetPage(c, { cards }) {
  return html`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex"><title>QR cards</title>
<link rel="stylesheet" href="/assets/site.css?v=${c.assetVersion}"></head>
<body class="qr-sheet">${cards.map((k) => html`<div class="qr-card"><p class="qr-couple">${en(c.config.couple.names)}</p>${raw(k.svg)}<p class="qr-name">${k.guest.name}</p><p class="qr-hint">Scan for your personal invitation</p></div>`)}</body></html>`;
}

export function announcementsAdminPage(c, { items, msg }) {
  const { config } = c;
  const aud = (a) => `${a.audience.type}${a.audience.values?.length ? `: ${a.audience.values.join(', ')}` : ''}`;
  const body = html`<h1>Announcements</h1>${flashMsg(msg)}
<ul class="mod-list">${items.map((a) => html`<li class="card">
  <p><strong>${a.title.en}</strong> ${a.pinned ? html`<span class="badge">pinned</span>` : ''} <span class="muted small">→ ${aud(a)}</span></p>
  <p>${a.body.en}</p>${a.title.hi ? html`<p class="muted" lang="hi">${a.title.hi} — ${a.body.hi}</p>` : ''}
  <p class="small muted">${a.startsAt ? `from ${fmtDateTime(a.startsAt)} ` : ''}${a.endsAt ? `until ${fmtDateTime(a.endsAt)}` : ''}</p>
  <form method="post" action="/admin/announcements/${a.id}/delete" data-confirm="Delete this announcement?"><button class="btn btn-ghost btn-sm">Delete</button></form>
</li>`)}</ul>
<form class="card" method="post" action="/admin/announcements">
  <h2>New announcement</h2>
  <div class="field"><label for="title_en">Title (English)</label><input id="title_en" name="title_en" required maxlength="100"></div>
  <div class="field"><label for="body_en">Message (English)</label><textarea id="body_en" name="body_en" rows="3" required maxlength="600"></textarea></div>
  <div class="field"><label for="title_hi">Title (Hindi, optional)</label><input id="title_hi" name="title_hi" maxlength="100" lang="hi"></div>
  <div class="field"><label for="body_hi">Message (Hindi, optional)</label><textarea id="body_hi" name="body_hi" rows="3" maxlength="600" lang="hi"></textarea></div>
  <div class="field"><label for="aud">Audience</label>
    <select id="aud" name="type" data-audience>
      <option value="public">Everyone (including public visitors)</option>
      <option value="guests">All signed-in guests</option>
      <option value="events">Guests invited to specific events</option>
      <option value="sides">Bride's / groom's side</option>
      <option value="groups">Guest groups</option>
    </select></div>
  <fieldset data-aud-for="events" hidden><legend>Events</legend><div class="seg wrap">${config.events.map((e) => html`<label><input type="checkbox" name="values_events" value="${e.id}"><span>${e.name.en}</span></label>`)}</div></fieldset>
  <fieldset data-aud-for="sides" hidden><legend>Sides</legend><div class="seg wrap">${['bride', 'groom'].map((s) => html`<label><input type="checkbox" name="values_sides" value="${s}"><span>${s}</span></label>`)}</div></fieldset>
  <fieldset data-aud-for="groups" hidden><legend>Groups</legend><div class="seg wrap">${config.groups.map((g) => html`<label><input type="checkbox" name="values_groups" value="${g}"><span>${g}</span></label>`)}</div></fieldset>
  <div class="row-2">
    <div class="field"><label for="startsAt">Show from (optional)</label><input id="startsAt" type="datetime-local" name="startsAt"></div>
    <div class="field"><label for="endsAt">Hide after (optional)</label><input id="endsAt" type="datetime-local" name="endsAt"></div>
  </div>
  <label class="check"><input type="checkbox" name="pinned" value="on"><span>Pin to top</span></label>
  <button class="btn btn-primary" type="submit">Publish</button>
</form>`;
  return shell(c, { title: 'Announcements', body });
}

export function checkinPage(c, { stats, events, defaultEvent, msg }) {
  const body = html`<h1>Check-in</h1>${flashMsg(msg)}
<div class="stat-row">${events.map((e) => html`<div class="stat"><strong>${stats[e.id]?.households || 0}</strong><span>${e.name.en} · ${stats[e.id]?.heads || 0} people</span></div>`)}</div>
<section class="card center">
  <h2>Scan a guest pass</h2>
  <p class="muted">Point your phone camera at the QR on the guest's pass — it opens their check-in page. Or use the scanner below on Android/Chrome.</p>
  <div class="scanner" data-scanner hidden><video playsinline muted></video><p class="scan-status" aria-live="polite"></p></div>
  <p><button type="button" class="btn btn-primary" data-scan-start>${icon('camera')} Start scanner</button></p>
  <form method="get" action="/admin/checkin/lookup" class="inline-form"><label for="code">Or type the pass code</label> <input id="code" name="code" maxlength="20" autocapitalize="off" required> <button class="btn btn-ghost btn-sm">Find</button></form>
  <p class="small muted">Default event right now: <strong>${defaultEvent ? defaultEvent.name.en : '—'}</strong></p>
</section>`;
  return shell(c, { title: 'Check-in', body });
}

export function checkinGuestPage(c, { guest, events, defaultEvent, checkins, msg }) {
  const body = html`<p><a href="/admin/checkin">← Check-in</a></p>
${flashMsg(msg)}
<section class="card">
  <h1>${guest.name}</h1>
  <p class="muted">${guest.side} side · up to ${guest.maxGuests} · ${(guest.groups || []).join(', ')}</p>
  ${guest.stay?.room ? html`<p>Room <strong>${guest.stay.room}</strong>, ${guest.stay.hotel}</p>` : ''}
  <ul class="checkin-events">${events.map((e) => {
    const done = checkins.find((k) => k.eventId === e.id);
    return html`<li class="card ${defaultEvent?.id === e.id ? 'current' : ''}" style="--ev:${e.color}">
      <p><strong>${e.name.en}</strong> · ${fmtShortDate(e.start)} ${fmtTime(e.start)}</p>
      ${done ? html`<p class="badge yes">${icon('check')} Checked in ×${done.count} at ${fmtTime(done.at)}</p>` : html`
      <form method="post" action="/admin/checkin" class="inline-form">
        <input type="hidden" name="guestId" value="${guest.id}"><input type="hidden" name="eventId" value="${e.id}">
        <label for="n-${e.id}">People</label> <input id="n-${e.id}" type="number" name="count" min="1" max="${guest.maxGuests + 2}" value="${guest.maxGuests}">
        <button class="btn btn-primary" type="submit">Check in</button>
      </form>`}
    </li>`;
  })}</ul>
  ${guest.notes ? html`<p class="note">Note: ${guest.notes}</p>` : ''}
</section>`;
  return shell(c, { title: `Check-in · ${guest.name}`, body });
}
