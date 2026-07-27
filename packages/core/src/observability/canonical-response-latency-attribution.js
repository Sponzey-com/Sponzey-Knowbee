export const CANONICAL_RESPONSE_LATENCY_STAGES = [
    "task_intake",
    "execution_decision",
    "tool_transport",
    "completion_review",
    "final_response",
    "delivery",
];
const STRUCTURED_REASON_CODE = /^[a-z][a-z0-9_]{1,63}$/u;
function stageForLlmReceipt(receipt) {
    switch (receipt.context.stage) {
        case "intake":
        case "planning":
            return "task_intake";
        case "execution":
            return "execution_decision";
        case "review":
            return "completion_review";
        case "final_response":
            return "final_response";
        default:
            return null;
    }
}
function stageForMetric(metric) {
    const stageCode = metric.detail?.stageCode;
    if (stageCode === "tool_transport" || stageCode === "delivery")
        return stageCode;
    return null;
}
function matchesReceiptCorrelation(receipt, runId, requestGroupId) {
    if (receipt.context.runId && receipt.context.runId !== runId)
        return false;
    if (receipt.context.requestGroupId
        && receipt.context.requestGroupId !== requestGroupId)
        return false;
    if (receipt.context.stage === "intake" || receipt.context.stage === "planning") {
        return receipt.context.requestGroupId === requestGroupId;
    }
    return (receipt.context.runId === runId
        && (receipt.context.requestGroupId === undefined
            || receipt.context.requestGroupId === requestGroupId));
}
function metricReasonCode(metric) {
    const value = metric.detail?.reasonCode;
    return typeof value === "string" && STRUCTURED_REASON_CODE.test(value)
        ? value
        : "stage_observed";
}
function worstStatus(statuses) {
    if (statuses.includes("timeout"))
        return "timeout";
    if (statuses.includes("slow"))
        return "slow";
    return "ok";
}
export function buildCanonicalResponseLatencyAttribution(input) {
    const runId = input.runId.trim();
    const requestGroupId = input.requestGroupId.trim();
    const buckets = new Map();
    const append = (stage, item) => {
        const current = buckets.get(stage) ?? [];
        current.push(item);
        buckets.set(stage, current);
    };
    for (const receipt of input.llmReceipts) {
        if (receipt.phase === "started"
            || receipt.durationMs === undefined
            || !matchesReceiptCorrelation(receipt, runId, requestGroupId)) {
            continue;
        }
        const stage = stageForLlmReceipt(receipt);
        if (!stage)
            continue;
        append(stage, {
            durationMs: receipt.durationMs,
            status: receipt.phase === "completed" ? "ok" : "timeout",
            reasonCode: STRUCTURED_REASON_CODE.test(receipt.context.operationCode)
                ? receipt.context.operationCode
                : "llm_invocation",
            evidenceRef: `llm-invocation:${receipt.invocationId}`,
        });
    }
    for (const metric of input.latencyMetrics) {
        if (metric.runId !== runId || metric.requestGroupId !== requestGroupId)
            continue;
        const stage = stageForMetric(metric);
        if (!stage)
            continue;
        append(stage, {
            durationMs: metric.durationMs,
            status: metric.status,
            reasonCode: metricReasonCode(metric),
            evidenceRef: `latency-metric:${metric.id}`,
        });
    }
    const stages = CANONICAL_RESPONSE_LATENCY_STAGES.flatMap((stage) => {
        const items = buckets.get(stage);
        if (!items || items.length === 0)
            return [];
        return [{
                stage,
                durationMs: items.reduce((total, item) => total + item.durationMs, 0),
                invocationCount: items.length,
                status: worstStatus(items.map((item) => item.status)),
                reasonCodes: [...new Set(items.map((item) => item.reasonCode))],
                evidenceRefs: [...new Set(items.map((item) => item.evidenceRef))],
            }];
    });
    const observedStages = new Set(stages.map((stage) => stage.stage));
    const missingStages = CANONICAL_RESPONSE_LATENCY_STAGES.filter((stage) => !observedStages.has(stage));
    return {
        status: missingStages.length === 0 ? "complete" : "incomplete",
        runId,
        requestGroupId,
        stages,
        missingStages,
        longestStages: [...stages]
            .sort((left, right) => right.durationMs - left.durationMs)
            .slice(0, 2),
    };
}
//# sourceMappingURL=canonical-response-latency-attribution.js.map