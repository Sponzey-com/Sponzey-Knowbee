import { describe, expect, it, vi } from "vitest"
import type { CanonicalWorkAggregate } from "../packages/core/src/contracts/canonical-work-aggregate.ts"
import type { CanonicalWorkReceipt } from "../packages/core/src/contracts/canonical-work-receipt.ts"
import {
  buildCanonicalPolicyBlockedDescriptor,
  recordCanonicalFinalizationTransition,
} from "../packages/core/src/runs/canonical-finalization-lifecycle.ts"
import { buildCanonicalBlockedRuntimeReport } from "../packages/core/src/runs/canonical-runtime-result-report.ts"
import { createCanonicalTerminalEvidencePort } from "../packages/core/src/runs/canonical-terminal-evidence.ts"

const cause = {
  schemaVersion: 1 as const,
  originStage: "policy_admission" as const,
  outcomeKind: "policy_block" as const,
  reasonCode: "approval_scope_missing",
  safeAlternativesExhausted: true,
}

const aggregate: CanonicalWorkAggregate = {
  workId: "work:root:run-1",
  rootRunId: "run-1",
  state: "USER_REPORT",
  revision: 3,
  transitions: [
    {
      revision: 1,
      event: "DIAGNOSIS_ACCEPTED",
      previousState: "REQUEST_RECEIVED",
      nextState: "SOLUTION_ANALYZED",
      receiptRef: "receipt:diagnosis:1",
    },
    {
      revision: 2,
      event: "POLICY_BLOCKED",
      previousState: "SOLUTION_ANALYZED",
      nextState: "BLOCKED",
      receiptRef: "receipt:policy:1",
    },
    {
      revision: 3,
      event: "REPORT_DELIVERED",
      previousState: "BLOCKED",
      nextState: "USER_REPORT",
      receiptRef: "receipt:delivery:1",
    },
  ],
}

const receipt: CanonicalWorkReceipt = {
  receiptId: "receipt:policy:1",
  workId: aggregate.workId,
  kind: "policy",
  evidenceFingerprint: `sha256:${"a".repeat(64)}`,
  evidenceRefs: ["policy-decision:1", "capability:telegram:reply"],
  issuedAt: 1,
  consumedRevision: 2,
  terminalCause: cause,
}

describe("Telegram blocked request diagnosis evidence", () => {
  it("issues the bounded policy cause and resolves it through the terminal transition receipt", () => {
    const built = buildCanonicalPolicyBlockedDescriptor({
      runId: "run-1",
      reasonCode: cause.reasonCode,
      policyFingerprint: `sha256:${"b".repeat(64)}`,
      capabilityRefs: ["capability:telegram:reply"],
      safeAlternativesExhausted: true,
    })
    expect(built).toMatchObject({
      ok: true,
      descriptor: {
        event: "POLICY_BLOCKED",
        receipt: { terminalCause: cause },
      },
    })

    const port = createCanonicalTerminalEvidencePort({
      loadAggregate: () => aggregate,
      loadReceipt: () => receipt,
    })
    expect(port.read(aggregate.workId)).toEqual({
      status: "available",
      workId: aggregate.workId,
      rootRunId: aggregate.rootRunId,
      terminalState: "BLOCKED",
      transition: {
        revision: 2,
        event: "POLICY_BLOCKED",
        receiptRef: receipt.receiptId,
      },
      cause,
      evidenceFingerprint: receipt.evidenceFingerprint,
      evidenceRefs: receipt.evidenceRefs,
    })
  })

  it("projects the evidence-bound reason instead of a generic policy reason", () => {
    const terminalEvidence = createCanonicalTerminalEvidencePort({
      loadAggregate: () => aggregate,
      loadReceipt: () => receipt,
    }).read(aggregate.workId)
    if (terminalEvidence.status !== "available") throw new Error("terminal evidence expected")

    expect(buildCanonicalBlockedRuntimeReport({
      primaryLanguage: "en",
      terminalEvidence,
    })).toMatchObject({
      workId: aggregate.workId,
      outcome: "blocked",
      reasonCode: cause.reasonCode,
      evidenceRefs: receipt.evidenceRefs,
    })
  })

  it.each([
    [
      "missing receipt",
      undefined,
      { status: "evidence_missing", reasonCode: "canonical_terminal_receipt_missing" },
    ],
    [
      "legacy cause",
      { ...receipt, terminalCause: undefined },
      { status: "evidence_missing", reasonCode: "canonical_terminal_cause_missing" },
    ],
    [
      "foreign work",
      { ...receipt, workId: "work:root:other" },
      { status: "evidence_invalid", reasonCode: "canonical_terminal_receipt_scope_mismatch" },
    ],
    [
      "wrong kind",
      { ...receipt, kind: "execution" },
      { status: "evidence_invalid", reasonCode: "canonical_terminal_receipt_kind_mismatch" },
    ],
    [
      "wrong revision",
      { ...receipt, consumedRevision: 3 },
      { status: "evidence_invalid", reasonCode: "canonical_terminal_receipt_revision_mismatch" },
    ],
    [
      "wrong outcome",
      { ...receipt, terminalCause: { ...cause, outcomeKind: "technical_failure" } },
      { status: "evidence_invalid", reasonCode: "canonical_terminal_cause_outcome_mismatch" },
    ],
  ] as const)("%s is rejected without inferring a policy cause", (_label, loaded, expected) => {
    const port = createCanonicalTerminalEvidencePort({
      loadAggregate: () => aggregate,
      loadReceipt: () => loaded as CanonicalWorkReceipt | undefined,
    })
    expect(port.read(aggregate.workId)).toEqual(expected)
  })

  it("maps repository corruption to typed invalid evidence without exposing the error", () => {
    const port = createCanonicalTerminalEvidencePort({
      loadAggregate: () => aggregate,
      loadReceipt: () => {
        throw new Error("secret persistence detail")
      },
    })
    expect(port.read(aggregate.workId)).toEqual({
      status: "evidence_invalid",
      reasonCode: "canonical_terminal_receipt_corrupt",
    })
  })

  it("rejects an idempotent receipt retry when terminal cause differs", () => {
    const built = buildCanonicalPolicyBlockedDescriptor({
      runId: "run-1",
      reasonCode: cause.reasonCode,
      policyFingerprint: `sha256:${"b".repeat(64)}`,
      capabilityRefs: ["capability:telegram:reply"],
      safeAlternativesExhausted: true,
    })
    if (!built.ok) throw new Error("descriptor expected")
    const applyTransition = vi.fn()

    expect(recordCanonicalFinalizationTransition(built.descriptor, {
      issueReceipt: () => ({ issued: false, reasonCode: "receipt_already_exists" }),
      loadReceipt: () => ({
        ...built.descriptor.receipt,
        terminalCause: {
          ...cause,
          reasonCode: "different_policy_reason",
        },
      }),
      applyTransition,
    })).toEqual({ ok: false, reasonCode: "receipt_already_exists" })
    expect(applyTransition).not.toHaveBeenCalled()
  })
})
