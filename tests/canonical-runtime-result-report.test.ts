import { describe, expect, it } from "vitest"
import type { NodeResultReport } from "../packages/core/src/contracts/enterprise-topology.ts"
import {
  buildCanonicalBlockedRuntimeReport,
  buildCanonicalPartialTopologyReport,
} from "../packages/core/src/runs/canonical-runtime-result-report.ts"
import type { CanonicalTerminalEvidenceResult } from "../packages/core/src/runs/canonical-terminal-evidence.ts"

const partialReport: NodeResultReport = {
  schemaVersion: 1,
  resultReportId: "report:1",
  topologyRunId: "topology-run:1",
  nodeRunId: "node-run:1",
  workOrderId: "work-order:1",
  nodeId: "node:1",
  status: "partial_success",
  outputs: [
    { outputId: "현재가", status: "satisfied" },
    { outputId: "거래량", status: "missing" },
  ],
  unmetSuccessCriteriaIds: ["거래량"],
  risksOrGaps: ["거래량 데이터 소스가 응답하지 않았습니다."],
  createdAt: 1,
}

const blockedEvidence: Extract<CanonicalTerminalEvidenceResult, { status: "available" }> = {
  status: "available",
  workId: "work:root:run-2",
  rootRunId: "run-2",
  terminalState: "BLOCKED",
  transition: {
    revision: 2,
    event: "POLICY_BLOCKED",
    receiptRef: "receipt:policy:run-2",
  },
  cause: {
    schemaVersion: 1,
    originStage: "policy_admission",
    outcomeKind: "policy_block",
    reasonCode: "approval_scope_missing",
    safeAlternativesExhausted: true,
  },
  evidenceFingerprint: `sha256:${"a".repeat(64)}`,
  evidenceRefs: ["policy-decision:run-2"],
}

describe("canonical runtime result reports", () => {
  it("maps verified topology scope into a canonical partial report", () => {
    expect(buildCanonicalPartialTopologyReport({
      runId: "run-1",
      primaryLanguage: "ko",
      report: partialReport,
    })).toMatchObject({
      workId: "work:root:run-1",
      outcome: "partial",
      completedScope: ["현재가"],
      unresolvedScope: ["거래량"],
      verifiedReasonFacts: ["거래량 데이터 소스가 응답하지 않았습니다."],
    })
  })

  it("builds a blocked report only from the canonical blocked state", () => {
    expect(buildCanonicalBlockedRuntimeReport({
      primaryLanguage: "en",
      terminalEvidence: blockedEvidence,
    })).toMatchObject({
      workId: "work:root:run-2",
      outcome: "blocked",
      reasonCode: "approval_scope_missing",
      evidenceRefs: ["policy-decision:run-2"],
      unresolvedScope: ["Requested work"],
      nextActions: [{ kind: "required_condition" }],
    })
  })
})
