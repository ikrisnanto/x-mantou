/* ============================================================================
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
   are consumed by dashboard.js once build.js concatenates both files. */

const Q = ["Q426","Q127","Q227","Q327","Q427","Q128","Q228","Q328","Q428"];

const REPORTED = [
  { label: "Q225",
    space: 746, connectivity: 2588, ai: 737,
    opInc: -970, netIncome: -1008,
    interestExpense: -411, interestIncome: 98, otherIncome: 413, tax: 138,
    aiNameplateGW: 0.4, aiInfraRevenue: 311,
    totalCapex: 2825, aiCapex: 749 },

  { label: "Q126",
    space: 619, connectivity: 3257, ai: 818,
    opInc: -1943, netIncome: -4276,
    interestExpense: -664, interestIncome: 213, otherIncome: -1876, tax: 6,
    aiNameplateGW: 1, aiInfraRevenue: null,
    totalCapex: 10107, aiCapex: 7723 },

  { label: "Q226",
    space: 962, connectivity: 4291, ai: 2561,
    opInc: -143, netIncome: -541,
    interestExpense: -629, interestIncome: 340, otherIncome: -86, tax: 23,
    aiNameplateGW: 1.4, aiInfraRevenue: 2194,
    totalCapex: 18369, aiCapex: 15828 },

  { label: "Q326",
    space: 1767, connectivity: 5248, ai: 7560,
    opInc: 2791, netIncome: 4404,
    interestExpense: -675, interestIncome: 873, otherIncome: 1025, tax: -390,
    aiNameplateGW: 1.7, aiInfraRevenue: 7022,
    totalCapex: 19593, aiCapex: 16444,

    // Jump-off detail — only the last record needs these.
    connectivitySubs: 13.6, connectivityEntGov: 2127, aiAdvertising: 538,
    balance: { cash: 51294, securities: 38561, ppe: 89483,
               totalAssets: 254045, totalLiab: 77277, equity: 176768 } },
];

const N  = Q.length;
const HQ = REPORTED.map(r => r.label);
const JUMPOFF = REPORTED[REPORTED.length - 1];

const FIXED = {
  space: {
    revGrowth: [-0.1,0.08,0.08,0.07,0.07,0.06,0.06,0.06,0.05],
    cogsPct: [0.32,0.31,0.3,0.3,0.29,0.28,0.28,0.27,0.27],
    rndPct: [0.9,0.8,0.7,0.62,0.55,0.5,0.46,0.42,0.39],
    sgaPct: [0.1,0.09,0.09,0.09,0.08,0.08,0.08,0.07,0.07],
    capexPct: [0.9,0.75,0.65,0.55,0.5,0.45,0.4,0.38,0.35]
  },
  connectivity: {
    subAdds: [1.6,1.6,1.5,1.5,1.4,1.4,1.3,1.3,1.2],
    arpu: [72,71.5,71,70.5,70,69.5,69,68.5,68],
    entGovGrowth: [0.18,0.15,0.13,0.12,0.11,0.1,0.1,0.09,0.09],
    cogsPct: [0.46,0.45,0.44,0.43,0.42,0.41,0.41,0.4,0.4],
    rndPct: [0.062,0.06,0.058,0.056,0.055,0.054,0.053,0.052,0.051],
    sgaPct: [0.058,0.056,0.054,0.052,0.05,0.049,0.048,0.047,0.046],
    capexPct: [0.29,0.28,0.27,0.26,0.25,0.24,0.24,0.23,0.23]
  },
  ai: {
    cogsPct: [0.42,0.4,0.38,0.37,0.36,0.35,0.34,0.33,0.33],
    rndPct: [0.3,0.27,0.25,0.23,0.21,0.2,0.19,0.18,0.17],
    sgaPct: [0.13,0.11,0.1,0.09,0.09,0.08,0.08,0.08,0.07],
    monetizable: [0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5],
    grok: [900,1150,1400,1650,1900,2150,2400,2650,2900],
    cursor: [1200,1500,1800,2100,2400,2700,3000,3300,3600],
    adGrowth: [0,0.01,0.02,0.02,0.02,0.02,0.02,0.02,0.02]
  },
  financing: {
    itShare: 0.7,
    itLife: 20,
    facilityLife: 56,
    legacyAddback: 6007,
    existingDebt: 38844,
    existingRate: 0.0695,
    newRate: 0.0585,
    cashYield: 0.04,
    minCash: 15000,
    openingCash: 89855,
    exitMonthShare: 0.38,
    arrTarget: 100000,
    otherIncome: [-50,-30,-20,-10,0,0,0,0,0],
    taxRate: 0.21,
    nolOpening: 37448,
    nolCap: 0.8
  }
};

