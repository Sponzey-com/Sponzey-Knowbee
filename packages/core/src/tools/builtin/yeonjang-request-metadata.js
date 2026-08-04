export function buildYeonjangRequestMetadata(ctx) {
    return {
        runId: ctx.runId,
        sessionId: ctx.sessionId,
        source: ctx.source,
        ...(ctx.requestGroupId ? { requestGroupId: ctx.requestGroupId } : {}),
        ...(ctx.agentId ? { agentId: ctx.agentId } : {}),
        ...(ctx.auditId ? { auditId: ctx.auditId } : {}),
        ...(ctx.capabilityDelegationId ? { capabilityDelegationId: ctx.capabilityDelegationId } : {}),
        ...(ctx.sideEffectOperation
            ? {
                operationId: ctx.sideEffectOperation.operationId,
                targetFingerprint: ctx.sideEffectOperation.targetFingerprint,
            }
            : {}),
    };
}
export function withYeonjangRequestMetadata(ctx, options = {}, authorizationResourceScope) {
    const { executionAuthorization: _callerExecutionAuthorization, ...callerOptions } = options;
    const mqttConfig = callerOptions.mqttConfig ?? ctx.mqttConfig;
    const approval = ctx.authorizationReceipt;
    const resourceScope = authorizationResourceScope?.trim();
    const executionAuthorization = resourceScope
        && ctx.yeonjangExecutionAuthorizationIssuer
        && approval?.approvalId
        && approval.approvalDecision
        && ctx.sideEffectOperation
        ? {
            issuer: ctx.yeonjangExecutionAuthorizationIssuer,
            resourceScope,
            grant: {
                approvalId: approval.approvalId,
                permissionScope: approval.permissionScope,
                decision: approval.approvalDecision,
            },
        }
        : undefined;
    return {
        ...callerOptions,
        signal: callerOptions.signal ?? ctx.signal,
        ...(mqttConfig ? { mqttConfig } : {}),
        ...(executionAuthorization ? { executionAuthorization } : {}),
        metadata: {
            ...(callerOptions.metadata ?? {}),
            ...buildYeonjangRequestMetadata(ctx),
        },
    };
}
//# sourceMappingURL=yeonjang-request-metadata.js.map