import { validateCanonicalPromptResponsibilityManifest, } from "../contracts/canonical-prompt-responsibility-manifest.js";
import { GOAL_REVIEW_GATE_REQUIRED_KEYS, validateGoalReviewGateReport, } from "../contracts/goal-review-gate.js";
import { auditGoalRuleOwnership, } from "./goal-ownership.js";
export function decideGoalDocumentReviewAcceptance(input) {
    const gate = validateGoalReviewGateReport(input.report);
    const ownership = auditGoalRuleOwnership({ occurrences: input.section10Occurrences });
    const manifest = validateCanonicalPromptResponsibilityManifest(input.promptManifest);
    const issues = [
        ...gate.issues.map((issue) => ({
            source: "review_gate",
            code: issue.code,
            subjectId: issue.key ?? issue.category,
        })),
        ...ownership.diagnostics.map((issue) => ({
            source: "document_ownership",
            code: issue.code,
            subjectId: issue.ruleKey,
        })),
        ...(manifest.status === "blocked"
            ? manifest.issues.map((issue) => ({
                source: "prompt_manifest",
                code: issue.code,
                subjectId: issue.subjectId,
            }))
            : []),
    ];
    if (issues.length > 0)
        return { status: "blocked", issues };
    return {
        status: "eligible",
        documentGateKeys: [...GOAL_REVIEW_GATE_REQUIRED_KEYS.documentStructure],
        moduleIds: manifest.status === "eligible" ? [...manifest.moduleIds] : [],
    };
}
//# sourceMappingURL=goal-document-review-acceptance.js.map