import { createHash } from "node:crypto";
import { aggregateSubSessionResultsForParent, buildParentAggregationRuntimeEvent, } from "../agent/sub-agent-result-review.js";
import { issueChildResultTrustReceipt, validateChildResultTrustReceipt, } from "../contracts/child-result-trust.js";
export class AggregateChildResult {
    dependencies;
    constructor(dependencies = {}) {
        this.dependencies = dependencies;
    }
    async execute(input) {
        for (const child of input.childResults) {
            if (child.resultReport) {
                await this.dependencies.appendParentEvent?.(input.parentRunId, `child_result_received:${child.subSessionId}:${child.resultReport.resultReportId}:${child.resultReport.status}`);
            }
        }
        await this.dependencies.appendParentEvent?.(input.parentRunId, `parent_child_result_aggregation_started:${input.childResults.map((child) => child.subSessionId).join(",") || "none"}`);
        const trustRejections = [];
        const trustedChildSources = [];
        const trustedChildResults = input.childResults.map((child) => {
            const report = child.resultReport;
            if (!report)
                return child;
            if (report.parentRunId !== input.parentRunId ||
                report.subSessionId !== child.subSessionId ||
                report.identity.parent?.parentRunId !== input.parentRunId) {
                const reasonCode = "child_result_binding_invalid";
                trustRejections.push({ subSessionId: child.subSessionId, reasonCode });
                return rejectedChildResult(child, reasonCode);
            }
            const binding = {
                parentRunId: input.parentRunId,
                parentAgentId: input.parentAgentId,
                childAgentId: report.source?.entityId ?? "",
                childAgentNameSnapshot: report.source?.agentNameSnapshot ?? "",
                subSessionId: child.subSessionId,
                resultReportId: report.resultReportId,
                resultFingerprint: resultFingerprint(report),
            };
            const issued = issueChildResultTrustReceipt({
                ...binding,
                directChildAgentIds: input.directChildAgentIds,
            });
            const verdict = issued.ok
                ? validateChildResultTrustReceipt({
                    receipt: issued.receipt,
                    expected: binding,
                    directChildAgentIds: input.directChildAgentIds,
                })
                : { allowed: false, reasonCode: issued.reasonCode, sourceRef: "" };
            if (verdict.allowed) {
                trustedChildSources.push({ subSessionId: child.subSessionId, sourceRef: verdict.sourceRef });
                return child;
            }
            const reasonCode = verdict.reasonCode === "child_result_data_only"
                ? "child_result_receipt_binding_mismatch"
                : verdict.reasonCode;
            trustRejections.push({ subSessionId: child.subSessionId, reasonCode });
            return rejectedChildResult(child, reasonCode);
        });
        const trace = aggregateSubSessionResultsForParent({
            ...input,
            childResults: trustedChildResults,
        });
        trace.reasonCodes = [...new Set([
                ...trace.reasonCodes,
                ...trustRejections.map((item) => item.reasonCode),
            ])].sort();
        const event = buildParentAggregationRuntimeEvent(trace);
        const primaryChild = trustedChildResults[0];
        await this.dependencies.appendParentEvent?.(input.parentRunId, `parent_child_result_aggregated:${primaryChild?.subSessionId ?? "none"}:${trace.nextAction}`);
        await this.dependencies.appendParentEvent?.(input.parentRunId, trace.finalDeliveryAllowed
            ? `parent_child_result_ready_for_finalization:${primaryChild?.subSessionId ?? "none"}`
            : `parent_child_result_recovery_required:${primaryChild?.subSessionId ?? "none"}:${trace.nextAction}`);
        this.dependencies.recordOrchestrationEvent?.({
            eventKind: "parent_child_result_aggregated",
            runId: input.parentRunId,
            ...(primaryChild?.subSessionId ? { subSessionId: primaryChild.subSessionId } : {}),
            ...(primaryChild?.resultReport?.source?.entityId
                ? { agentId: primaryChild.resultReport.source.entityId }
                : {}),
            correlationId: input.parentRunId,
            dedupeKey: [
                "orchestration:parent-child-result-aggregated",
                input.parentRunId,
                primaryChild?.subSessionId ?? "none",
                primaryChild?.resultReport?.resultReportId ?? "none",
            ].join(":"),
            source: "aggregate-child-result",
            summary: event.summary,
            payload: { ...event.payload },
        });
        return {
            trace,
            event,
            finalDeliveryAllowed: trace.finalDeliveryAllowed,
            nextAction: trace.nextAction,
            blockedSubSessionIds: trace.blockedSubSessionIds,
            limitedSubSessionIds: trace.limitedSubSessionIds,
            unverifiedSubSessionIds: trace.unverifiedSubSessionIds,
            trustRejections,
            trustedChildSources,
        };
    }
}
function resultFingerprint(report) {
    return `sha256:${createHash("sha256").update(JSON.stringify(report)).digest("hex")}`;
}
function rejectedChildResult(child, reasonCode) {
    return {
        subSessionId: child.subSessionId,
        review: {
            accepted: false,
            status: "failed",
            verdict: "reject",
            parentIntegrationStatus: "blocked_rejected",
            missingItems: [reasonCode],
            risksOrGaps: [],
            canRetry: false,
            normalizedFailureKey: reasonCode,
            manualActionReason: reasonCode,
        },
        attemptedMethods: [`trust_gate:${reasonCode}`],
        remainingAlternatives: child.remainingAlternatives ?? [],
        canUseSameChild: false,
        ...(child.canUseOtherDirectChild !== undefined
            ? { canUseOtherDirectChild: child.canUseOtherDirectChild }
            : {}),
        ...(child.canSelfSolve !== undefined ? { canSelfSolve: child.canSelfSolve } : {}),
        ...(child.needsUserDecision !== undefined
            ? { needsUserDecision: child.needsUserDecision }
            : {}),
        ...(child.returnToParentAllowed !== undefined
            ? { returnToParentAllowed: child.returnToParentAllowed }
            : {}),
    };
}
//# sourceMappingURL=aggregate-child-result.js.map