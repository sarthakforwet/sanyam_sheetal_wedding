# Sanyam & Sheetal — #ShyamsavereWithU

A mobile-first wedding website for Sanyam and Sheetal's two-day wedding at Radha Krishna Marriage Resort, Indore (2nd & 3rd December 2026). Most guests will open it from a WhatsApp link, so it's server-rendered HTML with one small stylesheet and one small script. Everything still works with JavaScript off.

The look follows the family's invitation site: a "velvet theatre" theme with night and wine backgrounds, gold Playfair Display headings, Poppins body text, cream "paper" cards with lace edges, and the pre-wedding photos. There is no RSVP. Guests with questions about attending WhatsApp the family.

## Quick start

```bash
npm install
cp .env.example .env        # set SESSION_SECRET, ADMIN_PASSWORD, STAFF_PIN
npm start                   # http://localhost:3000
```

On first run the site seeds sample data: 12 households and a couple of announcements. It then prints a few personal invite links. You'll find all the links in `data/demo-links.txt` and on **/admin/guests**.

| Command | What it does |
|---|---|
| `npm start` | Run the server |
| `npm run dev` | Run with auto-reload |
| `npm test` | Run the tests: guest visibility and privacy, announcement targeting, programme, the Redis store, i18n, photos |
| `npm run seed` | Wipe `data/` and re-seed the sample data |
| `npm run og` | Regenerate the WhatsApp preview image (couple photo + names) and icons |

Requires Node 22 or later (developed and tested on Node 23).

## Making it yours

All content lives in **`config/wedding.js`**, and every text field there is `{ en, hi }`. Interface labels are in **`config/i18n.js`**.

Taken from the family's invitation site: the programme and timings, the venue, the Pastel Carnival dress code (lavender for women, peach for men), the groom's parents, the "For any queries" phone numbers and the photo captions. Still to fill in or check:

- **Sheetal's family**: `families[1]` is empty and hidden until you add `about` and `members`.
- **Family photos**: set `photo: '/img/family/name.jpg'` to replace the monogram avatars.
- **Hindi spelling of the surname**: written as "बडगोती". Correct it in the config if the family spells it differently.
- **Travel notes**: the airport and station travel times are approximate.
- **Highlight film** (thank-you page): `thankYou.videoEmbed`, e.g. `https://www.youtube-nocookie.com/embed/<id>`.
- **Music**: drop a licensed MP3 in `public/audio/` and set `music.src`. Without it, the music button plays a soft synthesised tanpura drone. Music stays off until the guest taps the button.

**Photos** live in `public/img/photos/` as WebP (full size plus `-sm` thumbnails). `config.photos` chooses the hero slideshow, venue arch, closing photo and WhatsApp preview photo (`photos.og`; run `npm run og` after changing it). `story.timeline` and `story.gallery` hold the captioned "Our story" and "Moments" photos.

Only start times are shown to guests, matching the invitation. Each event's `end` is used for calendar entries and to decide when the thank-you page takes over, so adjust it if you know the real end time. Event colours (`color`, `tint`) theme each function's card and programme line. Text and buttons automatically use a darkened shade that passes WCAG AA contrast on cream.

## How guests use it

1. **Invite link.** Each household gets an unguessable link, `/i/<token>`. Opening it signs them in with a signed, HTTP-only cookie (valid 180 days) and immediately redirects to `/`, so the token never stays in the address bar. Send links from **/admin/guests**: each row has a prefilled *WhatsApp* button, *Copy* and a *QR* PNG. **/admin/qr-sheet** prints QR cards for physical invitations.
2. **Envelope.** On the first visit the guest taps the gold seal: the curtains part, the flap opens and the invitation letter rises, then "View the invitation" leads to the photo hero and a countdown to the Baraat. They can skip it, Esc closes it, and it's skipped entirely under reduced motion. "Replay invitation" brings it back.
3. **Everything else.** The programme and function cards (directions, Google Calendar / `.ics`), the Pastel Carnival mood board, a live forecast and a personal packing checklist. Also the venue, a wallet pass, travel and their room, story and moments, and families and contact numbers.
4. **Thank-you mode.** After the last event ends, `/` turns into a thank-you page with the highlight film, photos from the shoot and (once you set `thankYou.photosLink`) a link with a QR code to the official photos. Admins can preview it with `/?preview=thankyou`.

Visitors without a link see the public pages: story, families, travel and the public function (Reception & Dinner). To make another function public, set `public: true` on it.

## Admin (`/admin`)

Sign in with `ADMIN_PASSWORD`.

- **Dashboard**: per function, the households invited, the most people who could come, and who has checked in at the venue. Export the guest list as CSV (with a guard against spreadsheet formula injection).
- **Guests**: add and edit households (events, max party size, side, groups, hotel and room, transport note). Rotating a link signs out every device that used the old one.
- **Announcements**: target everyone, all guests, invitees of specific functions, the bride's or groom's side, or groups such as `outstation`. You can schedule start and end times and pin announcements.
- **Check-in**: staff sign in with `STAFF_PIN` (check-in access only). The QR on each guest's pass opens `/c/<code>`. On iPhone, just point the camera app at it; on Android Chrome there's also an in-page scanner. Non-staff who scan a pass see no guest details.

