// Pure calculation module for bounty tournaments.
// No DOM, no framework deps. Importable from web tools, mini-programs, Node.

// ----- 通用辅助 -----

/**
 * @param {{ ante: number, bb: number, playersAtTable: number,
 *           heroInvested: number, villainAllins: number[] }} p
 */
export function pkoPot(p) {
  const sb = p.bb / 2;
  const allin = p.villainAllins.reduce((s, v) => s + (v >= 0 ? v : 0), 0);
  return p.ante * p.playersAtTable + sb + p.bb + p.heroInvested + allin;
}

/**
 * @param {{ playersAtTable: number, ante: number, bb: number,
 *           heroInvested: number, villainStacks: number[] }} p
 */
export function mysteryPot(p) {
  const opp = p.villainStacks.reduce((s, v) => s + (v >= 0 ? v : 0), 0);
  return p.playersAtTable * p.ante + 1.5 * p.bb + opp + p.heroInvested;
}

/**
 * Hero needs to call max(0, max(villain_allins) - hero_invested).
 * Returns 0 if no villains.
 */
export function heroCallAmount(heroInvested, villainAllins) {
  if (!villainAllins.length) return 0;
  return Math.max(0, Math.max(...villainAllins) - heroInvested);
}

// ----- PKO 主计算 -----

/**
 * @param {{
 *   totalEntrants: number, playersLeft: number,
 *   startingStack: number, startingBounty: number,
 *   currentPot: number, heroCall: number, heroStack: number,
 *   villains: Array<{ stack: number, bounty: number }>
 * }} p
 * @returns {{
 *   F: number, bountyFactor: number, bountyValueAtCurrent: number,
 *   totalCoveredBounty: number, coveredCount: number,
 *   bountyChips: number, totalReward: number,
 *   requiredEquity: number, normalEquity: number,
 * }}
 */
export function calcPKO(p) {
  const F = p.playersLeft / p.totalEntrants;
  const bountyFactor = 0.5 / (1 + Math.sqrt(F));
  const bountyValueAtCurrent = bountyFactor * p.startingStack;

  let totalCoveredBounty = 0;
  let coveredCount = 0;
  for (const v of p.villains) {
    if (v.stack === undefined || v.bounty === undefined) continue;
    if (v.stack < 0 || v.bounty < 0) continue;
    if (p.heroStack >= v.stack) {
      totalCoveredBounty += v.bounty;
      coveredCount += 1;
    }
  }

  const bountyChips =
    (totalCoveredBounty / p.startingBounty) * bountyFactor * p.startingStack;
  const totalReward = p.currentPot + p.heroCall + bountyChips;

  if (totalReward <= 0 || p.currentPot + p.heroCall <= 0) {
    throw new Error('Pot + call must be > 0');
  }

  return {
    F,
    bountyFactor,
    bountyValueAtCurrent,
    totalCoveredBounty,
    coveredCount,
    bountyChips,
    totalReward,
    requiredEquity: p.heroCall / totalReward,
    normalEquity: p.heroCall / (p.currentPot + p.heroCall),
  };
}

// ----- 神秘赏金主计算 -----

/**
 * @param {{
 *   startingStack: number, regBuyin: number,
 *   currentPot: number, heroInvested: number, heroCall: number,
 *   bountyTable: Array<{ value: number, count: number }>,
 *   villainStacks: number[],
 * }} p
 * @returns {{
 *   totalBountyValue: number, totalBountyCount: number,
 *   averageBounty: number, singleBountyChips: number,
 *   coveredCount: number, totalBountyChips: number,
 *   totalReward: number,
 *   requiredEquity: number, normalEquity: number,
 * }}
 */
export function calcMystery(p) {
  let totalBountyValue = 0;
  let totalBountyCount = 0;
  for (const row of p.bountyTable) {
    if (row.value === undefined || row.count === undefined) continue;
    if (row.value < 0 || row.count < 0) continue;
    const c = Math.floor(row.count);
    totalBountyValue += row.value * c;
    totalBountyCount += c;
  }

  if (totalBountyCount <= 0) {
    throw new Error('Bounty table must have at least one valid row');
  }

  const averageBounty = totalBountyValue / totalBountyCount;
  const singleBountyChips = averageBounty * (p.startingStack / p.regBuyin);

  const heroCommit = p.heroInvested + p.heroCall;
  let coveredCount = 0;
  for (const stack of p.villainStacks) {
    if (stack === undefined || stack < 0) continue;
    if (heroCommit >= stack) coveredCount += 1;
  }

  const totalBountyChips = coveredCount * singleBountyChips;
  const totalReward = p.currentPot + p.heroCall + totalBountyChips;

  if (totalReward <= 0 || p.currentPot + p.heroCall <= 0) {
    throw new Error('Pot + call must be > 0');
  }

  return {
    totalBountyValue,
    totalBountyCount,
    averageBounty,
    singleBountyChips,
    coveredCount,
    totalBountyChips,
    totalReward,
    requiredEquity: p.heroCall / totalReward,
    normalEquity: p.heroCall / (p.currentPot + p.heroCall),
  };
}
