import { type ArtifactStorageContext } from "../artifacts/lifecycle.js";
import type { RuntimePaths } from "../config/paths.js";
import type { KnowbeeConfig } from "../config/types.js";
import { type LiveAcceptanceLlmPorts } from "../release/live-acceptance-llm-adapter.js";
import type { LiveAcceptanceSigningRequestSink } from "../release/live-acceptance-runner.js";
import type { LiveAcceptanceRuntimeSnapshotReaders } from "../release/live-acceptance-runtime-snapshot-adapter.js";
import type { LiveAcceptanceRuntimeIdentityAdmission } from "../release/live-acceptance-runtime-identity.js";
import type { YeonjangLiveAuditEvent } from "../runs/yeonjang-live-transport-adapter.js";
import type { ToolDispatcher } from "../tools/dispatcher.js";
import { createLiveAcceptanceRuntimeFactory } from "./live-acceptance-runtime-factory.js";
import type { ApiServerRuntimeDependencies } from "./server-runtime-context.js";
export declare function resolveConfiguredTelegramLiveSmokeTarget(config: Readonly<KnowbeeConfig>): ApiServerRuntimeDependencies["telegramLiveSmokeTarget"];
export interface LiveAcceptanceBootstrapPorts {
    readonly readers: LiveAcceptanceRuntimeSnapshotReaders;
    readonly inspectRuntimeIdentity: () => LiveAcceptanceRuntimeIdentityAdmission;
    readonly llm: Readonly<LiveAcceptanceLlmPorts>;
    readonly artifactStorage: ArtifactStorageContext;
    readonly findAuditEventId: (input: {
        readonly runId: string;
        readonly requestGroupId?: string;
        readonly toolName: string;
    }) => string | null;
    readonly invokeYeonjang: Parameters<typeof createLiveAcceptanceRuntimeFactory>[0]["invokeYeonjang"];
    readonly recordYeonjangAuditEvent: (event: YeonjangLiveAuditEvent) => string | null;
    readonly runChannels: Parameters<typeof createLiveAcceptanceRuntimeFactory>[0]["runChannels"];
    readonly requestSink: LiveAcceptanceSigningRequestSink;
    readonly now: () => number;
    readonly createId: () => string;
}
export declare function createLiveAcceptanceBootstrapDependencies(input: {
    readonly config: Readonly<KnowbeeConfig>;
    readonly dispatcher: Pick<ToolDispatcher, "dispatch" | "dispatchAgentScoped">;
    readonly ports: LiveAcceptanceBootstrapPorts;
}): ApiServerRuntimeDependencies;
export declare function createDefaultLiveAcceptanceBootstrapDependencies(input: {
    readonly config: Readonly<KnowbeeConfig>;
    readonly paths: Pick<RuntimePaths, "stateDir">;
    readonly dispatcher: ToolDispatcher;
}): ApiServerRuntimeDependencies;
//# sourceMappingURL=live-acceptance-bootstrap.d.ts.map