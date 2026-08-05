import {
  LLM_CAPABILITY_SELECTION_REJECTION_CODES,
  type LlmCapabilitySelectionRejectionCode,
  type LlmCapabilitySelectionValidationCode,
} from "./llm-capability-selection.js"

export const CAPABILITY_SELECTION_DECISION_TRACE_SCHEMA_VERSION =
  "knowbee.capability-selection-trace.v1" as const

export type CapabilitySelectionTraceValidationCode =
  | LlmCapabilitySelectionValidationCode
  | "invalid_json"
  | "json_object_required"

export type CapabilitySelectionTraceTerminalStatus =
  | "allowed"
  | "approval_required"
  | "rejected"
  | "failed"
  | "cancelled"

export type CapabilitySelectionTraceReasonCode =
  | "capability_selection_allowed"
  | "capability_selection_approval_required"
  | "capability_selection_rejected"
  | "capability_selection_context_invalid"
  | "capability_selection_provider_failed"
  | "capability_selection_timed_out"
  | "capability_selection_output_limit_exceeded"
  | "capability_selection_invalid_output"
  | "capability_selection_cancelled"

export interface CapabilitySelectionDecisionTraceDetail {
  schemaVersion: typeof CAPABILITY_SELECTION_DECISION_TRACE_SCHEMA_VERSION
  terminalStatus: CapabilitySelectionTraceTerminalStatus
  attemptCount: 0 | 1 | 2
  attemptKinds: Array<"initial" | "repair">
  validationReasonCodes: CapabilitySelectionTraceValidationCode[]
  admissionReasonCodes: LlmCapabilitySelectionRejectionCode[]
  strategyFingerprints: string[]
}

export type CapabilitySelectionDecisionTraceParseResult =
  | { status: "ready"; detail: CapabilitySelectionDecisionTraceDetail }
  | {
      status: "rejected"
      reasonCode:
        | "schema_version_unsupported"
        | "unknown_field"
        | "terminal_status_invalid"
        | "attempt_contract_invalid"
        | "validation_reason_invalid"
        | "admission_reason_invalid"
        | "strategy_fingerprint_invalid"
    }

export interface CapabilitySelectionDecisionTraceRecordInput {
  runId: string
  decisionReceiptId: string
  reasonCode: CapabilitySelectionTraceReasonCode
  detail: Omit<CapabilitySelectionDecisionTraceDetail, "schemaVersion">
}

export type CapabilitySelectionDecisionTraceRecordResult =
  | { status: "stored"; traceId: string }
  | {
      status: "failed"
      reasonCode: "trace_detail_invalid" | "trace_storage_failed"
    }

export interface CapabilitySelectionDecisionTraceSink {
  record(
    input: CapabilitySelectionDecisionTraceRecordInput,
  ): CapabilitySelectionDecisionTraceRecordResult
}

const EXPECTED_FIELDS = new Set([
  "schemaVersion",
  "terminalStatus",
  "attemptCount",
  "attemptKinds",
  "validationReasonCodes",
  "admissionReasonCodes",
  "strategyFingerprints",
])
const TERMINAL_STATUSES = new Set<CapabilitySelectionTraceTerminalStatus>([
  "allowed",
  "approval_required",
  "rejected",
  "failed",
  "cancelled",
])
const VALIDATION_CODES = new Set<CapabilitySelectionTraceValidationCode>([
  "schema_version_invalid",
  "run_id_required",
  "snapshot_id_required",
  "snapshot_fingerprint_invalid",
  "compared_bindings_invalid",
  "binding_assessments_invalid",
  "selected_binding_invalid",
  "reason_required",
  "invalid_json",
  "json_object_required",
])
const ADMISSION_CODES = new Set<LlmCapabilitySelectionRejectionCode>(
  LLM_CAPABILITY_SELECTION_REJECTION_CODES,
)
const SAFE_FINGERPRINT = /^[A-Za-z0-9][A-Za-z0-9:._-]{0,159}$/u

function recordValue(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function validStringArray<T extends string>(
  value: unknown,
  allowed: ReadonlySet<T>,
  maxItems: number,
): value is T[] {
  return (
    Array.isArray(value) &&
    value.length <= maxItems &&
    value.every((item) => typeof item === "string" && allowed.has(item as T)) &&
    new Set(value).size === value.length
  )
}

export function parseCapabilitySelectionDecisionTraceDetail(
  value: unknown,
): CapabilitySelectionDecisionTraceParseResult {
  const record = recordValue(value)
  if (record?.schemaVersion !== CAPABILITY_SELECTION_DECISION_TRACE_SCHEMA_VERSION) {
    return { status: "rejected", reasonCode: "schema_version_unsupported" }
  }
  if (Object.keys(record).some((key) => !EXPECTED_FIELDS.has(key))) {
    return { status: "rejected", reasonCode: "unknown_field" }
  }
  if (
    typeof record.terminalStatus !== "string" ||
    !TERMINAL_STATUSES.has(record.terminalStatus as CapabilitySelectionTraceTerminalStatus)
  ) {
    return { status: "rejected", reasonCode: "terminal_status_invalid" }
  }
  if (
    !Number.isSafeInteger(record.attemptCount) ||
    ![0, 1, 2].includes(record.attemptCount as number) ||
    !validStringArray(record.attemptKinds, new Set(["initial", "repair"] as const), 2) ||
    record.attemptKinds.length !== record.attemptCount ||
    (record.attemptKinds[0] !== undefined && record.attemptKinds[0] !== "initial") ||
    (record.attemptKinds[1] !== undefined && record.attemptKinds[1] !== "repair")
  ) {
    return { status: "rejected", reasonCode: "attempt_contract_invalid" }
  }
  if (!validStringArray(record.validationReasonCodes, VALIDATION_CODES, 16)) {
    return { status: "rejected", reasonCode: "validation_reason_invalid" }
  }
  if (!validStringArray(record.admissionReasonCodes, ADMISSION_CODES, 32)) {
    return { status: "rejected", reasonCode: "admission_reason_invalid" }
  }
  if (
    !Array.isArray(record.strategyFingerprints) ||
    record.strategyFingerprints.length > 32 ||
    !record.strategyFingerprints.every(
      (item) => typeof item === "string" && SAFE_FINGERPRINT.test(item),
    ) ||
    new Set(record.strategyFingerprints).size !== record.strategyFingerprints.length
  ) {
    return { status: "rejected", reasonCode: "strategy_fingerprint_invalid" }
  }
  return {
    status: "ready",
    detail: {
      schemaVersion: CAPABILITY_SELECTION_DECISION_TRACE_SCHEMA_VERSION,
      terminalStatus: record.terminalStatus as CapabilitySelectionTraceTerminalStatus,
      attemptCount: record.attemptCount as 0 | 1 | 2,
      attemptKinds: [...record.attemptKinds] as Array<"initial" | "repair">,
      validationReasonCodes: [...record.validationReasonCodes] as CapabilitySelectionTraceValidationCode[],
      admissionReasonCodes: [...record.admissionReasonCodes] as LlmCapabilitySelectionRejectionCode[],
      strategyFingerprints: [...record.strategyFingerprints] as string[],
    },
  }
}
