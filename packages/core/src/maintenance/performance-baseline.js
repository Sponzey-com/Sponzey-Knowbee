export const REQUIRED_REPRESENTATIVE_FLOW_IDS = [
    "direct_answer",
    "current_fact_read",
    "tool_write",
    "child_delegation",
    "cancel",
];
const MEASURED_STAGE_ORDER = [
    "intake",
    "planning",
    "execution",
    "review",
    "final_response",
    "maintenance",
    "other",
];
export function buildMeasuredRepresentativeFlowSample(input) {
    const terminalByInvocation = new Map();
    const duplicateTerminalInvocationIds = new Set();
    for (const receipt of input.llmReceipts) {
        if (receipt.phase === "started")
            continue;
        const existing = terminalByInvocation.get(receipt.invocationId);
        if (existing)
            duplicateTerminalInvocationIds.add(receipt.invocationId);
        if (!existing || receipt.at < existing.at)
            terminalByInvocation.set(receipt.invocationId, receipt);
    }
    const terminal = [...terminalByInvocation.values()];
    const diagnostics = [];
    if (!Number.isSafeInteger(input.startedAt) || !Number.isSafeInteger(input.finishedAt)) {
        diagnostics.push("run_timing_invalid");
    }
    if (input.finishedAt < input.startedAt)
        diagnostics.push("run_timing_reversed");
    if (duplicateTerminalInvocationIds.size > 0)
        diagnostics.push("llm_terminal_duplicate");
    if (terminal.some((receipt) => !Number.isSafeInteger(receipt.durationMs))) {
        diagnostics.push("llm_terminal_duration_missing");
    }
    const measuredCounters = {
        attemptCount: input.attemptCount,
        queueWaitMs: input.queueWaitMs,
        eventBytes: input.eventBytes,
        evidenceBytes: input.evidenceBytes,
    };
    for (const [metric, value] of Object.entries(measuredCounters)) {
        if (!Number.isSafeInteger(value) || value < 0)
            diagnostics.push(`measurement_invalid:${metric}`);
    }
    if (input.costEstimateUsd !== null &&
        (!Number.isFinite(input.costEstimateUsd) || input.costEstimateUsd < 0)) {
        diagnostics.push("measurement_invalid:costEstimateUsd");
    }
    const totalTokens = (key) => terminal.every((receipt) => Number.isSafeInteger(receipt[key]))
        ? terminal.reduce((sum, receipt) => sum + (receipt[key] ?? 0), 0)
        : null;
    const stages = [...new Set(terminal.map((receipt) => receipt.context.stage))]
        .sort((left, right) => {
        const leftIndex = MEASURED_STAGE_ORDER.indexOf(left);
        const rightIndex = MEASURED_STAGE_ORDER.indexOf(right);
        return ((leftIndex < 0 ? Number.MAX_SAFE_INTEGER : leftIndex) -
            (rightIndex < 0 ? Number.MAX_SAFE_INTEGER : rightIndex) || left.localeCompare(right));
    })
        .map((stage) => {
        const receipts = terminal.filter((receipt) => receipt.context.stage === stage);
        const stageTokens = (key) => receipts.every((receipt) => Number.isSafeInteger(receipt[key]))
            ? receipts.reduce((sum, receipt) => sum + (receipt[key] ?? 0), 0)
            : null;
        return {
            stage,
            llmCallCount: receipts.length,
            durationMs: receipts.reduce((sum, receipt) => sum + (receipt.durationMs ?? 0), 0),
            inputTokens: stageTokens("inputTokens"),
            outputTokens: stageTokens("outputTokens"),
        };
    });
    return {
        flowId: input.flowId,
        sampleId: input.sampleId,
        sourceKind: "live_runtime",
        durationMs: Math.max(0, input.finishedAt - input.startedAt),
        llmCallCount: terminal.length,
        inputTokens: totalTokens("inputTokens"),
        outputTokens: totalTokens("outputTokens"),
        costEstimateUsd: input.costEstimateUsd,
        attemptCount: input.attemptCount,
        queueWaitMs: input.queueWaitMs,
        eventBytes: input.eventBytes,
        evidenceBytes: input.evidenceBytes,
        stages,
        complete: diagnostics.length === 0,
        diagnostics,
    };
}
export function compareMeasuredFlowToBaseline(input) {
    const latencyRegressionRatio = Number((input.live.durationMs / Math.max(1, input.reference.latencyP95Ms)).toFixed(6));
    const llmCallIncrease = input.live.llmCallCount - input.reference.llmCallCount;
    const attemptIncrease = input.live.attemptCount - input.reference.attemptCount;
    if (!input.live.complete) {
        return {
            status: "baseline_only",
            latencyRegressionRatio,
            llmCallIncrease,
            attemptIncrease,
            reasonCodes: ["live_measurement_incomplete"],
        };
    }
    if (!input.thresholds) {
        return {
            status: "baseline_only",
            latencyRegressionRatio,
            llmCallIncrease,
            attemptIncrease,
            reasonCodes: ["acceptance_thresholds_not_approved"],
        };
    }
    const thresholdValues = Object.values(input.thresholds);
    if (thresholdValues.some((value) => !Number.isFinite(value) || value < 0)) {
        return {
            status: "baseline_only",
            latencyRegressionRatio,
            llmCallIncrease,
            attemptIncrease,
            reasonCodes: ["acceptance_thresholds_invalid"],
        };
    }
    const reasonCodes = [];
    if (latencyRegressionRatio > input.thresholds.maxLatencyRegressionRatio) {
        reasonCodes.push("latency_regression_exceeded");
    }
    if (llmCallIncrease > input.thresholds.maxLlmCallIncrease) {
        reasonCodes.push("llm_call_increase_exceeded");
    }
    if (attemptIncrease > input.thresholds.maxAttemptIncrease) {
        reasonCodes.push("attempt_increase_exceeded");
    }
    return {
        status: reasonCodes.length === 0 ? "accepted" : "rejected",
        latencyRegressionRatio,
        llmCallIncrease,
        attemptIncrease,
        reasonCodes,
    };
}
const COUNT_METRICS = [
    "llmCallCount",
    "inputTokens",
    "outputTokens",
    "attemptCount",
    "eventBytes",
    "evidenceBytes",
];
const NUMBER_METRICS = ["durationMs", "costEstimateUsd", "queueWaitMs"];
function percentile(values, ratio) {
    const sorted = [...values].sort((left, right) => left - right);
    return sorted[Math.max(0, Math.ceil(sorted.length * ratio) - 1)] ?? 0;
}
function totals(samples) {
    return samples.reduce((sum, sample) => ({
        llmCallCount: sum.llmCallCount + sample.llmCallCount,
        inputTokens: sum.inputTokens + sample.inputTokens,
        outputTokens: sum.outputTokens + sample.outputTokens,
        costEstimateUsd: Number((sum.costEstimateUsd + sample.costEstimateUsd).toFixed(6)),
        attemptCount: sum.attemptCount + sample.attemptCount,
        queueWaitMs: sum.queueWaitMs + sample.queueWaitMs,
        eventBytes: sum.eventBytes + sample.eventBytes,
        evidenceBytes: sum.evidenceBytes + sample.evidenceBytes,
    }), {
        llmCallCount: 0,
        inputTokens: 0,
        outputTokens: 0,
        costEstimateUsd: 0,
        attemptCount: 0,
        queueWaitMs: 0,
        eventBytes: 0,
        evidenceBytes: 0,
    });
}
function invalidMetric(sample) {
    for (const metric of COUNT_METRICS) {
        if (!Number.isInteger(sample[metric]) || sample[metric] < 0)
            return metric;
    }
    for (const metric of NUMBER_METRICS) {
        if (!Number.isFinite(sample[metric]) || sample[metric] < 0)
            return metric;
    }
    return null;
}
export function auditRepresentativeFlowBaseline(input) {
    const required = new Set(REQUIRED_REPRESENTATIVE_FLOW_IDS);
    const diagnostics = [];
    for (const sample of input.samples) {
        if (!required.has(sample.flowId)) {
            diagnostics.push({ code: "unknown_flow", flowId: sample.flowId, metric: null });
            continue;
        }
        const metric = invalidMetric(sample);
        if (metric)
            diagnostics.push({ code: "sample_metric_invalid", flowId: sample.flowId, metric });
    }
    const validSamples = input.samples.filter((sample) => required.has(sample.flowId) && invalidMetric(sample) === null);
    const flows = REQUIRED_REPRESENTATIVE_FLOW_IDS.flatMap((flowId) => {
        const matching = validSamples.filter((sample) => sample.flowId === flowId);
        if (matching.length === 0) {
            diagnostics.push({ code: "required_flow_missing", flowId, metric: null });
            return [];
        }
        const durations = matching.map((sample) => sample.durationMs);
        return [
            {
                flowId,
                sampleCount: matching.length,
                latencyP50Ms: percentile(durations, 0.5),
                latencyP95Ms: percentile(durations, 0.95),
                ...totals(matching),
            },
        ];
    });
    const durations = validSamples.map((sample) => sample.durationMs);
    diagnostics.sort((left, right) => `${left.code}:${left.flowId}:${left.metric ?? ""}`.localeCompare(`${right.code}:${right.flowId}:${right.metric ?? ""}`));
    return {
        schemaVersion: 1,
        fixtureVersion: input.fixtureVersion,
        sourceKind: input.sourceKind,
        complete: diagnostics.length === 0,
        counts: {
            requiredFlows: REQUIRED_REPRESENTATIVE_FLOW_IDS.length,
            coveredFlows: flows.length,
            samples: validSamples.length,
        },
        flows,
        aggregate: {
            sampleCount: validSamples.length,
            latencyP50Ms: percentile(durations, 0.5),
            latencyP95Ms: percentile(durations, 0.95),
            ...totals(validSamples),
        },
        diagnostics,
    };
}
//# sourceMappingURL=performance-baseline.js.map