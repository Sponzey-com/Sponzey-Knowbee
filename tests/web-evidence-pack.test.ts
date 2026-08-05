import { createHash } from "node:crypto"
import { describe, expect, it } from "vitest"

import type {
  WebEvidenceCompressionResult,
  WebEvidenceUnit,
} from "../packages/core/src/contracts/web-evidence-compression.ts"
import {
  createWebResearchContextBudget,
  type TokenEstimatorPort,
} from "../packages/core/src/contracts/web-research-context-budget.ts"
import {
  reviewAndAssembleWebEvidencePack,
  type WebEvidenceReviewPort,
} from "../packages/core/src/runs/web-evidence-pack.ts"

const hash = (value: string) =>
  `sha256:${createHash("sha256").update(value).digest("hex")}` as const
const estimator: TokenEstimatorPort = {
  version: "fixture-pack-v1",
  estimateTokens(text) {
    if (!text.includes('"units"')) return 0
    return (text.match(/"unitRef"/gu)?.length ?? 0) * 1_000 + 200
  },
}
const budgetResult = createWebResearchContextBudget({
  modelContextTokens: 8_000,
  systemToolText: "",
  conversationText: "",
}, estimator)
if (!budgetResult.ok) throw new Error(budgetResult.reasonCode)
const budget = budgetResult.value

function unit(
  id: string,
  factKey: string,
  confidence: number,
  sourceNumber: number,
): WebEvidenceUnit {
  const claim = `Claim ${id}`
  const evidence = `Evidence ${id}`
  return Object.freeze({
    unitRef: hash(`${claim}:${evidence}`),
    claim,
    evidence,
    sourceTitle: `Source ${sourceNumber}`,
    url: `https://example.com/source-${sourceNumber}`,
    publishedAt: "2026-07-24T00:00:00.000Z",
    retrievedAt: "2026-07-24T01:00:00.000Z",
    evidenceRef: `document:${sourceNumber}`,
    chunkRefs: Object.freeze([`document:${sourceNumber}:chunk:1`]),
    factKey,
    supportType: "direct",
    confidence,
    budgetFingerprint: budget.fingerprint,
  })
}

function compression(units: readonly WebEvidenceUnit[]): WebEvidenceCompressionResult {
  return Object.freeze({
    budgetFingerprint: budget.fingerprint,
    evidenceRef: units[0]?.evidenceRef ?? "document:none",
    units: Object.freeze([...units]),
    unresolvedFactKeys: Object.freeze([]),
  })
}

