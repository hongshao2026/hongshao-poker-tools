// Pure algebraic solver for the staking deal model.
// Given any subset of {B, N, b, C, s, m, R, Reff, G, K}, fills in the rest
// using the constraints below. No DOM, no framework deps.
//
// Variables:
//   B    总 buyin (= N * b)
//   N    场次数
//   b    单场 buyin
//   C    其它成本 (差旅、makeup 等)
//   s    出售比例 (0..1)
//   m    溢价倍数 (markup, e.g. 1.2)
//   R    实际 ROI (0..1, e.g. 0.3 = +30%)
//   Reff 选手有效 ROI (考虑卖股 + 溢价后)
//   G    选手净利润
//   K    选手自留资金 (= B*(1-s))
//
// Constraints:
//   B = N*b
//   K = B*(1-s)
//   Reff = (1-s)R / (1 - s*m)
//   phi = (1-s)R + s(m-1)
//   G = B*phi - C

/**
 * @param {object} inputs Partial values (use null for unknown). Pass percentages as decimals
 *                        (s=0.4 not 40, R=0.3 not 30, Reff=0.5 not 50).
 * @param {number} [maxIter=30] Max fixed-point iterations.
 * @returns {{ B, N, b, C, s, m, R, Reff, G, K, wasUnknown, iterations }}
 *          wasUnknown: which keys were null in input (so caller can mark them in UI).
 */
export function solveAll(inputs, maxIter = 30) {
  let { B = null, N = null, b = null, C = null, s = null,
        m = null, R = null, Reff = null, G = null, K = null } = inputs;

  const wasUnknown = {
    B: B === null, N: N === null, b: b === null, C: C === null, s: s === null,
    m: m === null, R: R === null, Reff: Reff === null, G: G === null, K: K === null,
  };

  let changed = true, iter = 0;
  while (changed && iter < maxIter) {
    changed = false;
    iter++;

    // B <-> N*b
    if (B === null && N !== null && b !== null) { B = N * b; changed = true; }
    if (N === null && B !== null && b !== null && b > 0) { N = B / b; changed = true; }
    if (b === null && B !== null && N !== null && N > 0) { b = B / N; changed = true; }

    // K = B*(1-s)
    if (K === null && B !== null && s !== null) { K = B * (1 - s); changed = true; }
    if (B === null && K !== null && s !== null && s < 0.9999) { B = K / (1 - s); changed = true; }
    if (s === null && K !== null && B !== null && B > 0) { s = 1 - K / B; changed = true; }

    // Reff = (1-s)R / (1-s*m)
    if (Reff === null && R !== null && s !== null && m !== null) {
      const denom = 1 - s * m;
      if (denom > 1e-9) { Reff = (1 - s) * R / denom; changed = true; }
    }
    if (R === null && Reff !== null && s !== null && m !== null && (1 - s) > 1e-9) {
      R = Reff * (1 - s * m) / (1 - s); changed = true;
    }
    if (m === null && Reff !== null && R !== null && s !== null && s > 1e-9 && Math.abs(Reff) > 1e-9) {
      m = (1 - (1 - s) * R / Reff) / s; changed = true;
    }
    if (s === null && Reff !== null && R !== null && m !== null) {
      const denom = Reff * m - R;
      if (Math.abs(denom) > 1e-9) { s = (Reff - R) / denom; changed = true; }
    }

    // phi = (1-s)R + s(m-1)
    let phi = null;
    if (s !== null && R !== null && m !== null) {
      phi = (1 - s) * R + s * (m - 1);
    }

    // G = B*phi - C
    if (G === null && B !== null && C !== null && phi !== null) { G = B * phi - C; changed = true; }
    if (B === null && G !== null && C !== null && phi !== null && Math.abs(phi) > 1e-9) {
      B = (G + C) / phi; changed = true;
    }
    if (C === null && G !== null && B !== null && phi !== null) { C = B * phi - G; changed = true; }

    // After B is known, retry N or b
    if (B !== null) {
      if (N === null && b !== null && b > 0) { N = B / b; changed = true; }
      if (b === null && N !== null && N > 0) { b = B / N; changed = true; }
    }

    // Solve s from G,B,C,R,m
    if (s === null && G !== null && B !== null && C !== null && R !== null && m !== null && B > 0) {
      const denom = m - 1 - R;
      if (Math.abs(denom) > 1e-9) { s = ((G + C) / B - R) / denom; changed = true; }
    }
    // Solve m from G,B,C,R,s
    if (m === null && G !== null && B !== null && C !== null && R !== null && s !== null && s > 1e-9 && B > 0) {
      m = 1 + ((G + C) / B - (1 - s) * R) / s; changed = true;
    }
    // Solve R from G,B,C,s,m
    if (R === null && G !== null && B !== null && C !== null && s !== null && m !== null && (1 - s) > 1e-9 && B > 0) {
      R = ((G + C) / B - s * (m - 1)) / (1 - s); changed = true;
    }
  }

  return { B, N, b, C, s, m, R, Reff, G, K, wasUnknown, iterations: iter };
}

/**
 * Detect risk-free arbitrage condition: when s*m >= 1, the player has net positive
 * cash from selling shares — there's effectively no investment.
 */
export function isArbitrage(s, m) {
  return s !== null && m !== null && s * m >= 1 - 1e-9;
}
