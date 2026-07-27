import { validateYeonjangBroadcastIntent } from "./yeonjang-broadcast.js";
import { validateYeonjangIdentityBoundarySnapshot, } from "./yeonjang-identity-boundary.js";
import { authorizeExactYeonjangTarget, } from "./yeonjang-target-resolution.js";
function exact(value) {
    return value?.trim() ?? "";
}
function unique(values) {
    const normalized = values.map(exact).filter(Boolean);
    if (normalized.length !== values.length || new Set(normalized).size !== normalized.length)
        return undefined;
    return normalized;
}
function sameSet(left, right) {
    return left.length === right.length && [...left].sort().every((value, index) => value === [...right].sort()[index]);
}
function validateNoYeonjangResult(decision, result) {
    if (decision.schemaVersion !== 1 || result.schemaVersion !== 1 || decision.blockedSteps.length === 0)
        return false;
    const expectedStatus = decision.selfSolveSteps.length > 0 ? "partial" : "blocked";
    if (result.status !== expectedStatus || JSON.stringify(result.blockedSteps) !== JSON.stringify(decision.blockedSteps))
        return false;
    const expectedSelfSolveIds = decision.selfSolveSteps.map((step) => step.stepId);
    const resultSelfSolveIds = result.completedSelfSolveResults.map((item) => item.stepId);
    return sameSet(expectedSelfSolveIds, resultSelfSolveIds)
        && result.blockedSteps.every((step) => step.status === "not_executed"
            && Boolean(exact(step.requiredCapability)) && Boolean(exact(step.requiredCapabilityName))
            && Boolean(exact(step.userFacingReason)) && Boolean(exact(step.userNextAction)));
}
export function authorizePromptImprovementYeonjangInvariant(input) {
    const snapshot = validateYeonjangIdentityBoundarySnapshot({ snapshot: input.identitySnapshot, maxAgeMs: input.maxIdentityAgeMs });
    const instancesByHost = new Map();
    for (const instance of snapshot.instances) {
        instancesByHost.set(instance.computerId, (instancesByHost.get(instance.computerId) ?? 0) + 1);
    }
    if ([...instancesByHost.values()].some((count) => count > 1)) {
        return { status: "blocked", reasonCode: "host_instance_duplicate" };
    }
    let targetInstanceIds = [];
    let requiredCapabilityIds = [];
    let blockedCapabilityIds = [];
    if (input.scope.kind === "single") {
        if (input.scope.targetDecision.status !== "resolved")
            return { status: "blocked", reasonCode: "exact_target_required" };
        try {
            targetInstanceIds = [authorizeExactYeonjangTarget({
                    receipt: input.scope.targetDecision.receipt,
                    selector: input.scope.selector,
                    snapshot,
                    maxAgeMs: input.maxIdentityAgeMs,
                })];
        }
        catch {
            return { status: "blocked", reasonCode: "exact_target_required" };
        }
        requiredCapabilityIds = unique(input.scope.requiredCapabilityIds) ?? [];
    }
    else if (input.scope.kind === "all_instances") {
        if (!validateYeonjangBroadcastIntent(input.scope.broadcastIntent).ok) {
            return { status: "blocked", reasonCode: "all_instances_broadcast_invalid" };
        }
        const userRequest = input.scope.userRequest;
        if (!userRequest)
            return { status: "blocked", reasonCode: "all_instances_user_request_missing" };
        if (userRequest.schemaVersion !== 1 || userRequest.actorType !== "user" || userRequest.explicitAllInstances !== true
            || !exact(userRequest.requestId) || !Number.isSafeInteger(userRequest.issuedAt)
            || !Number.isSafeInteger(userRequest.expiresAt) || userRequest.issuedAt > input.reviewedAt
            || userRequest.expiresAt <= input.reviewedAt || !unique(userRequest.targetInstanceIds)) {
            return { status: "blocked", reasonCode: "all_instances_user_request_invalid" };
        }
        targetInstanceIds = snapshot.instances
            .filter((instance) => instance.connectionState === "online" && instance.trustState === "trusted")
            .map((instance) => instance.instanceId);
        if (targetInstanceIds.length === 0 || !sameSet(targetInstanceIds, userRequest.targetInstanceIds)) {
            return { status: "blocked", reasonCode: "all_instances_scope_mismatch" };
        }
        requiredCapabilityIds = unique(input.scope.requiredCapabilityIds) ?? [];
    }
    else {
        if (snapshot.instances.some((instance) => instance.connectionState === "online" && instance.trustState === "trusted")) {
            return { status: "blocked", reasonCode: "no_yeonjang_scope_invalid" };
        }
        if (!validateNoYeonjangResult(input.scope.fallbackDecision, input.scope.truthfulResult)) {
            return { status: "blocked", reasonCode: "no_yeonjang_result_invalid" };
        }
        blockedCapabilityIds = [...new Set(input.scope.fallbackDecision.blockedSteps.map((step) => step.requiredCapability))];
    }
    const selected = targetInstanceIds.map((targetId) => snapshot.instances.find((instance) => instance.instanceId === targetId));
    if (selected.some((instance) => !instance)
        || selected.some((instance) => requiredCapabilityIds.some((capabilityId) => !instance.capabilityIds.includes(capabilityId)))) {
        return { status: "blocked", reasonCode: "target_capability_missing" };
    }
    for (const evidence of input.sensitiveOperations) {
        if (!targetInstanceIds.includes(exact(evidence.targetInstanceId))) {
            return { status: "blocked", reasonCode: "sensitive_authorization_scope_mismatch" };
        }
        if (evidence.decision.status !== "authorized") {
            return { status: "blocked", reasonCode: "sensitive_authorization_missing" };
        }
    }
    const proposalFingerprint = exact(input.proposalFingerprint);
    const baselineFingerprint = exact(input.baselineFingerprint);
    const proposedFingerprint = exact(input.proposedFingerprint);
    const goalSection3Fingerprint = exact(input.goalSection3Fingerprint);
    const reviewerRef = exact(input.reviewerRef);
    if (!proposalFingerprint || !baselineFingerprint || !proposedFingerprint || !goalSection3Fingerprint || !reviewerRef
        || baselineFingerprint === proposedFingerprint || !Number.isSafeInteger(input.reviewedAt) || input.reviewedAt < 0
        || !Number.isSafeInteger(input.expiresAt) || input.expiresAt <= input.reviewedAt) {
        return { status: "blocked", reasonCode: "yeonjang_review_lineage_invalid" };
    }
    return {
        status: "authorized",
        receipt: {
            schemaVersion: 1,
            invariant: "tool_boundary",
            decision: "preserved",
            proposalFingerprint,
            baselineFingerprint,
            proposedFingerprint,
            goalSection3Fingerprint,
            reviewerRef,
            reviewedAt: input.reviewedAt,
            expiresAt: input.expiresAt,
            operationScope: input.scope.kind,
            targetInstanceIds,
            requiredCapabilityIds,
            blockedCapabilityIds,
            sensitiveAuthorizationCount: input.sensitiveOperations.length,
        },
    };
}
export function projectYeonjangToolBoundaryInvariantReview(input) {
    const receipt = input.receipt;
    if (receipt.schemaVersion !== 1 || receipt.invariant !== "tool_boundary" || receipt.decision !== "preserved"
        || !exact(receipt.baselineFingerprint) || !exact(receipt.proposedFingerprint)
        || receipt.baselineFingerprint === receipt.proposedFingerprint || !exact(receipt.reviewerRef)
        || !unique(receipt.targetInstanceIds) || !unique(receipt.requiredCapabilityIds) || !unique(receipt.blockedCapabilityIds)
        || !Number.isSafeInteger(receipt.sensitiveAuthorizationCount) || receipt.sensitiveAuthorizationCount < 0
        || !Number.isSafeInteger(receipt.reviewedAt) || !Number.isSafeInteger(receipt.expiresAt)
        || !Number.isSafeInteger(input.now) || receipt.reviewedAt > input.now) {
        return { status: "blocked", reasonCode: "yeonjang_review_receipt_invalid" };
    }
    if (receipt.expiresAt <= input.now)
        return { status: "blocked", reasonCode: "yeonjang_review_expired" };
    if (receipt.proposalFingerprint !== exact(input.expectedProposalFingerprint)) {
        return { status: "blocked", reasonCode: "yeonjang_review_scope_mismatch" };
    }
    if (receipt.goalSection3Fingerprint !== exact(input.currentGoalSection3Fingerprint)) {
        return { status: "blocked", reasonCode: "goal_section3_lineage_mismatch" };
    }
    return {
        status: "authorized",
        review: {
            invariant: "tool_boundary",
            proposalFingerprint: receipt.proposalFingerprint,
            baselineFingerprint: receipt.baselineFingerprint,
            proposedFingerprint: receipt.proposedFingerprint,
            decision: "preserved",
            reviewerRef: receipt.reviewerRef,
            reviewedAt: receipt.reviewedAt,
            expiresAt: receipt.expiresAt,
        },
    };
}
//# sourceMappingURL=prompt-improvement-yeonjang-invariants.js.map