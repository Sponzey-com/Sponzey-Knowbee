import { createHash } from "node:crypto"

import { canonicalWorkIdForRootRun } from "../contracts/canonical-work-aggregate.js"
import type { SolutionPlanCapabilitySelection } from "../contracts/llm-solution-plan-provider.js"
import type { CanonicalPlanPolicyInput } from "./canonical-plan-policy.js"

const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/u

export type SolutionPlanCapabilityAdmissionReasonCode =
  | "capability_admission_invalid"
  | "capability_admission_outside_snapshot"
  | "capability_admission_target_ambiguous"
  | "capability_admission_target_unavailable"
  | "capability_admission_approval_required"
  | "capability_admission_denied"

export interface SolutionPlanCapabilityAdmissionEntry {
  stepId: string
  capabilityRef: string
  capabilityId: string
  targetId: string
}

export interface SolutionPlanCapabilityAdmissionDescriptor {
  runId: string
  receiptId: string
  solutionPlanReceiptId: string
  policyReceiptId: string
  capabilitySnapshotFingerprint: `sha256:${string}`
  outcome: "allowed" | "approval_required"
  approvalRequiredCapabilityIds: string[]
  entries: SolutionPlanCapabilityAdmissionEntry[]
  evidenceFingerprint: `sha256:${string}`
  evidenceRefs: string[]
}

interface PersistedCapabilityAdmissionReceipt {
  workId: string
  kind: string
  evidenceFingerprint: string
  evidenceRefs: string[]
}

function normalized(value: string): string {
  return value.trim()
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, nested]) => nested !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${stableStringify(nested)}`)
      .join(",")}}`
  }
  return JSON.stringify(value) ?? "null"
}

