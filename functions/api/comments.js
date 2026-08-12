import { clientIp, hashIp, checkRateLimit, verifyTurnstile, json, sameOrigin } from '../../shared/security.js';

const MAX_BODY = 2000;
const MAX_AUTHOR = 60;
const POST_LIMIT = 5; // comments per IP
const POST_WINDOW = 600; // per 10 minutes

export async function onRequestGet(context) {
  const db = context.env.x_mantou_comments;
  const { results } = await db
    .prepare(
      `SELECT id, author, body, created_at, upvotes, downvotes
       FROM comments
       ORDER BY (upvotes - downvotes) DESC, created_at DESC
       LIMIT 300`
    )
    .all();
  return json({ comments: results, turnstileSitekey: context.env.TURNSTILE_SITEKEY || null });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!sameOrigin(request)) {
    return json({ error: 'Cross-origin requests are not allowed' }, 403);
  }

  // Reject oversized payloads before reading them into memory.
  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > 16000) return json({ error: 'Request too large' }, 413);

  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  let author = typeof payload.author === 'string' ? payload.author.trim() : '';
  const body = typeof payload.body === 'string' ? payload.body.trim() : '';

  if (!body) return json({ error: 'Comment text is required' }, 400);
  if (body.length > MAX_BODY) return json({ error: `Comment is too long (max ${MAX_BODY} characters)` }, 400);
  if (author.length > MAX_AUTHOR) author = author.slice(0, MAX_AUTHOR);
  if (!author) author = 'Anonymous';

  const ip = clientIp(request);
  const ipHash = await hashIp(ip, env.RATE_SALT);
  const db = env.x_mantou_comments;

  const limited = await checkRateLimit(db, ipHash, 'comment', POST_LIMIT, POST_WINDOW);
  if (!limited.ok) {
    return json(
      { error: 'You are posting too quickly. Try again in a few minutes.' },
      429,
      { 'retry-after': String(limited.retryAfter) }
    );
  }

  const check = await verifyTurnstile(env.TURNSTILE_SECRET, payload.turnstileToken, ip);
  if (!check.ok) {
    return json({ error: 'Bot check failed. Reload the page and try again.', reason: check.reason }, 403);
  }

  const result = await db
    .prepare(
      `INSERT INTO comments (author, body) VALUES (?, ?)
       RETURNING id, author, body, created_at, upvotes, downvotes`
    )
    .bind(author, body)
    .first();

  return json({ comment: result }, 201);
}