## AI concierge

Set `ANTHROPIC_API_KEY` and a chat button appears. It answers using only the wedding config plus the signed-in guest's own record (their functions, room and transport note). It never has other guests' data. When it isn't sure, it gives the coordinator's WhatsApp link.

- Uses the official Anthropic SDK with `claude-opus-5-5` at `effort: "low"` (override with `CONCIERGE_MODEL`). The wedding facts are prompt-cached. Server-side refusal fallbacks are enabled with `fallbacks: "default"`.
- Rate limits: 8 messages per minute and 80 per day, per guest (or per IP for visitors). The history is trimmed to 10 turns of 600 characters each.
- Without a key the widget is hidden and `/api/concierge` returns 404.

## Wallet pass

- Every guest gets a pass page with a QR code. *Download pass* draws a PNG of it in the guest's own browser (so it uses the site's fonts), which works on any phone.
- **Google Wallet**: set `GOOGLE_WALLET_ISSUER_ID` and `GOOGLE_WALLET_SA_FILE` (a service-account JSON key with Wallet access) and an *Add to Google Wallet* button appears. The link is signed locally.
- **Apple Wallet** is not included. `.pkpass` files must be signed with an Apple Developer pass-type certificate. The PNG pass is the fallback on iPhone.

## Privacy & security

- The guest list, rooms, phone numbers and other guests' details are never rendered to anyone but admins. Tests check every guest page for leaks of other guests' rooms, tokens, pass codes and phone numbers.
- `noindex` is sent on every personal page (both the header and the meta tag), with `Cache-Control: private, no-store`. By default `robots.txt` blocks everything (`indexable: false` in the config).
- A strict CSP with per-request nonces, `frame-ancestors 'none'` and `Referrer-Policy: same-origin`. Cross-site POSTs are rejected (Origin / Sec-Fetch-Site checks plus SameSite cookies).
- Rate limits cover invite links, admin login and the concierge. They are kept in memory per server instance, so on Vercel they're best-effort.

## Deploying to Vercel

The app runs as a single Vercel Function (zero-config Express: `src/index.js` default-exports the app). `public/` is served by Vercel's CDN. Data (guests, check-ins, announcements) lives in **Upstash Redis** as one JSON document; each instance caches it for 2 seconds, and every write is an atomic compare-and-swap, so simultaneous check-ins never overwrite each other. `vercel.json` pins the function to Mumbai (`bom1`) and sets long cache lifetimes for `/assets` and `/img`.

1. **Push to GitHub** (the repo must include `public/og.png`, `public/img/` and `package-lock.json`).
2. **Import the repo** at vercel.com/new. Framework preset: *Other* (Express is detected). No build command and no output directory.
3. **Add Upstash Redis:** in the project, open *Storage*, then *Marketplace*, and add **Upstash for Redis** (the free tier is plenty). Pick the **Mumbai (ap-south-1)** region and connect it to the project for Production and Preview. This adds `KV_REST_API_URL` and `KV_REST_API_TOKEN`.
4. **Environment variables** (Settings → Environment Variables, Production and Preview):

   | Variable | Value |
   |---|---|
   | `SESSION_SECRET` | 64 random hex characters (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`) |
   | `ADMIN_PASSWORD` | a strong password for `/admin` |
   | `STAFF_PIN` | a separate PIN for the venue check-in staff |
   | `BASE_URL` | the public URL, e.g. `https://sanyam-sheetal.vercel.app` or your custom domain (defaults to the production domain if unset) |
   | `ANTHROPIC_API_KEY` | optional, enables the chat assistant |

5. **Deploy**, then open `/admin`, sign in, and add guests under *Guests*. Production starts with an empty guest list. Each row's *WhatsApp* button sends that family their personal link.
6. **Custom domain (optional):** Settings → Domains. Then update `BASE_URL` and redeploy, because invite links and QR codes are built from it.
7. **Check the WhatsApp preview** by pasting the site link into a chat. If an old preview sticks, add `?v=2` to the link.

**Back up the data:** run `npm run backup` with the Upstash credentials in your `.env` (Upstash → your database → *REST API*); it writes `data/backup-<date>.json`. Upstash also keeps daily backups on paid plans.

**Local development against the real database:** put `KV_REST_API_URL` and `KV_REST_API_TOKEN` in `.env` and `npm start` uses Redis instead of `data/db.json`. `npm run seed` refuses to overwrite Redis unless you pass `--yes`.

**Testing time-based behaviour:** set `SIMULATE_NOW=2026-12-03T19:30:00+05:30` to see the "happening now" banner, or `2026-12-04T10:00:00+05:30` for thank-you mode.

## Project layout

```
config/          wedding.js (content), i18n.js (UI strings)
src/index.js     entry: default-exports the app for Vercel, or listens locally
src/create-app.js app factory: security, request context, routes
src/store.js     data store: Upstash Redis (Vercel) or data/db.json (local)
src/routes/      site pages, JSON API (weather, concierge), admin
src/lib/         visibility, targeting & programme, sessions, security, calendar, QR, weather, wallet, concierge
src/views/       server-rendered templates (auto-escaping html`` helper)
public/assets/   site.css, site.js, admin.js
scripts/         seed, backup, asset generation
test/            node:test suites
```
