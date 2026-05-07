// Pure Monte Carlo simulator for staking strategy variance.
// No DOM, no framework deps. Caller can run inside a Web Worker for non-blocking.

/**
 * Top-heavy MTT payout structure (decay tuned by ITM count).
 * Returns array of payout fractions summing to 1.
 */
export function buildPayouts(itmCount) {
  let decay;
  if (itmCount <= 5) decay = 1.5;
  else if (itmCount <= 20) decay = 2.5;
  else if (itmCount <= 100) decay = 3.5;
  else decay = 4.5;
  const raw = [];
  for (let i = 0; i < itmCount; i++) raw.push(Math.exp(-decay * i / itmCount));
  const sum = raw.reduce((a, b) => a + b, 0);
  return raw.map((x) => x / sum);
}

/**
 * Simulate ROI for a given skill exponent.
 * rank = ceil(N * u^alpha), alpha>1 = better (skewed to lower ranks).
 * Returns realized ROI as a fraction of buyin.
 */
export function realizeROI(buyin, N, payouts, alpha, samples, rng = Math.random) {
  const itm = payouts.length;
  let total = 0;
  for (let i = 0; i < samples; i++) {
    const u = rng();
    const rank = Math.max(1, Math.min(N, Math.ceil(N * Math.pow(u, alpha))));
    if (rank > itm) total -= buyin;
    else total += payouts[rank - 1] * (buyin * N) - buyin;
  }
  return total / (samples * buyin);
}

/**
 * Binary-search for the alpha that makes empirical ROI match `targetR`.
 */
export function calibrateAlpha(buyin, N, payouts, targetR, samples, rng = Math.random) {
  let lo = 0.3, hi = 5.0;
  for (let iter = 0; iter < 22; iter++) {
    const mid = (lo + hi) / 2;
    const roi = realizeROI(buyin, N, payouts, mid, samples, rng);
    if (roi < targetR) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * Simulate one staking strategy: returns finals (terminal P/L per path), maxDDs,
 * and a few sample trajectories for plotting.
 *
 * Per-tournament player P/L = (1-sellFrac)*(prize - buyin) + buyin*sellFrac*(premium-1).
 *
 * @returns {{ finals: Float64Array, maxDDs: Float64Array,
 *             trajSample: Float64Array[], numTourneys: number }}
 */
export function simStrategy({
  buyin, N_field, payouts, alpha, sellFrac, premium,
  numTourneys, numPaths, rng = Math.random,
}) {
  const itm = payouts.length;
  const premIncomePerT = buyin * sellFrac * (premium - 1);
  const finals = new Float64Array(numPaths);
  const maxDDs = new Float64Array(numPaths);
  const trajSample = [];
  const SAMPLE_TRAJ = Math.min(30, numPaths);

  for (let p = 0; p < numPaths; p++) {
    let cum = 0, peak = 0, maxDD = 0;
    const traj = (p < SAMPLE_TRAJ) ? new Float64Array(numTourneys + 1) : null;
    if (traj) traj[0] = 0;

    for (let t = 0; t < numTourneys; t++) {
      const u = rng();
      const rank = Math.max(1, Math.min(N_field, Math.ceil(N_field * Math.pow(u, alpha))));
      let prize = 0;
      if (rank <= itm) prize = payouts[rank - 1] * (buyin * N_field);
      const tourneyPL = prize - buyin;
      const playerPL = (1 - sellFrac) * tourneyPL + premIncomePerT;
      cum += playerPL;
      if (cum > peak) peak = cum;
      const dd = peak - cum;
      if (dd > maxDD) maxDD = dd;
      if (traj) traj[t + 1] = cum;
    }
    finals[p] = cum;
    maxDDs[p] = maxDD;
    if (traj) trajSample.push(traj);
  }
  return { finals, maxDDs, trajSample, numTourneys };
}

/**
 * Quantile of a sorted array. p in [0, 1].
 */
export function quantile(sortedArr, p) {
  const idx = Math.max(0, Math.min(sortedArr.length - 1, Math.floor(p * sortedArr.length)));
  return sortedArr[idx];
}
