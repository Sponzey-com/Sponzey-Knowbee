export const PROMPT_MEMORY_EXCHANGE_METHODS = ["message_payload", "approved_handoff_package"];
function exact(value) {
    return value?.trim() ?? "";
}
function unique(values) {
    const normalized = values.map(exact).filter(Boolean);
    if (normalized.length !== values.length || new Set(normalized).size !== normalized.length)
        return undefined;
    return normalized;
}
export function evaluatePromptMemoryExchangeReceipt(receipt) {
    const exchangeId = exact(receipt.exchangeId);
    const sourceAgentId = exact(receipt.sourceAgentId);
    const targetAgentId = exact(receipt.targetAgentId);
    const payloadFingerprint = exact(receipt.payloadFingerprint);
    if (receipt.schemaVersion !== 1 || !exchangeId || !sourceAgentId || !targetAgentId || !payloadFingerprint) {
        return { status: "blocked", reasonCode: "exchange_receipt_invalid" };
    }
    if (!PROMPT_MEMORY_EXCHANGE_METHODS.includes(receipt.method)) {
        return { status: "blocked", reasonCode: "exchange_method_invalid" };
    }
    if (sourceAgentId === targetAgentId)
        return { status: "blocked", reasonCode: "exchange_owner_same" };
    if (receipt.method === "message_payload") {
        if (!exact(receipt.messageEvidenceRef))
            return { status: "blocked", reasonCode: "message_evidence_missing" };
    }
    else {
        if (!exact(receipt.approvalRef))
            return { status: "blocked", reasonCode: "handoff_approval_missing" };
        if (!receipt.handoff || !receipt.handoffDecision)
            return { status: "blocked", reasonCode: "handoff_receipt_missing" };
        if (receipt.handoffDecision.status !== "eligible")
            return { status: "blocked", reasonCode: "handoff_not_eligible" };
        if (exact(receipt.handoff.handoffId) !== exchangeId
            || receipt.handoffDecision.handoffId !== exchangeId
            || exact(receipt.handoff.sourceAgentId) !== sourceAgentId
            || exact(receipt.handoff.recipientAgentId) !== targetAgentId) {
            return { status: "blocked", reasonCode: "handoff_scope_mismatch" };
        }
    }
    return { status: "verified", exchangeId, method: receipt.method, sourceAgentId, targetAgentId, payloadFingerprint };
}
function verifyNamespaceSeparation(receipt, activeAgentIds) {
    const agentNamespaces = unique(receipt.agentNamespaceIds);
    const userNamespaces = unique(receipt.userNamespaceIds);
    if (receipt.schemaVersion !== 1 || receipt.status !== "verified" || !exact(receipt.evidenceRef)
        || !agentNamespaces || agentNamespaces.length === 0 || !userNamespaces)
        return "invalid";
    const userSet = new Set(userNamespaces);
    if (agentNamespaces.some((namespaceId) => userSet.has(namespaceId)))
        return "mixed";
    if (agentNamespaces.length !== activeAgentIds.length * 3
        || activeAgentIds.some((agentId) => ["short_term", "long_term", "history"]
            .some((kind) => !agentNamespaces.includes(`${agentId}:${kind}`))))
        return "incomplete";
    return "verified";
}
export function authorizePromptImprovementMemoryInvariant(input) {
    if (input.ownership.status !== "eligible" || input.ownership.activeAgentIds.length === 0) {
        return { status: "blocked", reasonCode: "memory_ownership_incomplete" };
    }
    const namespaceStatus = verifyNamespaceSeparation(input.namespaceSeparation, input.ownership.activeAgentIds);
    if (namespaceStatus === "invalid")
        return { status: "blocked", reasonCode: "memory_namespace_receipt_invalid" };
    if (namespaceStatus === "mixed")
        return { status: "blocked", reasonCode: "memory_namespace_mixed" };
    if (namespaceStatus === "incomplete")
        return { status: "blocked", reasonCode: "memory_namespace_coverage_incomplete" };
    const exchanges = input.exchanges.map(evaluatePromptMemoryExchangeReceipt);
    if (exchanges.some((decision) => decision.status !== "verified")) {
        return { status: "blocked", reasonCode: "memory_exchange_invalid" };
    }
    if (input.compaction.status !== "eligible") {
        return { status: "blocked", reasonCode: "compaction_preservation_incomplete" };
    }
    const policy = input.longTermPolicy;
    if (policy.schemaVersion !== 1 || !policy.storageNeedReviewRequired || !policy.sensitivityReviewRequired
        || !policy.userIntentReviewRequired || !policy.agentOwnerReviewRequired || !exact(policy.policyFingerprint)) {
        return { status: "blocked", reasonCode: "long_term_policy_incomplete" };
    }
    if (input.longTermMutations.some((decision) => decision.status !== "eligible")) {
        return { status: "blocked", reasonCode: "long_term_mutation_ineligible" };
    }
    const proposalFingerprint = exact(input.proposalFingerprint);
    const baselineFingerprint = exact(input.baselineFingerprint);
    const proposedFingerprint = exact(input.proposedFingerprint);
    const goalSection3Fingerprint = exact(input.goalSection3Fingerprint);
    const reviewerRef = exact(input.reviewerRef);
    if (!proposalFingerprint || !baselineFingerprint || !proposedFingerprint || !goalSection3Fingerprint || !reviewerRef
        || baselineFingerprint === proposedFingerprint
        || !Number.isSafeInteger(input.reviewedAt) || input.reviewedAt < 0
        || !Number.isSafeInteger(input.expiresAt) || input.expiresAt <= input.reviewedAt) {
        return { status: "blocked", reasonCode: "memory_review_lineage_invalid" };
    }
    return {
        status: "authorized",
        receipt: {
            schemaVersion: 1,
            invariant: "memory_isolation",
            decision: "preserved",
            proposalFingerprint,
            baselineFingerprint,
            proposedFingerprint,
            goalSection3Fingerprint,
            reviewerRef,
            reviewedAt: input.reviewedAt,
            expiresAt: input.expiresAt,
            activeAgentIds: [...input.ownership.activeAgentIds],
            exchangeIds: exchanges.map((decision) => decision.status === "verified" ? decision.exchangeId : ""),
            namespaceEvidenceRef: exact(input.namespaceSeparation.evidenceRef),
            policyFingerprint: exact(policy.policyFingerprint),
        },
    };
}
export function projectMemoryIsolationInvariantReview(input) {
    const receipt = input.receipt;
    if (receipt.schemaVersion !== 1 || receipt.invariant !== "memory_isolation" || receipt.decision !== "preserved"
        || !exact(receipt.baselineFingerprint) || !exact(receipt.proposedFingerprint)
        || receipt.baselineFingerprint === receipt.proposedFingerprint || !exact(receipt.reviewerRef)
        || !exact(receipt.namespaceEvidenceRef) || !exact(receipt.policyFingerprint)
        || receipt.activeAgentIds.length === 0 || !unique(receipt.activeAgentIds) || !unique(receipt.exchangeIds)
        || !Number.isSafeInteger(receipt.reviewedAt) || !Number.isSafeInteger(receipt.expiresAt)
        || !Number.isSafeInteger(input.now) || receipt.reviewedAt > input.now) {
        return { status: "blocked", reasonCode: "memory_review_receipt_invalid" };
    }
    if (receipt.expiresAt <= input.now)
        return { status: "blocked", reasonCode: "memory_review_expired" };
    if (receipt.proposalFingerprint !== exact(input.expectedProposalFingerprint)) {
        return { status: "blocked", reasonCode: "memory_review_scope_mismatch" };
    }
    if (receipt.goalSection3Fingerprint !== exact(input.currentGoalSection3Fingerprint)) {
        return { status: "blocked", reasonCode: "goal_section3_lineage_mismatch" };
    }
    return {
        status: "authorized",
        review: {
            invariant: "memory_isolation",
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
//# sourceMappingURL=prompt-improvement-memory-invariants.js.map