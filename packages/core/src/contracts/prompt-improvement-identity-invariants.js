import { DEFAULT_MAIN_AGENT_NAME_EN, DEFAULT_MAIN_AGENT_NAME_KO, KNOWBEE_PRODUCT_NAME, KNOWBEE_PRODUCT_NAME_KO, } from "./product-identity.js";
const IDENTITY_FIELDS = ["agentId", "agentName"];
function exact(value) {
    return value?.trim() ?? "";
}
function normalizedName(value) {
    return value.normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase("en-US");
}
function hasOnlyIdentityFields(value) {
    const keys = Object.keys(value).sort();
    return keys.length === IDENTITY_FIELDS.length && IDENTITY_FIELDS.every((field) => keys.includes(field));
}
export function auditPromptImprovementIdentitySnapshot(snapshot) {
    if (snapshot.productName !== KNOWBEE_PRODUCT_NAME || snapshot.productNameKo !== KNOWBEE_PRODUCT_NAME_KO) {
        return { status: "blocked", reasonCode: "product_identity_mismatch" };
    }
    const configuredMainAgentId = exact(snapshot.configuredMainAgentId);
    if (!configuredMainAgentId)
        return { status: "blocked", reasonCode: "main_agent_identity_invalid" };
    if (snapshot.agents.length === 0)
        return { status: "blocked", reasonCode: "agent_identity_invalid" };
    const ids = new Set();
    const names = new Set();
    const agents = new Map();
    const normalizedAgentNames = [];
    for (const agent of snapshot.agents) {
        if (!hasOnlyIdentityFields(agent))
            return { status: "blocked", reasonCode: "agent_identity_field_invalid" };
        const agentId = exact(agent.agentId);
        const agentName = exact(agent.agentName);
        if (!agentId || !agentName || ids.has(agentId))
            return { status: "blocked", reasonCode: "agent_identity_invalid" };
        const normalized = normalizedName(agentName);
        if (names.has(normalized))
            return { status: "blocked", reasonCode: "agent_name_duplicate" };
        ids.add(agentId);
        names.add(normalized);
        agents.set(agentId, agentName);
        normalizedAgentNames.push(agentName);
    }
    const mainAgentName = agents.get(configuredMainAgentId);
    if (!mainAgentName)
        return { status: "blocked", reasonCode: "main_agent_identity_invalid" };
    const configuredMainAgentName = exact(snapshot.configuredMainAgentName);
    const effectiveMainAgentName = configuredMainAgentName
        || (snapshot.responseLanguage === "ko" ? DEFAULT_MAIN_AGENT_NAME_KO : DEFAULT_MAIN_AGENT_NAME_EN);
    if (mainAgentName !== effectiveMainAgentName)
        return { status: "blocked", reasonCode: "main_agent_name_mismatch" };
    const userName = exact(snapshot.userName);
    if (userName && normalizedName(userName) === normalizedName(effectiveMainAgentName)) {
        return { status: "blocked", reasonCode: "user_agent_name_collision" };
    }
    if (snapshot.userFacingAgentFields.length !== 1 || snapshot.userFacingAgentFields[0] !== "agentName") {
        return { status: "blocked", reasonCode: "user_facing_identity_exposed" };
    }
    if (snapshot.responseAttributions.length !== agents.size) {
        return { status: "blocked", reasonCode: "response_attribution_incomplete" };
    }
    const attributed = new Set();
    for (const attribution of snapshot.responseAttributions) {
        if (!hasOnlyIdentityFields(attribution))
            return { status: "blocked", reasonCode: "response_attribution_mismatch" };
        const agentId = exact(attribution.agentId);
        if (attributed.has(agentId) || agents.get(agentId) !== exact(attribution.agentName)) {
            return { status: "blocked", reasonCode: "response_attribution_mismatch" };
        }
        attributed.add(agentId);
    }
    if (attributed.size !== agents.size)
        return { status: "blocked", reasonCode: "response_attribution_incomplete" };
    return { status: "preserved", effectiveMainAgentName, normalizedAgentNames };
}
export function createPromptImprovementIdentityReview(input) {
    const audit = auditPromptImprovementIdentitySnapshot(input.snapshot);
    if (audit.status === "blocked")
        return audit;
    const proposalFingerprint = exact(input.proposalFingerprint);
    const baselineFingerprint = exact(input.baselineFingerprint);
    const proposedFingerprint = exact(input.proposedFingerprint);
    const goalSection3Fingerprint = exact(input.goalSection3Fingerprint);
    const reviewerRef = exact(input.reviewerRef);
    if (!proposalFingerprint || !baselineFingerprint || !proposedFingerprint || !goalSection3Fingerprint || !reviewerRef
        || baselineFingerprint === proposedFingerprint
        || !Number.isSafeInteger(input.reviewedAt) || input.reviewedAt < 0
        || !Number.isSafeInteger(input.expiresAt) || input.expiresAt <= input.reviewedAt) {
        return { status: "blocked", reasonCode: "identity_review_lineage_invalid" };
    }
    return {
        status: "authorized",
        receipt: {
            schemaVersion: 1,
            invariant: "product_identity",
            decision: "preserved",
            proposalFingerprint,
            baselineFingerprint,
            proposedFingerprint,
            goalSection3Fingerprint,
            reviewerRef,
            reviewedAt: input.reviewedAt,
            expiresAt: input.expiresAt,
            effectiveMainAgentName: audit.effectiveMainAgentName,
        },
    };
}
export function projectProductIdentityInvariantReview(input) {
    const receipt = input.receipt;
    if (receipt.schemaVersion !== 1 || receipt.invariant !== "product_identity" || receipt.decision !== "preserved"
        || !exact(receipt.baselineFingerprint) || !exact(receipt.proposedFingerprint)
        || receipt.baselineFingerprint === receipt.proposedFingerprint || !exact(receipt.reviewerRef)
        || !exact(receipt.effectiveMainAgentName) || !Number.isSafeInteger(receipt.reviewedAt)
        || !Number.isSafeInteger(receipt.expiresAt) || !Number.isSafeInteger(input.now)
        || receipt.reviewedAt > input.now) {
        return { status: "blocked", reasonCode: "identity_review_receipt_invalid" };
    }
    if (receipt.expiresAt <= input.now)
        return { status: "blocked", reasonCode: "identity_review_expired" };
    if (receipt.proposalFingerprint !== exact(input.expectedProposalFingerprint)) {
        return { status: "blocked", reasonCode: "identity_review_scope_mismatch" };
    }
    if (receipt.goalSection3Fingerprint !== exact(input.currentGoalSection3Fingerprint)) {
        return { status: "blocked", reasonCode: "goal_section3_lineage_mismatch" };
    }
    return {
        status: "authorized",
        review: {
            invariant: "product_identity",
            proposalFingerprint: receipt.proposalFingerprint,
            baselineFingerprint: receipt.baselineFingerprint,
            proposedFingerprint: receipt.proposedFingerprint,
            decision: "preserved",
            reviewerRef: receipt.reviewerRef,
            reviewedAt: receipt.reviewedAt,
            expiresAt: receipt.expiresAt,
        },
    };
}
//# sourceMappingURL=prompt-improvement-identity-invariants.js.map