import { REQUIRED_REPRESENTATIVE_FLOW_IDS, compareMeasuredFlowToBaseline, } from "./performance-baseline.js";
function validateBaselineSnapshot(snapshot, baselineVersion) {
    if (!snapshot || typeof snapshot !== "object") {
        return { status: "baseline_only", reasonCodes: ["matrix_baseline_snapshot_required"] };
    }
    const value = snapshot;
    if (value.schemaVersion !== 1) {
        return { status: "baseline_only", reasonCodes: ["matrix_baseline_schema_unsupported"] };
    }
    if (value.baselineVersion !== baselineVersion) {
        return { status: "baseline_only", reasonCodes: ["matrix_baseline_version_mismatch"] };
    }
    if (!Array.isArray(value.flows)) {
        return { status: "baseline_only", reasonCodes: ["matrix_baseline_flows_required"] };
    }
    const knownFlows = new Set(REQUIRED_REPRESENTATIVE_FLOW_IDS);
    const seen = new Set();
    for (const flow of value.flows) {
        if (!flow || typeof flow !== "object" || !knownFlows.has(flow.flowId)) {
            return {
                status: "baseline_only",
                reasonCodes: [`matrix_baseline_flow_unknown:${String(flow?.flowId ?? "unknown")}`],
            };
        }
        if (seen.has(flow.flowId)) {
            return {
                status: "baseline_only",
                reasonCodes: [`matrix_baseline_flow_duplicate:${flow.flowId}`],
            };
        }
        seen.add(flow.flowId);
        for (const metric of ["latencyP95Ms", "llmCallCount", "attemptCount"]) {
            const metricValue = flow[metric];
            if (!Number.isFinite(metricValue) ||
                metricValue < 0 ||
                (metric !== "latencyP95Ms" && !Number.isSafeInteger(metricValue))) {
                return {
                    status: "baseline_only",
                    reasonCodes: [`matrix_baseline_metric_invalid:${flow.flowId}:${metric}`],
                };
            }
        }
    }
    for (const flowId of REQUIRED_REPRESENTATIVE_FLOW_IDS) {
        if (!seen.has(flowId)) {
            return {
                status: "baseline_only",
                reasonCodes: [`matrix_baseline_flow_missing:${flowId}`],
            };
        }
    }
    const flows = REQUIRED_REPRESENTATIVE_FLOW_IDS.map((flowId) => {
        const flow = value.flows?.find((candidate) => candidate.flowId === flowId);
        if (!flow)
            throw new Error("validated baseline flow is missing");
        return Object.freeze({ ...flow });
    });
    return {
        status: "valid",
        snapshot: Object.freeze({ schemaVersion: 1, baselineVersion, flows: Object.freeze(flows) }),
    };
}
function baselineSnapshotsMatch(left, right) {
    const validation = validateBaselineSnapshot(left, right.baselineVersion);
    if (validation.status === "baseline_only")
        return false;
    return REQUIRED_REPRESENTATIVE_FLOW_IDS.every((flowId) => {
        const leftFlow = validation.snapshot.flows.find((flow) => flow.flowId === flowId);
        const rightFlow = right.flows.find((flow) => flow.flowId === flowId);
        return (leftFlow?.latencyP95Ms === rightFlow?.latencyP95Ms &&
            leftFlow?.llmCallCount === rightFlow?.llmCallCount &&
            leftFlow?.attemptCount === rightFlow?.attemptCount);
    });
}
function thresholdSnapshotsMatch(left, right, baselineSnapshot) {
    if (!left || typeof left !== "object")
        return false;
    const validation = validatePerformanceAcceptanceMatrix({
        schemaVersion: 1,
        matrixId: "threshold-snapshot-validation",
        matrixVersion: 1,
        baselineVersion: "threshold-snapshot-validation",
        baselineSnapshot: {
            ...baselineSnapshot,
            baselineVersion: "threshold-snapshot-validation",
        },
        thresholds: left,
    });
    if (validation.status === "baseline_only")
        return false;
    return REQUIRED_REPRESENTATIVE_FLOW_IDS.every((flowId) => {
        const leftThreshold = validation.candidate.thresholds[flowId];
        const rightThreshold = right[flowId];
        return (leftThreshold?.maxLatencyRegressionRatio === rightThreshold?.maxLatencyRegressionRatio &&
            leftThreshold?.maxLlmCallIncrease === rightThreshold?.maxLlmCallIncrease &&
            leftThreshold?.maxAttemptIncrease === rightThreshold?.maxAttemptIncrease);
    });
}
export function validatePerformanceAcceptanceMatrix(candidate) {
    if (candidate.schemaVersion !== 1) {
        return { status: "baseline_only", reasonCodes: ["matrix_schema_unsupported"] };
    }
    if (!candidate.matrixId.trim()) {
        return { status: "baseline_only", reasonCodes: ["matrix_id_required"] };
    }
    if (!Number.isSafeInteger(candidate.matrixVersion) || candidate.matrixVersion < 1) {
        return { status: "baseline_only", reasonCodes: ["matrix_version_invalid"] };
    }
    if (!candidate.baselineVersion.trim()) {
        return { status: "baseline_only", reasonCodes: ["matrix_baseline_version_required"] };
    }
    const baselineValidation = validateBaselineSnapshot(candidate.baselineSnapshot, candidate.baselineVersion.trim());
    if (baselineValidation.status === "baseline_only")
        return baselineValidation;
    if (!candidate.thresholds || typeof candidate.thresholds !== "object") {
        return { status: "baseline_only", reasonCodes: ["matrix_thresholds_required"] };
    }
    const knownFlows = new Set(REQUIRED_REPRESENTATIVE_FLOW_IDS);
    const unknownFlow = Object.keys(candidate.thresholds).find((flowId) => !knownFlows.has(flowId));
    if (unknownFlow) {
        return { status: "baseline_only", reasonCodes: [`matrix_flow_unknown:${unknownFlow}`] };
    }
    for (const flowId of REQUIRED_REPRESENTATIVE_FLOW_IDS) {
        const threshold = candidate.thresholds[flowId];
        if (!threshold) {
            return { status: "baseline_only", reasonCodes: [`matrix_required_flow_missing:${flowId}`] };
        }
        for (const metric of [
            "maxLatencyRegressionRatio",
            "maxLlmCallIncrease",
            "maxAttemptIncrease",
        ]) {
            if (!Number.isFinite(threshold[metric]) || threshold[metric] < 0) {
                return {
                    status: "baseline_only",
                    reasonCodes: [`matrix_threshold_invalid:${flowId}:${metric}`],
                };
            }
            if (metric !== "maxLatencyRegressionRatio" && !Number.isSafeInteger(threshold[metric])) {
                return {
                    status: "baseline_only",
                    reasonCodes: [`matrix_threshold_invalid:${flowId}:${metric}`],
                };
            }
        }
    }
    const frozenThresholds = Object.fromEntries(REQUIRED_REPRESENTATIVE_FLOW_IDS.map((flowId) => [
        flowId,
        Object.freeze({ ...candidate.thresholds[flowId] }),
    ]));
    return {
        status: "valid",
        candidate: Object.freeze({
            ...candidate,
            matrixId: candidate.matrixId.trim(),
            baselineVersion: candidate.baselineVersion.trim(),
            baselineSnapshot: baselineValidation.snapshot,
            thresholds: Object.freeze(frozenThresholds),
        }),
    };
}
export function activatePerformanceAcceptanceMatrix(input) {
    const validation = validatePerformanceAcceptanceMatrix(input.candidate);
    if (validation.status === "baseline_only")
        return validation;
    const receipt = input.authorizationPort.resolve(validation.candidate);
    if (!receipt) {
        return { status: "baseline_only", reasonCodes: ["matrix_authorization_missing"] };
    }
    if (receipt.schemaVersion !== 1) {
        return { status: "baseline_only", reasonCodes: ["matrix_authorization_schema_unsupported"] };
    }
    if (receipt.decision !== "approved") {
        return { status: "baseline_only", reasonCodes: ["matrix_authorization_not_approved"] };
    }
    if (receipt.actorType !== "administrator" || !receipt.actorId.trim()) {
        return { status: "baseline_only", reasonCodes: ["matrix_authorization_actor_invalid"] };
    }
    if (receipt.scope !== "performance_release_gate") {
        return { status: "baseline_only", reasonCodes: ["matrix_authorization_scope_invalid"] };
    }
    if (!receipt.authorizationId.trim() ||
        !Number.isSafeInteger(receipt.approvedAt) ||
        receipt.approvedAt < 0) {
        return { status: "baseline_only", reasonCodes: ["matrix_authorization_receipt_invalid"] };
    }
    if (receipt.matrixId !== validation.candidate.matrixId ||
        receipt.matrixVersion !== validation.candidate.matrixVersion ||
        receipt.baselineVersion !== validation.candidate.baselineVersion ||
        !thresholdSnapshotsMatch(receipt.thresholdSnapshot, validation.candidate.thresholds, validation.candidate.baselineSnapshot) ||
        !baselineSnapshotsMatch(receipt.baselineSnapshot, validation.candidate.baselineSnapshot)) {
        return { status: "baseline_only", reasonCodes: ["matrix_authorization_binding_mismatch"] };
    }
    return {
        status: "active",
        matrix: Object.freeze({
            candidate: validation.candidate,
            authorization: Object.freeze({ ...receipt }),
        }),
    };
}
export function evaluateMeasuredFlowWithAcceptanceMatrix(input) {
    const activation = activatePerformanceAcceptanceMatrix(input);
    if (activation.status === "baseline_only")
        return activation;
    if (input.referenceBaselineVersion !== activation.matrix.candidate.baselineVersion) {
        return { status: "baseline_only", reasonCodes: ["matrix_baseline_binding_mismatch"] };
    }
    if (input.reference.flowId !== input.live.flowId) {
        return { status: "baseline_only", reasonCodes: ["matrix_flow_binding_mismatch"] };
    }
    const threshold = activation.matrix.candidate.thresholds[input.live.flowId];
    if (!threshold) {
        return { status: "baseline_only", reasonCodes: ["matrix_flow_threshold_missing"] };
    }
    const comparison = compareMeasuredFlowToBaseline({
        reference: input.reference,
        live: input.live,
        thresholds: threshold,
    });
    return { status: comparison.status, reasonCodes: comparison.reasonCodes };
}
//# sourceMappingURL=performance-acceptance-matrix.js.map