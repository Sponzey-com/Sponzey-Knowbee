import type { FastifyInstance } from "fastify";
import type { ApprovalDecision, ApprovalResolutionReason } from "../../events/index.js";
import type { KnowbeeEvents } from "../../events/index.js";
export declare function getWebUiWsClientCount(): number;
export declare function projectWebUiBroadcastPayload<T>(data: T): T;
export declare function redactWebUiTransportValue<T>(value: T): T;
export declare function projectToolBeforeForWebUi(event: KnowbeeEvents["tool.before"]): {
    type: "tool.before";
} & KnowbeeEvents["tool.before"];
export declare function projectRunEventForWebUi<T extends Record<string, unknown>>(type: string, event: T): {
    type: string;
} & T;
export declare function projectScheduleEventForWebUi<T extends Record<string, unknown>>(type: string, event: T): {
    type: string;
} & T;
export declare function projectControlEventForWebUi(event: KnowbeeEvents["control.event"]): {
    type: "control.event";
} & KnowbeeEvents["control.event"];
export declare function projectOrchestrationEventForWebUi(event: KnowbeeEvents["orchestration.event"]): {
    type: "orchestration.event";
} & KnowbeeEvents["orchestration.event"];
export declare function projectApprovalRequestForWebUi(event: Pick<KnowbeeEvents["approval.request"], "approvalId" | "runId" | "toolName" | "params" | "kind" | "guidance" | "expiresAt">): {
    type: "approval.request";
    approvalId?: string;
    runId: string;
    toolName: string;
    params: unknown;
    kind?: KnowbeeEvents["approval.request"]["kind"];
    guidance?: string;
    expiresAt?: number | null;
};
export declare function registerApprovalFromWs(runId: string, resolve: (d: ApprovalDecision, reason?: ApprovalResolutionReason) => void, approvalId?: string): void;
export interface WebUiApprovalResponseMessage {
    type?: string;
    approvalId?: string;
    runId?: string;
    decision?: string;
    toolName?: string;
}
export declare function resolveRegisteredWebUiApproval(input: {
    approvalId?: string | undefined;
    runId: string;
    decision: ApprovalDecision;
}): boolean;
export interface WebUiLiveUpdateAckMessage {
    type?: string;
    eventType?: string;
    emittedAt?: number;
    runId?: string;
    sessionId?: string;
    requestGroupId?: string;
    source?: string;
}
export declare function resolveWebUiApprovalResponse(msg: WebUiApprovalResponseMessage): boolean;
export declare function resolveWebUiLiveUpdateAck(msg: WebUiLiveUpdateAckMessage, now?: () => number): boolean;
export declare function resetWebUiApprovalStateForTest(): void;
export declare function registerWsRoute(app: FastifyInstance): void;
//# sourceMappingURL=stream.d.ts.map