export declare const IMPROVEMENT_VALIDATION_EVIDENCE_KINDS: readonly ["deterministic_test", "static_validation", "contract_regression", "live_model"];
export declare const INDEPENDENT_IMPROVEMENT_VALIDATION_KINDS: readonly ["deterministic_test", "static_validation", "contract_regression"];
export type ImprovementValidationEvidenceKind = typeof IMPROVEMENT_VALIDATION_EVIDENCE_KINDS[number];
export type IndependentImprovementValidationKind = typeof INDEPENDENT_IMPROVEMENT_VALIDATION_KINDS[number];
export interface ImprovementValidationEvidenceReceipt {
    proposalFingerprint: string;
    kind: ImprovementValidationEvidenceKind;
    status: "passed" | "failed";
    validatorId: string;
    evidenceRef: string;
    validatedAt: number;
}
export type ImprovementValidationDecision = {
    status: "authorized";
    proposalFingerprint: string;
    independentKinds: IndependentImprovementValidationKind[];
    evidenceRefs: string[];
} | {
    status: "blocked";
    reasonCode: "validation_evidence_invalid" | "validation_failed" | "independent_validation_missing";
};
export declare function authorizeImprovementValidation(input: {
    proposalFingerprint: string;
    evidence: readonly ImprovementValidationEvidenceReceipt[];
    now: number;
}): ImprovementValidationDecision;
export declare function activateValidatedImprovement<T>(input: {
    decision: ImprovementValidationDecision;
    activate: (authorization: Extract<ImprovementValidationDecision, {
        status: "authorized";
    }>) => Promise<T>;
}): Promise<{
    status: "activated";
    result: T;
} | Extract<ImprovementValidationDecision, {
    status: "blocked";
}>>;
//# sourceMappingURL=improvement-validation-evidence.d.ts.map