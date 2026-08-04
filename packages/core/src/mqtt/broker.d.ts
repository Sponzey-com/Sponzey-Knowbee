import type { KnowbeeConfig, MqttConfig } from "../config/types.js";
export interface MqttBrokerSnapshot {
    enabled: boolean;
    running: boolean;
    host: string;
    port: number;
    url: string;
    clientCount: number;
    authEnabled: boolean;
    allowAnonymous: boolean;
    reason: string | null;
}
type ExtensionTopicKind = "status" | "capabilities" | "request" | "response" | "event";
export type MqttV2RequesterRouteAdmission = {
    readonly ok: true;
    readonly requesterId: string | null;
} | {
    readonly ok: false;
    readonly reasonCode: "mqtt_v2_requester_config_required" | "mqtt_v2_requester_mismatch";
};
/**
 * Admits requester-scoped v2 routes against the immutable bootstrap identity.
 * Observation topics are producer-owned and therefore carry no requester.
 */
export declare function admitMqttV2RequesterRoute(topic: unknown, configuredRequesterId: string): MqttV2RequesterRouteAdmission;
export interface MqttExtensionSnapshot {
    extensionId: string;
    clientId: string | null;
    displayName: string | null;
    instanceId?: string | null;
    instanceAlias?: string | null;
    normalizedCallName?: string | null;
    nodeId?: string | null;
    supportProfile?: string | null;
    configuredSupportProfile?: string | null;
    supportProfileReasonCodes?: string[];
    interactiveDesktopAvailable?: boolean | null;
    trayRuntimeAvailable?: boolean | null;
    state: string | null;
    message: string | null;
    version: string | null;
    protocolVersion?: string | null;
    gitTag?: string | null;
    gitCommit?: string | null;
    buildTarget?: string | null;
    platform?: string | null;
    os?: string | null;
    arch?: string | null;
    transport?: string[];
    capabilityHash?: string | null;
    methods: string[];
    sessionId?: string | null;
    startupMode?: string | null;
    windowMode?: string | null;
    trayState?: string | null;
    trustState?: string | null;
    workspaceScopeId?: string | null;
    pairingFingerprint?: string | null;
    hostFingerprint?: string | null;
    installFingerprint?: string | null;
    /** Exact signed v2 execution target identity; never derived from host fields. */
    targetFingerprint?: string | null;
    /** Monotonic producer revisions used only to reject stale same-session v2 projections. */
    v2StatusSequence?: number | null;
    v2CapabilitiesSequence?: number | null;
    /** Signed online status lease; null for offline or non-v2 projections. */
    v2StatusExpiresAt?: number | null;
    permissions?: Record<string, unknown>;
    toolHealth?: Record<string, unknown>;
    capabilityMatrix?: Record<string, unknown>;
    lastCapabilityRefreshAt?: number | null;
    lastSeenAt: number;
}
export interface MqttExchangeLogEntry {
    id: string;
    timestamp: number;
    direction: "knowbee_to_extension" | "extension_to_knowbee";
    topic: string;
    extensionId: string | null;
    kind: ExtensionTopicKind | "unknown";
    clientId: string | null;
    payload: unknown;
}
export type MqttV2RequesterRouteFailureReason = "mqtt_v2_requester_config_required" | "mqtt_v2_requester_mismatch";
/** Keeps broker credential failure distinct from exact requester admission. */
export declare function createMqttV2RequesterRouteError(reasonCode: MqttV2RequesterRouteFailureReason): Error & {
    readonly code: MqttV2RequesterRouteFailureReason;
    readonly returnCode: 5;
};
export declare function expireMqttV2Observations(nowMs: number): {
    readonly expiredCount: number;
};
export declare function validateMqttBrokerConfig(config: MqttConfig): string | null;
export declare function startMqttBroker(config: MqttConfig): Promise<void>;
export declare function stopMqttBroker(): Promise<void>;
export declare function getMqttBrokerSnapshot(): MqttBrokerSnapshot;
export declare function getMqttExtensionSnapshots(): MqttExtensionSnapshot[];
export declare function getMqttExchangeLogs(): MqttExchangeLogEntry[];
export declare function disconnectMqttExtension(extensionId: string): Promise<{
    ok: boolean;
    message: string;
}>;
export declare function restartMqttBrokerFromConfig(config: Pick<KnowbeeConfig, "mqtt">): Promise<void>;
export {};
//# sourceMappingURL=broker.d.ts.map