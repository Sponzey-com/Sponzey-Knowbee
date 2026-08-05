import { type WebEvidenceRecoveryAdmission } from "../contracts/web-evidence-recovery.js";
import type { WebEvidenceVerificationResult } from "../contracts/web-evidence-verifier.js";
import type { WebResearchFingerprint } from "../contracts/web-research-method.js";
export interface WebEvidenceRecoveryPort {
    proposeRecovery(input: Readonly<{
        runId: string;
        unresolvedFactKeys: readonly string[];
        packFingerprint: `sha256:${string}`;
        attemptedStrategyFingerprints: readonly WebResearchFingerprint[];
        allowedMethods: readonly ["search", "fetch"];
        blockedAllowed: boolean;
    }>): Promise<unknown>;
}
export declare function planWebEvidenceRecovery(input: Readonly<{
    runId: string;
    verification: WebEvidenceVerificationResult;
    attemptedStrategyFingerprints: readonly WebResearchFingerprint[];
    blockedAllowed: boolean;
    signal: AbortSignal;
}>, port: WebEvidenceRecoveryPort): Promise<WebEvidenceRecoveryAdmission>;
//# sourceMappingURL=web-evidence-recovery.d.ts.map