/* Verifies assumptions.js is internally consistent.
 *
 * The engine indexes driver arrays positionally, so a length mismatch does not
 * throw — it silently produces undefined and NaN somewhere deep in the output.
 * This catches that before it ships.
 */
import { loadModel, quarterlyArrays, caseArrays, nextQuarter } from './model.js';

const { Q, REPORTED, FIXED, CASES } = loadModel();
const problems = [];

if (!Array.isArray(Q) || !Q.length) problems.push('Q is empty');
if (!Array.isArray(REPORTED) || !REPORTED.length) problems.push('REPORTED is empty');

for (const { path, arr } of [...quarterlyArrays(FIXED), ...caseArrays(CASES)]) {
  if (arr.length !== Q.length) {
    problems.push(`${path} has ${arr.length} values but Q has ${Q.length} quarters`);
  }
  const bad = arr.findIndex((v) => !Number.isFinite(v));
  if (bad !== -1) problems.push(`${path}[${bad}] is not a finite number`);
}

// Reported quarters may legitimately have gaps — an earnings release shows
// selected comparatives, not a continuous series. What must hold is that every
// label parses, that the forecast window itself is contiguous, and that it
// picks up immediately after the quarter it starts from.
for (const label of [...REPORTED.map((r) => r.label), ...Q]) {
  try { nextQuarter(label); } catch (err) { problems.push(err.message); }
}
for (let i = 1; i < Q.length; i++) {
  const expected = nextQuarter(Q[i - 1]);
  if (Q[i] !== expected) {
    problems.push(`forecast quarters are not contiguous: ${Q[i - 1]} -> ${Q[i]} (expected ${expected})`);
    break;
  }
}
if (REPORTED.length && Q.length) {
  const lastReported = REPORTED[REPORTED.length - 1].label;
  const expected = nextQuarter(lastReported);
  if (Q[0] !== expected) {
    problems.push(`forecast starts at ${Q[0]} but the jump-off quarter is ${lastReported} (expected ${expected})`);
  }
}

const required = ['label', 'space', 'connectivity', 'ai', 'opInc', 'netIncome',
  'interestExpense', 'interestIncome', 'otherIncome', 'tax', 'aiNameplateGW', 'totalCapex', 'aiCapex'];
REPORTED.forEach((r, i) => {
  for (const k of required) {
    if (r[k] === undefined) problems.push(`REPORTED[${i}] (${r.label || '?'}) is missing ${k}`);
  }
});

// The forecast starts from the last reported quarter, so it alone needs the
// seed detail the engine reads.
const jump = REPORTED[REPORTED.length - 1];
for (const k of ['connectivitySubs', 'connectivityEntGov', 'aiAdvertising', 'balance']) {
  if (jump && jump[k] === undefined) problems.push(`jump-off quarter ${jump.label} is missing ${k}`);
}
if (jump?.balance) {
  for (const k of ['cash', 'securities', 'ppe', 'totalAssets', 'totalLiab', 'equity']) {
    if (!Number.isFinite(jump.balance[k])) problems.push(`jump-off balance.${k} is not a number`);
  }
  const { totalAssets, totalLiab, equity } = jump.balance;
  if (Math.abs(totalAssets - (totalLiab + equity)) > 1) {
    problems.push(`jump-off balance sheet does not balance: assets ${totalAssets} vs liabilities+equity ${totalLiab + equity}`);
  }
}

if (problems.length) {
  console.error(`assumptions.js has ${problems.length} problem(s):`);
  for (const p of problems) console.error('  - ' + p);
  process.exit(1);
}

console.log(`assumptions.js OK — ${REPORTED.length} reported quarters (${REPORTED[0].label} to ${jump.label}), ` +
  `${Q.length} forecast quarters (${Q[0]} to ${Q[Q.length - 1]})`);
