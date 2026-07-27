export function createSlackLiveSmokeExecutor(ports) {
    return async (scenario) => {
        if (scenario.channel !== "slack" || scenario.kind !== "basic_query") {
            throw new Error("slack_live_smoke_scenario_unsupported");
        }
        let started;
        try {
            started = await ports.startRequest({ request: scenario.request, source: "slack" });
        }
        catch {
            throw new Error("slack_live_smoke_start_failed");
        }
        if (!started.requestId.trim() ||
            !started.runId.trim() ||
            started.requestGroupId !== started.runId ||
            !started.targetFingerprint.trim()) {
            throw new Error("slack_live_smoke_start_receipt_invalid");
        }
        let observation;
        try {
            observation = await ports.observeTerminal({ started });
        }
        catch {
            throw new Error("slack_live_smoke_observation_failed");
        }
        if (observation.requestId !== started.requestId ||
            observation.runId !== started.runId ||
            observation.requestGroupId !== started.requestGroupId ||
            observation.targetFingerprint !== started.targetFingerprint) {
            throw new Error("slack_live_smoke_observation_identity_mismatch");
        }
        if (observation.terminalStatus !== "completed") {
            throw new Error(`slack_live_smoke_terminal_${observation.terminalStatus}`);
        }
        if (observation.typedTraceStatus !== "ready") {
            throw new Error("slack_live_smoke_typed_trace_unavailable");
        }
        if (!observation.typedTraceTerminal || observation.typedTraceIssueCount !== 0) {
            throw new Error("slack_live_smoke_typed_trace_invalid");
        }
        const auditLogId = observation.auditEventId?.trim();
        const required = [
            [observation.analysisCompleted, "slack_live_smoke_analysis_receipt_missing"],
            [observation.evidenceRecorded, "slack_live_smoke_evidence_receipt_missing"],
            [observation.reviewCompleted, "slack_live_smoke_review_receipt_missing"],
            [observation.finalizationCompleted, "slack_live_smoke_finalization_receipt_missing"],
            [observation.topologyRunCount > 0, "slack_live_smoke_topology_receipt_missing"],
            [Boolean(auditLogId), "slack_live_smoke_audit_receipt_missing"],
            [observation.providerDeliveryReceipted, "slack_live_smoke_provider_receipt_missing"],
            [observation.targetMatched, "slack_live_smoke_target_mismatch"],
            [observation.userReportDelivered, "slack_live_smoke_user_report_not_delivered"],
        ];
        const failed = required.find(([valid]) => !valid);
        if (failed)
            throw new Error(failed[1]);
        return {
            sourceChannel: "slack",
            responseChannel: "slack",
            correlationKey: "slack_thread",
            requestFlow: {
                runId: observation.runId,
                requestGroupId: observation.requestGroupId,
                requestGroupMatchesRunId: true,
                decisionTracePresent: observation.analysisCompleted && observation.reviewCompleted,
                topologyRunCreated: true,
                providerDirectUsed: false,
            },
            auditLogId: auditLogId ?? "",
        };
    };
}
//# sourceMappingURL=slack-live-smoke-executor.js.map