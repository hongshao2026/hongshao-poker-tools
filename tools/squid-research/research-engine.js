(function attachSquidResearchEngine(root) {
  "use strict";

  function factorialsThrough(limit) {
    const values = [1];
    for (let index = 1; index <= limit; index += 1) values[index] = values[index - 1] * index;
    return values;
  }

  function* partitions(total, slots, maximum = total, prefix = []) {
    if (slots === 0) {
      if (total === 0) yield prefix;
      return;
    }
    const upper = Math.min(maximum, total);
    for (let value = upper; value >= 0; value -= 1) {
      yield* partitions(total - value, slots - 1, value, [...prefix, value]);
    }
  }

  function permutationCount(values, factorials) {
    const frequencies = new Map();
    for (const value of values) frequencies.set(value, (frequencies.get(value) || 0) + 1);
    let permutations = factorials[values.length];
    for (const frequency of frequencies.values()) permutations /= factorials[frequency];
    return permutations;
  }

  function distributionProbability(cakes, otherCounts, numPeople, distributed, factorials) {
    let denominator = Math.pow(numPeople, distributed);
    for (const count of cakes) denominator *= factorials[count];
    return (factorials[distributed] * permutationCount(otherCounts, factorials)) / denominator;
  }

  function validateSettings(settings) {
    const integerFields = ["numPeople", "totalSquids", "stopCount"];
    for (const field of integerFields) {
      if (!Number.isInteger(settings[field])) throw new Error(`${field} 必须是整数`);
    }
    if (settings.numPeople < 6 || settings.numPeople > 9) throw new Error("玩家数需在 6–9 人之间");
    if (settings.totalSquids < 3 || settings.totalSquids > 14) throw new Error("总鱼数需在 3–14 条之间");
    if (settings.stopCount < 2 || settings.stopCount > settings.numPeople) throw new Error("终止人数不能超过玩家数");
    if (!Number.isFinite(settings.squidValueBb) || settings.squidValueBb < 0) throw new Error("每鱼价值必须是非负数");
    if (!Number.isFinite(settings.baseDeadMoneyBb) || settings.baseDeadMoneyBb < 0) throw new Error("基础死钱必须是非负数");
    if (!Array.isArray(settings.multipliers) || settings.multipliers.length !== settings.totalSquids) throw new Error("倍率数量与总鱼数不一致");
    if (settings.multipliers.some((value) => !Number.isFinite(value) || value < 0)) throw new Error("倍率必须是非负数");
  }

  function generate(settings, createSolver, onProgress = () => {}) {
    validateSettings(settings);
    const startedAt = performance.now();
    const { numPeople, totalSquids, stopCount, squidValueBb, baseDeadMoneyBb, multipliers } = settings;
    const rules = multipliers.map((multiplier, index) => (index + 1) * multiplier);
    const factorials = factorialsThrough(Math.max(totalSquids, numPeople));
    const solver = createSolver();
    const rows = [];
    const groups = new Map();
    let labeledDistributions = 0;

    for (let distributed = 0; distributed < totalSquids; distributed += 1) {
      const remaining = totalSquids - distributed;
      for (let heroSquids = 0; heroSquids <= distributed; heroSquids += 1) {
        for (let opponentSquids = 0; opponentSquids <= distributed - heroSquids; opponentSquids += 1) {
          const otherTotal = distributed - heroSquids - opponentSquids;
          for (const others of partitions(otherTotal, numPeople - 2)) {
            const cakes = [heroSquids, opponentSquids, ...others];
            const occupied = cakes.reduce((count, value) => count + Number(value > 0), 0);
            if (occupied >= stopCount) continue;

            const heroGets = [...cakes];
            const opponentGets = [...cakes];
            heroGets[0] += 1;
            opponentGets[1] += 1;
            const heroResult = solver.solve(heroGets, totalSquids, stopCount, rules, numPeople, 1, Infinity, null, false);
            const opponentResult = solver.solve(opponentGets, totalSquids, stopCount, rules, numPeople, 1, Infinity, null, false);
            const squidDeadMoneyUnit = heroResult.players[0].netBb - opponentResult.players[0].netBb;
            const occurrenceProbability = distributionProbability(cakes, others, numPeople, distributed, factorials);
            const multiplicity = permutationCount(others, factorials);
            const key = `${remaining}|${heroSquids}|${opponentSquids}`;
            const squidDeadMoneyBb = squidDeadMoneyUnit * squidValueBb;
            const totalEffectiveBb = squidDeadMoneyBb + baseDeadMoneyBb;

            labeledDistributions += multiplicity;
            rows.push({
              remaining,
              distributed,
              heroSquids,
              opponentSquids,
              others,
              totalEffectiveBb,
              occurrenceProbability,
              squidDeadMoneyUnit,
              squidDeadMoneyBb,
              groupKey: key,
            });

            if (!groups.has(key)) {
              groups.set(key, {
                key,
                remaining,
                heroSquids,
                opponentSquids,
                probabilitySum: 0,
                weightedUnitSum: 0,
                minUnit: Infinity,
                maxUnit: -Infinity,
              });
            }
            const group = groups.get(key);
            group.probabilitySum += occurrenceProbability;
            group.weightedUnitSum += occurrenceProbability * squidDeadMoneyUnit;
            group.minUnit = Math.min(group.minUnit, squidDeadMoneyUnit);
            group.maxUnit = Math.max(group.maxUnit, squidDeadMoneyUnit);
          }
        }
      }
      onProgress({ completed: distributed + 1, total: totalSquids });
    }

    const finalizedGroups = [...groups.values()].map((group) => ({
      ...group,
      weightedMeanUnit: group.weightedUnitSum / group.probabilitySum,
      rangeBb: (group.maxUnit - group.minUnit) * squidValueBb,
    }));
    const groupLookup = new Map(finalizedGroups.map((group) => [group.key, group]));
    for (const row of rows) row.groupRangeBb = groupLookup.get(row.groupKey).rangeBb;

    rows.sort((a, b) => (
      b.remaining - a.remaining
      || a.heroSquids - b.heroSquids
      || a.opponentSquids - b.opponentSquids
      || b.others.join(",").localeCompare(a.others.join(","))
    ));
    finalizedGroups.sort((a, b) => b.rangeBb - a.rangeBb);
    const maximumRangeGroup = finalizedGroups[0] || null;
    const totalValues = rows.map((row) => row.totalEffectiveBb);

    return {
      rows,
      groups: finalizedGroups,
      summary: {
        distinctDistributions: rows.length,
        labeledDistributions,
        groupCount: finalizedGroups.length,
        maximumRangeBb: maximumRangeGroup ? maximumRangeGroup.rangeBb : 0,
        maximumRangeContext: maximumRangeGroup
          ? `${maximumRangeGroup.heroSquids} vs ${maximumRangeGroup.opponentSquids} · 剩余 ${maximumRangeGroup.remaining} 鱼`
          : "—",
        minimumTotalEffectiveBb: totalValues.length ? Math.min(...totalValues) : 0,
        maximumTotalEffectiveBb: totalValues.length ? Math.max(...totalValues) : 0,
        calculationMs: performance.now() - startedAt,
      },
      settings,
    };
  }

  root.SquidResearchEngine = { generate };
})(typeof self !== "undefined" ? self : globalThis);
