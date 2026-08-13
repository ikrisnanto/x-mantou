import { json, sameOrigin } from '../../../shared/security.js';
import { verifyAccess } from '../../../shared/access.js';

/* Lets the admin page confirm the Access session is live before showing
 * moderation controls. */
export async function onRequestPost(context) {
  const { request, env } = context;
  if (!sameOrigin(request)) return json({ error: 'Cross-origin requests are not allowed' }, 403);

  const auth = await verifyAccess(request, env);
  if (!auth.ok) return json({ error: auth.reason }, auth.status);
  return json({ ok: true, email: auth.email });
}
