import type { LiveAcceptanceBundleCandidate } from "./live-acceptance-bundle.js";
import { type YeonjangLiveSmokeReadOnlyMethod } from "../runs/yeonjang-live-smoke.js";
export interface LiveAcceptanceExecutionAuthorization {
    readonly authorizationId: string;
    readonly auditEventId: string;
    readonly approvedAt: number;
    readonly expiresAt: number;
}
export type LiveAcceptanceExtensionCapability = "skill" | "mcp";
export type LiveAcceptanceSelectionJsonValue = string | number | boolean | null | readonly LiveAcceptanceSelectionJsonValue[] | {
    readonly [key: string]: LiveAcceptanceSelectionJsonValue;
};
export interface LiveAcceptanceExtensionSelection {
    readonly capability: LiveAcceptanceExtensionCapability;
    readonly agentId: string;
    readonly bindingId: string;
    readonly catalogId: string;
    readonly toolName: string;
    readonly readOnly: true;
    readonly params: Readonly<Record<string, LiveAcceptanceSelectionJsonValue>>;
}
export interface LiveAcceptanceYeonjangSelection {
    readonly instanceId: string;
    readonly sessionId: string;
    readonly method: YeonjangLiveSmokeReadOnlyMethod;
    readonly params?: Readonly<Record<string, LiveAcceptanceSelectionJsonValue>>;
    readonly readOnly: true;
}
export interface LiveAcceptanceExecutionSelection {
    readonly extensions: readonly LiveAcceptanceExtensionSelection[];
    readonly yeonjang: LiveAcceptanceYeonjangSelection;
}
export interface LiveAcceptanceExecutionRequest {
    readonly kind: "knowbee.release.live_acceptance_execution_request";
    readonly schemaVersion: 2;
    readonly candidate: Readonly<LiveAcceptanceBundleCandidate>;
    readonly authorization: LiveAcceptanceExecutionAuthorization;
    readonly selection: LiveAcceptanceExecutionSelection;
    readonly requestedKeyId: `sha256:${string}`;
}
export type LiveAcceptanceExecutionRequestValidation = {
    status: "verified";
    request: Readonly<LiveAcceptanceExecutionRequest>;
} | {
    status: "rejected";
    reasonCode: string;
};
export declare function validateLiveAcceptanceExecutionRequest(value: unknown, now: number): LiveAcceptanceExecutionRequestValidation;
//# sourceMappingURL=live-acceptance-execution-request.d.ts.map