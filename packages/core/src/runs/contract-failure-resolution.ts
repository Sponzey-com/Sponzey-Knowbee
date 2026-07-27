import type {
  CanonicalExecutionFailure,
  CanonicalExecutionFailurePhase,
} from "./canonical-execution-failure.js"

export type ContractFailureClass =
  | "llm_output_repairable"
  | "capability_degraded"
  | "policy_waiting"
  | "persistence_conflict"
  | "adapter_unavailable"
  | "invariant_breach"

export type ContractFailureRetryClass =
  | "llm_repair"
  | "changed_strategy"
  | "wait"
  | "reload_state"
  | "adapter_retry"
  | "none"

export interface ContractFailure {
  readonly phase: CanonicalExecutionFailurePhase
  readonly reasonCode: string
  readonly failureClass: ContractFailureClass
  readonly retryClass: ContractFailureRetryClass
  readonly requestId: string
  readonly workId?: string
  readonly expectedRevision?: number
  readonly safeEvidenceRefs: readonly string[]
  readonly auditRef: string
}

export type ExecutionFailureDirective =
  | {
      kind: "repair"
      retryClass: "llm_repair"
      safeEvidenceRefs: string[]
    }
  | {
      kind: "replan"
      mode: "degraded_capability"
      retryClass: "changed_strategy"
      safeEvidenceRefs: string[]
    }
  | {
      kind: "wait"
      retryClass: "wait"
    }
  | {
      kind: "retry_persistence"
      retryClass: "reload_state"
      expectedRevision: number
    }
  | {
      kind: "retry_adapter"
      retryClass: "adapter_retry"
    }
  | {
      kind: "internal_fault"
      retryClass: "none"
      auditRef: string
    }

const REASON_CODES: Readonly<
  Record<Exclude<ContractFailureClass, "invariant_breach">, readonly string[]>
> = {
  llm_output_repairable: [
    "llm_output_schema_invalid",
    "intake_contract_unavailable",
    "analysis_schema_invalid",
  ],
  capability_degraded: [
    "capability_selection_catalog_invalid",
    "capability_selection_rejected",
    "capability_selection_provider_unavailable",
    "capability_selection_snapshot_invalid",
    "capability_selection_context_invalid",
    "capability_selection_provider_failed",
    "capability_selection_timed_out",
    "capability_selection_output_limit_exceeded",
    "capability_selection_invalid_output",
    "capability_unavailable",
    "capability_snapshot_degraded",
    "required_method_unavailable",
    "capability_denied",
  ],
  policy_waiting: ["approval_required", "user_input_required", "capability_approval_required"],
  persistence_conflict: ["revision_conflict", "receipt_already_exists", "receipt_already_consumed"],
  adapter_unavailable: ["adapter_unavailable", "network_unavailable", "delivery_unavailable"],
}

function classifyReasonCode(reasonCode: string): ContractFailureClass {
  for (const [failureClass, reasonCodes] of Object.entries(REASON_CODES)) {
    if (reasonCodes.includes(reasonCode)) return failureClass as ContractFailureClass
  }
  return "invariant_breach"
}

function retryClassFor(
  failureClass: ContractFailureClass,
  retryable: boolean,
): ContractFailureRetryClass {
  switch (failureClass) {
    case "llm_output_repairable":
      return "llm_repair"
    case "capability_degraded":
      return "changed_strategy"
    case "policy_waiting":
      return "wait"
    case "persistence_conflict":
      return "reload_state"
    case "adapter_unavailable":
      return retryable ? "adapter_retry" : "none"
    case "invariant_breach":
      return "none"
  }
}

function isSafeReference(value: string): boolean {
  if (value.length < 1 || value.length > 160) return false
  for (const character of value) {
    const isLowercaseLetter = character >= "a" && character <= "z"
    const isUppercaseLetter = character >= "A" && character <= "Z"
    const isDigit = character >= "0" && character <= "9"
    if (
      !isLowercaseLetter &&
      !isUppercaseLetter &&
      !isDigit &&
      character !== ":" &&
      character !== "." &&
      character !== "_" &&
      character !== "-"
    ) {
      return false
    }
  }
  return true
}

function safeReferenceOrFallback(value: string, fallback: string): string {
  const normalized = value.trim()
  return isSafeReference(normalized) ? normalized : fallback
}

