import { clientIp, hashIp, checkRateLimit, json, sameOrigin } from '../../../../shared/security.js';

const VOTE_LIMIT = 60; // votes per IP
const VOTE_WINDOW = 600; // per 10 minutes

export async function onRequestPost(context) {
  const { request, env, params } = context;

  if (!sameOrigin(request)) {
    return json({ error: 'Cross-origin requests are not allowed' }, 403);
  }

  const commentId = Number(params.id);
  if (!Number.isInteger(commentId) || commentId <= 0) {
    return json({ error: 'Invalid comment id' }, 400);
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const direction = payload.direction;
  if (direction !== 1 && direction !== -1) {
    return json({ error: 'direction must be 1 or -1' }, 400);
  }

  const ip = clientIp(request);
  const ipHash = await hashIp(ip, env.RATE_SALT);
  const db = env.x_mantou_comments;

  const limited = await checkRateLimit(db, ipHash, 'vote', VOTE_LIMIT, VOTE_WINDOW);
  if (!limited.ok) {
    return json({ error: 'Too many votes. Try again shortly.' }, 429, {
      'retry-after': String(limited.retryAfter),
    });
  }

  const comment = await db.prepare(`SELECT id FROM comments WHERE id = ?`).bind(commentId).first();
  if (!comment) return json({ error: 'Comment not found' }, 404);

  // Voter identity is derived server-side from the request IP. A client-supplied
  // id would let anyone mint unlimited identities and stuff the ballot.
  const voterId = ipHash;

  const existing = await db
    .prepare(`SELECT direction FROM votes WHERE comment_id = ? AND voter_id = ?`)
    .bind(commentId, voterId)
    .first();

  // Column names are chosen from a fixed pair, never interpolated from input.
  const countCol = direction === 1 ? 'upvotes' : 'downvotes';
  const otherCol = direction === 1 ? 'downvotes' : 'upvotes';

  if (!existing) {
    await db.batch([
      db.prepare(`INSERT INTO votes (comment_id, voter_id, direction) VALUES (?, ?, ?)`).bind(commentId, voterId, direction),
      db.prepare(`UPDATE comments SET ${countCol} = ${countCol} + 1 WHERE id = ?`).bind(commentId),
    ]);
  } else if (existing.direction === direction) {
    // Clicking the same arrow again clears the vote.
    await db.batch([
      db.prepare(`DELETE FROM votes WHERE comment_id = ? AND voter_id = ?`).bind(commentId, voterId),
      db.prepare(`UPDATE comments SET ${countCol} = MAX(${countCol} - 1, 0) WHERE id = ?`).bind(commentId),
    ]);
  } else {
    await db.batch([
      db.prepare(`UPDATE votes SET direction = ? WHERE comment_id = ? AND voter_id = ?`).bind(direction, commentId, voterId),
      db
        .prepare(`UPDATE comments SET ${countCol} = ${countCol} + 1, ${otherCol} = MAX(${otherCol} - 1, 0) WHERE id = ?`)
        .bind(commentId),
    ]);
  }

  const updated = await db
    .prepare(`SELECT id, author, body, created_at, upvotes, downvotes FROM comments WHERE id = ?`)
    .bind(commentId)
    .first();
  const myVote = await db
    .prepare(`SELECT direction FROM votes WHERE comment_id = ? AND voter_id = ?`)
    .bind(commentId, voterId)
    .first();

  return json({ comment: updated, myVote: myVote ? myVote.direction : 0 });
}
