import { createHash } from "node:crypto";
const UNSAFE_PATTERN = /(?:https?:\/\/|\/Users\/|token=|operator-secret)/iu;
function hasText(value) {
    return value.trim().length > 0;
}
function parseDate(value) {
    if (!hasText(value))
        return undefined;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}
function buildAuthorizationRef(input) {
    const hash = createHash("sha256")
        .update(input.dryRunReceiptId)
        .update("\n")
        .update(input.targetSurfaces.join(","))
        .update("\n")
        .update(input.authorizedAt)
        .update("\n")
        .update(input.expiresAt)
        .digest("hex")
        .slice(0, 3);
    return `live-execution-authorization:browser.active_tab_info:${hash}`;
}
function baseResult(input) {
    return Object.freeze({
        schemaVersion: "knowbee.yeonjang-browser-active-tab-info-live-execution-authorization.v1",
        method: "browser.active_tab_info",
        status: input.status,
        reasonCode: input.reasonCode,
        ...(input.blockingReasonCodes === undefined
            ? {}
            : { blockingReasonCodes: Object.freeze([...input.blockingReasonCodes]) }),
        ...(input.authorization === undefined ? {} : { authorization: input.authorization }),
        executeNow: false,
        addRustDispatchNow: false,
        enableSkillMappingNow: false,
        addProductionBindingNow: false,
        enableDefaultLiveSmokeNow: false,
        createLiveExecutionReceiptNow: false,
    });
}
export function buildYeonjangBrowserActiveTabInfoLiveExecutionAuthorization(input, options) {
    const blockingReasonCodes = [];
    if (input.dryRunReceipt.status !== "dry_run_receipt_ready") {
        blockingReasonCodes.push("live_execution_authorization_dry_run_receipt_not_ready");
    }
    if (!hasText(input.operatorFinalLiveAuthorizationProof)) {
        blockingReasonCodes.push("live_execution_authorization_operator_proof_required");
    }
    else if (UNSAFE_PATTERN.test(input.operatorFinalLiveAuthorizationProof)) {
        blockingReasonCodes.push("live_execution_authorization_operator_proof_unsafe");
    }
    if (input.targetSurfaces.length === 0) {
        blockingReasonCodes.push("live_execution_authorization_target_surfaces_required");
    }
    if (input.targetSurfaces.length > 0 &&
        input.targetSurfaces.length !== input.dryRunReceipt.mutationSurfaceCount) {
        blockingReasonCodes.push("live_execution_authorization_surface_count_mismatch");
    }
    if (!input.rollbackEmergencyCommandAcknowledged) {
        blockingReasonCodes.push("live_execution_authorization_rollback_emergency_acknowledgement_required");
    }
    if (!input.postExecutionVerificationAcknowledged) {
        blockingReasonCodes.push("live_execution_authorization_post_execution_verification_acknowledgement_required");
    }
    const authorizedAt = parseDate(input.authorizedAt);
    const expiresAt = parseDate(input.expiresAt);
    if (authorizedAt === undefined) {
        blockingReasonCodes.push("live_execution_authorization_authorized_at_invalid");
    }
    if (expiresAt === undefined) {
        blockingReasonCodes.push("live_execution_authorization_expires_at_invalid");
    }
    else if (expiresAt.getTime() <= options.now.getTime()) {
        blockingReasonCodes.push("live_execution_authorization_expired");
    }
    if (blockingReasonCodes.length > 0) {
        return baseResult({
            status: "blocked",
            reasonCode: "active_tab_info_live_execution_authorization_blocked",
            blockingReasonCodes,
        });
    }
    const normalizedAuthorizedAt = authorizedAt?.toISOString() ?? input.authorizedAt;
    const normalizedExpiresAt = expiresAt?.toISOString() ?? input.expiresAt;
    return baseResult({
        status: "live_execution_authorization_ready",
        reasonCode: "active_tab_info_live_execution_authorization_ready",
        authorization: Object.freeze({
            authorizationRef: buildAuthorizationRef({
                dryRunReceiptId: input.dryRunReceipt.dryRunReceiptId,
                targetSurfaces: input.targetSurfaces,
                authorizedAt: normalizedAuthorizedAt,
                expiresAt: normalizedExpiresAt,
            }),
            dryRunReceiptId: input.dryRunReceipt.dryRunReceiptId,
            targetSurfaces: Object.freeze([...input.targetSurfaces]),
            rollbackEmergencyCommandAcknowledged: true,
            postExecutionVerificationAcknowledged: true,
            authorizedAt: normalizedAuthorizedAt,
            expiresAt: normalizedExpiresAt,
        }),
    });
}
//# sourceMappingURL=yeonjang-browser-active-tab-info-live-execution-authorization.js.map