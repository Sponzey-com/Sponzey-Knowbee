import { type CanonicalPromptManifestIssueCode, type CanonicalPromptModuleId, type CanonicalPromptResponsibilityManifestEntry } from "../contracts/canonical-prompt-responsibility-manifest.js";
import { type GoalReviewGateIssueCode, type GoalReviewGateReport } from "../contracts/goal-review-gate.js";
import { type GoalDocumentRuleOccurrence, type GoalDocumentRuleOwnershipIssueCode } from "./goal-ownership.js";
export type GoalDocumentReviewIssue = {
    source: "review_gate";
    code: GoalReviewGateIssueCode;
    subjectId: string;
} | {
    source: "document_ownership";
    code: GoalDocumentRuleOwnershipIssueCode;
    subjectId: string;
} | {
    source: "prompt_manifest";
    code: CanonicalPromptManifestIssueCode;
    subjectId: string;
};
export type GoalDocumentReviewAcceptanceDecision = {
    status: "eligible";
    documentGateKeys: string[];
    moduleIds: CanonicalPromptModuleId[];
} | {
    status: "blocked";
    issues: GoalDocumentReviewIssue[];
};
export declare function decideGoalDocumentReviewAcceptance(input: {
    report: Partial<GoalReviewGateReport>;
    section10Occurrences: readonly GoalDocumentRuleOccurrence[];
    promptManifest: readonly CanonicalPromptResponsibilityManifestEntry[];
}): GoalDocumentReviewAcceptanceDecision;
//# sourceMappingURL=goal-document-review-acceptance.d.ts.map