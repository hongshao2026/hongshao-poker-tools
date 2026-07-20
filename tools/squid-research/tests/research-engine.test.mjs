import assert from "node:assert/strict";
import test from "node:test";
import { createPerPlayerSolver } from "../../../packages/core/squid/index.js";

await import("../research-engine.js");

const defaultSettings = {
  numPeople: 9,
  totalSquids: 12,
  squidValueBb: 4,
  baseDeadMoneyBb: 10.5,
  stopCount: 7,
  multipliers: Array(12).fill(1),
};

test("generates the verified 9-player research database", () => {
  const result = globalThis.SquidResearchEngine.generate(
    defaultSettings,
    createPerPlayerSolver,
  );

  assert.equal(result.rows.length, 1583);
  assert.equal(result.groups.length, 364);
  assert.equal(result.summary.labeledDistributions, 154540);
  assert.ok(Math.abs(result.summary.maximumRangeBb - 20) < 1e-9);

  const opening = result.rows.find((row) => row.remaining === 12 && row.heroSquids === 0 && row.opponentSquids === 0);
  assert.ok(opening);
  assert.equal(opening.occurrenceProbability, 1);
  assert.ok(Math.abs(opening.totalEffectiveBb - 34.65862703751954) < 1e-9);
});

test("occurrence probability includes merged P3-P9 identity permutations", () => {
  const result = globalThis.SquidResearchEngine.generate(
    defaultSettings,
    createPerPlayerSolver,
  );
  const otherPlayerGetsFirst = result.rows.find((row) => (
    row.remaining === 11
    && row.heroSquids === 0
    && row.opponentSquids === 0
  ));
  const heroGetsFirst = result.rows.find((row) => (
    row.remaining === 11
    && row.heroSquids === 1
    && row.opponentSquids === 0
  ));

  assert.ok(Math.abs(otherPlayerGetsFirst.occurrenceProbability - 7 / 9) < 1e-12);
  assert.ok(Math.abs(heroGetsFirst.occurrenceProbability - 1 / 9) < 1e-12);

  const afterTwoFishProbability = result.rows
    .filter((row) => row.remaining === 10)
    .reduce((sum, row) => sum + row.occurrenceProbability, 0);
  assert.ok(Math.abs(afterTwoFishProbability - 1) < 1e-12);
});

test("quick-query data contains all 0 vs 1 distributions", () => {
  const result = globalThis.SquidResearchEngine.generate(
    defaultSettings,
    createPerPlayerSolver,
  );
  const matches = result.rows.filter((row) => row.heroSquids === 0 && row.opponentSquids === 1);
  assert.ok(matches.length > 0);
  assert.ok(matches.every((row) => Number.isFinite(row.totalEffectiveBb)));
  assert.ok(matches.every((row) => row.occurrenceProbability > 0));
});
