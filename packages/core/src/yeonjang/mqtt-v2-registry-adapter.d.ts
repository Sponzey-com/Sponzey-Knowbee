import type { YeonjangMqttV2CapabilitiesObservation, YeonjangMqttV2StatusObservation } from "./mqtt-v2-contract.js";
import type { YeonjangInstanceTrustState, YeonjangRegistryObservation } from "./registry.js";
export interface ExistingYeonjangV2RegistryIdentity {
    readonly instanceId: string;
    readonly instanceAlias: string;
    readonly displayName: string;
    readonly nodeId: string;
    readonly supportProfile: string;
    readonly platform: string | null;
    readonly arch: string | null;
    readonly version: string | null;
    readonly capabilityHash: string | null;
    readonly methodCount: number;
    readonly workspaceScopeId: string | null;
    readonly trustState: YeonjangInstanceTrustState;
    readonly state?: string;
}
export declare function projectYeonjangMqttV2CapabilitiesToRegistryObservation(input: {
    readonly capabilities: YeonjangMqttV2CapabilitiesObservation;
    readonly clientId: string | null;
    readonly existing: ExistingYeonjangV2RegistryIdentity | null;
}): YeonjangRegistryObservation;
/**
 * Converts admitted v2 liveness into the existing registry command shape.
 * Alias, trust, workspace, and capability facts stay owned by the registry;
 * a status packet cannot replace them with user-facing or transport text.
 */
export declare function projectYeonjangMqttV2StatusToRegistryObservation(input: {
    readonly status: YeonjangMqttV2StatusObservation;
    readonly clientId: string | null;
    readonly existing: ExistingYeonjangV2RegistryIdentity | null;
}): YeonjangRegistryObservation;
//# sourceMappingURL=mqtt-v2-registry-adapter.d.ts.map