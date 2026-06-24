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
 * Compute terminal per-player transfer details in BB.
 * A zero-squid player pays every positive-squid player according to `rules`;
 * a positive-squid player receives from every zero-squid player.
 */
export function calculateTerminalPlayerPayoffs(cakes, rules, squidValueBb = 1) {
  const zerosCount = cakes.filter((c) => c === 0).length;
  const totalPaymentPerZeroPlayer = cakes.reduce((sum, cakeCount) => {
    if (cakeCount <= 0) return sum;
    return sum + getRewardAmount(cakeCount, rules) * squidValueBb;
  }, 0);

  return cakes.map((cakeCount) => {
    const receiveBb = cakeCount > 0 ? getRewardAmount(cakeCount, rules) * zerosCount * squidValueBb : 0;
    const payBb = cakeCount === 0 ? totalPaymentPerZeroPlayer : 0;
    return {
      squids: cakeCount,
      payBb,
      receiveBb,
      netBb: receiveBb - payBb,
    };
  });
}

/**
 * Stable key for a cake configuration (sorted descending so symmetric states share memo).
 */
export function getStateKey(cakes) {
  return JSON.stringify([...cakes].sort((a, b) => b - a));
}

function normalizeMaxPerPlayer(maxPerPlayer) {
  if (maxPerPlayer === undefined || maxPerPlayer === null || maxPerPlayer === Infinity) return Infinity;
  if (typeof maxPerPlayer === 'string' && maxPerPlayer.trim().toLowerCase() === 'inf') return Infinity;
  const parsed = Number(maxPerPlayer);
  return Number.isFinite(parsed) ? parsed : Infinity;
}

function isTerminalState(cakes, maxCakes, stopCount, maxPerPlayer = Infinity) {
  const occupiedCount = cakes.filter((c) => c > 0).length;
  const currentSum = cakes.reduce((a, b) => a + b, 0);
  const cap = normalizeMaxPerPlayer(maxPerPlayer);
  const hasEligibleReceiver = cakes.some((c) => c < cap);
  return occupiedCount >= stopCount || currentSum >= maxCakes || !hasEligibleReceiver;
}

function emptyPlayerOutcome(squids = 0) {
  return {
    squids,
    payBb: 0,
    receiveBb: 0,
    netBb: 0,
    finalDist: {},
  };
}

function copyPlayerOutcome(player, squids = player.squids) {
  return {
    squids,
    payBb: player.payBb,
    receiveBb: player.receiveBb,
    netBb: player.netBb,
    finalDist: { ...player.finalDist },
  };
}

function addWeightedPlayerOutcome(target, source, weight) {
  target.payBb += source.payBb * weight;
  target.receiveBb += source.receiveBb * weight;
  target.netBb += source.netBb * weight;
  for (const finalCount in source.finalDist) {
    target.finalDist[finalCount] = (target.finalDist[finalCount] || 0) + source.finalDist[finalCount] * weight;
  }
}

function mapCanonicalResultToCakes(cakes, canonicalCakes, canonicalResult) {
  const byCount = new Map();
  for (let i = 0; i < canonicalCakes.length; i++) {
    const count = canonicalCakes[i];
    if (!byCount.has(count)) byCount.set(count, []);
    byCount.get(count).push(canonicalResult.players[i]);
  }

  const averagedByCount = new Map();
  for (const [count, outcomes] of byCount.entries()) {
    const averaged = emptyPlayerOutcome(count);
    const weight = 1 / outcomes.length;
    for (const outcome of outcomes) addWeightedPlayerOutcome(averaged, outcome, weight);
    averagedByCount.set(count, averaged);
  }

  return {
    expectedPenaltyPayers: canonicalResult.expectedPenaltyPayers,
    players: cakes.map((count) => copyPlayerOutcome(averagedByCount.get(count), count)),
  };
}

/**
 * Create a per-player solver that returns expected terminal payments for every
 * current player position, while still memoizing symmetric states.
 */
