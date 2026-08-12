function json(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

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
  return json({ comments: results });
}

export async function onRequestPost(context) {
  let payload;
  try {
    payload = await context.request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  let author = typeof payload.author === 'string' ? payload.author.trim() : '';
  const body = typeof payload.body === 'string' ? payload.body.trim() : '';

  if (!body) return json({ error: 'Comment text is required' }, 400);
  if (body.length > 2000) return json({ error: 'Comment is too long (max 2000 characters)' }, 400);
  if (author.length > 60) author = author.slice(0, 60);
  if (!author) author = 'Anonymous';

  const db = context.env.x_mantou_comments;
  const result = await db
    .prepare(`INSERT INTO comments (author, body) VALUES (?, ?) RETURNING id, author, body, created_at, upvotes, downvotes`)
    .bind(author, body)
    .first();

  return json({ comment: result }, 201);
}
