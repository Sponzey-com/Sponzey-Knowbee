function required(value, field) {
    const normalized = value.trim();
    if (!normalized)
        throw new Error(`${field} is required.`);
    return normalized;
}
function uniqueSet(values, field) {
    const normalized = values.map((value) => required(value, field));
    if (new Set(normalized).size !== normalized.length)
        throw new Error(`${field} values must be unique.`);
    return new Set(normalized);
}
export function evaluateWorkBoundMemoryHandoff(input) {
    const handoffId = required(input.handoffId, "Handoff ID");
    const sourceAgentId = required(input.sourceAgentId, "Source agent ID");
    const recipientAgentId = required(input.recipientAgentId, "Recipient agent ID");
    const assignedWorkId = required(input.assignedWorkId, "Assigned work ID");
    const receiptWorkId = required(input.receiptWorkId, "Receipt work ID");
    const issueCodes = new Set();
    if (sourceAgentId === recipientAgentId)
        issueCodes.add("handoff_owner_same");
    if (assignedWorkId !== receiptWorkId)
        issueCodes.add("handoff_work_mismatch");
    if (!input.purpose.trim())
        issueCodes.add("handoff_purpose_missing");
    const allowedFields = uniqueSet(input.allowedPayloadFieldNames, "Allowed payload field");
    if ([...uniqueSet(input.payloadFieldNames, "Payload field")].some((field) => !allowedFields.has(field)))
        issueCodes.add("handoff_payload_field_not_allowed");
    const allowedRefs = uniqueSet(input.allowedContextRefs, "Allowed context ref");
    if ([...uniqueSet(input.contextRefs, "Context ref")].some((ref) => !allowedRefs.has(ref)))
        issueCodes.add("handoff_context_ref_not_allowed");
    if (uniqueSet(input.provenanceRefs, "Provenance ref").size === 0)
        issueCodes.add("handoff_provenance_missing");
    if (input.containsRawMemory)
        issueCodes.add("handoff_raw_memory_forbidden");
    if (input.containsUnrelatedHistory)
        issueCodes.add("handoff_unrelated_history_forbidden");
    if (input.grantsLongTermRetention)
        issueCodes.add("handoff_long_term_grant_forbidden");
    if (!Number.isFinite(input.expiresAt) || !Number.isFinite(input.evaluatedAt) || input.expiresAt <= input.evaluatedAt)
        issueCodes.add("handoff_expired");
    return issueCodes.size > 0 ? { status: "blocked", issueCodes: [...issueCodes] } : { status: "eligible", handoffId };
}
function positiveInteger(value, field) {
    if (!Number.isSafeInteger(value) || value <= 0)
        throw new Error(`${field} must be a positive integer.`);
    return value;
}
export function evaluateShortTermCompaction(input) {
    const tokenThreshold = positiveInteger(input.policy.tokenThreshold, "Token threshold");
    const messageThreshold = positiveInteger(input.policy.messageThreshold, "Message threshold");
    const protectedRecent = positiveInteger(input.policy.protectedRecentMessageCount, "Protected recent message count");
    const policyVersion = required(input.policy.policyVersion, "Compaction policy version");
    if (!Number.isSafeInteger(input.currentTokenEstimate) || input.currentTokenEstimate < 0)
        throw new Error("Current token estimate must be a non-negative integer.");
    if (!Number.isSafeInteger(input.currentMessageCount) || input.currentMessageCount < 0)
        throw new Error("Current message count must be a non-negative integer.");
    if (input.currentTokenEstimate <= tokenThreshold && input.currentMessageCount <= messageThreshold)
        return { status: "no_op", reasonCode: "threshold_not_exceeded" };
    const ordered = [...input.segments].sort((a, b) => a.ordinal - b.ordinal);
    const protectedOrdinals = new Set(ordered.slice(-protectedRecent).map((segment) => segment.ordinal));
    const candidates = ordered.filter((segment) => !protectedOrdinals.has(segment.ordinal) && !segment.pinned && !segment.activeWork && !segment.activeDelegation &&
        !segment.unresolvedToolResult && !segment.provisionalDecision && segment.messageCount > 0);
    return candidates.length > 0
        ? { status: "eligible", candidateSegmentIds: candidates.map((segment) => required(segment.segmentId, "Segment ID")), policyVersion }
        : { status: "blocked", reasonCode: "no_safe_compaction_candidate" };
}
export async function runEligibleMemoryOperation(input) {
    if (!input.eligible)
        return { status: "blocked" };
    return { status: "executed", result: await input.run() };
}
//# sourceMappingURL=memory-handoff-compaction.js.map