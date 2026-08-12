// Shared helpers for the comments API: IP hashing, per-IP rate limiting and
// Turnstile verification. Imported by the Pages Functions under functions/.

const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export function clientIp(request) {
  return (
    request.headers.get('CF-Connecting-IP') ||
    request.headers.get('X-Forwarded-For') ||
    'unknown'
  );
}

// The raw IP is never stored. It is salted and hashed so the table holds only
// an opaque identifier that cannot be reversed back to an address.
export async function hashIp(ip, salt) {
  const data = new TextEncoder().encode(`${salt || 'x-mantou'}::${ip}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Fixed-window per-IP limiter. Counts recent rows for (ip_hash, action) and
 * records the attempt when it is allowed.
 */
export async function checkRateLimit(db, ipHash, action, limit, windowSeconds) {
  const since = new Date(Date.now() - windowSeconds * 1000).toISOString();

  const row = await db
    .prepare(`SELECT COUNT(*) AS n FROM rate_events WHERE ip_hash = ? AND action = ? AND created_at >= ?`)
    .bind(ipHash, action, since)
    .first();

  if (row && row.n >= limit) {
    return { ok: false, retryAfter: windowSeconds };
  }

  await db
    .prepare(`INSERT INTO rate_events (ip_hash, action) VALUES (?, ?)`)
    .bind(ipHash, action)
    .run();

  // Opportunistic pruning so the table cannot grow without bound.
  if (Math.random() < 0.02) {
    await db
      .prepare(`DELETE FROM rate_events WHERE created_at < ?`)
      .bind(new Date(Date.now() - 3600 * 1000).toISOString())
      .run();
  }

  return { ok: true };
}

/**
 * Verifies a Turnstile token. Returns {ok:true} when the check passes, and
 * {ok:false, reason} when it does not. If no secret is configured the check is
 * reported as skipped so the endpoint can decide how to treat it.
 */
export async function verifyTurnstile(secret, token, ip) {
  if (!secret) return { ok: true, skipped: true };
  if (!token) return { ok: false, reason: 'missing-token' };

  const form = new FormData();
  form.append('secret', secret);
  form.append('response', token);
  if (ip && ip !== 'unknown') form.append('remoteip', ip);

  let res;
  try {
    res = await fetch(TURNSTILE_VERIFY_URL, { method: 'POST', body: form });
  } catch {
    return { ok: false, reason: 'verify-unreachable' };
  }

  if (!res.ok) return { ok: false, reason: 'verify-failed' };

  const data = await res.json().catch(() => null);
  if (!data || data.success !== true) {
    return { ok: false, reason: (data && data['error-codes'] && data['error-codes'][0]) || 'invalid-token' };
  }
  return { ok: true };
}

export function json(data, status, extraHeaders) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: Object.assign(
      {
        'content-type': 'application/json; charset=utf-8',
        // Responses are per-visitor and must never be served from a shared cache.
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
      },
      extraHeaders || {}
    ),
  });
}

// Rejects cross-origin writes. Browsers cannot forge Origin, so this blocks
// drive-by POSTs from other sites without needing a CSRF token.
export function sameOrigin(request) {
  const origin = request.headers.get('Origin');
  if (!origin) return true; // non-browser client; rate limit + Turnstile still apply
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}
