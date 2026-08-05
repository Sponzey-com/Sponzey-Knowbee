export type DevelopmentChangeSeparationMode = "structural_only" | "behavior_only" | "mixed_justified";
export interface DevelopmentChangeEvidence {
    changeId: string;
    structuralChanges: string[];
    behavioralChanges: string[];
    redEvidenceRefs: string[];
    completionAssertionRefs: string[];
    separationMode: DevelopmentChangeSeparationMode;
    mixedChangeReason?: string;
    independentValidationRefs: string[];
}
export type DevelopmentChangeAdmission = {
    status: "admitted";
    changeId: string;
} | {
    status: "rejected";
    reasonCodes: Array<"change_input_invalid" | "separation_mode_mismatch" | "red_evidence_missing" | "completion_assertion_missing" | "mixed_change_reason_missing" | "independent_validation_missing">;
};
export declare function admitDevelopmentChange(input: DevelopmentChangeEvidence): DevelopmentChangeAdmission;
//# sourceMappingURL=development-change-admission.d.ts.map