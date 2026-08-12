import { clientIp, hashIp, checkRateLimit, json, sameOrigin } from '../../../shared/security.js';

const ADMIN_ATTEMPT_LIMIT = 10; // failed/attempted admin calls per IP
const ADMIN_ATTEMPT_WINDOW = 600; // per 10 minutes

// Compares two secrets without leaking their contents through timing. Both are
// hashed first so the comparison always runs over equal-length input.
async function secretsMatch(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || !a || !b) return false;
  const enc = new TextEncoder();
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(a)),
    crypto.subtle.digest('SHA-256', enc.encode(b)),
  ]);
  const va = new Uint8Array(ha);
  const vb = new Uint8Array(hb);
  let diff = 0;
  for (let i = 0; i < va.length; i++) diff |= va[i] ^ vb[i];
  return diff === 0;
}

export async function onRequestDelete(context) {
  const { request, env, params } = context;

  if (!sameOrigin(request)) {
    return json({ error: 'Cross-origin requests are not allowed' }, 403);
  }

  const commentId = Number(params.id);
  if (!Number.isInteger(commentId) || commentId <= 0) {
    return json({ error: 'Invalid comment id' }, 400);
  }

  const db = env.x_mantou_comments;
  const ipHash = await hashIp(clientIp(request), env.RATE_SALT);

  // Throttle before checking the token so the endpoint cannot be brute-forced.
  const limited = await checkRateLimit(db, ipHash, 'admin', ADMIN_ATTEMPT_LIMIT, ADMIN_ATTEMPT_WINDOW);
  if (!limited.ok) {
    return json({ error: 'Too many attempts. Try again later.' }, 429, {
      'retry-after': String(limited.retryAfter),
    });
  }

  if (!env.ADMIN_TOKEN) {
    return json({ error: 'Admin delete is not configured on this deployment.' }, 501);
  }

  const supplied = request.headers.get('X-Admin-Token');
  if (!(await secretsMatch(supplied, env.ADMIN_TOKEN))) {
    return json({ error: 'Not authorized' }, 401);
  }

  const existing = await db.prepare(`SELECT id FROM comments WHERE id = ?`).bind(commentId).first();
  if (!existing) return json({ error: 'Comment not found' }, 404);

  await db.batch([
    db.prepare(`DELETE FROM votes WHERE comment_id = ?`).bind(commentId),
    db.prepare(`DELETE FROM comments WHERE id = ?`).bind(commentId),
  ]);

  return json({ deleted: commentId });
}

// Lets the admin UI confirm a token is valid before showing delete controls.
export async function onRequestPost(context) {
  const { request, env } = context;

  if (!sameOrigin(request)) {
    return json({ error: 'Cross-origin requests are not allowed' }, 403);
  }
  if (context.params.id !== 'verify') {
    return json({ error: 'Not found' }, 404);
  }

  const db = env.x_mantou_comments;
  const ipHash = await hashIp(clientIp(request), env.RATE_SALT);
  const limited = await checkRateLimit(db, ipHash, 'admin', ADMIN_ATTEMPT_LIMIT, ADMIN_ATTEMPT_WINDOW);
  if (!limited.ok) return json({ error: 'Too many attempts. Try again later.' }, 429);

  if (!env.ADMIN_TOKEN) return json({ error: 'Admin delete is not configured.' }, 501);

  const supplied = request.headers.get('X-Admin-Token');
  if (!(await secretsMatch(supplied, env.ADMIN_TOKEN))) {
    return json({ error: 'Not authorized' }, 401);
  }
  return json({ ok: true });
}
