import { LLM_CAPABILITY_SELECTION_REJECTION_CODES, } from "./llm-capability-selection.js";
export const CAPABILITY_SELECTION_DECISION_TRACE_SCHEMA_VERSION = "knowbee.capability-selection-trace.v1";
const EXPECTED_FIELDS = new Set([
    "schemaVersion",
    "terminalStatus",
    "attemptCount",
    "attemptKinds",
    "validationReasonCodes",
    "admissionReasonCodes",
    "strategyFingerprints",
]);
const TERMINAL_STATUSES = new Set([
    "allowed",
    "approval_required",
    "rejected",
    "failed",
    "cancelled",
]);
const VALIDATION_CODES = new Set([
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
]);
const ADMISSION_CODES = new Set(LLM_CAPABILITY_SELECTION_REJECTION_CODES);
const SAFE_FINGERPRINT = /^[A-Za-z0-9][A-Za-z0-9:._-]{0,159}$/u;
function recordValue(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value)
        ? value
        : null;
}
function validStringArray(value, allowed, maxItems) {
    return (Array.isArray(value) &&
        value.length <= maxItems &&
        value.every((item) => typeof item === "string" && allowed.has(item)) &&
        new Set(value).size === value.length);
}
export function parseCapabilitySelectionDecisionTraceDetail(value) {
    const record = recordValue(value);
    if (record?.schemaVersion !== CAPABILITY_SELECTION_DECISION_TRACE_SCHEMA_VERSION) {
        return { status: "rejected", reasonCode: "schema_version_unsupported" };
    }
    if (Object.keys(record).some((key) => !EXPECTED_FIELDS.has(key))) {
        return { status: "rejected", reasonCode: "unknown_field" };
    }
    if (typeof record.terminalStatus !== "string" ||
        !TERMINAL_STATUSES.has(record.terminalStatus)) {
        return { status: "rejected", reasonCode: "terminal_status_invalid" };
    }
    if (!Number.isSafeInteger(record.attemptCount) ||
        ![0, 1, 2].includes(record.attemptCount) ||
        !validStringArray(record.attemptKinds, new Set(["initial", "repair"]), 2) ||
        record.attemptKinds.length !== record.attemptCount ||
        (record.attemptKinds[0] !== undefined && record.attemptKinds[0] !== "initial") ||
        (record.attemptKinds[1] !== undefined && record.attemptKinds[1] !== "repair")) {
        return { status: "rejected", reasonCode: "attempt_contract_invalid" };
    }
    if (!validStringArray(record.validationReasonCodes, VALIDATION_CODES, 16)) {
        return { status: "rejected", reasonCode: "validation_reason_invalid" };
    }
    if (!validStringArray(record.admissionReasonCodes, ADMISSION_CODES, 32)) {
        return { status: "rejected", reasonCode: "admission_reason_invalid" };
    }
    if (!Array.isArray(record.strategyFingerprints) ||
        record.strategyFingerprints.length > 32 ||
        !record.strategyFingerprints.every((item) => typeof item === "string" && SAFE_FINGERPRINT.test(item)) ||
        new Set(record.strategyFingerprints).size !== record.strategyFingerprints.length) {
        return { status: "rejected", reasonCode: "strategy_fingerprint_invalid" };
    }
    return {
        status: "ready",
        detail: {
            schemaVersion: CAPABILITY_SELECTION_DECISION_TRACE_SCHEMA_VERSION,
            terminalStatus: record.terminalStatus,
            attemptCount: record.attemptCount,
            attemptKinds: [...record.attemptKinds],
            validationReasonCodes: [...record.validationReasonCodes],
            admissionReasonCodes: [...record.admissionReasonCodes],
            strategyFingerprints: [...record.strategyFingerprints],
        },
    };
}
//# sourceMappingURL=capability-selection-decision-trace.js.map