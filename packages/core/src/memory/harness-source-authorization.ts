import {
  REQUIRED_HARNESS_GUARDRAILS,
  type PromptImprovementHarnessGuardrail,
} from "./prompt-improvement-harness.js"

export const HARNESS_MUTABLE_SOURCE_KINDS = [
  "approval_policy",
  "state_machine",
  "harness_core",
  "input_output_schema",
  "activation_rollback_procedure",
  "test_fixture",
] as const
export type HarnessMutableSourceKind = typeof HARNESS_MUTABLE_SOURCE_KINDS[number]

export interface HarnessMutableSourceDescriptor {
  sourceKind: HarnessMutableSourceKind
  sourceRef: string
  baselineVersion: string
  baselineChecksum: string
}

export interface ExplicitHarnessUserRequestReceipt {
  requestId: string
  requester: string
  requesterType: "user" | "administrator"
  requestedSourceRefs: string[]
  requestedAt: number
  expiresAt: number
}

export interface HarnessSourceApprovalReceipt {
  approvalId: string
  approvedBy: string
  approvedSourceRefs: string[]
  approvedAt: number
  expiresAt: number
}

export type HarnessSourceAuthorizationDecision =
  | { status: "authorized"; source: HarnessMutableSourceDescriptor; requestId: string; approvalId: string }
  | { status: "blocked"; reasonCode: "source_kind_invalid" | "source_ref_invalid" | "source_lineage_invalid" | "explicit_user_request_missing" | "request_expired" | "request_scope_mismatch" | "approval_missing" | "approval_expired" | "approval_scope_mismatch" }

export type HarnessGuardrailDisposition = "preserved" | "weakened" | "disabled"

export interface HarnessGuardrailSnapshotEntry {
  guardrail: PromptImprovementHarnessGuardrail
  disposition: HarnessGuardrailDisposition
}

export type HarnessApplicationAuthorizationDecision =
  | {
      status: "authorized"
      fixedRisk: "high"
      guardrails: readonly PromptImprovementHarnessGuardrail[]
    }
  | {
      status: "blocked"
      reasonCode:
        | "baseline_guardrail_snapshot_invalid"
        | "proposed_guardrail_missing"
        | "proposed_guardrail_weakened"
        | "harness_risk_downgrade_forbidden"
        | "high_risk_approval_required"
      guardrail?: PromptImprovementHarnessGuardrail
    }

const SOURCE_REFS: Record<HarnessMutableSourceKind, string> = {
  approval_policy: "packages/core/src/memory/prompt-improvement-harness.ts#approval-policy",
  state_machine: "packages/core/src/memory/prompt-improvement-harness.ts#state-machine",
  harness_core: "prompts/prompt_improvement.md#harness-core",
  input_output_schema: "packages/core/src/memory/prompt-improvement-harness.ts#input-output-schema",
  activation_rollback_procedure: "prompts/prompt_improvement.md#activation-rollback-procedure",
  test_fixture: "tests/task1357-harness-guardrail-authorization.test.ts",
}

function snapshotMap(entries: readonly HarnessGuardrailSnapshotEntry[]): Map<PromptImprovementHarnessGuardrail, HarnessGuardrailDisposition> | null {
  const map = new Map<PromptImprovementHarnessGuardrail, HarnessGuardrailDisposition>()
  for (const entry of entries) {
    if (!REQUIRED_HARNESS_GUARDRAILS.includes(entry.guardrail) || map.has(entry.guardrail)) return null
    map.set(entry.guardrail, entry.disposition)
  }
  return map
}

