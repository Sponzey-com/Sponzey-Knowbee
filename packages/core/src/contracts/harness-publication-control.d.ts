import type { HighRiskVerificationDecision } from "./high-risk-improvement-verification.js";
import type { PromptActivationProjection } from "./high-risk-source-activation-evidence.js";
import type { RecursivePromptImprovementGateDecision } from "./recursive-prompt-improvement-gate.js";
export declare const CURRENT_HARNESS_CONTROL_EVIDENCE: readonly ["input", "baseline", "invariant", "approval", "regression", "rollback", "activation"];
export declare const HARNESS_STATE_MACHINE_COMPONENTS: readonly ["state", "event", "transition", "terminal", "failure", "rollback"];
export type CurrentHarnessControlEvidenceKind = typeof CURRENT_HARNESS_CONTROL_EVIDENCE[number];
export type HarnessStateMachineComponent = typeof HARNESS_STATE_MACHINE_COMPONENTS[number];
export interface CurrentHarnessControlEvidenceReceipt {
    kind: CurrentHarnessControlEvidenceKind;
    proposalFingerprint: string;
    evidenceRef: string;
}
export interface CurrentHarnessControlReceipt {
    schemaVersion: 1;
    proposalRunId: string;
    proposalFingerprint: string;
    activeHarnessVersion: string;
    activeHarnessChecksum: string;
    controllingHarnessChecksum: string;
    targetSourceRefs: string[];
    evidence: CurrentHarnessControlEvidenceReceipt[];
    issuedAt: number;
    expiresAt: number;
}
export interface HarnessStateMachineComponentReceipt {
    component: HarnessStateMachineComponent;
    proposalFingerprint: string;
    definitionRef: string;
}
export type CurrentHarnessControlDecision = {
    status: "verified";
    proposalRunId: string;
    proposalFingerprint: string;
    activeHarnessChecksum: string;
    targetSourceRefs: string[];
} | {
    status: "blocked";
    reasonCode: "control_receipt_invalid" | "control_receipt_expired" | "inactive_harness_control" | "control_evidence_invalid" | "control_evidence_missing" | "control_evidence_scope_mismatch";
    evidenceKind?: CurrentHarnessControlEvidenceKind;
};
export type HarnessStateMachineCompletenessDecision = {
    status: "complete";
    proposalFingerprint: string;
    components: readonly HarnessStateMachineComponent[];
} | {
    status: "blocked";
    reasonCode: "state_machine_component_invalid" | "state_machine_component_missing" | "state_machine_scope_mismatch";
    component?: HarnessStateMachineComponent;
};
export type HarnessPublicationDecision = {
    status: "authorized";
    proposalFingerprint: string;
    activationRunId: string;
    runtimeSnapshotFingerprint: string;
} | {
    status: "blocked";
    reasonCode: "current_harness_control_unverified" | "recursive_gate_unverified" | "proposal_scope_mismatch" | "state_machine_incomplete" | "high_risk_verification_missing" | "activation_unconfirmed" | "current_run_activation_forbidden" | "current_snapshot_activation_forbidden";
};
export declare function verifyCurrentHarnessControl(input: {
    receipt: CurrentHarnessControlReceipt;
    now: number;
}): CurrentHarnessControlDecision;
export declare function verifyHarnessStateMachineCompleteness(input: {
    proposalFingerprint: string;
    components: readonly HarnessStateMachineComponentReceipt[];
}): HarnessStateMachineCompletenessDecision;
export declare function authorizeHarnessPublication(input: {
    control: CurrentHarnessControlDecision;
    recursiveGate: RecursivePromptImprovementGateDecision;
    stateMachine: HarnessStateMachineCompletenessDecision;
    highRisk: HighRiskVerificationDecision;
    activation: PromptActivationProjection;
    currentRuntimeSnapshotFingerprint: string;
}): HarnessPublicationDecision;
export declare function publishAuthorizedHarness<T>(input: {
    decision: HarnessPublicationDecision;
    publish: (authorization: Extract<HarnessPublicationDecision, {
        status: "authorized";
    }>) => Promise<T>;
}): Promise<{
    status: "published";
    result: T;
} | Extract<HarnessPublicationDecision, {
    status: "blocked";
}>>;
//# sourceMappingURL=harness-publication-control.d.ts.map