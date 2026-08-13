import { json, sameOrigin } from '../../../../shared/security.js';
import { verifyAccess } from '../../../../shared/access.js';

/* Comment moderation — ADMIN ONLY.
 * Under /api/admin/ so one Cloudflare Access rule covers every admin route.
 * The Access session is verified here too, so the edge rule is defence in
 * depth rather than the only lock. */

export async function onRequestDelete(context) {
  const { request, env, params } = context;

  if (!sameOrigin(request)) {
    return json({ error: 'Cross-origin requests are not allowed' }, 403);
  }

  const commentId = Number(params.id);
  if (!Number.isInteger(commentId) || commentId <= 0) {
    return json({ error: 'Invalid comment id' }, 400);
  }

  const auth = await verifyAccess(request, env);
  if (!auth.ok) return json({ error: auth.reason }, auth.status);

  const db = env.x_mantou_comments;
  const existing = await db.prepare(`SELECT id FROM comments WHERE id = ?`).bind(commentId).first();
  if (!existing) return json({ error: 'Comment not found' }, 404);

  await db.batch([
    db.prepare(`DELETE FROM votes WHERE comment_id = ?`).bind(commentId),
    db.prepare(`DELETE FROM comments WHERE id = ?`).bind(commentId),
  ]);

  return json({ deleted: commentId, by: auth.email });
}
