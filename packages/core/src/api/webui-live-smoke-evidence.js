function toolResult(value) {
    if (value === "success" || value === "failed" || value === "denied")
        return value;
    return undefined;
}
function approvalStatus(value) {
    switch (value) {
        case "requested":
        case "consumed":
        case "denied":
        case "expired":
            return value;
        case "approved_once":
        case "approved_run":
            return "approved";
        default:
            return undefined;
    }
}
export function createWebUiLiveSmokeEvidenceReader(dependencies) {
    return (run) => {
        const auditLogs = dependencies.listAuditLogsForRun(run.id);
        const toolReceipts = auditLogs.flatMap((row) => {
            const result = toolResult(row.result);
            return result && row.request_group_id === run.requestGroupId && row.channel === "webui"
                ? [
                    {
                        runId: run.id,
                        requestGroupId: run.requestGroupId,
                        toolName: row.tool_name,
                        result,
                    },
                ]
                : [];
        });
        const capabilityReceipts = auditLogs.flatMap((row) => row.result === "failed" &&
            row.error_code === "tool_not_registered" &&
            row.request_group_id === run.requestGroupId &&
            row.channel === "webui"
            ? [
                {
                    runId: run.id,
                    requestGroupId: run.requestGroupId,
                    capability: "tool_execution",
                    receiptStatus: "unsupported_capability",
                },
            ]
            : []);
        const deliveredEvents = dependencies
            .listMessageLedgerEvents({ runId: run.id, limit: 1_000 })
            .filter((event) => event.request_group_id === run.requestGroupId &&
            event.channel === "webui" &&
            (event.event_kind === "text_delivered" ||
                event.event_kind === "final_answer_delivered") &&
            (event.status === "delivered" || event.status === "succeeded"));
        const canonicalDeliveries = deliveredEvents.filter((event) => event.event_kind === "final_answer_delivered");
        const deliveredUserReports = canonicalDeliveries.length > 0
            ? canonicalDeliveries
            : deliveredEvents.filter((event) => event.event_kind === "text_delivered");
        const deliveredUserReport = deliveredUserReports[0];
        const userReportDelivered = deliveredUserReport !== undefined;
        const approval = dependencies.getLatestApprovalForRun(run.id);
        const status = approval ? approvalStatus(approval.status) : undefined;
        const approvalReceipts = approval &&
            status &&
            approval.request_group_id === run.requestGroupId &&
            approval.channel === "webui"
            ? [
                {
                    runId: run.id,
                    requestGroupId: run.requestGroupId,
                    channel: "webui",
                    toolName: approval.tool_name,
                    status,
                    uiVisible: approval.decision_by === "webui" || dependencies.isWebUiApprovalVisible(),
                },
            ]
            : [];
        const deliveredPaths = new Set(dependencies
            .listArtifactReceiptsForRun(run.id)
            .filter((receipt) => receipt.request_group_id === run.requestGroupId &&
            receipt.channel === "webui" &&
            receipt.delivered_at !== null)
            .map((receipt) => receipt.artifact_path));
        const artifactReceipts = dependencies
            .listArtifactMetadataForRun(run.id)
            .flatMap((metadata) => {
            if (metadata.request_group_id !== run.requestGroupId ||
                metadata.owner_channel !== "webui" ||
                !deliveredPaths.has(metadata.artifact_path)) {
                return [];
            }
            const access = dependencies.buildArtifactAccess(metadata);
            if (!access.ok)
                return [];
            const mode = access.previewable ? "inline_preview" : "download_link";
            const url = access.previewable ? access.previewUrl : access.downloadUrl;
            return url
                ? [
                    {
                        runId: run.id,
                        requestGroupId: run.requestGroupId,
                        channel: "webui",
                        mode,
                        url,
                    },
                ]
                : [];
        });
        return {
            toolReceipts,
            approvalReceipts,
            artifactReceipts,
            capabilityReceipts,
            userReportDelivered,
            userReportDeliveryCount: deliveredUserReports.length,
            ...(deliveredUserReport ? { deliveryReceiptRef: deliveredUserReport.id } : {}),
        };
    };
}
//# sourceMappingURL=webui-live-smoke-evidence.js.map