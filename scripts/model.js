/* Shared helpers for the model-maintenance scripts.
 *
 * assumptions.js is a plain script rather than a module, so it is evaluated in
 * a sandboxed Function to read its data, and rewritten from the resulting
 * objects. That keeps the scripts from having to parse JavaScript by hand.
 * Comments inside the data are regenerated from the template below, so keep
 * anything worth saying in the header rather than beside a value.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const ASSUMPTIONS = join(ROOT, 'src', 'dashboard', 'assumptions.js');

export function loadModel() {
  const src = readFileSync(ASSUMPTIONS, 'utf8');
  const read = new Function(`${src}; return { Q, REPORTED, FIXED, CASES };`);
  return { src, ...read() };
}

/** "Q326" -> "Q426" -> "Q126" of the next year, etc. */
export function nextQuarter(label) {
  const m = /^Q([1-4])(\d{2})$/.exec(label);
  if (!m) throw new Error(`unrecognised quarter label: ${label}`);
  const q = Number(m[1]);
  const yy = Number(m[2]);
  return q === 4 ? `Q1${String((yy + 1) % 100).padStart(2, '0')}` : `Q${q + 1}${m[2]}`;
}

/** Every driver array that must stay the same length as Q. */
export function quarterlyArrays(FIXED) {
  const out = [];
  for (const [group, obj] of Object.entries(FIXED)) {
    if (!obj || typeof obj !== 'object') continue;
    for (const [key, val] of Object.entries(obj)) {
      if (Array.isArray(val) && val.every((v) => typeof v === 'number')) {
        out.push({ path: `${group}.${key}`, ref: obj, key, arr: val });
      }
    }
  }
  return out;
}

export function caseArrays(CASES) {
  const out = [];
  for (const [id, c] of Object.entries(CASES)) {
    for (const key of ['rate', 'spot', 'capexGW']) {
      if (Array.isArray(c[key])) out.push({ path: `CASES.${id}.${key}`, ref: c, key, arr: c[key] });
    }
  }
  return out;
}

const HEADER = `/* ============================================================================
 * MODEL ASSUMPTIONS — the single source of truth for every number in the model.
 *
 * Edit here, or through the Model assumptions panel on /admin, which publishes
 * to the database so every visitor sees the change. After editing by hand run:
 *   npm run build
 *
 * Conventions:
 *   - Money is $ millions per quarter unless a name says otherwise.
 *   - Ratios are fractions, not percents (0.33 means 33%).
 *   - Every driver array has one entry per quarter in Q, in the same order.
 *   - REPORTED holds published results, oldest first; the last entry is the
 *     jump-off the forecast starts from.
 *
 * When a new quarter is published:  npm run roll-quarter -- --data new.json
 * To check the file is internally consistent:  npm run check
 *
 * Origin: first derived from the workbook in reference/, which is a historical
 * snapshot and is never read at build time — this file is authoritative.
 * ==========================================================================*/

/* eslint-disable no-unused-vars -- Q, REPORTED, N, HQ, JUMPOFF, FIXED and CASES
   are consumed by dashboard.js once build.js concatenates both files. */`;

const num = (n) => (Number.isInteger(n) ? String(n) : String(+(+n).toFixed(10)));

function reportedLiteral(REPORTED) {
  return REPORTED.map((r) => {
    const lines = [`  { label: ${JSON.stringify(r.label)},`];
    lines.push(`    space: ${num(r.space)}, connectivity: ${num(r.connectivity)}, ai: ${num(r.ai)},`);
    lines.push(`    opInc: ${num(r.opInc)}, netIncome: ${num(r.netIncome)},`);
    lines.push(
      `    interestExpense: ${num(r.interestExpense)}, interestIncome: ${num(r.interestIncome)}, ` +
        `otherIncome: ${num(r.otherIncome)}, tax: ${num(r.tax)},`
    );
    lines.push(
      `    aiNameplateGW: ${num(r.aiNameplateGW)}, aiInfraRevenue: ${r.aiInfraRevenue == null ? 'null' : num(r.aiInfraRevenue)},`
    );
    const tail = `    totalCapex: ${num(r.totalCapex)}, aiCapex: ${num(r.aiCapex)}`;
    if (r.balance) {
      lines.push(tail + ',');
      lines.push('');
      lines.push('    // Jump-off detail — only the last record needs these.');
      lines.push(
        `    connectivitySubs: ${num(r.connectivitySubs)}, connectivityEntGov: ${num(r.connectivityEntGov)}, ` +
          `aiAdvertising: ${num(r.aiAdvertising)},`
      );
      lines.push(
        `    balance: { cash: ${num(r.balance.cash)}, securities: ${num(r.balance.securities)}, ppe: ${num(r.balance.ppe)},`
      );
      lines.push(
        `               totalAssets: ${num(r.balance.totalAssets)}, totalLiab: ${num(r.balance.totalLiab)}, equity: ${num(r.balance.equity)} } },`
      );
    } else {
      lines.push(tail + ' },');
    }
    return lines.join('\n');
  }).join('\n\n');
}

function objLiteral(o, indent) {
  const pad = ' '.repeat(indent);
  const padIn = ' '.repeat(indent + 2);
  const parts = Object.entries(o).map(([k, v]) => {
    if (Array.isArray(v)) {
      const body = typeof v[0] === 'string' ? JSON.stringify(v) : `[${v.map(num).join(',')}]`;
      return `${padIn}${k}: ${body}`;
    }
    if (v && typeof v === 'object') return `${padIn}${k}: ${objLiteral(v, indent + 2)}`;
    return `${padIn}${k}: ${JSON.stringify(v)}`;
  });
  return `{\n${parts.join(',\n')}\n${pad}}`;
}

export function writeModel({ Q, REPORTED, FIXED, CASES }) {
  const out = `${HEADER}

const Q = ${JSON.stringify(Q)};

const REPORTED = [
${reportedLiteral(REPORTED)}
];

const N  = Q.length;
const HQ = REPORTED.map(r => r.label);
const JUMPOFF = REPORTED[REPORTED.length - 1];

const FIXED = ${objLiteral(FIXED, 0)};

const CASES = ${objLiteral(CASES, 0)};
`;
  writeFileSync(ASSUMPTIONS, out);
  return out;
}
