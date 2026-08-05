import type { WebUiLiveSmokeExecutorPorts } from "../channels/webui-live-smoke-executor.js";
import type { TypedObservabilityEventRepository } from "../observability/typed-event-repository.js";
import type { StartedIngressRun } from "../runs/ingress.js";
import type { RequestExecutionOutcome } from "../runs/flow-contract.js";
import type { WebUiLiveSmokeEvidenceProjection } from "./webui-live-smoke-evidence.js";
import type { LiveSmokeDecisionReceiptReader } from "../channels/live-smoke-decision-receipts.js";
import type { LiveSmokeFirstResponseLatencyReader } from "../channels/live-smoke-latency-evidence.js";
export interface WebUiLiveSmokeRuntimeDependencies {
    startCanonicalRequest(request: string): StartedIngressRun;
    observabilityRepository: Pick<TypedObservabilityEventRepository, "list">;
    listTopologyRunsForRootRun(rootRunId: string): readonly unknown[];
    readExecutionOutcome(runId: string): RequestExecutionOutcome | undefined;
    readDecisionReceiptRefs: LiveSmokeDecisionReceiptReader;
    readFirstResponseLatency: LiveSmokeFirstResponseLatencyReader;
    readEvidence(run: {
        id: string;
        requestGroupId: string;
    }): WebUiLiveSmokeEvidenceProjection;
    cancelRun?(runId: string): void;
    timeoutMs?: number;
    now?: () => number;
}
export declare function createWebUiLiveSmokeRuntimePorts(dependencies: WebUiLiveSmokeRuntimeDependencies): WebUiLiveSmokeExecutorPorts;
//# sourceMappingURL=webui-live-smoke-runtime.d.ts.map