const CASES = {
  1: {
    name: "Case 1 — Conservative",
    basis: "Price per rented watt starts near the ~$27-30 a year Q3 2026 actually realised and erodes to $18 by Q428 as supply catches up. Capex $30bn falling to $21bn per GW. Management's base build-out.",
    gw: [2.8,4,6.5,9.5,13,15,17,19,21],
    rate: [7500,7500,7250,6750,6250,5750,5250,4750,4500],
    spot: [8000,8000,7500,7000,6500,6000,5500,5000,4750],
    capexGW: [30000,28000,26500,25000,24000,23000,22000,21500,21000],
    ltr: 4500
  },
  2: {
    name: "Case 2 — Guidance-consistent",
    basis: "Calibrated to the Q3 2026 call: ~$100bn Dec-2026 ARR, Q1 2027 revenue inside the $33-37bn guide, and pricing 'slightly above the high end of the $30-50 per watt range' ($52) through 2027, easing to $44 by Q428. Capex $31bn per GW in Q426 lands inside the $35-40bn Q4 capex guide; payback under a year. Build-out ~13 GW by end-2027, which Musk is 'highly confident' of.",
    gw: [2.8,4,6.5,9.5,13,15,17,19,21],
    rate: [8250,11750,13000,13000,13000,12500,12000,11500,11000],
    spot: [12500,13500,13750,13750,13500,13000,12500,12000,11500],
    capexGW: [31000,31000,30000,29000,28000,27000,26000,25000,24000],
    ltr: 11000
  },
  3: {
    name: "Case 3 — High-capex stress",
    basis: "Case 2 pricing and build-out, but capex stuck at $55bn per GW, what Q3 2026 actually cost ($16.4bn of SI capex for 0.3 GW added), and never coming down.",
    gw: [2.8,4,6.5,9.5,13,15,17,19,21],
    rate: [8250,11750,13000,13000,13000,12500,12000,11500,11000],
    spot: [12500,13500,13750,13750,13500,13000,12500,12000,11500],
    capexGW: [55000,55000,55000,55000,55000,55000,55000,55000,55000],
    ltr: 11000
  },
  4: {
    name: "Case 4 — Contract run-rate, then re-pricing",
    basis: "Starts at ~$38 per rented watt a year, the Dec-2026 run-rate of the disclosed deals (~$53bn a year on ~1.4 GW rented), then rolls down to $20 as Musk's short, spot-priced contracts reprice in a looser market. Capex as Case 1.",
    gw: [2.8,4,6.5,9.5,13,15,17,19,21],
    rate: [9500,9500,9000,8250,7500,6750,6000,5250,5000],
    spot: [9250,9000,8500,7750,7000,6250,5500,5000,5000],
    capexGW: [30000,28000,26500,25000,24000,23000,22000,21500,21000],
    ltr: 5000
  },
  5: {
    name: "Case 5 — Stretch build-out",
    basis: "Case 2 pricing and capex with Musk's stretch: ~20 GW of compute by end-2027 (he plans ~20 GW of incremental power, 'so 23 gigawatts roughly in total' of power), then +2 GW a quarter.",
    gw: [2.8,4.3,8,13.5,20,22,24,26,28],
    rate: [8250,11750,13000,13000,13000,12500,12000,11500,11000],
    spot: [12500,13500,13750,13750,13500,13000,12500,12000,11500],
    capexGW: [31000,31000,30000,29000,28000,27000,26000,25000,24000],
    ltr: 11000
  }
};
