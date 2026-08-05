import { createHash } from "node:crypto";
function evidenceHash(input) {
    return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}
export function createExtensionLiveToolDispatchAdapter(input) {
    return async (execution) => {
        const scenario = execution.selection.scenario;
        const context = input.contextFor(execution);
        const dispatch = {
            toolName: scenario.expectedToolName,
            params: { ...execution.selection.params },
            capabilityBindingId: scenario.expectedBindingId,
            resultSharing: "data_exchange",
            ctx: {
                ...context,
                runId: execution.runId,
                requestGroupId: execution.runId,
                signal: execution.signal,
                agentId: scenario.expectedAgentId,
            },
        };
        const result = await input.dispatcher.dispatchAgentScoped(dispatch);
        const auditEventId = input.findAuditEventId({
            runId: execution.runId,
            requestGroupId: execution.runId,
            toolName: scenario.expectedToolName,
        });
        const evidenceRef = `tool-result:${scenario.capability}:${evidenceHash({
            runId: execution.runId,
            scenarioId: scenario.id,
            toolName: scenario.expectedToolName,
            success: result.success,
            output: result.output,
            ...(result.error ? { error: result.error } : {}),
        })}`;
        return {
            toolExecution: {
                runId: execution.runId,
                requestGroupId: execution.runId,
                capability: scenario.capability,
                agentId: scenario.expectedAgentId,
                bindingId: scenario.expectedBindingId,
                catalogId: scenario.expectedCatalogId,
                toolName: scenario.expectedToolName,
                status: result.success ? "succeeded" : result.error === "denied" ? "denied" : "failed",
                executionObserved: result.success && Boolean(auditEventId),
                evidenceRef,
            },
            auditEventId,
            diagnosisPayload: Object.freeze({
                success: result.success,
                output: result.output,
                ...(result.error ? { error: result.error } : {}),
            }),
        };
    };
}
//# sourceMappingURL=extension-live-tool-dispatch-adapter.js.map