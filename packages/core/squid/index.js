// Pure DP solver for the Squid Game cake EV problem.
// No DOM, no framework deps. Importable from web tools, mini-programs, Node.

/**
 * Reward amount for a player who finishes with `cakeCount` cakes,
 * given a `rules` array (rules[i-1] = reward for i cakes).
 * If cakeCount exceeds rules length, returns the last rule.
 */
export function getRewardAmount(cakeCount, rules) {
  if (cakeCount === 0) return 0;
  const idx = cakeCount - 1;
  if (idx >= rules.length) return rules[rules.length - 1];
  return rules[idx];
}

/**
 * Compute terminal payoff map keyed by cake count.
 * Players with 0 cakes pay; players with >0 cakes receive.
 * Returns { [cakeCount]: payoff } where payoff for 0 is negative (the loser pays).
 */
export function calculateTerminalPayoff(cakes, rules) {
  const zerosCount = cakes.filter((c) => c === 0).length;
  const payoffMap = {};
  let totalPaymentPerZeroPlayer = 0;

  const uniqueCounts = [...new Set(cakes)];
  for (const k of uniqueCounts) {
    if (k > 0) {
      const reward = getRewardAmount(k, rules);
      const income = reward * zerosCount;
      payoffMap[k] = income;
      const countOfPeopleWithK = cakes.filter((c) => c === k).length;
      totalPaymentPerZeroPlayer += reward * countOfPeopleWithK;
    }
  }

  if (uniqueCounts.includes(0)) {
    payoffMap[0] = -totalPaymentPerZeroPlayer;
  }

  return payoffMap;
}

/**
 * Stable key for a cake configuration (sorted descending so symmetric states share memo).
 */
export function getStateKey(cakes) {
  return JSON.stringify([...cakes].sort((a, b) => b - a));
}

/**
 * Create a solver instance with its own memoization tables.
 * Reuse the same instance across calls in one analysis to share memo;
 * create a new one when input shape (numPeople, rules, etc.) changes.
 */
export function createSolver() {
  const memoEv = Object.create(null);
  const memoProb = Object.create(null);

  function solveEv(cakes, maxCakes, stopCount, rules, numPeople) {
    const stateKey = getStateKey(cakes);
    if (memoEv[stateKey]) return memoEv[stateKey];

    const occupiedCount = cakes.filter((c) => c > 0).length;
    const currentSum = cakes.reduce((a, b) => a + b, 0);

    if (occupiedCount >= stopCount || currentSum >= maxCakes) {
      const result = calculateTerminalPayoff(cakes, rules);
      memoEv[stateKey] = result;
      return result;
    }

    const prob = 1.0 / numPeople;
    const currentPlayersTotalEv = new Array(numPeople).fill(0);

    for (let receiverIdx = 0; receiverIdx < numPeople; receiverIdx++) {
      const nextCakes = [...cakes];
      nextCakes[receiverIdx] += 1;

      const futureEvMap = solveEv(nextCakes, maxCakes, stopCount, rules, numPeople);

      for (let pIdx = 0; pIdx < numPeople; pIdx++) {
        const kInFuture = nextCakes[pIdx];
        const val = futureEvMap[kInFuture] || 0.0;
        currentPlayersTotalEv[pIdx] += val;
      }
    }

    const resultMap = {};
    const countsCheck = {};
    for (let pIdx = 0; pIdx < numPeople; pIdx++) {
      const k = cakes[pIdx];
      const avgEv = currentPlayersTotalEv[pIdx] * prob;
      if (!resultMap[k]) {
        resultMap[k] = 0;
        countsCheck[k] = 0;
      }
      resultMap[k] += avgEv;
      countsCheck[k] += 1;
    }
    for (const k in resultMap) {
      resultMap[k] /= countsCheck[k];
    }

    memoEv[stateKey] = resultMap;
    return resultMap;
  }

  function solveProb(cakes, maxCakes, stopCount, numPeople) {
    const stateKey = getStateKey(cakes);
    if (memoProb[stateKey]) return memoProb[stateKey];

    const occupiedCount = cakes.filter((c) => c > 0).length;
    const currentSum = cakes.reduce((a, b) => a + b, 0);

    if (occupiedCount >= stopCount || currentSum >= maxCakes) {
      const res = {};
      for (const k of [...new Set(cakes)]) res[k] = { [k]: 1.0 };
      memoProb[stateKey] = res;
      return res;
    }

    const probStep = 1.0 / numPeople;
    const positionDists = new Array(numPeople).fill(0).map(() => ({}));

    for (let receiverIdx = 0; receiverIdx < numPeople; receiverIdx++) {
      const nextCakes = [...cakes];
      nextCakes[receiverIdx] += 1;
      const futureProbMap = solveProb(nextCakes, maxCakes, stopCount, numPeople);

      for (let pIdx = 0; pIdx < numPeople; pIdx++) {
        const kInFuture = nextCakes[pIdx];
        const futureDist = futureProbMap[kInFuture] || {};
        for (const finalK in futureDist) {
          positionDists[pIdx][finalK] = (positionDists[pIdx][finalK] || 0) + futureDist[finalK] * probStep;
        }
      }
    }

    const result = {};
    for (const k of [...new Set(cakes)]) {
      const indices = cakes.map((c, i) => (c === k ? i : -1)).filter((i) => i !== -1);
      const combinedDist = {};
      for (const idx of indices) {
        for (const finalK in positionDists[idx]) {
          combinedDist[finalK] = (combinedDist[finalK] || 0) + positionDists[idx][finalK];
        }
      }
      const countK = indices.length;
      for (const finalK in combinedDist) combinedDist[finalK] /= countK;
      result[k] = combinedDist;
    }

    memoProb[stateKey] = result;
    return result;
  }

  return { solveEv, solveProb };
}

