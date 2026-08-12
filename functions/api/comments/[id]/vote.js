function json(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

export async function onRequestPost(context) {
  const commentId = Number(context.params.id);
  if (!Number.isInteger(commentId) || commentId <= 0) {
    return json({ error: 'Invalid comment id' }, 400);
  }

  let payload;
  try {
    payload = await context.request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const voterId = typeof payload.voterId === 'string' ? payload.voterId.trim() : '';
  const direction = payload.direction;

  if (!voterId || voterId.length > 100) return json({ error: 'Invalid voter id' }, 400);
  if (direction !== 1 && direction !== -1) return json({ error: 'direction must be 1 or -1' }, 400);

  const db = context.env.x_mantou_comments;

  const comment = await db.prepare(`SELECT id FROM comments WHERE id = ?`).bind(commentId).first();
  if (!comment) return json({ error: 'Comment not found' }, 404);

  const existing = await db
    .prepare(`SELECT direction FROM votes WHERE comment_id = ? AND voter_id = ?`)
    .bind(commentId, voterId)
    .first();

  const countCol = direction === 1 ? 'upvotes' : 'downvotes';
  const otherCol = direction === 1 ? 'downvotes' : 'upvotes';

  if (!existing) {
    await db.batch([
      db.prepare(`INSERT INTO votes (comment_id, voter_id, direction) VALUES (?, ?, ?)`).bind(commentId, voterId, direction),
      db.prepare(`UPDATE comments SET ${countCol} = ${countCol} + 1 WHERE id = ?`).bind(commentId),
    ]);
  } else if (existing.direction === direction) {
    // toggle off — clicking the same vote again removes it
    await db.batch([
      db.prepare(`DELETE FROM votes WHERE comment_id = ? AND voter_id = ?`).bind(commentId, voterId),
      db.prepare(`UPDATE comments SET ${countCol} = MAX(${countCol} - 1, 0) WHERE id = ?`).bind(commentId),
    ]);
  } else {
    // switch direction
    await db.batch([
      db.prepare(`UPDATE votes SET direction = ? WHERE comment_id = ? AND voter_id = ?`).bind(direction, commentId, voterId),
      db.prepare(`UPDATE comments SET ${countCol} = ${countCol} + 1, ${otherCol} = MAX(${otherCol} - 1, 0) WHERE id = ?`).bind(commentId),
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
