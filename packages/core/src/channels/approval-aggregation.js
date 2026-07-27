import { buildApprovalRequestControl, renderApprovalRequestControlText, } from "./interactive-control.js";
export function appendApprovalAggregateItem(context, item, requesterId, observedAt = Date.now()) {
    const next = context ?? {
        runId: item.runId,
        requesterId,
        items: [],
        openedAt: observedAt,
        lastUpdatedAt: observedAt,
    };
    const itemKey = approvalAggregateItemKey(item);
    const exists = next.items.some((existing) => approvalAggregateItemKey(existing) === itemKey);
    if (!exists)
        next.items.push(item);
    next.lastUpdatedAt = observedAt;
    return {
        context: next,
        appended: !exists,
        aggregationLatencyMs: !exists && next.items.length > 1
            ? Math.max(0, observedAt - next.openedAt)
            : null,
    };
}
export function buildApprovalAggregateText(params) {
    return renderApprovalRequestControlText(buildApprovalRequestControl({
        runRef: params.context.runId,
        language: params.language,
        items: params.context.items.map((item) => ({
            ...(item.approvalId ? { approvalRef: item.approvalId } : {}),
            toolLabel: item.toolName,
            kind: item.kind,
        })),
    }), params.channel);
}
export function resolveApprovalAggregate(context, decision, reason = "user") {
    for (const item of context.items) {
        item.resolve(decision, reason);
    }
    return [...context.items];
}
function approvalAggregateItemKey(item) {
    return item.approvalId
        ?? [
            item.runId,
            item.parentRunId ?? "",
            item.subSessionId ?? "",
            item.agentId ?? "",
            item.teamId ?? "",
            item.kind,
            item.toolName,
            item.paramsPreview,
        ].join(":");
}
//# sourceMappingURL=approval-aggregation.js.map