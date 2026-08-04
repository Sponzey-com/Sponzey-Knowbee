import type { ChannelSource } from "../channels/contracts.js";
import type { MqttConfig } from "../config/types.js";
import { type MqttExtensionSnapshot } from "../mqtt/broker.js";
import { type YeonjangCommandAttemptEvidence } from "./command-attempt.js";
import type { YeonjangAuthorizationReceipt, YeonjangExecutionAuthorizationGrant, YeonjangExecutionAuthorizationIssuerPort } from "./execution-authorization-receipt.js";
import { type YeonjangMqttV2CommandMethod } from "./mqtt-v2-contract.js";
export type { YeonjangAuthorizationReceipt } from "./execution-authorization-receipt.js";
export declare const YEONJANG_COMMAND_PROTOCOL_VERSION: 1;
export interface YeonjangRequestEnvelope {
    protocolVersion: typeof YEONJANG_COMMAND_PROTOCOL_VERSION;
    id: string;
    method: string;
    params: Record<string, unknown>;
    metadata?: YeonjangRequestMetadata;
}
export interface YeonjangRequestMetadata {
    runId?: string;
    requestGroupId?: string;
    sessionId?: string;
    targetSessionId?: string;
    commandId?: string;
    operationId?: string;
    targetFingerprint?: `sha256:${string}`;
    deliveryId?: string;
    idempotencyKey?: string;
    expiresAt?: number;
    cancelToken?: string;
    broadcastRunId?: string;
    broadcastIndex?: number;
    broadcastTotal?: number;
    source?: ChannelSource;
    agentId?: string;
    auditId?: string;
    capabilityDelegationId?: string;
    authorizationReceipt?: YeonjangAuthorizationReceipt;
}
export interface YeonjangErrorBody {
    code: string;
    message: string;
}
export interface YeonjangResponseEnvelope<T = unknown> {
    id?: string;
    ok: boolean;
    result?: T;
    error?: YeonjangErrorBody;
    attempt?: unknown;
}
export declare class YeonjangCommandError extends Error {
    readonly code: string;
    readonly attempt?: YeonjangCommandAttemptEvidence;
    constructor(input: {
        code: string;
        message: string;
        attempt?: YeonjangCommandAttemptEvidence;
    });
}
/**
 * Converts the signed MQTT v2 terminal failure into the existing command-attempt
 * contract. The terminal, not user-facing prose, owns whether an effect started.
 */
