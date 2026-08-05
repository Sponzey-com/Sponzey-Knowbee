import { type WebEvidencePackResult } from "../contracts/web-evidence-pack.js";
import type { WebEvidenceCompressionResult } from "../contracts/web-evidence-compression.js";
import type { TokenEstimatorPort, WebResearchContextBudget } from "../contracts/web-research-context-budget.js";
export interface WebEvidenceReviewPort {
    reviewEvidence(input: Readonly<{
        requestGoal: string;
        requiredFactKeys: readonly string[];
        budgetFingerprint: `sha256:${string}`;
        evidenceSnapshotFingerprint: `sha256:${string}`;
        units: readonly WebEvidenceCompressionResult["units"][number][];
    }>): Promise<unknown>;
}
export declare function reviewAndAssembleWebEvidencePack(input: Readonly<{
    requestGoal: string;
    requiredFactKeys: readonly string[];
    budget: WebResearchContextBudget;
    compressionResults: readonly WebEvidenceCompressionResult[];
}>, dependencies: Readonly<{
    reviewPort: WebEvidenceReviewPort;
    estimator: TokenEstimatorPort;
}>): Promise<WebEvidencePackResult>;
//# sourceMappingURL=web-evidence-pack.d.ts.map