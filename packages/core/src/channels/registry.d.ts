import type { KnowbeeConfig } from "../config/types.js";
import type { ArtifactStorageContext } from "../artifacts/lifecycle.js";
import type { MemoryJournalRepository } from "../memory/journal.js";
import type { AgentHierarchyStorage } from "../orchestration/hierarchy.js";
import { type ChannelConnectionRecord } from "./connections.js";
import { type ChannelProviderFactory, type ChannelRuntimeStartResult, type ChannelRuntimeSummary } from "./runtime.js";
import type { ChannelPendingResponseDeliveryOwner } from "./pending-response-delivery.js";
export interface ChannelRegistryOptions {
    config: KnowbeeConfig;
    artifactStorage?: ArtifactStorageContext | undefined;
    memoryJournal?: MemoryJournalRepository | undefined;
    hierarchyStorage?: AgentHierarchyStorage | undefined;
    connections?: ChannelConnectionRecord[];
    factories?: ChannelProviderFactory[];
    now?: () => number;
}
export interface ChannelRegistryPlanItem {
    connection: ChannelConnectionRecord;
    factory: ChannelProviderFactory | null;
    shouldStart: boolean;
    reason: "enabled_configured" | "disabled" | "unconfigured" | "unsupported_provider";
}
export declare class ChannelRegistry {
    private readonly config;
    private readonly now;
    private readonly factories;
    private readonly adapters;
    private readonly startedConnectionIds;
    private readonly fixedConnections;
    constructor(options: ChannelRegistryOptions);
    registerFactory(factory: ChannelProviderFactory): void;
    loadConnections(): ChannelConnectionRecord[];
    plan(): ChannelRegistryPlanItem[];
    startEnabled(): Promise<ChannelRuntimeStartResult>;
    stopAll(): Promise<ChannelRuntimeSummary[]>;
    getCapabilitySummaries(): ChannelRuntimeSummary[];
    getPendingResponseDeliveryOwner(provider: string): ChannelPendingResponseDeliveryOwner | undefined;
    private health;
}
export declare function createBuiltInChannelProviderFactories(artifactStorage: ArtifactStorageContext, memoryJournal: MemoryJournalRepository, hierarchyStorage: AgentHierarchyStorage): ChannelProviderFactory[];
export declare function buildChannelRegistryRuntimeDiagnostics(config: KnowbeeConfig, artifactStorage: ArtifactStorageContext): ChannelRuntimeSummary[];
//# sourceMappingURL=registry.d.ts.map