export declare function projectYeonjangMqttV2TerminalFailure(input: {
    readonly method: YeonjangMqttV2CommandMethod;
    readonly commandId: string;
    readonly operationId: string;
    readonly targetFingerprint: string;
    readonly executionOutcome: "blocked" | "failed" | "cancelled" | "effect_unknown";
    readonly failure: Readonly<Record<string, unknown>> | null;
}): {
    readonly code: string;
    readonly message: string;
    readonly attempt?: YeonjangCommandAttemptEvidence;
};
export type YeonjangChunkAssemblyResult = {
    kind: "pending";
} | {
    kind: "complete";
    payload: Buffer;
} | {
    kind: "rejected";
    code: "invalid_response_chunk" | "response_chunk_too_large";
};
export interface YeonjangChunkAssembler {
    accept(value: unknown): YeonjangChunkAssemblyResult;
}
export declare function createYeonjangChunkAssembler(input: {
    requestId: string;
    maxTotalBytes?: number;
    maxChunkCount?: number;
}): YeonjangChunkAssembler;
export interface YeonjangClientOptions {
    extensionId?: string;
    timeoutMs?: number;
    forceRefresh?: boolean;
    signal?: AbortSignal;
    metadata?: YeonjangRequestMetadata;
    mqttConfig?: MqttConfig;
    executionAuthorization?: {
        readonly issuer: YeonjangExecutionAuthorizationIssuerPort;
        readonly resourceScope: string;
        readonly grant: YeonjangExecutionAuthorizationGrant;
    };
}
export interface YeonjangCommandDispatch {
    requestId: string;
    commandId: string;
    deliveryId: string;
    idempotencyKey: string;
    expiresAt: number;
    cancelToken: string;
    metadata: YeonjangRequestMetadata;
    request: YeonjangRequestEnvelope;
}
export declare function createYeonjangCancellationRequest(input: {
    commandId: string;
    cancelToken: string;
    targetSessionId?: string;
}): YeonjangRequestEnvelope;
export interface YeonjangMethodCapability {
    name: string;
    implemented: boolean;
    supported?: boolean;
    supportState?: string;
    requiresApproval?: boolean;
    requiresPermission?: boolean;
    permissionSetting?: string | null;
    knownLimitations?: string[];
    requiresInteractiveDesktop?: boolean;
    broadcastSafe?: boolean;
    defaultTargetPolicy?: string;
    reasonCodes?: string[];
    platformBaseline?: Record<string, unknown>;
    outputModes?: string[];
    lastCheckedAt?: number;
}
export interface ArmedYeonjangResponseWaiter<T> {
    readonly response: Promise<T>;
    cancel(): Promise<void>;
}
export declare function armYeonjangResponseWaiter<T>(createResponseWaiter: (cancellationSignal: AbortSignal) => Promise<T>): ArmedYeonjangResponseWaiter<T>;
export interface YeonjangCapabilityMatrixEntry {
    supported?: boolean;
    supportState?: string;
    requiresApproval?: boolean;
    requiresPermission?: boolean;
    permissionSetting?: string | null;
    knownLimitations?: string[];
    requiresInteractiveDesktop?: boolean;
    broadcastSafe?: boolean;
    defaultTargetPolicy?: string;
    reasonCodes?: string[];
    platformBaseline?: Record<string, unknown>;
    outputModes?: string[];
    lastCheckedAt?: number;
}
export interface YeonjangCapabilitiesPayload {
    node?: string;
    version?: string;
    protocolVersion?: string;
    protocol_version?: string;
    gitTag?: string;
    git_tag?: string;
    gitCommit?: string;
    git_commit?: string;
    buildTarget?: string;
    build_target?: string;
    os?: string;
    arch?: string;
    platform?: string;
    supportProfile?: string;
    configuredSupportProfile?: string;
    supportProfileReasonCodes?: string[];
    interactiveDesktopAvailable?: boolean;
    trayRuntimeAvailable?: boolean;
    transport?: string | string[];
    capabilityHash?: string;
    capability_hash?: string;
    capabilityMatrix?: Record<string, YeonjangCapabilityMatrixEntry>;
    capability_matrix?: Record<string, YeonjangCapabilityMatrixEntry>;
    methods?: YeonjangMethodCapability[];
    permissions?: Record<string, unknown>;
    toolHealth?: Record<string, unknown>;
    tool_health?: Record<string, unknown>;
    lastCapabilityRefreshAt?: number;
    lastCheckedAt?: number;
}
export declare const DEFAULT_YEONJANG_EXTENSION_ID = "yeonjang-main";
export declare function buildYeonjangTopics(extensionId?: string): {
    statusTopic: string;
    capabilitiesTopic: string;
    requestTopic: string;
    responseTopic: string;
    eventTopic: string;
};
export declare function invokeYeonjangMethod<T = unknown>(method: string, params?: Record<string, unknown>, options?: YeonjangClientOptions): Promise<T>;
export declare function createYeonjangCommandDispatch(method: string, params?: Record<string, unknown>, options?: YeonjangClientOptions): YeonjangCommandDispatch;
export declare function isYeonjangSafeRetryMethod(method: string): boolean;
export declare function getYeonjangCapabilities(options?: YeonjangClientOptions): Promise<YeonjangCapabilitiesPayload>;
export declare function clearYeonjangCapabilityCache(): void;
export declare function shouldSerializeYeonjangMethod(method: string): boolean;
export declare function enqueueYeonjangExtensionExecution<T>(extensionId: string, task: () => Promise<T>): Promise<T>;
export declare function canYeonjangHandleMethod(method: string, options?: YeonjangClientOptions): Promise<boolean>;
export declare function resolveYeonjangMethodCapability(capabilities: YeonjangCapabilitiesPayload, method: string): YeonjangCapabilityMatrixEntry | YeonjangMethodCapability | null;
export declare function doesYeonjangCapabilitySupportMethod(capabilities: YeonjangCapabilitiesPayload, method: string): boolean;
export declare function hasYeonjangCapabilityMatrix(capabilities: YeonjangCapabilitiesPayload): boolean;
export declare function resolveYeonjangCapabilityOutputModes(capabilities: YeonjangCapabilitiesPayload, method: string): string[] | null;
export declare function doesYeonjangCapabilitySupportOutputMode(capabilities: YeonjangCapabilitiesPayload, method: string, outputMode: string): boolean | null;
export declare function snapshotToYeonjangCapabilitiesPayload(snapshot: MqttExtensionSnapshot): YeonjangCapabilitiesPayload;
export declare function isYeonjangUnavailableError(error: unknown): boolean;
//# sourceMappingURL=mqtt-client.d.ts.map