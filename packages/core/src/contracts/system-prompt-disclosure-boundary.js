export const RAW_SYSTEM_PROMPT_DISCLOSURE_PURPOSES = [
    "prompt_review_or_improvement",
    "administrator_debug",
    "security_or_audit_validation",
];
const CAPABILITY_BY_PURPOSE = {
    prompt_review_or_improvement: "prompt_reviewer",
    administrator_debug: "administrator",
    security_or_audit_validation: "security_auditor",
};
function required(value, field) {
    const normalized = value.trim();
    if (!normalized)
        throw new Error(`${field} is required.`);
    return normalized;
}
function timestamp(value, field) {
    if (!Number.isSafeInteger(value) || value < 0)
        throw new Error(`${field} must be a non-negative integer.`);
    return value;
}
export function authorizeSystemPromptDisclosure(input) {
    if (input.surface !== "authorized_workflow")
        return { status: "summary_only", projection: "behavior_policy_summary" };
    const requestId = required(input.requestId, "Disclosure request ID");
    const actorRef = required(input.actorRef, "Disclosure actor reference");
    const audienceRef = required(input.audienceRef, "Disclosure audience reference");
    const purpose = input.requestedPurpose;
    const sourceRefs = input.requestedSourceRefs ?? [];
    const expectedFingerprint = required(input.expectedSourceSetFingerprint ?? "", "Expected source-set fingerprint");
    const now = timestamp(input.now, "Current time");
    const receipt = input.receipt;
    if (!receipt || !purpose)
        return { status: "blocked", reasonCode: "authorization_missing" };
    if (receipt.schemaVersion !== 1)
        throw new Error("Unsupported system prompt disclosure authorization schema version.");
    required(receipt.authorizationId, "Disclosure authorization ID");
    if (receipt.decision !== "approved")
        return { status: "blocked", reasonCode: "authorization_denied" };
    timestamp(receipt.issuedAt, "Disclosure authorization issue time");
    timestamp(receipt.expiresAt, "Disclosure authorization expiry");
    if (receipt.issuedAt > now || receipt.expiresAt <= now)
        return { status: "blocked", reasonCode: "authorization_expired" };
    if (sourceRefs.length === 0 || sourceRefs.some((ref) => !ref.trim() || ref.includes("*")) || new Set(sourceRefs).size !== sourceRefs.length) {
        return { status: "blocked", reasonCode: "target_invalid" };
    }
    if (!Number.isSafeInteger(receipt.maxBytes) || receipt.maxBytes <= 0 || !Number.isSafeInteger(receipt.maxSegments) || receipt.maxSegments <= 0) {
        return { status: "blocked", reasonCode: "delivery_limit_invalid" };
    }
    if (receipt.actorCapability !== CAPABILITY_BY_PURPOSE[purpose])
        return { status: "blocked", reasonCode: "actor_capability_mismatch" };
    if (receipt.requestId !== requestId || receipt.actorRef !== actorRef || receipt.audienceRef !== audienceRef
        || receipt.purpose !== purpose || receipt.sourceSetFingerprint !== expectedFingerprint
        || receipt.targetSourceRefs.length !== sourceRefs.length || receipt.targetSourceRefs.some((ref, index) => ref !== sourceRefs[index])) {
        return { status: "blocked", reasonCode: "authorization_scope_mismatch" };
    }
    return {
        status: "authorized", authorizationId: receipt.authorizationId, targetSourceRefs: [...sourceRefs],
        sourceSetFingerprint: expectedFingerprint, redactionMode: receipt.redactionMode,
        maxBytes: receipt.maxBytes, maxSegments: receipt.maxSegments,
    };
}
export async function deliverAuthorizedSystemPrompt(input) {
    if (input.decision.status !== "authorized")
        return input.decision;
    if (input.decision.redactionMode !== "raw_authorized") {
        return { status: "blocked", reasonCode: "raw_disclosure_not_authorized" };
    }
    if (input.actualSourceSetFingerprint !== input.decision.sourceSetFingerprint)
        return { status: "blocked", reasonCode: "authorization_scope_mismatch" };
    if (input.contentBytes > input.decision.maxBytes || input.contentSegments > input.decision.maxSegments) {
        return { status: "blocked", reasonCode: "delivery_limit_invalid" };
    }
    return { status: "delivered", result: await input.deliver(input.decision) };
}
export const ORDINARY_UI_ALLOWED_FIELDS = [
    "agentName",
    "statusLabel",
    "actionableReason",
    "nextAction",
];
const ORDINARY_UI_FORBIDDEN_FIELD = /(?:^|_)(?:agent_?id|session_?id|run_?id|request_?group_?id|state_?machine|raw_?state|system_?prompt|prompt_?content|persona|trait|workspace_?path)(?:$|_)/u;
function normalizedUiField(field) {
    return field.replace(/([a-z0-9])([A-Z])/g, "$1_$2").replace(/[\s-]+/g, "_").toLowerCase();
}
export function projectOrdinaryUi(input) {
    if (Object.keys(input).some((field) => ORDINARY_UI_FORBIDDEN_FIELD.test(normalizedUiField(field)))) {
        return { status: "rejected", reasonCode: "ordinary_ui_forbidden_field" };
    }
    const agentName = typeof input.agentName === "string" ? input.agentName.trim() : "";
    const statusLabel = typeof input.statusLabel === "string" ? input.statusLabel.trim() : "";
    if (!agentName || !statusLabel) {
        return { status: "rejected", reasonCode: "ordinary_ui_required_field_missing" };
    }
    const optionalText = (field) => {
        const value = input[field];
        return typeof value === "string" && value.trim() ? value.trim() : undefined;
    };
    const actionableReason = optionalText("actionableReason");
    const nextAction = optionalText("nextAction");
    return {
        status: "projected",
        projection: {
            agentName,
            statusLabel,
            ...(actionableReason ? { actionableReason } : {}),
            ...(nextAction ? { nextAction } : {}),
        },
    };
}
export function authorizeRestrictedUiDisclosure(input) {
    if (input.surface === "ordinary_ui") {
        return { status: "summary_only", projection: "behavior_policy_summary" };
    }
    const receipt = input.receipt;
    if (!receipt || receipt.surface !== input.surface || receipt.contentKind !== input.contentKind) {
        return { status: "blocked", reasonCode: "authorization_scope_mismatch" };
    }
    if (input.contentKind === "agent_persona") {
        const requestedAgentRef = input.requestedAgentRef?.trim() ?? "";
        if (!requestedAgentRef || receipt.targetAgentRef !== requestedAgentRef) {
            return { status: "blocked", reasonCode: "authorization_scope_mismatch" };
        }
        if (receipt.actorCapability !== "administrator") {
            return { status: "blocked", reasonCode: "actor_capability_mismatch" };
        }
    }
    return authorizeSystemPromptDisclosure({
        surface: "authorized_workflow",
        requestId: input.requestId,
        actorRef: input.actorRef,
        audienceRef: input.audienceRef,
        requestedPurpose: input.requestedPurpose,
        requestedSourceRefs: input.requestedSourceRefs,
        expectedSourceSetFingerprint: input.expectedSourceSetFingerprint,
        receipt,
        now: input.now,
    });
}
//# sourceMappingURL=system-prompt-disclosure-boundary.js.map