export function buildSolutionPlanCapabilityAdmission(input: {
  runId: string
  solutionPlanReceiptId: string
  policyReceiptId: string
  capabilitySnapshot: CanonicalPlanPolicyInput["capabilitySnapshot"]
  selections: SolutionPlanCapabilitySelection[]
  targetId?: string | undefined
  approvedCapabilityIds: string[]
}):
  | { ok: true; descriptor: SolutionPlanCapabilityAdmissionDescriptor }
  | { ok: false; reasonCode: SolutionPlanCapabilityAdmissionReasonCode } {
  const runId = normalized(input.runId)
  const solutionPlanReceiptId = normalized(input.solutionPlanReceiptId)
  const policyReceiptId = normalized(input.policyReceiptId)
  const targetId = normalized(input.targetId ?? "")
  if (
    !runId ||
    !solutionPlanReceiptId ||
    !policyReceiptId ||
    !normalized(input.capabilitySnapshot.snapshotId) ||
    !SHA256_PATTERN.test(input.capabilitySnapshot.fingerprint) ||
    input.selections.length === 0
  ) {
    return { ok: false, reasonCode: "capability_admission_invalid" }
  }
  const stepIds = new Set<string>()
  const approved = new Set(input.approvedCapabilityIds.map(normalized).filter(Boolean))
  const approvalRequiredCapabilityIds = new Set<string>()
  const entries: SolutionPlanCapabilityAdmissionEntry[] = []
  for (const selection of input.selections) {
    const stepId = normalized(selection.stepId)
    const capabilityRef = normalized(selection.capabilityRef)
    const capabilityId = capabilityRef.startsWith("capability:")
      ? normalized(capabilityRef.slice("capability:".length))
      : ""
    if (!stepId || stepIds.has(stepId) || !capabilityId) {
      return { ok: false, reasonCode: "capability_admission_invalid" }
    }
    stepIds.add(stepId)
    const candidates = input.capabilitySnapshot.bindings.filter(
      (binding) => normalized(binding.capabilityId) === capabilityId,
    )
    if (candidates.length === 0) {
      return { ok: false, reasonCode: "capability_admission_outside_snapshot" }
    }
    const targetCandidates = targetId
      ? candidates.filter((binding) => normalized(binding.targetId) === targetId)
      : candidates
    if (targetCandidates.length === 0) {
      return { ok: false, reasonCode: "capability_admission_target_unavailable" }
    }
    if (targetCandidates.length !== 1) {
      return { ok: false, reasonCode: "capability_admission_target_ambiguous" }
    }
    const binding = targetCandidates[0]
    if (!binding) return { ok: false, reasonCode: "capability_admission_invalid" }
    if (binding.risk === "denied") {
      return { ok: false, reasonCode: "capability_admission_denied" }
    }
    if (binding.risk === "approval_required" && !approved.has(capabilityId)) {
      approvalRequiredCapabilityIds.add(capabilityId)
    }
    entries.push({
      stepId,
      capabilityRef,
      capabilityId,
      targetId: normalized(binding.targetId),
    })
  }
  const approvalRequired = [...approvalRequiredCapabilityIds].sort()
  const outcome =
    approvalRequired.length > 0
      ? "approval_required" as const
      : "allowed" as const
  const evidence = {
    runId,
    solutionPlanReceiptId,
    policyReceiptId,
    snapshotId: normalized(input.capabilitySnapshot.snapshotId),
    snapshotFingerprint: input.capabilitySnapshot.fingerprint,
    outcome,
    approvalRequiredCapabilityIds: approvalRequired,
    entries,
  }
  const digest = createHash("sha256").update(stableStringify(evidence)).digest("hex")
  return {
    ok: true,
    descriptor: {
      runId,
      receiptId: `receipt:capability-admission:${runId}:${digest.slice(0, 24)}`,
      solutionPlanReceiptId,
      policyReceiptId,
      capabilitySnapshotFingerprint: input.capabilitySnapshot.fingerprint,
      outcome,
      approvalRequiredCapabilityIds: approvalRequired,
      entries,
      evidenceFingerprint: `sha256:${digest}`,
      evidenceRefs: [
        `solution-plan-receipt:${solutionPlanReceiptId}`,
        `policy-receipt:${policyReceiptId}`,
        `capability-snapshot-fingerprint:${input.capabilitySnapshot.fingerprint}`,
        ...entries.map((entry) => {
          const stepDigest = createHash("sha256")
            .update(`${entry.stepId}\u0000${entry.capabilityRef}`)
            .digest("hex")
          return `capability-step:${stepDigest.slice(0, 24)}`
        }),
      ],
    },
  }
}

export function recordSolutionPlanCapabilityAdmission(
  descriptor: SolutionPlanCapabilityAdmissionDescriptor,
  dependencies: {
    issueReceipt: (receipt: {
      receiptId: string
      workId: string
      kind: "policy"
      evidenceFingerprint: string
      evidenceRefs: string[]
    }) => { issued: true } | { issued: false; reasonCode: string }
    loadReceipt: (
      receiptId: string,
    ) => PersistedCapabilityAdmissionReceipt | undefined
  },
):
  | { ok: true; capabilityAdmissionReceiptId: string }
  | { ok: false; reasonCode: string } {
  const receipt = {
    receiptId: descriptor.receiptId,
    workId: canonicalWorkIdForRootRun(descriptor.runId),
    kind: "policy" as const,
    evidenceFingerprint: descriptor.evidenceFingerprint,
    evidenceRefs: descriptor.evidenceRefs,
  }
  const issued = dependencies.issueReceipt(receipt)
  if (!issued.issued) {
    const existing = dependencies.loadReceipt(receipt.receiptId)
    const exact =
      existing?.workId === receipt.workId &&
      existing.kind === receipt.kind &&
      existing.evidenceFingerprint === receipt.evidenceFingerprint &&
      existing.evidenceRefs.length === receipt.evidenceRefs.length &&
      existing.evidenceRefs.every((reference, index) =>
        reference === receipt.evidenceRefs[index],
      )
    if (!exact) return { ok: false, reasonCode: issued.reasonCode }
  }
  return {
    ok: true,
    capabilityAdmissionReceiptId: descriptor.receiptId,
  }
}