describe("budget-bounded web evidence pack", () => {
  it("uses LLM review refs to remove semantic duplicates and preserve both sides of conflicts", async () => {
    const first = unit("price-100", "current_price", 0.95, 1)
    const conflicting = unit("price-101", "current_price", 0.9, 2)
    const duplicate = unit("same-price", "current_price", 0.7, 3)
    const port: WebEvidenceReviewPort = {
      reviewEvidence: async (input) => ({
        budgetFingerprint: budget.fingerprint,
        evidenceSnapshotFingerprint: input.evidenceSnapshotFingerprint,
        duplicateGroups: [[first.unitRef, duplicate.unitRef]],
        conflicts: [{
          factKey: "current_price",
          unitRefs: [first.unitRef, conflicting.unitRef],
          reason: "The sources report different current prices.",
        }],
        unresolvedFactKeys: [],
      }),
    }

    const result = await reviewAndAssembleWebEvidencePack({
      requestGoal: "Find the current price.",
      requiredFactKeys: ["current_price"],
      budget,
      compressionResults: [
        compression([first]),
        compression([conflicting]),
        compression([duplicate]),
      ],
    }, { reviewPort: port, estimator })

    expect(result).toMatchObject({
      ok: true,
      value: {
        schemaVersion: 1,
        budgetFingerprint: budget.fingerprint,
        units: [{ unitRef: first.unitRef }, { unitRef: conflicting.unitRef }],
        droppedUnitRefs: [duplicate.unitRef],
        conflicts: [{
          factKey: "current_price",
          unitRefs: [first.unitRef, conflicting.unitRef],
        }],
      },
    })
    if (!result.ok) return
    expect(result.value.totalTokenEstimate).toBe(2_200)
    expect(result.value.totalTokenEstimate).toBeLessThanOrEqual(
      budget.allocations.webEvidenceTokens,
    )
    expect(JSON.stringify(result.value)).not.toContain("content")
    expect(Object.isFrozen(result.value)).toBe(true)
    expect(Object.isFrozen(result.value.provenanceIndex)).toBe(true)
  })

  it("removes the lowest-confidence whole unit when the pack exceeds its ceiling", async () => {
    const high = unit("high", "current_price", 0.95, 1)
    const medium = unit("medium", "current_price", 0.8, 2)
    const low = unit("low", "current_price", 0.2, 3)
    const port: WebEvidenceReviewPort = {
      reviewEvidence: async (input) => ({
        budgetFingerprint: budget.fingerprint,
        evidenceSnapshotFingerprint: input.evidenceSnapshotFingerprint,
        duplicateGroups: [],
        conflicts: [],
        unresolvedFactKeys: [],
      }),
    }

    const result = await reviewAndAssembleWebEvidencePack({
      requestGoal: "Find the current price.",
      requiredFactKeys: ["current_price"],
      budget,
      compressionResults: [compression([high, medium, low])],
    }, { reviewPort: port, estimator })

    expect(result).toMatchObject({
      ok: true,
      value: {
        units: [{ unitRef: high.unitRef }, { unitRef: medium.unitRef }],
        droppedUnitRefs: [low.unitRef],
        totalTokenEstimate: 2_200,
      },
    })
  })

  it.each([
    ["invented ref", (items: readonly WebEvidenceUnit[], fingerprint: string) => ({
      budgetFingerprint: budget.fingerprint,
      evidenceSnapshotFingerprint: fingerprint,
      duplicateGroups: [[items[0]!.unitRef, hash("invented")]],
      conflicts: [],
      unresolvedFactKeys: [],
    })],
    ["cross-fact conflict", (items: readonly WebEvidenceUnit[], fingerprint: string) => ({
      budgetFingerprint: budget.fingerprint,
      evidenceSnapshotFingerprint: fingerprint,
      duplicateGroups: [],
      conflicts: [{
        factKey: "current_price",
        unitRefs: [items[0]!.unitRef, items[1]!.unitRef],
        reason: "Invalid cross-fact conflict.",
      }],
      unresolvedFactKeys: [],
    })],
    ["stale budget", (_items: readonly WebEvidenceUnit[], fingerprint: string) => ({
      budgetFingerprint: `sha256:${"9".repeat(64)}`,
      evidenceSnapshotFingerprint: fingerprint,
      duplicateGroups: [],
      conflicts: [],
      unresolvedFactKeys: [],
    })],
  ])("rejects %s from review", async (_label, receipt) => {
    const first = unit("price", "current_price", 0.9, 1)
    const second = unit("date", "market_date", 0.8, 2)
    const port: WebEvidenceReviewPort = {
      reviewEvidence: async (input) =>
        receipt([first, second], input.evidenceSnapshotFingerprint),
    }

    expect(await reviewAndAssembleWebEvidencePack({
      requestGoal: "Find market data.",
      requiredFactKeys: ["current_price", "market_date"],
      budget,
      compressionResults: [compression([first, second])],
    }, { reviewPort: port, estimator })).toMatchObject({ ok: false })
  })

  it("reports budget exhaustion instead of truncating conflicting evidence", async () => {
    const first = unit("one", "current_price", 0.9, 1)
    const second = unit("two", "current_price", 0.8, 2)
    const third = unit("three", "current_price", 0.7, 3)
    const port: WebEvidenceReviewPort = {
      reviewEvidence: async (input) => ({
        budgetFingerprint: budget.fingerprint,
        evidenceSnapshotFingerprint: input.evidenceSnapshotFingerprint,
        duplicateGroups: [],
        conflicts: [{
          factKey: "current_price",
          unitRefs: [first.unitRef, second.unitRef, third.unitRef],
          reason: "All values conflict.",
        }],
        unresolvedFactKeys: [],
      }),
    }

    expect(await reviewAndAssembleWebEvidencePack({
      requestGoal: "Find the current price.",
      requiredFactKeys: ["current_price"],
      budget,
      compressionResults: [compression([first, second, third])],
    }, { reviewPort: port, estimator })).toEqual({
      ok: false,
      reasonCode: "web_evidence_pack_budget_exhausted",
    })
  })
})