export function authorizeHarnessApplication(input: {
  declaredRisk: "low" | "medium" | "high"
  approvedRisk?: "low" | "medium" | "high"
  baselineGuardrails: readonly HarnessGuardrailSnapshotEntry[]
  proposedGuardrails: readonly HarnessGuardrailSnapshotEntry[]
}): HarnessApplicationAuthorizationDecision {
  const baseline = snapshotMap(input.baselineGuardrails)
  if (!baseline || REQUIRED_HARNESS_GUARDRAILS.some((guardrail) => baseline.get(guardrail) !== "preserved")) {
    return { status: "blocked", reasonCode: "baseline_guardrail_snapshot_invalid" }
  }
  if (input.declaredRisk !== "high") {
    return { status: "blocked", reasonCode: "harness_risk_downgrade_forbidden" }
  }
  if (input.approvedRisk !== "high") {
    return { status: "blocked", reasonCode: "high_risk_approval_required" }
  }
  const proposed = snapshotMap(input.proposedGuardrails)
  for (const guardrail of REQUIRED_HARNESS_GUARDRAILS) {
    const disposition = proposed?.get(guardrail)
    if (!disposition) return { status: "blocked", reasonCode: "proposed_guardrail_missing", guardrail }
    if (disposition !== "preserved") {
      return { status: "blocked", reasonCode: "proposed_guardrail_weakened", guardrail }
    }
  }
  return { status: "authorized", fixedRisk: "high", guardrails: REQUIRED_HARNESS_GUARDRAILS }
}

export async function executeAuthorizedHarnessApplication<T>(input: {
  decision: HarnessApplicationAuthorizationDecision
  apply: () => Promise<T>
}): Promise<{ status: "applied"; result: T } | Extract<HarnessApplicationAuthorizationDecision, { status: "blocked" }>> {
  if (input.decision.status !== "authorized") return input.decision
  return { status: "applied", result: await input.apply() }
}

function exactValues(values: string[]): string[] {
  return values.map((value) => value.trim()).filter(Boolean)
}

export function authorizeHarnessSourceMutation(input: {
  source: Partial<HarnessMutableSourceDescriptor>
  userRequest?: ExplicitHarnessUserRequestReceipt
  approval?: HarnessSourceApprovalReceipt
  now: number
}): HarnessSourceAuthorizationDecision {
  const sourceKind = input.source.sourceKind
  if (!sourceKind || !HARNESS_MUTABLE_SOURCE_KINDS.includes(sourceKind)) return { status: "blocked", reasonCode: "source_kind_invalid" }
  const sourceRef = input.source.sourceRef?.trim() ?? ""
  if (sourceRef !== SOURCE_REFS[sourceKind]) return { status: "blocked", reasonCode: "source_ref_invalid" }
  const baselineVersion = input.source.baselineVersion?.trim() ?? ""
  const baselineChecksum = input.source.baselineChecksum?.trim() ?? ""
  if (!baselineVersion || /^(?:head|current|latest)$/iu.test(baselineVersion) || !/^(?:sha256:)?[a-f0-9]{8,64}$/iu.test(baselineChecksum)) {
    return { status: "blocked", reasonCode: "source_lineage_invalid" }
  }
  const request = input.userRequest
  if (!request || !request.requestId.trim() || !request.requester.trim() || !["user", "administrator"].includes(request.requesterType)) {
    return { status: "blocked", reasonCode: "explicit_user_request_missing" }
  }
  if (request.requestedAt > input.now || request.expiresAt <= input.now) return { status: "blocked", reasonCode: "request_expired" }
  if (!exactValues(request.requestedSourceRefs).includes(sourceRef)) return { status: "blocked", reasonCode: "request_scope_mismatch" }
  const approval = input.approval
  if (!approval || !approval.approvalId.trim() || !approval.approvedBy.trim()) return { status: "blocked", reasonCode: "approval_missing" }
  if (approval.approvedAt > input.now || approval.expiresAt <= input.now) return { status: "blocked", reasonCode: "approval_expired" }
  if (!exactValues(approval.approvedSourceRefs).includes(sourceRef)) return { status: "blocked", reasonCode: "approval_scope_mismatch" }
  return {
    status: "authorized",
    source: { sourceKind, sourceRef, baselineVersion, baselineChecksum },
    requestId: request.requestId,
    approvalId: approval.approvalId,
  }
}

export async function executeAuthorizedHarnessSourceMutation<T>(input: {
  decision: HarnessSourceAuthorizationDecision
  writerKind: HarnessMutableSourceKind
  write: (source: HarnessMutableSourceDescriptor) => Promise<T>
}): Promise<{ status: "written"; result: T } | { status: "blocked"; reasonCode: string }> {
  if (input.decision.status !== "authorized") return input.decision
  if (input.decision.source.sourceKind !== input.writerKind) return { status: "blocked", reasonCode: "writer_kind_mismatch" }
  return { status: "written", result: await input.write(input.decision.source) }
}
