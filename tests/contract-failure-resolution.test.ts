import { describe, expect, it } from "vitest"
import { CanonicalExecutionFailure } from "../packages/core/src/runs/canonical-execution-failure.ts"
import {
  projectAuditContractFailure,
  projectCanonicalContractFailure,
  projectContractFailureRetryDirective,
  projectPublicContractFailure,
  resolveExecutionFailure,
} from "../packages/core/src/runs/contract-failure-resolution.ts"

function project(reasonCode: string, retryable = false) {
  return projectCanonicalContractFailure({
    failure: new CanonicalExecutionFailure({
      phase: "policy",
      reasonCode,
      retryable,
    }),
    requestId: "request-1",
    workId: "work-1",
    expectedRevision: 2,
    safeEvidenceRefs: ["snapshot:capabilities:sha256-123", "/private/raw-path"],
    auditRef: "audit:run-1",
  })
}

describe("contract failure resolution", () => {
  it("replans with the remaining snapshot when the capability catalog is degraded", () => {
    const failure = project("capability_selection_catalog_invalid", true)

    expect(failure).toMatchObject({
      failureClass: "capability_degraded",
      retryClass: "changed_strategy",
      requestId: "request-1",
      workId: "work-1",
      expectedRevision: 2,
      safeEvidenceRefs: ["snapshot:capabilities:sha256-123"],
    })
    expect(resolveExecutionFailure(failure)).toEqual({
      kind: "replan",
      mode: "degraded_capability",
      retryClass: "changed_strategy",
      safeEvidenceRefs: ["snapshot:capabilities:sha256-123"],
    })
  })

  it("returns distinct directives for repair, persistence conflict, and invariant breach", () => {
    expect(resolveExecutionFailure(project("llm_output_schema_invalid", true))).toMatchObject({
      kind: "repair",
      retryClass: "llm_repair",
    })
    expect(resolveExecutionFailure(project("revision_conflict", true))).toEqual({
      kind: "retry_persistence",
      retryClass: "reload_state",
      expectedRevision: 2,
    })
    expect(resolveExecutionFailure(project("receipt_lineage_mismatch"))).toEqual({
      kind: "internal_fault",
      retryClass: "none",
      auditRef: "audit:run-1",
    })
    expect(resolveExecutionFailure(project("unregistered_reason_code", true))).toEqual({
      kind: "internal_fault",
      retryClass: "none",
      auditRef: "audit:run-1",
    })
  })

  it("closes policy and adapter failures without falling through to another directive", () => {
    expect(resolveExecutionFailure(project("approval_required"))).toEqual({
      kind: "wait",
      retryClass: "wait",
    })
    expect(resolveExecutionFailure(project("adapter_unavailable", true))).toEqual({
      kind: "retry_adapter",
      retryClass: "adapter_retry",
    })
    expect(resolveExecutionFailure(project("adapter_unavailable", false))).toEqual({
      kind: "internal_fault",
      retryClass: "none",
      auditRef: "audit:run-1",
    })
  })

  it.each([
    "capability_selection_rejected",
    "capability_selection_invalid_output",
    "capability_selection_provider_unavailable",
    "capability_selection_provider_failed",
    "capability_selection_timed_out",
    "capability_selection_output_limit_exceeded",
    "capability_selection_snapshot_invalid",
  ] as const)("returns capability failure %s to changed-strategy reanalysis", (reasonCode) => {
    const failure = project(reasonCode, true)

    expect(failure).toMatchObject({
      failureClass: "capability_degraded",
      retryClass: "changed_strategy",
    })
    expect(resolveExecutionFailure(failure)).toMatchObject({
      kind: "replan",
      mode: "degraded_capability",
      retryClass: "changed_strategy",
    })
  })

  it("places only bounded safe evidence references in the LLM reanalysis envelope", () => {
    const failure = projectCanonicalContractFailure({
      failure: new CanonicalExecutionFailure({
        phase: "policy",
        reasonCode: "capability_selection_rejected",
        retryable: true,
      }),
      requestId: "request-1",
      workId: "work-1",
      safeEvidenceRefs: [
        "decision-trace:trace-1",
        "capability-rejection:failed_strategy_reselected",
        "/private/raw-path",
      ],
      auditRef: "audit:run-1",
    })

    const retry = projectContractFailureRetryDirective({
      failure,
      originalRequest: "현재 정보를 알려줘",
    })

    expect(retry?.kind).toBe("retry_intake")
    if (!retry) throw new Error("retry directive expected")
    expect(JSON.parse(retry.message)).toMatchObject({
      kind: "knowbee_intake_reanalysis_v1",
      failure: {
        reasonCode: "capability_selection_rejected",
        safeEvidenceRefs: [
          "capability-rejection:failed_strategy_reselected",
          "decision-trace:trace-1",
        ],
      },
      requirements: {
        changedStrategyRequired: true,
        preserveOriginalGoal: true,
      },
    })
    expect(retry.message).not.toContain("/private/raw-path")
  })

  it("does not reanalyze a cancelled capability selection", () => {
    const failure = project("capability_selection_cancelled", true)

    expect(resolveExecutionFailure(failure)).toEqual({
      kind: "internal_fault",
      retryClass: "none",
      auditRef: "audit:run-1",
    })
    expect(projectContractFailureRetryDirective({
      failure,
      originalRequest: "현재 정보를 알려줘",
    })).toBeNull()
  })

  it("keeps internal fields out of public projection and exposes only safe audit fields", () => {
    const failure = project("capability_selection_catalog_invalid", true)
    const publicProjection = projectPublicContractFailure(failure)
    const auditProjection = projectAuditContractFailure(failure)

    expect(publicProjection).toEqual({
      status: "retrying",
      action: "replan",
    })
    expect(JSON.stringify(publicProjection)).not.toContain("reason")
    expect(JSON.stringify(publicProjection)).not.toContain("evidence")
    expect(JSON.stringify(publicProjection)).not.toContain("audit")
    expect(auditProjection).toEqual({
      phase: "policy",
      reasonCode: "capability_selection_catalog_invalid",
      failureClass: "capability_degraded",
      retryClass: "changed_strategy",
      requestId: "request-1",
      workId: "work-1",
      expectedRevision: 2,
      safeEvidenceRefs: ["snapshot:capabilities:sha256-123"],
      auditRef: "audit:run-1",
    })
    expect(JSON.stringify(auditProjection)).not.toContain("/private/raw-path")
  })
})
