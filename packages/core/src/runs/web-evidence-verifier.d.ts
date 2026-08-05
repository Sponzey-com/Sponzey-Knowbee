import { type WebEvidenceVerificationAdmission } from "../contracts/web-evidence-verifier.js";
import type { WebEvidencePack } from "../contracts/web-evidence-pack.js";
export interface WebEvidenceVerifierPort {
    verifyEvidence(input: Readonly<{
        requestGoal: string;
        requiredFactKeys: readonly string[];
        evidencePack: WebEvidencePack;
    }>): Promise<unknown>;
}
export declare function verifyWebEvidencePack(input: Readonly<{
    requestGoal: string;
    requiredFactKeys: readonly string[];
    evidencePack: WebEvidencePack;
}>, port: WebEvidenceVerifierPort): Promise<WebEvidenceVerificationAdmission>;
//# sourceMappingURL=web-evidence-verifier.d.ts.map