export const HIGH_RISK_IMPROVEMENT_CHECKS = [
    "permission_gate",
    "prompt_source_checksum",
    "rollback",
    "audit_log",
    "conflict",
    "harness_regression_suite",
];
const BASE_CHECKS = [
    "permission_gate",
    "prompt_source_checksum",
    "rollback",
    "audit_log",
    "conflict",
];
const LOG_PURPOSES = ["product", "field_debug", "development"];
function exact(value) {
    return value.trim();
}
function checksum(value) {
    return /^(?:sha256:)?[a-f0-9]{8,64}$/iu.test(exact(value));
}
function requiredChecks(kind) {
    return kind === "harness" ? HIGH_RISK_IMPROVEMENT_CHECKS : BASE_CHECKS;
}
function validLogBoundary(receipt) {
    if (receipt.purpose === "product") {
        return receipt.visibility === "production_default"
            && !receipt.containsInternalDiagnostics
            && receipt.containsUserSafeSummary;
    }
    if (receipt.purpose === "field_debug") {
        return receipt.visibility === "field_opt_in" && !receipt.containsUserSafeSummary;
    }
    return receipt.visibility === "development_only" && !receipt.containsUserSafeSummary;
}
export function authorizeHighRiskImprovementVerification(input) {
    const changeId = exact(input.changeId);
    const required = requiredChecks(input.kind);
    const checkMap = new Map();
    for (const receipt of input.checks) {
        if (!HIGH_RISK_IMPROVEMENT_CHECKS.includes(receipt.check) || !exact(receipt.evidenceRef) || checkMap.has(receipt.check)) {
            return { status: "blocked", reasonCode: "check_receipt_invalid" };
        }
        if (exact(receipt.changeId) !== changeId)
            return { status: "blocked", reasonCode: "check_scope_mismatch", check: receipt.check };
        checkMap.set(receipt.check, receipt);
    }
    for (const check of required) {
        const receipt = checkMap.get(check);
        if (!receipt)
            return { status: "blocked", reasonCode: "check_missing", check };
        if (receipt.status !== "passed")
            return { status: "blocked", reasonCode: "check_failed", check };
    }
    const rollback = input.rollback;
    if (!exact(rollback.sourceRef) || !exact(rollback.rollbackEvidenceRef)) {
        return { status: "blocked", reasonCode: "rollback_receipt_invalid" };
    }
    if (exact(rollback.changeId) !== changeId)
        return { status: "blocked", reasonCode: "rollback_scope_mismatch" };
    if (!checksum(rollback.baselineChecksum)
        || !checksum(rollback.changedChecksum)
        || !checksum(rollback.restoredChecksum)
        || exact(rollback.baselineChecksum) === exact(rollback.changedChecksum)
        || exact(rollback.baselineChecksum) !== exact(rollback.restoredChecksum)) {
        return { status: "blocked", reasonCode: "rollback_checksum_invalid" };
    }
    const logMap = new Map();
    for (const receipt of input.logs) {
        if (!LOG_PURPOSES.includes(receipt.purpose) || !exact(receipt.evidenceRef) || logMap.has(receipt.purpose)) {
            return { status: "blocked", reasonCode: "log_receipt_invalid" };
        }
        if (exact(receipt.changeId) !== changeId)
            return { status: "blocked", reasonCode: "log_scope_mismatch", purpose: receipt.purpose };
        logMap.set(receipt.purpose, receipt);
    }
    for (const purpose of LOG_PURPOSES) {
        const receipt = logMap.get(purpose);
        if (!receipt)
            return { status: "blocked", reasonCode: "log_purpose_missing", purpose };
        if (!validLogBoundary(receipt))
            return { status: "blocked", reasonCode: "log_boundary_invalid", purpose };
    }
    return {
        status: "authorized",
        changeId,
        risk: "high",
        checks: required,
        rollbackSourceRef: exact(rollback.sourceRef),
    };
}
export async function executeVerifiedHighRiskImprovement(input) {
    if (input.decision.status !== "authorized")
        return input.decision;
    return { status: "applied", result: await input.apply(input.decision) };
}
//# sourceMappingURL=high-risk-improvement-verification.js.map