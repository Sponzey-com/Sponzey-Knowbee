const ALL_STAGES = [
    "request_total",
    "analysis",
    "execution",
    "approval_wait",
    "llm_execution",
    "tool_execution",
    "review",
    "final_response",
    "canonical_delivery",
    "terminal_projection",
    "queue_wait",
];
const ALL_COUNTERS = [
    "llm_invocation",
    "tool_invocation",
    "recovery",
    "queue_retry",
    "delivery_duplicate",
    "delivery_failure",
];
function nearestRank(values, percentile) {
    if (values.length === 0)
        return null;
    const sorted = [...values].sort((left, right) => left - right);
    const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * percentile) - 1);
    return sorted[index] ?? null;
}
function dedupeSamples(samples, window) {
    const deduped = new Map();
    for (const sample of samples) {
        if (sample.observedAt < window.startAt || sample.observedAt > window.endAt)
            continue;
        if (!Number.isFinite(sample.durationMs) || sample.durationMs < 0)
            continue;
        const stageReceiptKey = `${sample.runId}:${sample.stage}`;
        if (!deduped.has(stageReceiptKey))
            deduped.set(stageReceiptKey, sample);
    }
    return [...deduped.values()];
}
function dedupeCounters(counters, window) {
    const deduped = new Map();
    for (const receipt of counters) {
        if (receipt.observedAt < window.startAt || receipt.observedAt > window.endAt)
            continue;
        if (!Number.isFinite(receipt.amount) || receipt.amount < 0)
            continue;
        if (!deduped.has(receipt.receiptId))
            deduped.set(receipt.receiptId, receipt);
    }
    return [...deduped.values()];
}
function aggregateStage(input) {
    const values = input.samples
        .filter((sample) => sample.stage === input.stage)
        .map((sample) => Math.round(sample.durationMs));
    const observation = values.length > 0
        ? "measured"
        : input.authorizationRequired
            ? "authorization_required"
            : input.configured
                ? "not_observed"
                : "not_configured";
    return {
        stage: input.stage,
        required: input.required,
        observation,
        count: values.length,
        p50Ms: nearestRank(values, 0.5),
        p95Ms: nearestRank(values, 0.95),
        maxMs: values.length > 0 ? Math.max(...values) : null,
    };
}
function evaluateAdmission(metrics, counters, requiredCounters, baseline) {
    const externalBlockers = metrics
        .filter((metric) => metric.required && metric.observation === "authorization_required")
        .map((metric) => ({
        category: "external_input",
        code: "authorization_required",
        stage: metric.stage,
    }));
    if (externalBlockers.length > 0) {
        return {
            status: "blocked_external_input",
            state: "coverage_evaluated",
            blockers: externalBlockers,
        };
    }
    const externalCounterBlockers = counters
        .filter((counter) => requiredCounters.has(counter.counter) && counter.observation === "authorization_required")
        .map((counter) => ({
        category: "external_input",
        code: "authorization_required",
        counter: counter.counter,
    }));
    if (externalCounterBlockers.length > 0) {
        return {
            status: "blocked_external_input",
            state: "coverage_evaluated",
            blockers: externalCounterBlockers,
        };
    }
    const coverageBlockers = metrics.flatMap((metric) => {
        if (!metric.required || metric.observation === "measured")
            return [];
        return [
            {
                category: "metric_coverage",
                code: metric.observation === "not_configured"
                    ? "required_metric_not_configured"
                    : "required_metric_not_observed",
                stage: metric.stage,
            },
        ];
    });
    if (coverageBlockers.length > 0) {
        return { status: "rejected", state: "coverage_evaluated", blockers: coverageBlockers };
    }
    const counterCoverageBlockers = counters.flatMap((counter) => {
        if (!requiredCounters.has(counter.counter) || counter.observation === "measured")
            return [];
        return [
            {
                category: "metric_coverage",
                code: counter.observation === "not_configured"
                    ? "required_counter_not_configured"
                    : "required_counter_not_observed",
                counter: counter.counter,
            },
        ];
    });
    if (counterCoverageBlockers.length > 0) {
        return {
            status: "rejected",
            state: "coverage_evaluated",
            blockers: counterCoverageBlockers,
        };
    }
    if (!baseline) {
        return {
            status: "rejected",
            state: "baseline_evaluated",
            blockers: [{ category: "baseline_required", code: "approved_baseline_missing" }],
        };
    }
    const baselineBlockers = metrics
        .filter((metric) => metric.required && !baseline.stageLimits[metric.stage])
        .map((metric) => ({
        category: "baseline_required",
        code: "stage_baseline_missing",
        stage: metric.stage,
    }));
    if (baselineBlockers.length > 0) {
        return { status: "rejected", state: "baseline_evaluated", blockers: baselineBlockers };
    }
    const regressionBlockers = [];
    for (const metric of metrics) {
        const limit = baseline.stageLimits[metric.stage];
        if (!limit || metric.observation !== "measured")
            continue;
        if (metric.p95Ms !== null && metric.p95Ms > limit.p95MaxMs) {
            regressionBlockers.push({
                category: "product_regression",
                code: "p95_limit_exceeded",
                stage: metric.stage,
            });
        }
        if (limit.maxMs !== undefined && metric.maxMs !== null && metric.maxMs > limit.maxMs) {
            regressionBlockers.push({
                category: "product_regression",
                code: "max_limit_exceeded",
                stage: metric.stage,
            });
        }
    }
    return regressionBlockers.length > 0
        ? { status: "rejected", state: "rejected", blockers: regressionBlockers }
        : { status: "admitted", state: "admitted", blockers: [] };
}
function aggregateCounter(input) {
    const receipts = input.receipts.filter((receipt) => receipt.counter === input.counter);
    if (receipts.length > 0 || input.measured) {
        return {
            counter: input.counter,
            observation: "measured",
            count: receipts.reduce((sum, receipt) => sum + receipt.amount, 0),
        };
    }
    return {
        counter: input.counter,
        observation: input.authorizationRequired
            ? "authorization_required"
            : input.configured
                ? "not_observed"
                : "not_configured",
        count: null,
    };
}
export function buildReleaseWindowMetricReport(input) {
    const required = new Set(input.requiredStages);
    const configured = new Set(input.configuredStages);
    const authorizationRequired = new Set(input.authorizationRequiredStages ?? []);
    const requiredCounters = new Set(input.requiredCounters ?? []);
    const configuredCounters = new Set(input.configuredCounters ?? []);
    const authorizationRequiredCounters = new Set(input.authorizationRequiredCounters ?? []);
    const samples = dedupeSamples(input.source.samples, input.window);
    const counterReceipts = dedupeCounters(input.source.counters, input.window);
    const relevantStages = ALL_STAGES.filter((stage) => required.has(stage) ||
        configured.has(stage) ||
        samples.some((sample) => sample.stage === stage));
    const metrics = relevantStages.map((stage) => aggregateStage({
        stage,
        required: required.has(stage),
        configured: configured.has(stage),
        authorizationRequired: authorizationRequired.has(stage),
        samples,
    }));
    const counters = ALL_COUNTERS.map((counter) => aggregateCounter({
        counter,
        receipts: counterReceipts,
        measured: input.source.measuredCounters.includes(counter),
        configured: configuredCounters.has(counter),
        authorizationRequired: authorizationRequiredCounters.has(counter),
    }));
    return {
        kind: "knowbee.release.window_metrics",
        window: { ...input.window },
        sourceRunCount: Math.max(0, input.source.runCount),
        terminalRunCount: Math.max(0, input.source.terminalRunCount),
        sampleCount: samples.length,
        sourceIssues: input.source.issues.map((issue) => ({ ...issue })),
        metrics,
        counters,
        baselineId: input.baseline?.baselineId ?? null,
        admission: evaluateAdmission(metrics, counters, requiredCounters, input.baseline),
    };
}
export function projectReleaseMetricProductLog(report) {
    const blockerCategoryCounts = {};
    for (const blocker of report.admission.blockers) {
        blockerCategoryCounts[blocker.category] = (blockerCategoryCounts[blocker.category] ?? 0) + 1;
    }
    return {
        windowId: report.window.windowId,
        sampleCount: report.sampleCount,
        runCount: report.sourceRunCount,
        admissionStatus: report.admission.status,
        blockerCategoryCounts,
    };
}
export function projectReleaseMetricFieldDebugLog(report) {
    return {
        windowId: report.window.windowId,
        metrics: report.metrics.map((metric) => ({ ...metric })),
        counters: report.counters.map((counter) => ({ ...counter })),
        sourceIssues: report.sourceIssues.map((issue) => ({ ...issue })),
    };
}
//# sourceMappingURL=release-window-metrics.js.map