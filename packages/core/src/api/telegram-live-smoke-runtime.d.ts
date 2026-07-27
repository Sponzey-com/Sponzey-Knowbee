import type { TelegramLiveSmokeExecutorPorts } from "../channels/telegram-live-smoke-executor.js";
import type { TypedObservabilityEventRepository } from "../observability/typed-event-repository.js";
import type { RequestExecutionOutcome } from "../runs/flow-contract.js";
import type { RootRun } from "../runs/types.js";
import type { TelegramLiveSmokeTarget } from "./server-runtime-context.js";
import type { TelegramLiveSmokeEvidenceProjection } from "./telegram-live-smoke-evidence.js";
import type { LiveSmokeDecisionReceiptReader } from "../channels/live-smoke-decision-receipts.js";
import type { LiveSmokeFirstResponseLatencyReader } from "../channels/live-smoke-latency-evidence.js";
export interface StartedTelegramLiveSmokeIngress {
    requestId: string;
    runId: string;
    requestGroupId: string;
    finished: Promise<RootRun | undefined>;
}
export interface TelegramLiveSmokeRuntimeDependencies {
    target: TelegramLiveSmokeTarget;
    startCanonicalRequest(input: {
        request: string;
        target: TelegramLiveSmokeTarget;
    }): Promise<StartedTelegramLiveSmokeIngress>;
    observabilityRepository: Pick<TypedObservabilityEventRepository, "list">;
    listTopologyRunsForRootRun(rootRunId: string): readonly unknown[];
    readExecutionOutcome(runId: string): RequestExecutionOutcome | undefined;
    readDecisionReceiptRefs: LiveSmokeDecisionReceiptReader;
    readFirstResponseLatency: LiveSmokeFirstResponseLatencyReader;
    readEvidence(run: {
        id: string;
        requestGroupId: string;
    }, target: TelegramLiveSmokeTarget): TelegramLiveSmokeEvidenceProjection;
    cancelRun?(runId: string): void;
    timeoutMs?: number;
    now?: () => number;
}
export declare function createTelegramLiveSmokeRuntimePorts(dependencies: TelegramLiveSmokeRuntimeDependencies): TelegramLiveSmokeExecutorPorts;
//# sourceMappingURL=telegram-live-smoke-runtime.d.ts.map