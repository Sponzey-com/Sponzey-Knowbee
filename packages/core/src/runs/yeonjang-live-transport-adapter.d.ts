import type { YeonjangRequestMetadata } from "../yeonjang/mqtt-client.js";
import type { YeonjangLiveSmokeReadOnlyMethod } from "./yeonjang-live-smoke.js";
import type { YeonjangLiveSmokeExecutePort } from "./yeonjang-live-smoke-runner.js";
export interface YeonjangLiveInvokeOptions {
    readonly extensionId: string;
    readonly timeoutMs: number;
    readonly metadata: YeonjangRequestMetadata;
}
export type YeonjangLiveInvokePort = (method: YeonjangLiveSmokeReadOnlyMethod, params: Record<string, unknown>, options: YeonjangLiveInvokeOptions) => Promise<unknown>;
export interface YeonjangLiveAuditEvent {
    readonly runId: string;
    readonly requestGroupId: string;
    readonly commandId: string;
    readonly instanceId: string;
    readonly sessionId: string;
    readonly method: YeonjangLiveSmokeReadOnlyMethod;
    readonly evidenceRef: string;
}
export declare function createYeonjangLiveTransportAdapter(input: {
    readonly invoke: YeonjangLiveInvokePort;
    readonly timeoutMs: number;
    readonly createCommandId: () => string;
    readonly createAuditCorrelationId: () => string;
    readonly recordAuditEvent: (event: YeonjangLiveAuditEvent) => string | null;
}): YeonjangLiveSmokeExecutePort;
//# sourceMappingURL=yeonjang-live-transport-adapter.d.ts.map