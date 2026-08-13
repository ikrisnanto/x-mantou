import { json } from '../../shared/security.js';

/* Published model assumptions — PUBLIC READ ONLY.
 *
 * The dashboard merges any saved overrides over its built-in defaults, so an
 * admin edit becomes the live model for every visitor. This route must stay
 * reachable without a login, which is why the writes live under /api/admin/
 * instead: Cloudflare Access guards that prefix, and cannot filter by method.
 */

export async function onRequestGet(context) {
  const row = await context.env.x_mantou_comments
    .prepare(`SELECT payload, updated_at FROM assumptions WHERE id = 1`)
    .first();

  if (!row) return json({ overrides: null, updatedAt: null });

  let overrides = null;
  try {
    overrides = JSON.parse(row.payload);
  } catch {
    overrides = null; // corrupt row must not break the public page
  }
  return json({ overrides, updatedAt: row.updated_at });
}
