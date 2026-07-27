import type {
  CapabilitySelectionCandidateContext,
  CapabilitySelectionSnapshot,
  LlmCapabilitySelectionAdmission,
  LlmCapabilitySelectionAttemptProvider,
  LlmCapabilitySelectionContext,
  LlmCapabilitySelectionRejectionCode,
  LlmCapabilitySelectionSchemaRepairProvider,
} from "../contracts/llm-capability-selection.js"
import type { CapabilitySelectionDecisionTraceSink } from "../contracts/capability-selection-decision-trace.js"
import type { CanonicalCapabilitySnapshotProjection } from "./canonical-capability-snapshot.js"
import {
  type CapabilitySelectionSkillBinding,
  type CapabilitySelectionSkillDefinition,
  projectCapabilitySelectionSnapshot,
} from "./capability-selection-snapshot.js"
import { executeCapabilitySelection } from "./capability-selection-use-case.js"
import type {
  InstructionSkillRunSnapshot,
  InstructionSkillSnapshotFinding,
} from "./instruction-skill-snapshot.js"

export interface CanonicalCapabilitySelectionInput {
  runId: string
  ownerAgentId: string
  canonicalSnapshot: CanonicalCapabilitySnapshotProjection & {
    snapshotId: string
    fingerprint: `sha256:${string}`
  }
  methodConstraints: {
    requestedMethods: string[]
    exclusiveMethods: string[]
    targetId?: string | undefined
  }
  selectionContext: LlmCapabilitySelectionContext
  skillDefinitions: readonly CapabilitySelectionSkillDefinition[]
  skillBindings: readonly CapabilitySelectionSkillBinding[]
  instructionSkills: readonly InstructionSkillRunSnapshot[]
  instructionSkillFindings: readonly InstructionSkillSnapshotFinding[]
  setupFailureReasonCode?: "capability_selection_catalog_invalid" | undefined
  provider?:
    | (LlmCapabilitySelectionAttemptProvider & Partial<LlmCapabilitySelectionSchemaRepairProvider>)
    | undefined
  traceSink?: CapabilitySelectionDecisionTraceSink | undefined
  externalTransferAllowed: boolean
  maxCost: "none" | "low" | "high"
}

export type CanonicalCapabilitySelectionResult =
  | { ok: true; mode: "explicit_method" }
  | {
      ok: true
      mode: "selected"
      capabilitySnapshotFingerprint: `sha256:${string}`
      admission: Extract<
        LlmCapabilitySelectionAdmission,
        { status: "allowed" | "approval_required" }
      >
      selectedCandidateContext: CapabilitySelectionCandidateContext | null
      decisionTraceId?: string | undefined
    }
  | {
      ok: false
      reasonCode:
        | "capability_selection_provider_unavailable"
        | "capability_selection_catalog_invalid"
        | "capability_selection_snapshot_invalid"
        | "capability_selection_context_invalid"
        | "capability_selection_provider_failed"
        | "capability_selection_timed_out"
        | "capability_selection_output_limit_exceeded"
        | "capability_selection_invalid_output"
        | "capability_selection_trace_failed"
        | "capability_selection_cancelled"
        | "capability_selection_rejected"
      rejectionReasonCodes?: LlmCapabilitySelectionRejectionCode[] | undefined
      failureReasonCodes?: string[] | undefined
      decisionTraceId?: string | undefined
      strategyFingerprints?: string[] | undefined
    }

function hasExplicitMethodConstraint(
  constraints: CanonicalCapabilitySelectionInput["methodConstraints"],
): boolean {
  return Boolean(
    constraints.requestedMethods.some((method) => method.trim()) ||
      constraints.exclusiveMethods.some((method) => method.trim()),
  )
}

export async function authorizeCanonicalCapabilitySelection(
  input: CanonicalCapabilitySelectionInput,
): Promise<CanonicalCapabilitySelectionResult> {
  if (hasExplicitMethodConstraint(input.methodConstraints)) {
    return { ok: true, mode: "explicit_method" }
  }
  if (input.setupFailureReasonCode) {
    return {
      ok: false,
      reasonCode: input.setupFailureReasonCode,
    }
  }
  if (!input.provider) {
    return {
      ok: false,
      reasonCode: "capability_selection_provider_unavailable",
    }
  }

  let capabilitySnapshot: CapabilitySelectionSnapshot
  try {
    capabilitySnapshot = projectCapabilitySelectionSnapshot({
      snapshotId: `selection:${input.canonicalSnapshot.snapshotId}`,
      ownerAgentId: input.ownerAgentId,
      canonicalSnapshot: input.canonicalSnapshot,
      skillDefinitions: input.skillDefinitions,
      skillBindings: input.skillBindings,
      instructionSkills: input.instructionSkills,
      instructionSkillFindings: input.instructionSkillFindings,
    })
  } catch {
    return {
      ok: false,
      reasonCode: "capability_selection_snapshot_invalid",
    }
  }

  const admission = await executeCapabilitySelection({
    runId: input.runId,
    receiptId: `receipt:capability-selection:${input.runId}`,
    capabilitySnapshot,
    selectionContext: input.selectionContext,
    provider: input.provider,
    ...(input.provider.repairCapabilitySelection
      ? { repairProvider: input.provider as LlmCapabilitySelectionSchemaRepairProvider }
      : {}),
    ...(input.traceSink ? { traceSink: input.traceSink } : {}),
    userMethodSpecified: false,
    externalTransferAllowed: input.externalTransferAllowed,
    maxCost: input.maxCost,
  })
  if (admission.status === "allowed" || admission.status === "approval_required") {
    const selectedCandidateContext =
      capabilitySnapshot.candidateContexts?.find(
        (candidate) =>
          candidate.capabilityId === admission.selectedBinding.capabilityId &&
          candidate.targetId === admission.selectedBinding.targetId,
      ) ?? null
    const admittedSelection = {
      status: admission.status,
      receiptId: admission.receiptId,
      selectedBinding: admission.selectedBinding,
    }
    return {
      ok: true,
      mode: "selected",
      capabilitySnapshotFingerprint: capabilitySnapshot.fingerprint,
      admission: admittedSelection,
      selectedCandidateContext,
      ...(admission.decisionTraceId
        ? { decisionTraceId: admission.decisionTraceId }
        : {}),
    }
  }
  if (admission.status === "failed" || admission.status === "cancelled") {
    return {
      ok: false,
      reasonCode: admission.reasonCode,
      ...("validationReasonCodes" in admission && admission.validationReasonCodes
        ? { failureReasonCodes: [...admission.validationReasonCodes] }
        : {}),
      ...(admission.decisionTraceId
        ? { decisionTraceId: admission.decisionTraceId }
        : {}),
    }
  }
  return {
    ok: false,
    reasonCode: "capability_selection_rejected",
    rejectionReasonCodes: "reasonCodes" in admission ? admission.reasonCodes : [],
    ...(admission.decisionTraceId
      ? { decisionTraceId: admission.decisionTraceId }
      : {}),
    ...(admission.strategyFingerprints
      ? { strategyFingerprints: [...admission.strategyFingerprints] }
      : {}),
  }
}
