import type { FeatureCapability } from "../contracts/feature-capability.js";
export interface PlatformCapabilityRuntime {
    providerConfigured: boolean;
    conversationPortAvailable: boolean;
    planningPortAvailable: boolean;
    executionPortAvailable: boolean;
    hierarchyPortAvailable: boolean;
    activeSubAgentCount: number;
}
export declare function projectPlatformCapabilities(runtime: PlatformCapabilityRuntime): FeatureCapability[];
//# sourceMappingURL=platform.d.ts.map