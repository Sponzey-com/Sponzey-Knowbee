import type { SlackLiveSmokeExecutorPorts } from "../channels/slack-live-smoke-executor.js";
import type { TypedObservabilityEventRepository } from "../observability/typed-event-repository.js";
import type { RootRun } from "../runs/types.js";
import type { SlackLiveSmokeTarget } from "./server-runtime-context.js";
import type { SlackLiveSmokeEvidenceProjection } from "./slack-live-smoke-evidence.js";
export interface StartedSlackLiveSmokeIngress {
    requestId: string;
    runId: string;
    requestGroupId: string;
    threadTs: string;
    finished: Promise<RootRun | undefined>;
}
export interface SlackLiveSmokeRuntimeDependencies {
    target: SlackLiveSmokeTarget;
    startCanonicalRequest(input: {
        request: string;
        target: SlackLiveSmokeTarget;
    }): Promise<StartedSlackLiveSmokeIngress>;
    observabilityRepository: Pick<TypedObservabilityEventRepository, "list">;
    listTopologyRunsForRootRun(rootRunId: string): readonly unknown[];
    readEvidence(run: {
        id: string;
        requestGroupId: string;
    }, target: SlackLiveSmokeTarget): SlackLiveSmokeEvidenceProjection;
    timeoutMs?: number;
}
export declare function createSlackLiveSmokeRuntimePorts(dependencies: SlackLiveSmokeRuntimeDependencies): SlackLiveSmokeExecutorPorts;
//# sourceMappingURL=slack-live-smoke-runtime.d.ts.map