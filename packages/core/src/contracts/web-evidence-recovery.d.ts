import type { WebEvidenceVerificationResult } from "./web-evidence-verifier.js";
import type { WebResearchFingerprint, WebResearchMethodCandidate } from "./web-research-method.js";
export type WebEvidenceRecoveryCandidate = WebResearchMethodCandidate & Readonly<{
    factKey: string;
}>;
export type WebEvidenceRecoveryDirective = Readonly<{
    action: "continue";
    packFingerprint: `sha256:${string}`;
    candidates: readonly WebEvidenceRecoveryCandidate[];
}> | Readonly<{
    action: "blocked";
    packFingerprint: `sha256:${string}`;
    candidates: readonly [];
}>;
export type WebEvidenceRecoveryAdmission = Readonly<{
    ok: true;
    value: WebEvidenceRecoveryDirective;
}> | Readonly<{
    ok: false;
    reasonCode: "web_evidence_recovery_input_invalid" | "web_evidence_recovery_receipt_invalid" | "web_evidence_recovery_pack_mismatch" | "web_evidence_recovery_candidate_invalid" | "web_evidence_recovery_strategy_unchanged" | "web_evidence_recovery_blocked_not_admitted" | "web_evidence_recovery_cancelled";
}>;
export declare function admitWebEvidenceRecovery(input: Readonly<{
    receipt: unknown;
    verification: WebEvidenceVerificationResult;
    attemptedStrategyFingerprints: readonly WebResearchFingerprint[];
    blockedAllowed: boolean;
}>): WebEvidenceRecoveryAdmission;
//# sourceMappingURL=web-evidence-recovery.d.ts.map