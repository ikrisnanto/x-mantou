/* Cloudflare Access verification.
 *
 * Access sits in front of /admin and the admin API routes and, once a visitor
 * has signed in, attaches a signed JWT to every request. We verify that JWT
 * here rather than trusting the edge alone: if a route were ever reachable
 * without the Access rule, the API must still refuse.
 *
 * Requires two vars on the Pages project:
 *   ACCESS_TEAM_DOMAIN  e.g. yourteam.cloudflareaccess.com
 *   ACCESS_AUD          the Application Audience tag of the Access app
 *
 * If either is missing every admin call is denied. Failing closed matters more
 * than convenience: an unconfigured deployment must not be an open one.
 */

const certCache = new Map(); // teamDomain -> { keys, fetchedAt }
const CERT_TTL_MS = 60 * 60 * 1000;

function b64urlToBytes(s) {
  const pad = s.length % 4 ? '='.repeat(4 - (s.length % 4)) : '';
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function b64urlToJson(s) {
  return JSON.parse(new TextDecoder().decode(b64urlToBytes(s)));
}

async function getKeys(teamDomain) {
  const hit = certCache.get(teamDomain);
  if (hit && Date.now() - hit.fetchedAt < CERT_TTL_MS) return hit.keys;

  const res = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error('could not fetch Access certificates');
  const { keys } = await res.json();
  if (!Array.isArray(keys) || !keys.length) throw new Error('no Access signing keys');

  certCache.set(teamDomain, { keys, fetchedAt: Date.now() });
  return keys;
}

/**
 * Returns { ok: true, email } for a valid Access session, otherwise
 * { ok: false, status, reason }.
 */
export async function verifyAccess(request, env) {
  const teamDomain = env.ACCESS_TEAM_DOMAIN;
  const aud = env.ACCESS_AUD;
  if (!teamDomain || !aud) {
    return { ok: false, status: 503, reason: 'Admin access is not configured on this deployment.' };
  }

  const token =
    request.headers.get('Cf-Access-Jwt-Assertion') ||
    (request.headers.get('Cookie') || '').match(/(?:^|;\s*)CF_Authorization=([^;]+)/)?.[1];

  if (!token) return { ok: false, status: 401, reason: 'Not signed in.' };

  const parts = token.split('.');
  if (parts.length !== 3) return { ok: false, status: 401, reason: 'Malformed token.' };
  const [headerB64, payloadB64, sigB64] = parts;

  let header, payload;
  try {
    header = b64urlToJson(headerB64);
    payload = b64urlToJson(payloadB64);
  } catch {
    return { ok: false, status: 401, reason: 'Malformed token.' };
  }

  if (header.alg !== 'RS256') return { ok: false, status: 401, reason: 'Unexpected token algorithm.' };

  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== 'number' || payload.exp <= now) {
    return { ok: false, status: 401, reason: 'Session expired.' };
  }
  if (typeof payload.nbf === 'number' && payload.nbf > now + 60) {
    return { ok: false, status: 401, reason: 'Token not yet valid.' };
  }

  // The audience tag binds the token to THIS application; without it a token
  // minted for any other app in the account would be accepted here.
  const audList = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!audList.includes(aud)) return { ok: false, status: 401, reason: 'Token audience mismatch.' };

  if (payload.iss && payload.iss !== `https://${teamDomain}`) {
    return { ok: false, status: 401, reason: 'Token issuer mismatch.' };
  }

  let keys;
  try {
    keys = await getKeys(teamDomain);
  } catch {
    return { ok: false, status: 503, reason: 'Could not verify session right now.' };
  }

  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) return { ok: false, status: 401, reason: 'Unknown signing key.' };

  const key = await crypto.subtle.importKey(
    'jwk',
    { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify']
  );

  const valid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    b64urlToBytes(sigB64),
    new TextEncoder().encode(`${headerB64}.${payloadB64}`)
  );
  if (!valid) return { ok: false, status: 401, reason: 'Invalid signature.' };

  return { ok: true, email: payload.email || payload.common_name || 'admin' };
}
