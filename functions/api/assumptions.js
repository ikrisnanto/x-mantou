import { json, sameOrigin } from '../../shared/security.js';
import { verifyAccess } from '../../shared/access.js';

/* Published model assumptions.
 *
 * GET  is public: the dashboard merges any saved overrides over its built-in
 *      defaults, so an admin edit becomes the live model for every visitor.
 * POST is admin-only, behind Cloudflare Access.
 *
 * The payload is validated against an explicit allow-list of numeric paths.
 * Anything not listed is dropped rather than merged, so a crafted request
 * cannot introduce new keys or non-numeric values into the model.
 */

const QUARTERS = 10;

// path -> 'q' (array of 10 numbers) | 's' (single number)
const ALLOWED = {
  'space.revGrowth': 'q', 'space.cogsPct': 'q', 'space.rndPct': 'q', 'space.sgaPct': 'q', 'space.capexPct': 'q',
  'connectivity.subAdds': 'q', 'connectivity.arpu': 'q', 'connectivity.entGovGrowth': 'q',
  'connectivity.cogsPct': 'q', 'connectivity.rndPct': 'q', 'connectivity.sgaPct': 'q', 'connectivity.capexPct': 'q',
  'ai.monetizable': 'q', 'ai.cogsPct': 'q', 'ai.rndPct': 'q', 'ai.sgaPct': 'q',
  'ai.grok': 'q', 'ai.cursor': 'q', 'ai.adGrowth': 'q',
  'financing.otherIncome': 'q', 'financing.tax': 'q',
  'financing.itShare': 's', 'financing.itLife': 's', 'financing.facilityLife': 's',
  'financing.legacyAddback': 's', 'financing.existingDebt': 's', 'financing.existingRate': 's',
  'financing.newRate': 's', 'financing.cashYield': 's', 'financing.minCash': 's', 'financing.openingCash': 's',
};

const finite = (v) => typeof v === 'number' && Number.isFinite(v);

function sanitize(input) {
  if (!input || typeof input !== 'object') return { error: 'payload must be an object' };
  const clean = {};
  for (const [path, shape] of Object.entries(ALLOWED)) {
    if (!(path in input)) continue;
    const v = input[path];
    if (shape === 'q') {
      if (!Array.isArray(v) || v.length !== QUARTERS || !v.every(finite)) {
        return { error: `${path} must be ${QUARTERS} finite numbers` };
      }
      clean[path] = v;
    } else {
      if (!finite(v)) return { error: `${path} must be a finite number` };
      clean[path] = v;
    }
  }
  if (!Object.keys(clean).length) return { error: 'no recognised assumption keys in payload' };
  return { clean };
}

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

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!sameOrigin(request)) return json({ error: 'Cross-origin requests are not allowed' }, 403);

  const auth = await verifyAccess(request, env);
  if (!auth.ok) return json({ error: auth.reason }, auth.status);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const { clean, error } = sanitize(body.overrides);
  if (error) return json({ error }, 400);

  await env.x_mantou_comments
    .prepare(
      `INSERT INTO assumptions (id, payload, updated_at, updated_by)
       VALUES (1, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'), ?)
       ON CONFLICT(id) DO UPDATE SET
         payload = excluded.payload,
         updated_at = excluded.updated_at,
         updated_by = excluded.updated_by`
    )
    .bind(JSON.stringify(clean), auth.email)
    .run();

  return json({ ok: true, keys: Object.keys(clean).length, updatedBy: auth.email });
}

export async function onRequestDelete(context) {
  const { request, env } = context;
  if (!sameOrigin(request)) return json({ error: 'Cross-origin requests are not allowed' }, 403);

  const auth = await verifyAccess(request, env);
  if (!auth.ok) return json({ error: auth.reason }, auth.status);

  await env.x_mantou_comments.prepare(`DELETE FROM assumptions WHERE id = 1`).run();
  return json({ ok: true, reverted: true });
}
