import { json, sameOrigin } from '../../../shared/security.js';
import { verifyAccess } from '../../../shared/access.js';

/* Publishing model assumptions — ADMIN ONLY.
 *
 * Lives under /api/admin/ so a single Cloudflare Access rule covers every admin
 * route. Access cannot filter by HTTP method, so the public read stays at
 * /api/assumptions where no login is required.
 *
 * The payload is validated against an explicit allow-list of numeric paths.
 * Anything not listed is dropped rather than merged, so a crafted request
 * cannot introduce new keys or non-numeric values into the model.
 */

// path -> 'q' (one value per forecast quarter) | 's' (single number)
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

/* Quarterly arrays must all share one length. It is taken from the payload
   rather than hardcoded, so rolling the horizon does not require a code change
   — but every array in a single request has to agree. */
function sanitize(input) {
  if (!input || typeof input !== 'object') return { error: 'payload must be an object' };

  const lengths = new Set();
  for (const [path, shape] of Object.entries(ALLOWED)) {
    if (shape === 'q' && Array.isArray(input[path])) lengths.add(input[path].length);
  }
  if (lengths.size > 1) return { error: 'quarterly arrays have differing lengths' };
  const quarters = [...lengths][0];
  if (quarters !== undefined && (!Number.isInteger(quarters) || quarters < 1 || quarters > 40)) {
    return { error: 'quarterly arrays have an implausible length' };
  }

  const clean = {};
  for (const [path, shape] of Object.entries(ALLOWED)) {
    if (!(path in input)) continue;
    const v = input[path];
    if (shape === 'q') {
      if (!Array.isArray(v) || v.length !== quarters || !v.every(finite)) {
        return { error: `${path} must be ${quarters} finite numbers` };
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
