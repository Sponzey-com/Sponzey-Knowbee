import type { ChannelSmokeRunnerOptions } from "../channels/smoke-runner.js";
import type { LiveAcceptanceSelectionAvailability } from "../release/live-acceptance-selection-preflight.js";
import type { LiveAcceptanceRuntimeIdentityAdmission } from "../release/live-acceptance-runtime-identity.js";
import type { StartupProcessContext } from "../runtime/startup-process-context.js";
import type { GatewayStartupProgressPort } from "../runtime/gateway-startup-coordinator.js";
import type { UpdateRuntimeEnvironment } from "../update/service.js";
import type { LiveAcceptanceRouteExecutor } from "./routes/live-acceptance.js";
import type { YeonjangExecutionAdmissionKeyProvisionerPort } from "../yeonjang/pairing-execution-admission-provisioning.js";
export type LiveAcceptanceSelectionAvailabilityInspector = () => readonly LiveAcceptanceSelectionAvailability[];
export interface TelegramLiveSmokeTarget {
    readonly chatId: number;
    readonly userId: number;
    readonly threadId?: number;
}
export interface SlackLiveSmokeTarget {
    readonly channelId: string;
    readonly userId: string;
    readonly threadTs?: string;
}
export type SlackLiveSmokeTargetParseResult = {
    status: "ready";
    target: SlackLiveSmokeTarget;
} | {
    status: "unavailable";
    reasonCode: "not_configured" | "incomplete" | "invalid";
};
export declare function parseSlackLiveSmokeTarget(env: Readonly<Record<string, string | undefined>>): SlackLiveSmokeTargetParseResult;
export type TelegramLiveSmokeTargetParseResult = {
    status: "ready";
    target: TelegramLiveSmokeTarget;
} | {
    status: "unavailable";
    reasonCode: "not_configured" | "incomplete" | "invalid";
};
export declare function parseTelegramLiveSmokeTarget(env: Readonly<Record<string, string | undefined>>): TelegramLiveSmokeTargetParseResult;
export interface ApiServerRuntimeContext {
    readonly uiModeEnv: Readonly<Record<string, string | undefined>>;
    readonly mcpProcessEnv: Readonly<Record<string, string | undefined>>;
    readonly argv: readonly string[];
    readonly enterpriseTopologyBuilderUi: string | undefined;
    readonly channelSmokeLiveEnabled: boolean;
    readonly liveAcceptanceEnabled: boolean;
    readonly liveAcceptanceExecutor?: LiveAcceptanceRouteExecutor;
    readonly liveAcceptanceExecutorFactory?: LiveAcceptanceExecutorFactory;
    readonly liveAcceptanceSelectionAvailabilityInspector?: LiveAcceptanceSelectionAvailabilityInspector;
    readonly liveAcceptanceRuntimeIdentityInspector?: () => LiveAcceptanceRuntimeIdentityAdmission;
    readonly telegramLiveSmokeTarget?: TelegramLiveSmokeTarget;
    readonly slackLiveSmokeTarget?: SlackLiveSmokeTarget;
    readonly channelSmokeLiveExecutor?: ChannelSmokeRunnerOptions["executeScenario"];
    readonly updateEnv: Readonly<UpdateRuntimeEnvironment>;
    readonly pairingExecutionAdmissionKeyProvisioner?: YeonjangExecutionAdmissionKeyProvisionerPort;
    readonly startupProgress?: GatewayStartupProgressPort;
}
export interface LiveAcceptanceExecutorFactoryInput {
    readonly channelSmokeLiveExecutor?: ChannelSmokeRunnerOptions["executeScenario"];
}
export type LiveAcceptanceExecutorFactory = (input: Readonly<LiveAcceptanceExecutorFactoryInput>) => LiveAcceptanceRouteExecutor | undefined;
export interface ApiServerRuntimeDependencies {
    readonly liveAcceptanceExecutor?: LiveAcceptanceRouteExecutor;
    readonly liveAcceptanceExecutorFactory?: LiveAcceptanceExecutorFactory;
    readonly liveAcceptanceSelectionAvailabilityInspector?: LiveAcceptanceSelectionAvailabilityInspector;
    readonly liveAcceptanceRuntimeIdentityInspector?: () => LiveAcceptanceRuntimeIdentityAdmission;
    readonly channelSmokeLiveExecutor?: ChannelSmokeRunnerOptions["executeScenario"];
    readonly telegramLiveSmokeTarget?: TelegramLiveSmokeTarget;
    readonly slackLiveSmokeTarget?: SlackLiveSmokeTarget;
    readonly pairingExecutionAdmissionKeyProvisioner?: YeonjangExecutionAdmissionKeyProvisionerPort;
    readonly startupProgress?: GatewayStartupProgressPort;
}
export type ApiLiveAcceptanceExecutorResolution = {
    readonly status: "ready";
    readonly executor: LiveAcceptanceRouteExecutor;
} | {
    readonly status: "unavailable";
    readonly reasonCode: "live_acceptance_executor_missing" | "live_acceptance_executor_factory_unavailable" | "live_acceptance_executor_factory_failed";
};
export declare function resolveApiLiveAcceptanceExecutor(input: {
    readonly runtime: Pick<ApiServerRuntimeContext, "liveAcceptanceExecutor" | "liveAcceptanceExecutorFactory">;
    readonly channelSmokeLiveExecutor?: ChannelSmokeRunnerOptions["executeScenario"];
}): ApiLiveAcceptanceExecutorResolution;
export declare function createApiServerRuntimeContext(startup: StartupProcessContext, dependencies?: ApiServerRuntimeDependencies): ApiServerRuntimeContext;
//# sourceMappingURL=server-runtime-context.d.ts.map