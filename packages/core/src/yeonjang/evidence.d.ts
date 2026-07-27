import type { YeonjangToolMapping, YeonjangToolRiskLevel } from "./tool-mapping.js";
export type YeonjangEvidencePostCheck = {
    kind: "not_required";
} | {
    kind: "verified" | "failed" | "unverifiable";
    verified: boolean;
    exists?: boolean;
    bytes?: number;
    artifactRef?: string;
    mimeType?: string;
    reason?: string;
} | {
    kind: "goal_validated";
    verified: true;
    diagnosisReceiptId: string;
    diagnosisTarget: "result_diagnosis";
    diagnosisSubjectKind: "validation_result" | "tool_result";
    evidenceRefs: string[];
};
export interface YeonjangEvidenceEnvelope {
    schemaVersion: "yeonjang-evidence-v1";
    targetRef: string;
    toolName: string;
    methodIds: string[];
    group: string;
    riskLevel: YeonjangToolRiskLevel;
    requiresApproval: boolean;
    collectedAt: number;
    summary: string;
    postCheck: YeonjangEvidencePostCheck;
    rawPayloadVisibility: "audit_only";
}
export interface BuildYeonjangEvidenceEnvelopeInput {
    targetRef: string;
    toolName: string;
    methodIds: string[];
    group: string;
    riskLevel: YeonjangToolRiskLevel;
    requiresApproval: boolean;
    summary: string;
    postCheck: YeonjangEvidencePostCheck;
    collectedAt?: number;
}
export declare function buildYeonjangEvidenceEnvelope(input: BuildYeonjangEvidenceEnvelopeInput): YeonjangEvidenceEnvelope;
export declare function buildYeonjangGoalValidatedPostCheck(input: {
    diagnosisReceiptId: string;
    diagnosisSubjectKind?: "validation_result" | "tool_result";
    evidenceRefs: string[];
}): Extract<YeonjangEvidencePostCheck, {
    kind: "goal_validated";
}>;
export declare function buildYeonjangEvidenceFromMapping(input: {
    mapping: YeonjangToolMapping;
    targetRef: string;
    summary: string;
    postCheck: YeonjangEvidencePostCheck;
    collectedAt?: number;
}): YeonjangEvidenceEnvelope;
//# sourceMappingURL=evidence.d.ts.map