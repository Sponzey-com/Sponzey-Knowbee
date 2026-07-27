import { createHash } from "node:crypto";
const CHANNELS = ["telegram", "webui"];
const KINDS = [
    "basic_query",
    "web_skill",
    "approval_required_tool",
    "artifact_delivery",
    "failure_tool",
];
const BUILD_IDENTITY = /^[a-f0-9]{40}$/u;
function sha256(value) {
    return createHash("sha256").update(value).digest("hex");
}
function terminalEvidenceValid(result) {
    const flow = result.trace?.requestFlow;
    const finalization = result.trace?.finalization;
    const delivery = result.trace?.finalDelivery;
    return (result.status === "passed"
        && Boolean(result.auditLogId?.trim())
        && result.trace?.auditLogId === result.auditLogId
        && Boolean(flow?.requestDiagnosisReceiptId?.trim())
        && Boolean(flow?.solutionPlanReceiptId?.trim())
        && Boolean(flow?.resultReviewReceiptId?.trim())
        && Boolean(flow?.finalResponseReceiptId?.trim())
        && flow?.decisionReceiptOrderValid === true
        && flow?.requestGroupMatchesRunId === true
        && flow?.providerDirectUsed === false
        && finalization?.rootOwnerFinalized === true
        && finalization.finalAnswerCount === 1
        && delivery?.delivered === true
        && delivery.userVisible === true
        && Boolean(delivery.receiptRef?.trim()));
}
export function buildConversationProcessReleaseEvidence(input) {
    const blockers = [];
    const channels = [];
    const expectedBuildIdentity = input.expectedBuildIdentity.trim();
    if (!BUILD_IDENTITY.test(expectedBuildIdentity))
        blockers.push("build_identity_invalid");
    for (const channel of CHANNELS) {
        const candidates = input.candidates.filter((candidate) => candidate.run.results.some((result) => result.scenario.channel === channel));
        if (candidates.length !== 1) {
            blockers.push(candidates.length === 0
                ? `channel_run_missing:${channel}`
                : `channel_run_duplicate:${channel}`);
            continue;
        }
        const candidate = candidates[0];
        const run = candidate.run;
        if (candidate.buildIdentity !== expectedBuildIdentity) {
            blockers.push(`build_identity_mismatch:${channel}`);
        }
        if (run.mode !== "live-run")
            blockers.push(`run_not_live:${channel}`);
        if (run.status !== "passed"
            || run.counts.total !== KINDS.length
            || run.counts.passed !== KINDS.length
            || run.counts.failed !== 0
            || run.counts.skipped !== 0) {
            blockers.push(`required_scenario_not_passed:${channel}`);
        }
        if (!Number.isFinite(run.finishedAt)
            || run.finishedAt > input.now
            || input.now - run.finishedAt > input.maxAgeMs) {
            blockers.push(`run_stale:${channel}`);
        }
        const channelResults = run.results.filter((result) => result.scenario.channel === channel);
        for (const kind of KINDS) {
            const matching = channelResults.filter((result) => result.scenario.kind === kind);
            if (matching.length !== 1) {
                blockers.push(`scenario_cardinality_invalid:${channel}:${kind}`);
            }
            else if (!terminalEvidenceValid(matching[0])) {
                blockers.push(`terminal_evidence_invalid:${channel}:${kind}`);
            }
        }
        channels.push({
            channel,
            passedCount: channelResults.filter((result) => result.status === "passed").length,
            finishedAt: run.finishedAt,
            evidenceRef: `sha256:${sha256([
                candidate.buildIdentity,
                channel,
                run.runId,
                String(run.finishedAt),
                ...channelResults.map((result) => result.scenario.id).sort(),
            ].join("|"))}`,
        });
    }
    const bounded = {
        schemaVersion: 1,
        status: blockers.length === 0 ? "passed" : "blocked",
        buildIdentity: expectedBuildIdentity,
        scenarioCount: channels.reduce((sum, channel) => sum + channel.passedCount, 0),
        channels,
        blockers: [...new Set(blockers)].sort(),
    };
    return {
        ...bounded,
        checksum: sha256(JSON.stringify(bounded)),
    };
}
//# sourceMappingURL=conversation-process-release-evidence.js.map