export function projectCanonicalContractFailure(input: {
  failure: CanonicalExecutionFailure
  requestId: string
  workId?: string
  expectedRevision?: number
  safeEvidenceRefs?: readonly string[]
  auditRef: string
}): ContractFailure {
  const failureClass = classifyReasonCode(input.failure.reasonCode)
  const requestId = safeReferenceOrFallback(input.requestId, "request:unknown")
  const auditRef = safeReferenceOrFallback(input.auditRef, `audit:${requestId}`)
  const workId = input.workId ? safeReferenceOrFallback(input.workId, "work:unknown") : undefined
  const safeEvidenceRefs = [
    ...new Set(
      (input.safeEvidenceRefs ?? []).map((reference) => reference.trim()).filter(isSafeReference),
    ),
  ].sort()
  const expectedRevision =
    input.expectedRevision !== undefined &&
    Number.isSafeInteger(input.expectedRevision) &&
    input.expectedRevision >= 0
      ? input.expectedRevision
      : undefined

  return {
    phase: input.failure.phase,
    reasonCode: input.failure.reasonCode,
    failureClass,
    retryClass: retryClassFor(failureClass, input.failure.retryable),
    requestId,
    ...(workId ? { workId } : {}),
    ...(expectedRevision !== undefined ? { expectedRevision } : {}),
    safeEvidenceRefs,
    auditRef,
  }
}

export function resolveExecutionFailure(failure: ContractFailure): ExecutionFailureDirective {
  switch (failure.retryClass) {
    case "llm_repair":
      return {
        kind: "repair",
        retryClass: "llm_repair",
        safeEvidenceRefs: [...failure.safeEvidenceRefs],
      }
    case "changed_strategy":
      return {
        kind: "replan",
        mode: "degraded_capability",
        retryClass: "changed_strategy",
        safeEvidenceRefs: [...failure.safeEvidenceRefs],
      }
    case "wait":
      return { kind: "wait", retryClass: "wait" }
    case "reload_state":
      return failure.expectedRevision !== undefined
        ? {
            kind: "retry_persistence",
            retryClass: "reload_state",
            expectedRevision: failure.expectedRevision,
          }
        : {
            kind: "internal_fault",
            retryClass: "none",
            auditRef: failure.auditRef,
          }
    case "adapter_retry":
      return { kind: "retry_adapter", retryClass: "adapter_retry" }
    case "none":
      return {
        kind: "internal_fault",
        retryClass: "none",
        auditRef: failure.auditRef,
      }
  }
}

export interface PublicContractFailureProjection {
  status: "retrying" | "waiting" | "blocked"
  action: "repair" | "replan" | "wait" | "retry" | "contact_support"
}

export function projectPublicContractFailure(
  failure: ContractFailure,
): PublicContractFailureProjection {
  const directive = resolveExecutionFailure(failure)
  switch (directive.kind) {
    case "repair":
      return { status: "retrying", action: "repair" }
    case "replan":
      return { status: "retrying", action: "replan" }
    case "wait":
      return { status: "waiting", action: "wait" }
    case "retry_persistence":
    case "retry_adapter":
      return { status: "retrying", action: "retry" }
    case "internal_fault":
      return { status: "blocked", action: "contact_support" }
  }
}

export function projectAuditContractFailure(failure: ContractFailure): ContractFailure {
  return {
    ...failure,
    safeEvidenceRefs: [...failure.safeEvidenceRefs],
  }
}

export interface ContractFailureRetryDirective {
  kind: "retry_intake"
  summary: string
  reason: string
  message: string
  eventLabel: "canonical_policy_reanalysis_requested"
}

export function projectContractFailureRetryDirective(input: {
  failure: ContractFailure
  originalRequest: string
}): ContractFailureRetryDirective | null {
  const directive = resolveExecutionFailure(input.failure)
  if (directive.kind !== "repair" && directive.kind !== "replan") return null
  return {
    kind: "retry_intake",
    summary:
      directive.kind === "repair"
        ? "분석 계약을 보정하여 다시 확인합니다."
        : "사용 가능한 기능으로 해결 전략을 다시 수립합니다.",
    reason: "A changed analysis strategy is required.",
    message: JSON.stringify({
      kind: "knowbee_intake_reanalysis_v1",
      originalRequest: input.originalRequest,
      failure: {
        phase: input.failure.phase,
        failureClass: input.failure.failureClass,
        retryClass: input.failure.retryClass,
        reasonCode: input.failure.reasonCode,
        safeEvidenceRefs: [...input.failure.safeEvidenceRefs],
      },
      requirements: {
        changedStrategyRequired: true,
        preserveOriginalGoal: true,
      },
    }),
    eventLabel: "canonical_policy_reanalysis_requested",
  }
}
