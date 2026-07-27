import type { ApprovalSourceDescriptor } from "./exact-source-approval.js"
import {
  PROMPT_IMPROVEMENT_HARNESS_CHANGE_SCOPES,
  REQUIRED_HARNESS_GUARDRAILS,
  type PromptImprovementHarnessChangeScope,
  type PromptImprovementHarnessGuardrail,
} from "../memory/prompt-improvement-harness.js"

export interface CanonicalApprovalRequest {
  changeKind: "prompt_source" | "harness"
  targetFiles: ApprovalSourceDescriptor[]
  changeSummary: string
  riskLevel: "low" | "medium" | "high"
  invariantsAffected: string[]
  testsToRun: string[]
  rollbackPlan: string
  activationMethod: "reload" | "restart" | "registry_activation" | "next_request_snapshot"
  harnessChangeScope?: PromptImprovementHarnessChangeScope[]
  harnessGuardrailsToPreserve?: PromptImprovementHarnessGuardrail[]
}

export type CanonicalApprovalRequestDecision =
  | { status: "valid"; request: CanonicalApprovalRequest }
  | {
      status: "blocked"
      reasonCode:
        | "target_files_required"
        | "approval_field_missing"
        | "approval_list_invalid"
        | "harness_field_forbidden"
        | "harness_scope_required"
        | "harness_scope_invalid"
        | "harness_guardrail_missing"
        | "harness_guardrail_invalid"
      field?: string
      guardrail?: PromptImprovementHarnessGuardrail
    }

export interface DefaultRiskApprovalReceipt {
  decision: "approved" | "denied"
  actorType: "user" | "administrator" | "system"
  actorId: string
  explicitApproval: boolean
  proposalFingerprint: string
}

export type DefaultRiskApprovalDecision =
  | { status: "authorized"; risk: "low" | "medium" | "high"; approvalMode: "tests_and_rollback" | "user_or_administrator" | "explicit" }
  | { status: "blocked"; reasonCode: "low_evidence_required" | "approval_required" | "approval_denied" | "approval_actor_invalid" | "explicit_approval_required" }

function exact(value: string): string {
  return value.trim()
}

function uniqueNonEmpty(values: readonly string[]): boolean {
  const normalized = values.map(exact).filter(Boolean)
  return normalized.length === values.length && normalized.length > 0 && new Set(normalized).size === normalized.length
}

export function validateCanonicalApprovalRequest(request: CanonicalApprovalRequest): CanonicalApprovalRequestDecision {
  if (request.targetFiles.length === 0 || request.targetFiles.some((source) => !exact(source.sourceRef))) {
    return { status: "blocked", reasonCode: "target_files_required", field: "targetFiles" }
  }
  for (const [field, value] of [
    ["changeSummary", request.changeSummary],
    ["rollbackPlan", request.rollbackPlan],
    ["activationMethod", request.activationMethod],
  ] as const) {
    if (!exact(value)) return { status: "blocked", reasonCode: "approval_field_missing", field }
  }
  if (!uniqueNonEmpty(request.invariantsAffected)) {
    return { status: "blocked", reasonCode: "approval_list_invalid", field: "invariantsAffected" }
  }
  if (!uniqueNonEmpty(request.testsToRun)) {
    return { status: "blocked", reasonCode: "approval_list_invalid", field: "testsToRun" }
  }
  if (request.changeKind === "prompt_source") {
    if ((request.harnessChangeScope?.length ?? 0) > 0 || (request.harnessGuardrailsToPreserve?.length ?? 0) > 0) {
      return { status: "blocked", reasonCode: "harness_field_forbidden" }
    }
    return { status: "valid", request }
  }
  const scopes = request.harnessChangeScope ?? []
  if (scopes.length === 0) return { status: "blocked", reasonCode: "harness_scope_required" }
  if (new Set(scopes).size !== scopes.length || scopes.some((scope) => !PROMPT_IMPROVEMENT_HARNESS_CHANGE_SCOPES.includes(scope))) {
    return { status: "blocked", reasonCode: "harness_scope_invalid" }
  }
  const guardrails = request.harnessGuardrailsToPreserve ?? []
  if (new Set(guardrails).size !== guardrails.length || guardrails.some((guardrail) => !REQUIRED_HARNESS_GUARDRAILS.includes(guardrail))) {
    return { status: "blocked", reasonCode: "harness_guardrail_invalid" }
  }
  for (const guardrail of REQUIRED_HARNESS_GUARDRAILS) {
    if (!guardrails.includes(guardrail)) return { status: "blocked", reasonCode: "harness_guardrail_missing", guardrail }
  }
  return { status: "valid", request }
}

export function decideDefaultRiskApprovalPolicy(input: {
  risk: "low" | "medium" | "high"
  testsPassed: boolean
  rollbackAvailable: boolean
  expectedProposalFingerprint: string
  approval?: DefaultRiskApprovalReceipt
}): DefaultRiskApprovalDecision {
  if (input.risk === "low") {
    if (!input.testsPassed || !input.rollbackAvailable) return { status: "blocked", reasonCode: "low_evidence_required" }
    return { status: "authorized", risk: "low", approvalMode: "tests_and_rollback" }
  }
  const approval = input.approval
  if (!approval || approval.proposalFingerprint !== input.expectedProposalFingerprint || !exact(approval.actorId)) {
    return { status: "blocked", reasonCode: "approval_required" }
  }
  if (approval.decision !== "approved") return { status: "blocked", reasonCode: "approval_denied" }
  if (approval.actorType !== "user" && approval.actorType !== "administrator") {
    return { status: "blocked", reasonCode: "approval_actor_invalid" }
  }
  if (input.risk === "high" && !approval.explicitApproval) {
    return { status: "blocked", reasonCode: "explicit_approval_required" }
  }
  return {
    status: "authorized",
    risk: input.risk,
    approvalMode: input.risk === "high" ? "explicit" : "user_or_administrator",
  }
}

export async function applyCanonicalApprovedChange<T>(input: {
  requestDecision: CanonicalApprovalRequestDecision
  riskDecision: DefaultRiskApprovalDecision
  apply: () => Promise<T>
}): Promise<{ status: "applied"; result: T } | { status: "blocked"; reasonCode: string }> {
  if (input.requestDecision.status !== "valid") return input.requestDecision
  if (input.riskDecision.status !== "authorized") return input.riskDecision
  return { status: "applied", result: await input.apply() }
}
