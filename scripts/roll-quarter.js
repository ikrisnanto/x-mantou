/* Rolls the model forward one quarter.
 *
 *   npm run roll-quarter -- --data new-quarter.json
 *   npm run roll-quarter -- --template          (writes a blank input file)
 *   npm run roll-quarter -- --data f.json --dry (show what would change)
 *
 * What it does:
 *   1. appends the newly reported quarter to REPORTED, making it the jump-off
 *   2. drops that quarter from the front of Q and of every driver array,
 *      since it is now history rather than forecast
 *   3. extends the far end by one quarter so the horizon stays the same length,
 *      carrying each driver's last value forward as a starting point
 *
 * Step 3 is a placeholder, not a forecast: review the new final column in the
 * /admin panel afterwards. --no-extend leaves the horizon one quarter shorter.
 */
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { loadModel, writeModel, nextQuarter, quarterlyArrays, caseArrays } from './model.js';

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const value = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? null : argv[i + 1];
};

const TEMPLATE = {
  label: '',
  space: 0, connectivity: 0, ai: 0,
  opInc: 0, netIncome: 0,
  interestExpense: 0, interestIncome: 0, otherIncome: 0, tax: 0,
  aiNameplateGW: 0, aiInfraRevenue: null,
  totalCapex: 0, aiCapex: 0,
  connectivitySubs: 0, connectivityEntGov: 0, aiAdvertising: 0,
  balance: { cash: 0, securities: 0, ppe: 0, totalAssets: 0, totalLiab: 0, equity: 0 },
};

if (flag('template')) {
  const { Q } = loadModel();
  const out = { ...TEMPLATE, label: Q[0] };
  writeFileSync('new-quarter.json', JSON.stringify(out, null, 2) + '\n');
  console.log(`wrote new-quarter.json for ${Q[0]} — fill in the reported figures, then:`);
  console.log('  npm run roll-quarter -- --data new-quarter.json');
  process.exit(0);
}

const dataPath = value('data');
if (!dataPath) {
  console.error('usage: npm run roll-quarter -- --data new-quarter.json   (or --template to start one)');
  process.exit(1);
}
if (!existsSync(dataPath)) {
  console.error(`no such file: ${dataPath}`);
  process.exit(1);
}

const incoming = JSON.parse(readFileSync(dataPath, 'utf8'));
const model = loadModel();
const { Q, REPORTED, FIXED, CASES } = model;

const expected = Q[0];
if (!incoming.label) incoming.label = expected;
if (incoming.label !== expected) {
  console.error(`this data is for ${incoming.label}, but the next quarter to report is ${expected}`);
  process.exit(1);
}

const required = ['space', 'connectivity', 'ai', 'opInc', 'netIncome', 'interestExpense',
  'interestIncome', 'otherIncome', 'tax', 'aiNameplateGW', 'totalCapex', 'aiCapex',
  'connectivitySubs', 'connectivityEntGov', 'aiAdvertising'];
const missing = required.filter((k) => !Number.isFinite(incoming[k]));
if (missing.length) {
  console.error(`new-quarter data is missing or non-numeric: ${missing.join(', ')}`);
  process.exit(1);
}
for (const k of ['cash', 'securities', 'ppe', 'totalAssets', 'totalLiab', 'equity']) {
  if (!Number.isFinite(incoming.balance?.[k])) {
    console.error(`new-quarter data is missing balance.${k}`);
    process.exit(1);
  }
}

// The previous jump-off becomes an ordinary historical row; only the newest
// quarter carries the seed detail the engine reads.
const prev = REPORTED[REPORTED.length - 1];
for (const k of ['connectivitySubs', 'connectivityEntGov', 'aiAdvertising', 'balance']) delete prev[k];

REPORTED.push(incoming);

const droppedLabel = Q.shift();
const arrays = [...quarterlyArrays(FIXED), ...caseArrays(CASES)];
for (const a of arrays) a.ref[a.key] = a.arr.slice(1);

let added = null;
if (!flag('no-extend')) {
  added = nextQuarter(Q[Q.length - 1] ?? droppedLabel);
  Q.push(added);
  for (const a of arrays) {
    const arr = a.ref[a.key];
    arr.push(arr[arr.length - 1]);
  }
}

console.log(`reported quarter added: ${incoming.label}  (now the jump-off)`);
console.log(`forecast now starts at: ${Q[0]}`);
if (added) console.log(`horizon extended to:    ${added}  (carried forward from the previous quarter — review in /admin)`);
else console.log(`horizon now ${Q.length} quarters (was ${Q.length + 1})`);

if (flag('dry')) {
  console.log('\n--dry: nothing written.');
  process.exit(0);
}

writeModel({ Q, REPORTED, FIXED, CASES });
console.log('\nwrote src/dashboard/assumptions.js');
console.log('next: npm run check && npm run build, then review the new final column in /admin');
