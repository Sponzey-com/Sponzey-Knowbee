export function buildYeonjangRequestMetadata(ctx) {
    return {
        runId: ctx.runId,
        sessionId: ctx.sessionId,
        source: ctx.source,
        ...(ctx.requestGroupId ? { requestGroupId: ctx.requestGroupId } : {}),
        ...(ctx.agentId ? { agentId: ctx.agentId } : {}),
        ...(ctx.auditId ? { auditId: ctx.auditId } : {}),
        ...(ctx.capabilityDelegationId ? { capabilityDelegationId: ctx.capabilityDelegationId } : {}),
    };
}
export function withYeonjangRequestMetadata(ctx, options = {}) {
    const mqttConfig = options.mqttConfig ?? ctx.mqttConfig;
    return {
        ...options,
        ...(mqttConfig ? { mqttConfig } : {}),
        metadata: {
            ...(options.metadata ?? {}),
            ...buildYeonjangRequestMetadata(ctx),
        },
    };
}
//# sourceMappingURL=yeonjang-request-metadata.js.map