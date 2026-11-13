// Pages that need a signed-in guest: the wallet pass.

import { html, raw, jsonForScript } from '../../lib/html.js';
import { layout } from '../layout.js';
import { icon } from '../motifs.js';
import { pageHead, eventStyle, evInk } from '../components.js';
import { fmtShortDate, fmtTime } from '../../lib/time.js';

export function passPage(c, { events, qrSvg, walletUrl, checkins }) {
  const { t, tr, lang, guest, config } = c;
  const done = new Set(checkins.map((k) => k.eventId));
  // Everything the browser needs to draw the downloadable pass image
  const passData = {
    couple: tr(config.couple.names),
    tag: `${config.hashtag} · ${tr(config.dateRange)}`,
    name: guest.name,
    meta: `${t('pass_party', { n: guest.maxGuests })} · ${t('pass_code')}: ${guest.checkinCode}`,
    room: guest.stay?.room ? `${t('pass_room')}: ${guest.stay.room}, ${guest.stay.hotel}` : '',
    events: events.map((ev) => ({ name: tr(ev.name), when: `${fmtShortDate(ev.start, lang)} · ${fmtTime(ev.start, lang)}`, color: evInk(ev.color) })),
    footer: t('pass_intro').split('.')[0],
  };
  const body = html`
<div class="container narrow">
  ${pageHead(t('pass_title'), t('pass_intro'))}
  <article class="pass-card" aria-label="${t('pass_title')}">
    <div class="pass-top">
      <p class="pass-couple">${tr(config.couple.names)}</p>
      <p class="pass-tag">${config.hashtag} · ${tr(config.dateRange)}</p>
    </div>
    <div class="pass-qr" role="img" aria-label="QR · ${t('pass_code')} ${guest.checkinCode}">${raw(qrSvg)}</div>
    <p class="pass-name">${guest.name}</p>
    <p class="pass-meta">${t('pass_party', { n: guest.maxGuests })} · ${t('pass_code')}: <code>${guest.checkinCode}</code></p>
    ${guest.stay?.room ? html`<p class="pass-meta">${t('pass_room')}: <strong>${guest.stay.room}</strong>, ${guest.stay.hotel}</p>` : ''}
    <ul class="pass-events">
      ${events.map((ev) => html`<li ${eventStyle(ev)}><span>${icon(ev.icon)} ${tr(ev.name)}</span><span class="muted">${fmtShortDate(ev.start, lang)} · ${fmtTime(ev.start, lang)}</span>${done.has(ev.id) ? html`<span class="badge yes">${icon('check')} ${t('pass_checked_in')}</span>` : ''}</li>`)}
    </ul>
  </article>
  <div class="stack center">
    ${walletUrl ? html`<a class="btn btn-dark" href="${walletUrl}" target="_blank" rel="noopener">${icon('wallet')}<span>${t('pass_google')}</span></a>` : ''}
    <button type="button" class="btn btn-primary" data-pass-download hidden>${icon('download')}<span>${t('pass_download')}</span></button>
    <p class="muted small">${t('pass_tip')}</p>
  </div>
  <script type="application/json" id="pass-data">${jsonForScript(passData)}</script>
</div>`;
  return layout(c, { body, page: 'pass', title: t('pass_title'), noindex: true });
}
