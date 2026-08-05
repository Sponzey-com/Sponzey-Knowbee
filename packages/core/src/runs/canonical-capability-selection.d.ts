import type { CapabilitySelectionCandidateContext, LlmCapabilitySelectionAdmission, LlmCapabilitySelectionAttemptProvider, LlmCapabilitySelectionContext, LlmCapabilitySelectionRejectionCode, LlmCapabilitySelectionSchemaRepairProvider } from "../contracts/llm-capability-selection.js";
import type { CapabilitySelectionDecisionTraceSink } from "../contracts/capability-selection-decision-trace.js";
import type { CanonicalCapabilitySnapshotProjection } from "./canonical-capability-snapshot.js";
import { type CapabilitySelectionSkillBinding, type CapabilitySelectionSkillDefinition } from "./capability-selection-snapshot.js";
import type { InstructionSkillRunSnapshot, InstructionSkillSnapshotFinding } from "./instruction-skill-snapshot.js";
export interface CanonicalCapabilitySelectionInput {
    runId: string;
    ownerAgentId: string;
    canonicalSnapshot: CanonicalCapabilitySnapshotProjection & {
        snapshotId: string;
        fingerprint: `sha256:${string}`;
    };
    methodConstraints: {
        requestedMethods: string[];
        exclusiveMethods: string[];
        targetId?: string | undefined;
    };
    selectionContext: LlmCapabilitySelectionContext;
    skillDefinitions: readonly CapabilitySelectionSkillDefinition[];
    skillBindings: readonly CapabilitySelectionSkillBinding[];
    instructionSkills: readonly InstructionSkillRunSnapshot[];
    instructionSkillFindings: readonly InstructionSkillSnapshotFinding[];
    setupFailureReasonCode?: "capability_selection_catalog_invalid" | undefined;
    provider?: (LlmCapabilitySelectionAttemptProvider & Partial<LlmCapabilitySelectionSchemaRepairProvider>) | undefined;
    traceSink?: CapabilitySelectionDecisionTraceSink | undefined;
    externalTransferAllowed: boolean;
    maxCost: "none" | "low" | "high";
}
export type CanonicalCapabilitySelectionResult = {
    ok: true;
    mode: "explicit_method";
} | {
    ok: true;
    mode: "selected";
    capabilitySnapshotFingerprint: `sha256:${string}`;
    admission: Extract<LlmCapabilitySelectionAdmission, {
        status: "allowed" | "approval_required";
    }>;
    selectedCandidateContext: CapabilitySelectionCandidateContext | null;
    decisionTraceId?: string | undefined;
} | {
    ok: false;
    reasonCode: "capability_selection_provider_unavailable" | "capability_selection_catalog_invalid" | "capability_selection_snapshot_invalid" | "capability_selection_context_invalid" | "capability_selection_provider_failed" | "capability_selection_timed_out" | "capability_selection_output_limit_exceeded" | "capability_selection_invalid_output" | "capability_selection_trace_failed" | "capability_selection_cancelled" | "capability_selection_rejected";
    rejectionReasonCodes?: LlmCapabilitySelectionRejectionCode[] | undefined;
    failureReasonCodes?: string[] | undefined;
    decisionTraceId?: string | undefined;
    strategyFingerprints?: string[] | undefined;
};
export declare function authorizeCanonicalCapabilitySelection(input: CanonicalCapabilitySelectionInput): Promise<CanonicalCapabilitySelectionResult>;
//# sourceMappingURL=canonical-capability-selection.d.ts.map