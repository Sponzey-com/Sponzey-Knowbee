export const APPROVAL_SOURCE_KINDS = [
    "prompt_source_file",
    "persistent_prompt_record",
    "harness_source_file",
];
function exact(value) {
    return value.trim();
}
function checksum(value) {
    return /^(?:sha256:)?[a-f0-9]{8,64}$/iu.test(exact(value));
}
function exactSourceRef(source) {
    const ref = exact(source.sourceRef);
    if (!ref || /[*?]|(?:^|\/)\.\.(?:\/|$)|\/$/u.test(ref))
        return false;
    if (source.sourceKind === "prompt_source_file") {
        return /^prompts\/[A-Za-z0-9][A-Za-z0-9._/-]*\.md$/u.test(ref);
    }
    if (source.sourceKind === "persistent_prompt_record") {
        return /^prompt-record:[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(ref);
    }
    return /^(?:packages\/core\/src\/(?:memory|contracts)\/[A-Za-z0-9][A-Za-z0-9._/-]*\.ts(?:#[A-Za-z0-9][A-Za-z0-9._-]*)?|prompts\/[A-Za-z0-9][A-Za-z0-9._/-]*\.md#[A-Za-z0-9][A-Za-z0-9._-]*)$/u.test(ref);
}
function normalizeSources(sources) {
    if (sources.length === 0)
        return "invalid";
    const refs = new Set();
    const normalized = [];
    for (const source of sources) {
        if (!APPROVAL_SOURCE_KINDS.includes(source.sourceKind)
            || !exact(source.baselineVersion)
            || /^(?:current|latest|head)$/iu.test(exact(source.baselineVersion))
            || !checksum(source.baselineChecksum)
            || !checksum(source.proposedChecksum)
            || exact(source.baselineChecksum) === exact(source.proposedChecksum))
            return "invalid";
        if (!exactSourceRef(source))
            return "ref";
        const key = `${source.sourceKind}:${exact(source.sourceRef)}`;
        if (refs.has(key))
            return "duplicate";
        refs.add(key);
        normalized.push({
            sourceKind: source.sourceKind,
            sourceRef: exact(source.sourceRef),
            baselineVersion: exact(source.baselineVersion),
            baselineChecksum: exact(source.baselineChecksum),
            proposedChecksum: exact(source.proposedChecksum),
        });
    }
    return normalized;
}
function sourceSignature(source) {
    return [source.sourceKind, source.sourceRef, source.baselineVersion, source.baselineChecksum, source.proposedChecksum].join("|");
}
function sameSources(left, right) {
    if (left.length !== right.length)
        return false;
    const expected = new Set(left.map(sourceSignature));
    return right.every((source) => expected.has(sourceSignature(source)));
}
export function authorizeExactSourceApproval(input) {
    const request = input.request;
    if (!exact(request.approvalId) || !exact(request.proposalFingerprint) || !exact(request.sourceSetFingerprint)
        || !exact(request.changeSummary) || !exact(request.rollbackPlan) || !exact(request.approvedBy)
        || request.invariantsAffected.length === 0 || request.invariantsAffected.some((value) => !exact(value))
        || request.testsToRun.length === 0 || request.testsToRun.some((value) => !exact(value))
        || !Number.isSafeInteger(request.issuedAt) || !Number.isSafeInteger(request.expiresAt)
        || !Number.isSafeInteger(input.now) || request.issuedAt > input.now) {
        return { status: "blocked", reasonCode: "approval_request_invalid" };
    }
    if (request.decision !== "approved")
        return { status: "blocked", reasonCode: "approval_denied" };
    if (request.expiresAt <= input.now)
        return { status: "blocked", reasonCode: "approval_expired" };
    if (request.proposalFingerprint !== input.expectedProposalFingerprint) {
        return { status: "blocked", reasonCode: "proposal_scope_mismatch" };
    }
    if (request.sourceSetFingerprint !== input.expectedSourceSetFingerprint) {
        return { status: "blocked", reasonCode: "source_set_fingerprint_mismatch" };
    }
    const proposalSources = normalizeSources(input.proposalSources);
    const approvedSources = normalizeSources(request.targetSources);
    if (proposalSources === "invalid" || approvedSources === "invalid")
        return { status: "blocked", reasonCode: "source_descriptor_invalid" };
    if (proposalSources === "ref" || approvedSources === "ref")
        return { status: "blocked", reasonCode: "source_ref_not_exact" };
    if (proposalSources === "duplicate" || approvedSources === "duplicate")
        return { status: "blocked", reasonCode: "source_duplicate" };
    if (!sameSources(proposalSources, approvedSources))
        return { status: "blocked", reasonCode: "source_set_mismatch" };
    return {
        status: "authorized",
        approvalId: request.approvalId,
        proposalFingerprint: request.proposalFingerprint,
        sourceSetFingerprint: request.sourceSetFingerprint,
        targetSources: approvedSources,
    };
}
export async function applyExactApprovedSource(input) {
    if (input.decision.status !== "authorized")
        return input.decision;
    const signature = sourceSignature(input.source);
    if (!input.decision.targetSources.some((source) => sourceSignature(source) === signature)) {
        return { status: "blocked", reasonCode: "source_not_approved" };
    }
    return { status: "applied", result: await input.apply(input.source) };
}
//# sourceMappingURL=exact-source-approval.js.map