// MTT staking model: variance, ROI, optimal sale fraction, growth rate.
// Pure functions, no DOM/React deps. Importable from web tools, mini-programs, Node.
//
// Calibrated against 9 real GG data points (Felix table at the bottom).

export const MODEL = {
  sigma_constant: 0.908,
  sigma_field_exp: 0.286,
  top1_constant: 0.813,
  top1_exp: 0.738,
  cash_rate: 0.14,
  type_mult: {
    Standard: 1.0,
    PKO: 0.8,
    Mystery: 1.4,
  },
  markup_slope: 0.499,
};

/**
 * Reference ROI implied by Felix's table for a given field+buyin combo.
 * Empirically fit: ROI ≈ a + 3.13*log(field) - 3.0*log(BI/109).
 */
export const refROI = (field, buyin) => {
  const baseROI = 1.0 + 3.13 * Math.log(field);
  const biAdjust = -3.0 * Math.log(buyin / 109);
  return Math.max(0, baseROI + biAdjust);
};

/** Standard deviation per buy-in for given field size + tournament type. */
export const calcSigma = (field, type) => {
  return MODEL.sigma_constant * Math.pow(field, MODEL.sigma_field_exp) * (MODEL.type_mult[type] || 1);
};

/** Markup recommended by the calibrated model for a given ROI fraction. */
export const recommendMarkup = (roiFrac) => 1 + MODEL.markup_slope * roiFrac;

/**
 * Adjust per-bullet sigma for player's risk-shape preference.
 * shape ∈ [0,1]: 0 = 稳健入围 (low var), 0.5 = 均衡 (Felix baseline), 1.0 = 搏深跑 (high var).
 * Quadratic fit through (0, 0.85), (0.5, 1.0), (1.0, 1.4).
 */
export const adjustSigmaForShape = (sigma, shape) => {
  const mult = 0.5 * shape * shape + 0.05 * shape + 0.85;
  return sigma * mult;
};

/**
 * Calibrated model — closed-form approximation of Felix's table outputs.
 * Uses g_per_bullet ≈ m/BR - v/(2*BR²).
 */
export const calibratedModel = ({ buyin, field, roi, BR, type, markup, shape }) => {
  const roiFrac = roi / 100;
  const MU = markup;
  let sigmaBI = calcSigma(field, type);
  sigmaBI = adjustSigmaForShape(sigmaBI, shape);
  const sigma_d_sq = Math.pow(sigmaBI * buyin, 2);

  let oneMinusS = (BR * buyin * (roiFrac - (MU - 1))) / sigma_d_sq;
  oneMinusS = Math.max(0.001, Math.min(1.0, oneMinusS));
  const s = 1 - oneMinusS;

  const mu_d = roiFrac * buyin;
  const m_self = oneMinusS * mu_d + s * (MU - 1) * buyin;
  const v_self = Math.pow(oneMinusS, 2) * sigma_d_sq;
  const g_per_bullet = m_self / BR - v_self / (2 * BR * BR);
  const g_self_only = mu_d / BR - sigma_d_sq / (2 * BR * BR);

  return {
    optSale: s,
    sigmaBI,
    sigma_d: sigmaBI * buyin,
    expectedSelf: m_self,
    gPerBullet: g_per_bullet,
    gSelfOnly: g_self_only,
    ceGrowth: g_per_bullet * BR,
    ceSelfOnly: g_self_only * BR,
  };
};

/**
 * Theoretical model — numerical search over s ∈ [0,1] for optimal log-bankroll growth.
 * Same g(s) = m(s)/BR - v(s)/(2 BR²) but searched directly instead of closed-form.
 */
export const theoreticalModel = ({ buyin, field, roi, BR, type, markup, shape }) => {
  const roiFrac = roi / 100;
  const MU = markup;
  let sigmaBI = calcSigma(field, type);
  sigmaBI = adjustSigmaForShape(sigmaBI, shape);
  const sigma_d = sigmaBI * buyin;
  const mu_d = roiFrac * buyin;

  let bestS = 0;
  let bestG = -Infinity;
  for (let s = 0; s <= 1; s += 0.005) {
    const oneMinusS = 1 - s;
    const m = oneMinusS * mu_d + s * (MU - 1) * buyin;
    const v = oneMinusS * oneMinusS * sigma_d * sigma_d;
    const g = m / BR - v / (2 * BR * BR);
    if (g > bestG) { bestG = g; bestS = s; }
  }

  const oneMinusS = 1 - bestS;
  const m_self = oneMinusS * mu_d + bestS * (MU - 1) * buyin;
  const v_self = oneMinusS * oneMinusS * sigma_d * sigma_d;
  const g_self_only = mu_d / BR - sigma_d * sigma_d / (2 * BR * BR);

  // Felix-style: f* = μ/(σ²+μ²) — Kelly fraction in the no-sell case.
  const kellyFrac = mu_d / (sigma_d * sigma_d + mu_d * mu_d);
  const kellyBI = kellyFrac * BR;

  return {
    optSale: bestS,
    sigmaBI,
    sigma_d,
    expectedSelf: m_self,
    gPerBullet: bestG,
    gSelfOnly: g_self_only,
    ceGrowth: bestG * BR,
    ceSelfOnly: g_self_only * BR,
    kellyBI,
  };
};

