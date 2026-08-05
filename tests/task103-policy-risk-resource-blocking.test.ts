import { describe, expect, it } from "vitest"
import { admitRequiredResourceUnavailableBlock } from "../packages/core/src/contracts/index.ts"
import { evaluateSafetyRisk } from "../packages/core/src/contracts/safety-control-self-solve.ts"
import {
  type ExhaustedSolutionPathReceipt,
  evaluateBlockedStopReportDecision,
} from "../packages/core/src/contracts/stop-report-decision.ts"

const exhausted: ExhaustedSolutionPathReceipt = {
  receiptId: "diagnosis:103",
  complete: true,
  canFinalizeFailure: true,
  missingPaths: [],
  evidenceRefs: ["path-review:all"],
  partialResultRefs: [],
  workaroundGuidance: ["Request a permission change."],
}

describe("Task 103 policy, risk, and unavailable-resource blocking", () => {
  it("admits an evidenced permission denial only after safe alternatives are exhausted", () => {
    expect(
      evaluateBlockedStopReportDecision({
        goalId: "goal:103",
        exhaustion: exhausted,
        unresolvedItemIds: ["step:write"],
        permissionDenial: {
          permissionKind: "filesystem_write",
          targetRef: "target:workspace",
          decisionSource: "user",
          evidenceRefs: ["approval:denied"],
          safeAlternativePathIds: [],
        },
      }),
    ).toMatchObject({ status: "stop_and_report", reasonCode: "permission_denied" })
  })

  it.each(["safety", "privacy", "cost", "system_integrity"])(
    "stops a non-mitigable critical %s risk with evidence",
    (riskKind) => {
      expect(
        evaluateSafetyRisk({
          riskKind,
          severity: "critical",
          affectedActionRef: "action:103",
          evidenceRefs: [`risk:${riskKind}`],
          mitigationAvailable: false,
          approvalEligible: false,
          requiredMitigations: [],
        }),
      ).toEqual({
        status: "stop_and_report",
        reasonCode: "safety_risk",
        evidenceRefs: [`risk:${riskKind}`],
      })
    },
  )

  it("binds required external-resource absence to scoped changed-candidate exhaustion", () => {
    expect(
      admitRequiredResourceUnavailableBlock({
        workId: "work:103",
        resourceId: "instance:office-pc",
        capabilitySnapshotRef: "capability-snapshot:103",
        resourceEvidenceRefs: ["connection:offline", "registry:instance-known"],
        continuationDecision: {
          status: "reassess",
          reason: "no_viable_changed_candidate",
          scope: {
            kind: "current_runtime_snapshot",
            workId: "work:103",
            evaluatedCandidateIds: ["candidate:remote", "candidate:local"],
          },
          excludedCandidates: [
            { candidateId: "candidate:remote", reasonCodes: ["connection_unavailable"] },
            { candidateId: "candidate:local", reasonCodes: ["capability_unconfirmed"] },
          ],
        },
      }),
    ).toEqual({
      status: "blocked",
      reasonCode: "required_resource_unavailable",
      workId: "work:103",
      resourceId: "instance:office-pc",
      evidenceRefs: ["capability-snapshot:103", "connection:offline", "registry:instance-known"],
      evaluatedCandidateIds: ["candidate:remote", "candidate:local"],
    })
  })

  it("rejects resource-unavailable blocking while a changed candidate remains", () => {
    expect(
      admitRequiredResourceUnavailableBlock({
        workId: "work:103",
        resourceId: "instance:office-pc",
        capabilitySnapshotRef: "capability-snapshot:103",
        resourceEvidenceRefs: ["connection:offline"],
        continuationDecision: {
          status: "continue",
          viableCandidateIds: ["candidate:local"],
        },
      }),
    ).toEqual({ status: "rejected", reasonCodes: ["changed_candidate_remaining"] })
  })
})
