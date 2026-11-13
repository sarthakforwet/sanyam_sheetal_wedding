// Stateless signed cookies (HMAC-SHA256). Payloads are small JSON objects;
// tampering or expiry makes them read as absent.

import crypto from 'node:crypto';

const b64u = (buf) => Buffer.from(buf).toString('base64url');

export function sign(payload, secret) {
  const body = b64u(JSON.stringify(payload));
  const mac = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${mac}`;
}

export function verify(value, secret, now = Date.now()) {
  if (typeof value !== 'string') return null;
  const [body, mac] = value.split('.');
  if (!body || !mac) return null;
  const expected = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (data.exp && data.exp < now) return null;
    return data;
  } catch {
    return null;
  }
}

export function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    if (!k) continue;
    try {
      out[k] = decodeURIComponent(part.slice(i + 1).trim());
    } catch {
      out[k] = part.slice(i + 1).trim();
    }
  }
  return out;
}

export function cookieHeader(name, value, { maxAge, secure, httpOnly = true, sameSite = 'Lax' } = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, 'Path=/', `SameSite=${sameSite}`];
  if (httpOnly) parts.push('HttpOnly');
  if (secure) parts.push('Secure');
  if (maxAge != null) parts.push(`Max-Age=${Math.floor(maxAge)}`);
  return parts.join('; ');
}

export function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

// Short fingerprint of a guest token, embedded in the session so rotating
// a guest's link signs out every device that used the old one.
export const tokenTag = (token) => crypto.createHash('sha256').update(token).digest('base64url').slice(0, 10);
