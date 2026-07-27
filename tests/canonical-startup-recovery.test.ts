import { describe, expect, it } from "vitest"
import type { CanonicalWorkAggregate } from "../packages/core/src/contracts/canonical-work-aggregate.ts"
import { classifyCanonicalStartupRecovery } from "../packages/core/src/runs/canonical-startup-recovery.ts"

function aggregate(state: CanonicalWorkAggregate["state"]): CanonicalWorkAggregate {
  return {
    workId: "work:root:run-1",
    rootRunId: "run-1",
    state,
    revision: 0,
    transitions: [],
  }
}

describe("canonical startup recovery", () => {
  it.each([
    ["USER_REPORT", "no_action"],
    ["USER_INPUT_REQUIRED", "resume_waiting"],
    ["SUCCEEDED", "resume_delivery"],
    ["BLOCKED", "resume_delivery"],
    ["CANCELLED", "resume_delivery"],
  ] as const)("classifies %s as %s", (state, expected) => {
    expect(classifyCanonicalStartupRecovery({
      aggregate: aggregate(state),
      rootRunStatus: state === "USER_INPUT_REQUIRED" ? "awaiting_user" : "running",
      committedFinalDelivery: false,
      responseArtifactAvailable: state !== "SUCCEEDED" && state !== "BLOCKED" && state !== "CANCELLED"
        ? false
        : true,
      sideEffectReceiptAvailable: false,
      runtimeManifestMatches: true,
    }).kind).toBe(expected)
  })

  it("requires manual intervention when terminal response evidence cannot be reconstructed", () => {
    expect(classifyCanonicalStartupRecovery({
      aggregate: aggregate("EXHAUSTED"),
      rootRunStatus: "running",
      committedFinalDelivery: false,
      responseArtifactAvailable: false,
      sideEffectReceiptAvailable: false,
      runtimeManifestMatches: true,
    })).toMatchObject({
      kind: "manual_intervention",
      reasonCode: "canonical_recovery_response_artifact_missing",
    })
  })

  it("finishes a committed terminal delivery without resending it", () => {
    expect(classifyCanonicalStartupRecovery({
      aggregate: aggregate("PARTIALLY_SUCCEEDED"),
      rootRunStatus: "running",
      committedFinalDelivery: true,
      responseArtifactAvailable: false,
      sideEffectReceiptAvailable: false,
      runtimeManifestMatches: true,
    })).toMatchObject({ kind: "resume_delivery", deliveryMode: "commit_transition_only" })
  })

  it("never reruns an in-flight side effect after restart", () => {
    expect(classifyCanonicalStartupRecovery({
      aggregate: aggregate("EXECUTING"),
      rootRunStatus: "running",
      committedFinalDelivery: false,
      responseArtifactAvailable: false,
      sideEffectReceiptAvailable: true,
      runtimeManifestMatches: true,
    })).toMatchObject({
      kind: "reassess_execution",
      resumeFrom: "post_state_verification",
      executePreviousAttempt: false,
    })
  })

  it("fails closed when in-flight evidence or runtime manifest is unsafe", () => {
    expect(classifyCanonicalStartupRecovery({
      aggregate: aggregate("RESULT_REVIEW"),
      rootRunStatus: "running",
      committedFinalDelivery: false,
      responseArtifactAvailable: false,
      sideEffectReceiptAvailable: false,
      runtimeManifestMatches: true,
    })).toMatchObject({ kind: "manual_intervention", reasonCode: "canonical_recovery_attempt_receipt_missing" })
    expect(classifyCanonicalStartupRecovery({
      aggregate: aggregate("EXECUTING"),
      rootRunStatus: "running",
      committedFinalDelivery: false,
      responseArtifactAvailable: false,
      sideEffectReceiptAvailable: true,
      runtimeManifestMatches: false,
    })).toMatchObject({ kind: "manual_intervention", reasonCode: "canonical_recovery_manifest_mismatch" })
  })
})