export function createPerPlayerSolver() {
  const memo = new Map();

  function solve(cakes, maxCakes, stopCount, rules, numPeople, squidValueBb = 1, maxPerPlayer = Infinity) {
    const canonicalCakes = [...cakes].sort((a, b) => b - a);
    const cap = normalizeMaxPerPlayer(maxPerPlayer);
    const key = JSON.stringify([canonicalCakes, maxCakes, stopCount, rules, numPeople, squidValueBb, cap]);

    if (!memo.has(key)) {
      memo.set(
        key,
        solveCanonical(canonicalCakes, maxCakes, stopCount, rules, numPeople, squidValueBb, cap),
      );
    }

    return mapCanonicalResultToCakes(cakes, canonicalCakes, memo.get(key));
  }

  function solveCanonical(cakes, maxCakes, stopCount, rules, numPeople, squidValueBb, maxPerPlayer) {
    if (isTerminalState(cakes, maxCakes, stopCount, maxPerPlayer)) {
      const payoffs = calculateTerminalPlayerPayoffs(cakes, rules, squidValueBb);
      return {
        expectedPenaltyPayers: cakes.filter((c) => c === 0).length,
        players: payoffs.map((player) => ({
          ...player,
          finalDist: { [player.squids]: 1 },
        })),
      };
    }

    const eligibleReceivers = cakes
      .map((count, index) => (count < maxPerPlayer ? index : -1))
      .filter((index) => index !== -1);
    const stepProbability = 1 / eligibleReceivers.length;
    const accumPlayers = cakes.map((count) => emptyPlayerOutcome(count));
    let expectedPenaltyPayers = 0;

    for (const receiverIdx of eligibleReceivers) {
      const nextCakes = [...cakes];
      nextCakes[receiverIdx] += 1;
      const future = solve(nextCakes, maxCakes, stopCount, rules, numPeople, squidValueBb, maxPerPlayer);
      expectedPenaltyPayers += future.expectedPenaltyPayers * stepProbability;

      for (let playerIdx = 0; playerIdx < numPeople; playerIdx++) {
        addWeightedPlayerOutcome(accumPlayers[playerIdx], future.players[playerIdx], stepProbability);
      }
    }

    return {
      expectedPenaltyPayers,
      players: accumPlayers,
    };
  }

  return { solve };
}

/**
 * Full-table dead-money analysis.
 *
 * Returns the current expected payment/receipt/net for every player and a
 * scenario table showing what changes if the current hand's squid(s) go to each player.
 */
export function analyzePerPlayerDeadMoney({
  allCakes,
  maxCakes,
  stopCount,
  rules,
  numPeople,
  squidValueBb = 1,
  maxPerPlayer = Infinity,
  handSquids = 1,
}) {
  const cap = normalizeMaxPerPlayer(maxPerPlayer);
  const solver = createPerPlayerSolver();
  const base = solver.solve(allCakes, maxCakes, stopCount, rules, numPeople, squidValueBb, cap);
  const currentSum = allCakes.reduce((a, b) => a + b, 0);
  const hasRemainingSquids = currentSum < maxCakes;
  const scenarioSquids = Math.min(
    Math.max(1, Math.floor(Number(handSquids) || 1)),
    Math.max(0, maxCakes - currentSum),
  );

  function shapeScenario(label, cakes, result, receiverIndex = null) {
    return {
      label,
      receiverIndex,
      allCakes: [...cakes],
      expectedPenaltyPayers: result.expectedPenaltyPayers,
      players: result.players.map((player, index) => ({
        player: `P${index + 1}`,
        squids: cakes[index],
        deadMoneyBb: player.payBb,
        receiveBb: player.receiveBb,
        penaltyEquityBb: player.netBb,
        finalDist: { ...player.finalDist },
      })),
    };
  }

  const baseScenario = shapeScenario('当前分布', allCakes, base);
  const scenarios = [baseScenario];

  if (hasRemainingSquids && !isTerminalState(allCakes, maxCakes, stopCount, cap)) {
    for (let receiverIdx = 0; receiverIdx < numPeople; receiverIdx++) {
      if (allCakes[receiverIdx] + scenarioSquids > cap) continue;
      const nextCakes = [...allCakes];
      nextCakes[receiverIdx] += scenarioSquids;
      const result = solver.solve(nextCakes, maxCakes, stopCount, rules, numPeople, squidValueBb, cap);
      scenarios.push(shapeScenario(`P${receiverIdx + 1} +${scenarioSquids}`, nextCakes, result, receiverIdx));
    }
  }

  const scenarioByReceiver = new Map(
    scenarios
      .filter((scenario) => scenario.receiverIndex !== null)
      .map((scenario) => [scenario.receiverIndex, scenario]),
  );
  const potAnteMatrix = allCakes.map((_, playerIdx) => (
    allCakes.map((__, opponentIdx) => {
      if (playerIdx === opponentIdx) return null;
      const playerGetsSquid = scenarioByReceiver.get(playerIdx);
      const opponentGetsSquid = scenarioByReceiver.get(opponentIdx);
      if (!playerGetsSquid || !opponentGetsSquid) return null;
      return (
        playerGetsSquid.players[playerIdx].penaltyEquityBb
        - opponentGetsSquid.players[playerIdx].penaltyEquityBb
      );
    })
  ));
  const players = baseScenario.players.map((player, playerIdx) => {
    const antes = potAnteMatrix[playerIdx].filter((value) => Number.isFinite(value));
    const averageAnteBb = antes.length
      ? antes.reduce((sum, value) => sum + value, 0) / antes.length
      : 0;
    return {
      ...player,
      averageAnteBb,
    };
  });

  return {
    gameEnded: isTerminalState(allCakes, maxCakes, stopCount, cap),
    expectedPenaltyPayers: base.expectedPenaltyPayers,
    players,
    scenarios,
    matrix: scenarios.map((scenario) => scenario.players.map((player) => player.deadMoneyBb)),
    potAnteMatrix,
  };
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
