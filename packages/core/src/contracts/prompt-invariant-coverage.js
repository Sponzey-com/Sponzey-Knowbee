export const PROMPT_IMPROVEMENT_IMPACT_KINDS = [
    "identity",
    "delegation",
    "memory",
    "yeonjang",
    "tool_mcp",
    "safety",
    "recursive_ownership",
];
const REQUIRED_INVARIANT_BY_IMPACT = {
    identity: "product_identity",
    delegation: "delegation_rules",
    memory: "memory_isolation",
    yeonjang: "tool_boundary",
    tool_mcp: "tool_boundary",
    safety: "safety_rules",
    recursive_ownership: "delegation_rules",
};
function required(value, field) {
    const normalized = value.trim();
    if (!normalized)
        throw new Error(`${field} is required.`);
    return normalized;
}
function timestamp(value, field) {
    if (!Number.isSafeInteger(value) || value < 0)
        throw new Error(`${field} must be a non-negative integer.`);
    return value;
}
function sameSet(left, right) {
    return left.length === right.length && new Set(left).size === left.length
        && new Set(right).size === right.length && left.every((item) => right.includes(item));
}
function impacts(values) {
    if (values.length === 0 || new Set(values).size !== values.length)
        return undefined;
    if (values.some((value) => !PROMPT_IMPROVEMENT_IMPACT_KINDS.includes(value)))
        return undefined;
    return PROMPT_IMPROVEMENT_IMPACT_KINDS.filter((value) => values.includes(value));
}
function validateRuleSnapshots(input) {
    const canonical = new Map();
    for (const rule of input.canonicalRules) {
        const ruleId = required(rule.ruleId, "Canonical rule ID");
        required(rule.semanticChecksum, "Canonical semantic checksum");
        if (canonical.has(ruleId))
            return "harness_projection_orphan";
        canonical.set(ruleId, rule);
    }
    if (canonical.size === 0)
        return "harness_projection_missing";
    const projectionsByCanonical = new Map();
    const projectionIds = new Set();
    for (const projection of input.harnessProjectionRules) {
        const projectionRuleId = required(projection.projectionRuleId, "Harness projection rule ID");
        const canonicalRuleId = required(projection.canonicalRuleId, "Canonical rule reference");
        required(projection.semanticChecksum, "Harness projection semantic checksum");
        if (projectionIds.has(projectionRuleId) || !canonical.has(canonicalRuleId))
            return "harness_projection_orphan";
        projectionIds.add(projectionRuleId);
        const entries = projectionsByCanonical.get(canonicalRuleId) ?? [];
        entries.push(projection);
        projectionsByCanonical.set(canonicalRuleId, entries);
    }
    if ([...canonical.keys()].some((ruleId) => !projectionsByCanonical.has(ruleId))) {
        return "harness_projection_missing";
    }
    if ([...projectionsByCanonical.values()].some((entries) => entries.length !== 1)) {
        return "harness_projection_orphan";
    }
    const corrections = [];
    for (const [ruleId, rule] of canonical) {
        const projection = projectionsByCanonical.get(ruleId)[0];
        if (projection.semanticChecksum !== rule.semanticChecksum || projection.enforcement !== rule.enforcement) {
            corrections.push({
                projectionRuleId: projection.projectionRuleId,
                authoritativeRuleId: ruleId,
                authoritativeSemanticChecksum: rule.semanticChecksum,
                authoritativeEnforcement: rule.enforcement,
            });
        }
    }
    return { corrections };
}
export function authorizePromptInvariantCoverage(input) {
    const proposalFingerprint = required(input.proposalFingerprint, "Proposal fingerprint");
    const sourceSetFingerprint = required(input.sourceSetFingerprint, "Source set fingerprint");
    const goalSection3Fingerprint = required(input.goalSection3Fingerprint, "GOAL section-3 fingerprint");
    const reviewerRef = required(input.reviewerRef, "Reviewer reference");
    const targetOwnerAgentId = required(input.targetOwnerAgentId, "Target owner agent ID");
    const configuredMainAgentId = required(input.configuredMainAgentId, "Configured main agent ID");
    const reviewedAt = timestamp(input.reviewedAt, "Coverage review time");
    const expiresAt = timestamp(input.expiresAt, "Coverage review expiry");
    if (expiresAt <= reviewedAt)
        return { status: "blocked", reasonCode: "invariant_review_expired" };
    const declared = impacts(input.declaredImpacts);
    const analyzed = impacts(input.analyzedImpacts);
    if (!declared || !analyzed || !sameSet(declared, analyzed)) {
        return { status: "blocked", reasonCode: "impact_scope_mismatch" };
    }
    const coverageByImpact = new Map();
    for (const evidence of input.coverage) {
        if (!analyzed.includes(evidence.impact))
            return { status: "blocked", reasonCode: "impact_scope_mismatch" };
        if (coverageByImpact.has(evidence.impact))
            return { status: "blocked", reasonCode: "invariant_review_duplicate" };
        coverageByImpact.set(evidence.impact, evidence);
    }
    if (analyzed.some((impact) => !coverageByImpact.has(impact))) {
        return { status: "blocked", reasonCode: "invariant_review_missing" };
    }
    const applicationReviews = new Map();
    const coverageEvidenceRefs = [];
    for (const impact of analyzed) {
        const evidence = coverageByImpact.get(impact);
        coverageEvidenceRefs.push(required(evidence.evidenceRef, "Invariant coverage evidence reference"));
        if (evidence.goalSection3Fingerprint !== goalSection3Fingerprint) {
            return { status: "blocked", reasonCode: "goal_section3_lineage_mismatch" };
        }
        const review = evidence.review;
        timestamp(review.reviewedAt, "Invariant review time");
        timestamp(review.expiresAt, "Invariant review expiry");
        if (review.reviewedAt > reviewedAt || review.expiresAt <= reviewedAt) {
            return { status: "blocked", reasonCode: "invariant_review_expired" };
        }
        if (review.invariant !== REQUIRED_INVARIANT_BY_IMPACT[impact]
            || review.proposalFingerprint !== proposalFingerprint
            || !review.baselineFingerprint.trim()
            || !review.proposedFingerprint.trim()
            || !review.reviewerRef.trim()) {
            return { status: "blocked", reasonCode: "invariant_review_scope_mismatch" };
        }
        if (review.decision !== "preserved")
            return { status: "blocked", reasonCode: "invariant_not_preserved" };
        if (evidence.applicationReview) {
            if (applicationReviews.has(review.invariant)) {
                return { status: "blocked", reasonCode: "application_review_duplicate" };
            }
            applicationReviews.set(review.invariant, review);
        }
    }
    const requiredApplicationInvariants = new Set(analyzed.map((impact) => REQUIRED_INVARIANT_BY_IMPACT[impact]));
    if ([...requiredApplicationInvariants].some((invariant) => !applicationReviews.has(invariant))) {
        return { status: "blocked", reasonCode: "application_review_missing" };
    }
    const ruleValidation = validateRuleSnapshots(input);
    if (typeof ruleValidation === "string")
        return { status: "blocked", reasonCode: ruleValidation };
    if (ruleValidation.corrections.length > 0) {
        return { status: "blocked", reasonCode: "goal_section3_conflict", corrections: ruleValidation.corrections };
    }
    let mainReviewId;
    if (input.ownershipMode === "common_policy") {
        if (targetOwnerAgentId !== configuredMainAgentId) {
            return { status: "blocked", reasonCode: "common_policy_final_review_scope_mismatch" };
        }
        const decision = input.platformSourceDecision;
        if (!decision)
            return { status: "blocked", reasonCode: "common_policy_final_review_missing" };
        if (decision.status !== "authorized") {
            return { status: "blocked", reasonCode: "common_policy_final_review_blocked" };
        }
        const authorization = decision.authorization;
        if (authorization.proposalFingerprint !== proposalFingerprint
            || authorization.sourceSetFingerprint !== sourceSetFingerprint
            || authorization.impact === "agent_owned_only"
            || !authorization.mainReviewId?.trim()) {
            return { status: "blocked", reasonCode: "common_policy_final_review_scope_mismatch" };
        }
        mainReviewId = authorization.mainReviewId;
    }
    else {
        const ownershipReview = input.ownershipReview;
        if (!ownershipReview)
            return { status: "blocked", reasonCode: "agent_ownership_review_missing" };
        if (ownershipReview.reviewedAgentId !== targetOwnerAgentId
            || ownershipReview.decision.status !== "authorized"
            || ownershipReview.decision.proposalFingerprint !== proposalFingerprint) {
            return { status: "blocked", reasonCode: "agent_ownership_review_scope_mismatch" };
        }
    }
    return {
        status: "authorized",
        receipt: {
            schemaVersion: 1,
            proposalFingerprint,
            sourceSetFingerprint,
            goalSection3Fingerprint,
            coveredImpacts: analyzed,
            ownershipMode: input.ownershipMode,
            targetOwnerAgentId,
            reviewerRef,
            reviewedAt,
            expiresAt,
            mainReviewId,
            coverageEvidenceRefs,
            canonicalRuleIds: input.canonicalRules.map((rule) => rule.ruleId),
            applicationInvariantNames: [...requiredApplicationInvariants],
        },
        applicationReviews: [...applicationReviews.values()],
    };
}
//# sourceMappingURL=prompt-invariant-coverage.js.map