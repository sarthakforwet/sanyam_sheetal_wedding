// "Save to Google Wallet" links, signed locally (no API round-trip).
// Needs a Google Wallet issuer account and a service-account JSON key:
//   GOOGLE_WALLET_ISSUER_ID=3388000000012345678
//   GOOGLE_WALLET_SA_FILE=./secrets/wallet-sa.json
// Without them, guests get the downloadable QR pass instead.
//
// Apple Wallet (.pkpass) needs an Apple Developer pass-type certificate to
// sign; it isn't bundled — the downloadable pass works on iPhone as well.

import fs from 'node:fs';
import crypto from 'node:crypto';

let cachedKey;
function serviceAccount(env) {
  if (cachedKey !== undefined) return cachedKey;
  cachedKey = null;
  if (env.GOOGLE_WALLET_ISSUER_ID && env.GOOGLE_WALLET_SA_FILE) {
    try {
      const sa = JSON.parse(fs.readFileSync(env.GOOGLE_WALLET_SA_FILE, 'utf8'));
      if (sa.client_email && sa.private_key) cachedKey = sa;
    } catch (err) {
      console.warn('[wallet] could not read service account file:', err.message);
    }
  }
  return cachedKey;
}

export const googleWalletEnabled = (env = process.env) => !!serviceAccount(env);

const b64u = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');

export function googleWalletSaveUrl({ env = process.env, baseUrl, guest, config, events, tr, checkinUrl }) {
  const sa = serviceAccount(env);
  if (!sa) return null;
  const issuer = env.GOOGLE_WALLET_ISSUER_ID;
  const classId = `${issuer}.sanyam_sheetal_wedding`;
  const lang = (s) => ({ defaultValue: { language: 'en', value: s } });

  const claims = {
    iss: sa.client_email,
    aud: 'google',
    typ: 'savetowallet',
    origins: [baseUrl],
    payload: {
      genericClasses: [{ id: classId }],
      genericObjects: [
        {
          id: `${issuer}.${guest.checkinCode}`,
          classId,
          state: 'ACTIVE',
          cardTitle: lang(tr(config.couple.names)),
          header: lang(guest.name),
          subheader: lang(`${config.hashtag} · ${tr(config.dateRange)}`),
          hexBackgroundColor: '#7A1B2A',
          logo: { sourceUri: { uri: `${baseUrl}/img/icon-192.png` } },
          barcode: { type: 'QR_CODE', value: checkinUrl, alternateText: guest.checkinCode },
          textModulesData: events.map((e) => ({ id: e.id, header: tr(e.name), body: `${new Date(e.start).toLocaleString('en-IN', { timeZone: config.timezone, dateStyle: 'medium', timeStyle: 'short' })} · ${tr(config.venues[e.venue].name)}` })),
        },
      ],
    },
  };
  const header = { alg: 'RS256', typ: 'JWT' };
  const unsigned = `${b64u(header)}.${b64u(claims)}`;
  const signature = crypto.createSign('RSA-SHA256').update(unsigned).sign(sa.private_key).toString('base64url');
  return `https://pay.google.com/gp/v/save/${unsigned}.${signature}`;
}
