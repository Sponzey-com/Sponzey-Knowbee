export function buildYeonjangEvidenceEnvelope(input) {
    const targetRef = input.targetRef.trim();
    const toolName = input.toolName.trim();
    const methodIds = input.methodIds.map((method) => method.trim()).filter(Boolean);
    const summary = input.summary.trim();
    if (!targetRef)
        throw new Error("YEONJANG_EVIDENCE_TARGET_REF_MISSING");
    if (!toolName)
        throw new Error("YEONJANG_EVIDENCE_TOOL_NAME_MISSING");
    if (methodIds.length === 0)
        throw new Error("YEONJANG_EVIDENCE_METHOD_IDS_MISSING");
    if (!summary)
        throw new Error("YEONJANG_EVIDENCE_SUMMARY_MISSING");
    return {
        schemaVersion: "yeonjang-evidence-v1",
        targetRef,
        toolName,
        methodIds,
        group: input.group,
        riskLevel: input.riskLevel,
        requiresApproval: input.requiresApproval,
        collectedAt: input.collectedAt ?? Date.now(),
        summary,
        postCheck: input.postCheck,
        rawPayloadVisibility: "audit_only",
    };
}
export function buildYeonjangGoalValidatedPostCheck(input) {
    const diagnosisReceiptId = input.diagnosisReceiptId.trim();
    const evidenceRefs = input.evidenceRefs.map((ref) => ref.trim()).filter(Boolean);
    if (!diagnosisReceiptId)
        throw new Error("YEONJANG_GOAL_VALIDATION_DIAGNOSIS_RECEIPT_MISSING");
    if (evidenceRefs.length === 0)
        throw new Error("YEONJANG_GOAL_VALIDATION_EVIDENCE_REFS_MISSING");
    return {
        kind: "goal_validated",
        verified: true,
        diagnosisReceiptId,
        diagnosisTarget: "result_diagnosis",
        diagnosisSubjectKind: input.diagnosisSubjectKind ?? "validation_result",
        evidenceRefs,
    };
}
export function buildYeonjangEvidenceFromMapping(input) {
    return buildYeonjangEvidenceEnvelope({
        targetRef: input.targetRef,
        toolName: input.mapping.toolName,
        methodIds: [...input.mapping.methodIds],
        group: input.mapping.group,
        riskLevel: input.mapping.riskLevel,
        requiresApproval: input.mapping.requiresApproval,
        summary: input.summary,
        postCheck: input.postCheck,
        ...(input.collectedAt != null ? { collectedAt: input.collectedAt } : {}),
    });
}
//# sourceMappingURL=evidence.js.map