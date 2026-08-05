import { describe, expect, it } from "vitest"
import {
  type StopReportInput,
  type VerifiedFailureReportFacts,
  mapCanonicalResultReportFacts,
} from "../packages/core/src/index.ts"

describe("task1251 result report source mapping", () => {
  it("maps an evidenced completion into the canonical completed report", () => {
    const report: StopReportInput = {
      goalId: "goal:1",
      reasonCode: "goal_achieved",
      evidenceRefs: ["evidence:criterion:1"],
      unresolvedItemIds: [],
      currentTurn: 2,
      currentRetry: 0,
      policyVersion: "attempt:v1",
    }
    expect(
      mapCanonicalResultReportFacts({
        kind: "completion",
        report,
        workId: "work:1",
        primaryLanguage: "ko",
        completedScope: ["criterion:1"],
        verifiedReasonFacts: ["Every criterion passed."],
      }),
    ).toMatchObject({ outcome: "completed", completedScope: ["criterion:1"], unresolvedScope: [] })
  })

  it.each([
    ["partial", "partial"],
    ["blocked", "blocked"],
    ["concrete_impossibility", "impossible"],
  ] as const)("maps verified failure source %s to %s", (reasonCode, expected) => {
    const report: VerifiedFailureReportFacts = {
      schemaVersion: 1,
      outcome: reasonCode === "partial" ? "partial" : "blocked",
      primaryLanguage: "en",
      failedScope: ["scope:remaining"],
      verifiedReason: {
        reasonCode,
        text: "The verified condition prevents completion.",
        evidenceRefs: ["evidence:1"],
      },
      nextActions: ["Provide the required condition and retry."],
      partialResultRefs: reasonCode === "partial" ? ["result:1"] : [],
      diagnosisReceiptId: "receipt:1",
    }
    expect(
      mapCanonicalResultReportFacts({
        kind: "verified_failure",
        report,
        goalId: "goal:1",
        workId: "work:1",
        completedScope: reasonCode === "partial" ? ["scope:done"] : [],
      }).outcome,
    ).toBe(expected)
  })

  it("rejects a non-achieved stop source as a completed report", () => {
    expect(() =>
      mapCanonicalResultReportFacts({
        kind: "completion",
        report: {
          goalId: "goal:1",
          reasonCode: "turn_limit_reached",
          evidenceRefs: [],
          unresolvedItemIds: ["scope:x"],
          currentTurn: 3,
          currentRetry: 0,
          policyVersion: "v1",
        },
        workId: "work:1",
        primaryLanguage: "ko",
        completedScope: [],
        verifiedReasonFacts: ["Turn limit reached."],
      }),
    ).toThrow(/goal-achieved/i)
  })
})
