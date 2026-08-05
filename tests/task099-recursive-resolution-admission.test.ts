import { describe, expect, it } from "vitest"
import {
  type ResolutionAttemptRecord,
  admitIncompleteWebRecovery,
  admitNextResolutionAttempt,
} from "../packages/core/src/contracts/recursive-resolution-admission.ts"

const failedSearch: ResolutionAttemptRecord = {
  attemptId: "attempt:search:1",
  workId: "work:99",
  stepId: "current-value",
  meansId: "web_search",
  inputRefs: ["request:99", "query:sk-hynix-current-price"],
  targetId: "agent:knowbee",
  strategyFingerprint: "strategy:web-search:v1",
  resultRefs: ["result:search:1"],
  failureCause: "requested_value_missing",
  validation: {
    status: "insufficient",
    evidenceRefs: ["evidence:search-results:1"],
    reason: "The result contains links but no current price value.",
  },
}

describe("Task 099 recursive resolution admission", () => {
  it("records a complete failed attempt and admits a materially different next strategy", () => {
    expect(
      admitNextResolutionAttempt({
        workId: "work:99",
        unresolvedGoal: "Return the current SK hynix price with timestamp.",
        priorAttempts: [failedSearch],
        nextAttempt: {
          attemptId: "attempt:fetch:2",
          meansId: "web_fetch",
          inputRefs: ["source-url:official-market-page"],
          targetId: "agent:knowbee",
          strategyFingerprint: "strategy:official-source-fetch:v2",
        },
      }),
    ).toMatchObject({ status: "allowed", changedDimensions: ["means", "input", "strategy"] })
  })

  it("rejects incomplete records and a duplicate unchanged attempt", () => {
    expect(
      admitNextResolutionAttempt({
        workId: "work:99",
        unresolvedGoal: "Return the current value.",
        priorAttempts: [
          { ...failedSearch, validation: { ...failedSearch.validation, evidenceRefs: [] } },
        ],
        nextAttempt: {
          attemptId: "attempt:2",
          meansId: "web_fetch",
          inputRefs: ["source:1"],
          targetId: "agent:knowbee",
          strategyFingerprint: "strategy:fetch:v2",
        },
      }),
    ).toMatchObject({ status: "rejected", reasonCodes: ["attempt_record_invalid"] })
    expect(
      admitNextResolutionAttempt({
        workId: "work:99",
        unresolvedGoal: "Return the current value.",
        priorAttempts: [failedSearch],
        nextAttempt: {
          attemptId: "attempt:search:2",
          meansId: "web_search",
          inputRefs: [...failedSearch.inputRefs],
          targetId: "agent:knowbee",
          strategyFingerprint: "strategy:web-search:v1",
        },
      }),
    ).toMatchObject({ status: "rejected", reasonCodes: ["unchanged_attempt"] })
  })

  it("rejects a return to any older unchanged attempt, not only the latest attempt", () => {
    const sourceFetch: ResolutionAttemptRecord = {
      ...failedSearch,
      attemptId: "attempt:fetch:2",
      meansId: "web_fetch",
      inputRefs: ["source-url:official"],
      strategyFingerprint: "strategy:official-source-fetch:v2",
    }
    expect(
      admitNextResolutionAttempt({
        workId: "work:99",
        unresolvedGoal: "Return the current value.",
        priorAttempts: [failedSearch, sourceFetch],
        nextAttempt: {
          attemptId: "attempt:search:3",
          meansId: failedSearch.meansId,
          inputRefs: [...failedSearch.inputRefs],
          targetId: failedSearch.targetId,
          strategyFingerprint: failedSearch.strategyFingerprint,
        },
      }),
    ).toMatchObject({ status: "rejected", reasonCodes: ["unchanged_attempt"] })
  })

  it("selects an available source fetch after successful web search lacks the value", () => {
    expect(
      admitIncompleteWebRecovery({
        workId: "work:99",
        failedSearchAttempt: failedSearch,
        pathReviews: [
          { path: "source_fetch", status: "available", evidenceRefs: ["url:official"] },
          { path: "alternate_source", status: "available", evidenceRefs: ["source:exchange"] },
          { path: "dedicated_api", status: "unavailable", evidenceRefs: ["api:not-configured"] },
          { path: "skill_or_mcp", status: "unavailable", evidenceRefs: ["registry:none"] },
          { path: "other_means", status: "unavailable", evidenceRefs: ["capability:none"] },
        ],
        selectedPath: "source_fetch",
      }),
    ).toMatchObject({ status: "selected", path: "source_fetch" })
  })

  it("does not complete or report terminal failure while an alternative remains available", () => {
    expect(
      admitIncompleteWebRecovery({
        workId: "work:99",
        failedSearchAttempt: failedSearch,
        pathReviews: [
          { path: "source_fetch", status: "available", evidenceRefs: ["url:official"] },
          { path: "alternate_source", status: "unreviewed", evidenceRefs: [] },
          { path: "dedicated_api", status: "unreviewed", evidenceRefs: [] },
          { path: "skill_or_mcp", status: "unreviewed", evidenceRefs: [] },
          { path: "other_means", status: "unreviewed", evidenceRefs: [] },
        ],
      }),
    ).toMatchObject({ status: "continue", availablePaths: ["source_fetch"] })
  })
})
