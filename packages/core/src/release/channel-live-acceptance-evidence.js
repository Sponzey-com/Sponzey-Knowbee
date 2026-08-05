const SUPPORTED = new Set(["webui", "telegram", "slack"]);
export function produceChannelLiveAcceptanceEvidence(run) {
    const accepted = [];
    const rejected = [];
    const seen = new Set();
    for (const result of run.results) {
        const scenarioId = result.scenario.id;
        let reasonCode;
        if (run.mode !== "live-run")
            reasonCode = "channel_smoke_not_live";
        else if (run.status !== "passed")
            reasonCode = "channel_smoke_run_not_passed";
        else if (seen.has(scenarioId))
            reasonCode = "channel_smoke_scenario_duplicate";
        else if (result.scenario.kind !== "basic_query" ||
            !SUPPORTED.has(result.scenario.channel)) {
            reasonCode = "channel_smoke_scenario_unsupported";
        }
        else if (result.status !== "passed")
            reasonCode = "channel_smoke_result_not_passed";
        else if (!result.auditLogId?.trim() || result.trace?.auditLogId !== result.auditLogId) {
            reasonCode = "channel_smoke_audit_missing";
        }
        else if (result.trace?.sourceChannel !== result.scenario.channel ||
            result.trace.responseChannel !== result.scenario.expectedTarget ||
            result.scenario.expectedTarget !== result.scenario.channel) {
            reasonCode = "channel_smoke_channel_mismatch";
        }
        else if (result.trace.requestFlow?.providerDirectUsed !== false) {
            reasonCode = "channel_smoke_provider_direct";
        }
        else if (result.trace.requestFlow.requestGroupMatchesRunId !== true ||
            result.trace.requestFlow.decisionTracePresent !== true ||
            result.trace.requestFlow.topologyRunCreated !== true) {
            reasonCode = "channel_smoke_correlation_invalid";
        }
        seen.add(scenarioId);
        if (reasonCode) {
            rejected.push({ scenarioId, reasonCode });
            continue;
        }
        accepted.push({
            evidenceRef: `channel-smoke:${run.runId}:${scenarioId}`,
            capability: result.scenario.channel,
            scenarioId,
            terminalStatus: "passed",
            auditEventId: result.auditLogId ?? "",
            executedAt: result.finishedAt ?? run.finishedAt,
            redactionStatus: "verified",
        });
    }
    return { accepted, rejected };
}
//# sourceMappingURL=channel-live-acceptance-evidence.js.map