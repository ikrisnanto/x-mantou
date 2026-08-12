/* ============================================================================
 * MODEL ASSUMPTIONS — the single source of truth for every number in the model.
 *
 * This is the file to edit when you want to change the model. Everything here
 * feeds the engine in dashboard.js; nothing else in the codebase hardcodes a
 * model figure. After editing, run:  npm run build
 *
 * Conventions used throughout:
 *   - Money is $ millions per quarter unless a name says otherwise.
 *   - Ratios are fractions, not percents (0.33 means 33%).
 *   - Every forecast array has exactly 10 entries, one per quarter of Q,
 *     running Q326 -> Q428. Keep that length or the engine will read undefined.
 *   - "A" figures are reported actuals and should only change when SpaceX
 *     restates or a new quarter is published.
 *
 * Origin: figures were first derived from SpaceX_PL_Business_Case_Model.xlsx
 * (kept in reference/ as a historical snapshot). That workbook is NO LONGER
 * authoritative and is never read at build time — this file is.
 * ==========================================================================*/

const Q = ["Q326","Q426","Q127","Q227","Q327","Q427","Q128","Q228","Q328","Q428"];
const HQ = ["Q225","Q126","Q226"];
const N = 10;

const FIXED = {
  space: {
    revGrowth: [0.10,0.12,0.10,0.09,0.08,0.08,0.07,0.07,0.06,0.06],
    cogsPct:   [0.33,0.32,0.31,0.30,0.30,0.29,0.28,0.28,0.27,0.27],
    rndPct:    [1.00,0.90,0.80,0.70,0.62,0.55,0.50,0.46,0.42,0.39],
    sgaPct:    [0.10,0.10,0.09,0.09,0.09,0.08,0.08,0.08,0.07,0.07],
    capexPct:  [1.00,0.90,0.75,0.65,0.55,0.50,0.45,0.40,0.38,0.35],
    revQ226A: 962
  },
  connectivity: {
    subAdds:   [1.6,1.6,1.5,1.5,1.4,1.4,1.3,1.3,1.2,1.2],
    arpu:      [65,65,64,64,63,63,62,62,61,61],
    entGovGrowth: [0.20,0.18,0.15,0.13,0.12,0.11,0.10,0.10,0.09,0.09],
    cogsPct:   [0.47,0.46,0.45,0.44,0.43,0.42,0.41,0.41,0.40,0.40],
    rndPct:    [0.065,0.062,0.060,0.058,0.056,0.055,0.054,0.053,0.052,0.051],
    sgaPct:    [0.06,0.058,0.056,0.054,0.052,0.05,0.049,0.048,0.047,0.046],
    capexPct:  [0.30,0.29,0.28,0.27,0.26,0.25,0.24,0.24,0.23,0.23],
    subsQ226A: 12, entGovQ226A: 1806
  },
  ai: {
    cogsPct:   [0.40,0.39,0.38,0.37,0.36,0.35,0.34,0.34,0.33,0.33],
    rndPct:    [0.75,0.65,0.58,0.52,0.47,0.43,0.40,0.37,0.35,0.33],
    sgaPct:    [0.18,0.16,0.15,0.14,0.13,0.12,0.11,0.11,0.10,0.10],
    monetizable: [0.9,0.9,0.9,0.9,0.9,0.9,0.9,0.9,0.9,0.9],
    grok:      [700,900,1150,1400,1650,1900,2150,2400,2650,2900],
    cursor:    [0,1200,1500,1800,2100,2400,2700,3000,3300,3600],
    adGrowth:  [-0.02,0,0.01,0.02,0.02,0.02,0.02,0.02,0.02,0.02],
    adQ226A: 367, nameplateQ226A: 1.4
  },
  financing: {
    itShare: 0.7, itLife: 20, facilityLife: 56,
    legacyAddback: 3681, existingDebt: 39364, existingRate: 0.055, newRate: 0.065,
    cashYield: 0.04, minCash: 15000, openingCash: 100009,
    otherIncome: [-50,-50,-30,-20,-10,0,0,0,0,0],
    tax: [20,20,20,20,20,20,20,20,20,20]
  },
  balanceQ226A: { cash: 93522, securities: 6487, ppe: 65736, totalAssets: 192770, totalLiab: 65546, equity: 127224 },
  historical: {
    quarters: HQ,
    space:        [746, 619, 962],
    connectivity: [2588, 3257, 4291],
    ai:           [737, 818, 2561],
    netIncome:    [-1008, -4276, -541],
    aiNameplateGW:[0.4, 1.0, 1.4]
  }
};

const CASES = {
  1: { name: "Case 1 — Conservative",
       rate: [2800,2900,2900,2850,2800,2750,2650,2550,2450,2400],
       spot: [3200,3300,3300,3200,3150,3100,3000,2900,2800,2700],
       capexGW: [32000,30000,28000,26500,25000,24000,23000,22000,21500,21000], ltr: 2400 },
  2: { name: "Case 2 — Management-consistent",
       rate: [6000,6500,6400,6300,6200,6100,5900,5700,5400,5200],
       spot: [12000,12000,11800,11500,11200,11000,10500,10000,9500,9000],
       capexGW: [48000,50000,52000,54000,56000,58000,60000,62000,64000,66000], ltr: 5200 },
  3: { name: "Case 3 — High-capex stress",
       rate: [6000,6500,6400,6300,6200,6100,5900,5700,5400,5200],
       spot: [12000,12000,11800,11500,11200,11000,10500,10000,9500,9000],
       capexGW: [55000,60000,65000,70000,75000,80000,84000,87000,89000,90000], ltr: 5200 }
};
