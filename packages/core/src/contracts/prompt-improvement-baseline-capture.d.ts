import { type PromptImprovementRollbackSourceType } from "./prompt-rollback-source-policy.js";
import { type PromptRollbackVerificationMethod } from "./prompt-change-rollback-readiness.js";
import { type PromptImprovementHarnessGuardrail } from "./harness-guardrails.js";
export declare const REQUIRED_PROMPT_IMPROVEMENT_REGRESSION_AREAS: readonly ["identity", "delegation", "memory_isolation", "yeonjang", "prompt_activation"];
export type PromptImprovementRegressionArea = typeof REQUIRED_PROMPT_IMPROVEMENT_REGRESSION_AREAS[number];
export type PromptImprovementBaselineChangeKind = "prompt" | "harness";
export type PromptImprovementBaselineRollbackSourceType = Exclude<PromptImprovementRollbackSourceType, "release_artifact_version">;
export declare const PROMPT_IMPROVEMENT_BASELINE_ROLLBACK_SOURCE_TYPES: readonly PromptImprovementBaselineRollbackSourceType[];
export interface PromptImprovementSourceBaseline {
    sourceRef: string;
    sourceKind: PromptImprovementBaselineChangeKind;
    baselineVersion: string;
    beforeChecksum: string;
    summary: string;
    summarySourceRefs: readonly string[];
    capturedAt: number;
    sourceLastModifiedAt: number;
    evidenceRef: string;
}
export interface PromptImprovementActiveHarnessBaseline {
    version: string;
    checksum: string;
    controllingChecksum: string;
    capturedAt: number;
    evidenceRef: string;
}
export interface PromptImprovementInvariantSnapshot {
    area: PromptImprovementRegressionArea;
    invariantRef: string;
    evidenceRef: string;
}
export interface PromptImprovementRegressionTestSnapshot {
    area: PromptImprovementRegressionArea;
    testRef: string;
    evidenceRef: string;
}
export interface PromptImprovementHarnessGuardrailSnapshot {
    guardrail: PromptImprovementHarnessGuardrail;
    currentRuleRef: string;
    evidenceRef: string;
}
export interface PromptImprovementBaselineRollbackTarget {
    targetSourceRef: string;
    targetBaselineVersion: string;
    targetBaselineChecksum: string;
    sourceType: PromptImprovementRollbackSourceType;
    sourceRef: string;
    executorId: string;
    verificationMethod: PromptRollbackVerificationMethod | string;
    evidenceRef: string;
}
export interface PromptImprovementBaselineCaptureInput {
    runId: string;
    actor: string;
    triggerSource: string;
    changeKind: PromptImprovementBaselineChangeKind;
    capturedAt: number;
    draftRequestedAt: number;
    targetPromptSources: string[];
    targetHarnessSources: string[];
    sourceBaselines: PromptImprovementSourceBaseline[];
    activeHarness: PromptImprovementActiveHarnessBaseline;
    affectedAreas: PromptImprovementRegressionArea[];
    invariantSnapshots: PromptImprovementInvariantSnapshot[];
    regressionTests: PromptImprovementRegressionTestSnapshot[];
    harnessGuardrails: PromptImprovementHarnessGuardrailSnapshot[];
    activationState: "unchanged";
    rollbackTargets: PromptImprovementBaselineRollbackTarget[];
}
export interface PromptImprovementBaselineCaptureReceipt {
    readonly schemaVersion: 1;
    readonly state: "baseline_captured";
    readonly runId: string;
    readonly actor: string;
    readonly triggerSource: string;
    readonly changeKind: PromptImprovementBaselineChangeKind;
    readonly capturedAt: number;
    readonly draftRequestedAt: number;
    readonly targetPromptSources: readonly string[];
    readonly targetHarnessSources: readonly string[];
    readonly sourceBaselines: readonly Readonly<PromptImprovementSourceBaseline>[];
    readonly activeHarness: Readonly<PromptImprovementActiveHarnessBaseline>;
    readonly affectedAreas: readonly PromptImprovementRegressionArea[];
    readonly invariantSnapshots: readonly Readonly<PromptImprovementInvariantSnapshot>[];
    readonly regressionTests: readonly Readonly<PromptImprovementRegressionTestSnapshot>[];
    readonly harnessGuardrails: readonly Readonly<PromptImprovementHarnessGuardrailSnapshot>[];
    readonly activationState: "unchanged";
    readonly rollbackTargets: readonly Readonly<PromptImprovementBaselineRollbackTarget>[];
}
export type PromptImprovementBaselineCaptureReasonCode = "baseline_identity_invalid" | "baseline_not_before_draft" | "target_source_invalid" | "harness_fields_not_allowed" | "harness_target_required" | "source_baseline_coverage_invalid" | "source_baseline_invalid" | "source_summary_scope_invalid" | "source_checksum_not_pre_write" | "active_harness_missing" | "active_harness_invalid" | "active_harness_mismatch" | "active_harness_not_pre_draft" | "activation_state_invalid" | "affected_area_invalid" | "invariant_coverage_invalid" | "regression_test_coverage_invalid" | "harness_guardrail_coverage_invalid" | "rollback_target_coverage_invalid" | "rollback_source_invalid" | "rollback_source_not_allowed" | "rollback_baseline_mismatch" | "rollback_executor_missing" | "rollback_verification_missing" | "rollback_evidence_missing";
export type PromptImprovementBaselineCaptureDecision = {
    status: "authorized";
    receipt: PromptImprovementBaselineCaptureReceipt;
} | {
    status: "blocked";
    reasonCode: PromptImprovementBaselineCaptureReasonCode;
};
export declare function authorizePromptImprovementBaselineCapture(input: PromptImprovementBaselineCaptureInput): PromptImprovementBaselineCaptureDecision;
export declare function draftFromAuthorizedPromptImprovementBaseline<T>(input: {
    decision: PromptImprovementBaselineCaptureDecision;
    draft: (baseline: PromptImprovementBaselineCaptureReceipt) => Promise<T> | T;
}): Promise<{
    status: "drafted";
    baseline: PromptImprovementBaselineCaptureReceipt;
    result: T;
} | {
    status: "blocked";
    reasonCode: "baseline_not_authorized";
}>;
//# sourceMappingURL=prompt-improvement-baseline-capture.d.ts.map