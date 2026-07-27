import type { FastifyInstance } from "fastify";
import type { LiveAcceptanceBundleApproval } from "../../release/live-acceptance-bundle.js";
import { type LiveAcceptanceExecutionSelection } from "../../release/live-acceptance-execution-request.js";
import type { LiveAcceptanceRunnerResult } from "../../release/live-acceptance-runner.js";
export type LiveAcceptanceRouteExecutor = (input: {
    candidate: Readonly<{
        appVersion: string;
        gitTag: string | null;
        gitCommit: string | null;
    }>;
    approval: Readonly<LiveAcceptanceBundleApproval>;
    selection: Readonly<LiveAcceptanceExecutionSelection>;
    requestedKeyId: string;
    signal: AbortSignal;
}) => Promise<LiveAcceptanceRunnerResult>;
export declare const LIVE_ACCEPTANCE_READINESS_CAPABILITIES: readonly ["webui", "telegram", "slack", "web", "skill", "mcp", "yeonjang"];
export type LiveAcceptanceReadinessCapability = (typeof LIVE_ACCEPTANCE_READINESS_CAPABILITIES)[number];
export type LiveAcceptanceReadinessReasonCode = "live_acceptance_webui_target_unavailable" | "live_acceptance_telegram_target_unavailable" | "live_acceptance_slack_target_unavailable" | "live_acceptance_web_runtime_unavailable" | "live_acceptance_skill_selection_unavailable" | "live_acceptance_mcp_selection_unavailable" | "live_acceptance_yeonjang_selection_unavailable";
export type LiveAcceptanceCapabilityReadiness = Readonly<{
    capability: LiveAcceptanceReadinessCapability;
    status: "ready";
}> | Readonly<{
    capability: LiveAcceptanceReadinessCapability;
    status: "unavailable";
    reasonCode: LiveAcceptanceReadinessReasonCode;
}>;
export interface LiveAcceptanceRouteOptions {
    readonly enabled: boolean;
    readonly execute?: LiveAcceptanceRouteExecutor;
    readonly inspectReadiness?: () => readonly LiveAcceptanceCapabilityReadiness[];
    readonly now: () => number;
}
interface LiveAcceptanceRequestEventSource {
    readonly aborted: boolean;
    once(event: "aborted", listener: () => void): unknown;
    off(event: "aborted", listener: () => void): unknown;
}
interface LiveAcceptanceResponseEventSource {
    readonly writableEnded: boolean;
    once(event: "close", listener: () => void): unknown;
    off(event: "close", listener: () => void): unknown;
}
export declare function bindLiveAcceptanceRequestCancellation(input: {
    readonly request: LiveAcceptanceRequestEventSource;
    readonly response: LiveAcceptanceResponseEventSource;
}): Readonly<{
    signal: AbortSignal;
    dispose: () => void;
}>;
export declare function registerLiveAcceptanceRoute(app: FastifyInstance, options: LiveAcceptanceRouteOptions): void;
export {};
//# sourceMappingURL=live-acceptance.d.ts.map