/**
 * High-level decision analysis: given the current state, compute
 *   - probability distribution of my final cake count
 *   - EV if I get the next cake (hit)
 *   - EV if I don't (miss, averaged across other players getting it)
 *   - diff = evHit - evMiss
 *
 * @param {{ allCakes: number[], maxCakes: number, stopCount: number,
 *           rules: number[], numPeople: number, myIndex?: number }} args
 */
export function analyzeDecision({ allCakes, maxCakes, stopCount, rules, numPeople, myIndex = 0 }) {
  const myCake = allCakes[myIndex];
  const others = allCakes.filter((_, i) => i !== myIndex);
  const totalCakes = allCakes.reduce((a, b) => a + b, 0);

  if (totalCakes === maxCakes) {
    const payoffMap = calculateTerminalPayoff(allCakes, rules);
    const myFinal = payoffMap[myCake] || 0.0;
    return {
      gameEnded: true,
      probDist: { [myCake]: 1.0 },
      evHit: myFinal,
      evMiss: 0,
      diff: myFinal,
    };
  }

  const solver = createSolver();
  const probMap = solver.solveProb(allCakes, maxCakes, stopCount, numPeople);
  const probDist = probMap[myCake] || {};

  const nextCakesIfGet = [...allCakes];
  nextCakesIfGet[myIndex] = myCake + 1;
  const evMapIfGet = solver.solveEv(nextCakesIfGet, maxCakes, stopCount, rules, numPeople);
  const evHit = evMapIfGet[myCake + 1] || 0;

  let totalEvIfNotGet = 0;
  for (let i = 0; i < others.length; i++) {
    const tempCakes = [...allCakes];
    // bump the i-th OTHER player (skip myIndex)
    const otherAbsoluteIdx = i < myIndex ? i : i + 1;
    tempCakes[otherAbsoluteIdx] += 1;
    const evMap = solver.solveEv(tempCakes, maxCakes, stopCount, rules, numPeople);
    totalEvIfNotGet += evMap[myCake] || 0;
  }
  const evMiss = others.length > 0 ? totalEvIfNotGet / others.length : 0;

  return {
    gameEnded: false,
    probDist,
    evHit,
    evMiss,
    diff: evHit - evMiss,
  };
}
