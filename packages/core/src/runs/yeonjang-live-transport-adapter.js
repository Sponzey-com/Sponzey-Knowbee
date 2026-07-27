import { createHash } from "node:crypto";
function evidenceHash(input) {
    return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}
export function createYeonjangLiveTransportAdapter(input) {
    if (!Number.isFinite(input.timeoutMs) || input.timeoutMs <= 0) {
        throw new Error("yeonjang_live_timeout_invalid");
    }
    return async (execution) => {
        if (execution.signal.aborted)
            throw new Error("yeonjang_smoke_cancelled");
        const scenario = execution.selection.scenario;
        const params = { ...(scenario.params ?? {}) };
        const commandId = input.createCommandId().trim();
        const auditId = input.createAuditCorrelationId().trim();
        if (!commandId || !auditId)
            throw new Error("yeonjang_live_correlation_invalid");
        const response = await input.invoke(scenario.expectedMethod, params, {
            extensionId: scenario.expectedInstanceId,
            timeoutMs: input.timeoutMs,
            metadata: {
                runId: execution.runId,
                requestGroupId: execution.runId,
                targetSessionId: scenario.expectedSessionId,
                commandId,
                auditId,
            },
        });
        if (execution.signal.aborted)
            throw new Error("yeonjang_smoke_cancelled");
        const evidenceRef = `tool-result:yeonjang:${evidenceHash({
            runId: execution.runId,
            commandId,
            instanceId: scenario.expectedInstanceId,
            sessionId: scenario.expectedSessionId,
            method: scenario.expectedMethod,
            params,
            response,
        })}`;
        const auditEventId = input.recordAuditEvent({
            runId: execution.runId,
            requestGroupId: execution.runId,
            commandId,
            instanceId: scenario.expectedInstanceId,
            sessionId: scenario.expectedSessionId,
            method: scenario.expectedMethod,
            evidenceRef,
        });
        return {
            command: {
                runId: execution.runId,
                requestGroupId: execution.runId,
                commandId,
                instanceId: scenario.expectedInstanceId,
                sessionId: scenario.expectedSessionId,
                method: scenario.expectedMethod,
                readOnly: true,
                deliveryStatus: "acked",
            },
            observedResult: {
                runId: execution.runId,
                commandId,
                instanceId: scenario.expectedInstanceId,
                sessionId: scenario.expectedSessionId,
                status: "observed",
                evidenceRef,
            },
            auditEventId,
            diagnosisPayload: response,
        };
    };
}
//# sourceMappingURL=yeonjang-live-transport-adapter.js.map