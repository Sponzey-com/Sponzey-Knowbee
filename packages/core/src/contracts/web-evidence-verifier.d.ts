import type { WebEvidencePack } from "./web-evidence-pack.js";
export interface WebEvidenceVerificationResult {
    readonly packFingerprint: `sha256:${string}`;
    readonly budgetFingerprint: `sha256:${string}`;
    readonly status: "sufficient" | "insufficient" | "conflicted";
    readonly answerDraft: string | null;
    readonly supportedUnitRefs: readonly string[];
    readonly unresolvedFactKeys: readonly string[];
}
export type WebEvidenceVerificationAdmission = Readonly<{
    ok: true;
    value: WebEvidenceVerificationResult;
}> | Readonly<{
    ok: false;
    reasonCode: "web_evidence_verification_input_invalid" | "web_evidence_verification_receipt_invalid" | "web_evidence_verification_fingerprint_mismatch" | "web_evidence_verification_reference_invalid" | "web_evidence_verification_fact_invalid" | "web_evidence_verification_status_invalid";
}>;
export declare function admitWebEvidenceVerification(input: Readonly<{
    receipt: unknown;
    evidencePack: WebEvidencePack;
    requiredFactKeys: readonly string[];
}>): WebEvidenceVerificationAdmission;
//# sourceMappingURL=web-evidence-verifier.d.ts.map