/**
 * Felix's original 27-row reference table.
 * Used by the FelixTab UI for visual cross-validation against the model.
 */
export const FELIX_TABLE = [
  { type: "PKO",      field: 20000, buyin: 109, roi: 24.5, mu: 1.123, sale: 97.9, ce: 20 },
  { type: "Standard", field: 20000, buyin: 109, roi: 24.5, mu: 1.123, sale: 98.4, ce: 19 },
  { type: "Mystery",  field: 20000, buyin: 109, roi: 24.5, mu: 1.123, sale: 97.0, ce: 19 },
  { type: "PKO",      field: 20000, buyin: 55,  roi: 27.6, mu: 1.138, sale: 95.4, ce: 11 },
  { type: "Standard", field: 20000, buyin: 55,  roi: 27.6, mu: 1.138, sale: 96.5, ce: 10 },
  { type: "Standard", field: 5000,  buyin: 109, roi: 20.4, mu: 1.102, sale: 96.7, ce: 17 },
  { type: "PKO",      field: 5000,  buyin: 109, roi: 20.4, mu: 1.102, sale: 95.3, ce: 17 },
  { type: "Mystery",  field: 5000,  buyin: 109, roi: 20.4, mu: 1.102, sale: 94.2, ce: 17 },
  { type: "Mystery",  field: 5000,  buyin: 55,  roi: 23.2, mu: 1.116, sale: 87.2, ce: 9 },
  { type: "Standard", field: 5000,  buyin: 55,  roi: 23.2, mu: 1.116, sale: 92.7, ce: 8 },
  { type: "Standard", field: 2000,  buyin: 109, roi: 16.2, mu: 1.081, sale: 95.4, ce: 14 },
  { type: "PKO",      field: 2000,  buyin: 109, roi: 16.2, mu: 1.081, sale: 93.1, ce: 15 },
  { type: "Mystery",  field: 2000,  buyin: 109, roi: 16.2, mu: 1.081, sale: 92.1, ce: 15 },
  { type: "Standard", field: 1000,  buyin: 109, roi: 14.1, mu: 1.071, sale: 93.6, ce: 13 },
  { type: "PKO",      field: 1000,  buyin: 109, roi: 14.1, mu: 1.071, sale: 90.5, ce: 14 },
  { type: "Mystery",  field: 1000,  buyin: 109, roi: 14.1, mu: 1.071, sale: 89.7, ce: 14 },
  { type: "Mystery",  field: 500,   buyin: 109, roi: 12.1, mu: 1.06,  sale: 86.5, ce: 12 },
  { type: "Standard", field: 500,   buyin: 109, roi: 12.1, mu: 1.06,  sale: 91.1, ce: 12 },
  { type: "PKO",      field: 500,   buyin: 109, roi: 12.1, mu: 1.06,  sale: 87.4, ce: 13 },
  { type: "Standard", field: 200,   buyin: 109, roi: 9.7,  mu: 1.048, sale: 85.9, ce: 11 },
  { type: "Mystery",  field: 200,   buyin: 109, roi: 9.7,  mu: 1.048, sale: 81.3, ce: 11 },
  { type: "PKO",      field: 200,   buyin: 109, roi: 9.7,  mu: 1.048, sale: 82.4, ce: 12 },
  { type: "PKO",      field: 100,   buyin: 109, roi: 7.9,  mu: 1.039, sale: 79.0, ce: 11 },
  { type: "Mystery",  field: 100,   buyin: 109, roi: 7.9,  mu: 1.039, sale: 79.0, ce: 10 },
  { type: "Standard", field: 100,   buyin: 109, roi: 7.9,  mu: 1.039, sale: 79.4, ce: 10 },
];
