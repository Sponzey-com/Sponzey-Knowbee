import type { PersistedConfigFileSystem, PersistedConfigPaths } from "../config/persisted-file.js";
import type { KnowbeeConfig, McpServerConfig } from "../config/types.js";
import type { CapabilityRiskLevel } from "../contracts/sub-agent-orchestration.js";
import type { McpConfigurationStorePort, McpRuntimeApplyPort } from "./mcp-mutation-runtime.js";
export interface McpCatalogAdapterRow {
    internalMcpId: string;
    status: "enabled" | "disabled" | "archived";
    displayName: string;
    risk: CapabilityRiskLevel;
    toolNames: readonly string[];
    metadata: Readonly<Record<string, unknown>>;
    source: "manual" | "import" | "system";
    auditId: string | null;
    createdAt: number;
    updatedAt: number;
}
export interface McpCatalogPersistencePort {
    list(includeArchived: boolean): readonly McpCatalogAdapterRow[];
    write(row: McpCatalogAdapterRow): void;
}
export declare function createMcpConfigurationStore(input: {
    paths: PersistedConfigPaths;
    initialConfig: Pick<KnowbeeConfig, "mcp">;
    fileSystem: PersistedConfigFileSystem;
    catalog: McpCatalogPersistencePort;
    externalRevision?: () => number;
}): McpConfigurationStorePort;
export interface McpRegistryApplyPort {
    reload(config: KnowbeeConfig, baseEnv: Readonly<Record<string, string | undefined>>): Promise<readonly {
        name: string;
        ready: boolean;
        toolCount: number;
    }[]>;
    statuses(): readonly {
        name: string;
        ready: boolean;
        toolCount: number;
    }[];
    reloadTarget(input: {
        name: string;
        config: McpServerConfig;
        defaultCwd: string;
        baseEnv: Readonly<Record<string, string | undefined>>;
    }): Promise<{
        name: string;
        ready: boolean;
        toolCount: number;
    }>;
}
export declare function createMcpRegistryApplyAdapter(input: {
    initialConfig: KnowbeeConfig;
    initialRevision: number;
    baseEnv: Readonly<Record<string, string | undefined>>;
    registry: McpRegistryApplyPort;
}): McpRuntimeApplyPort;
//# sourceMappingURL=mcp-mutation-adapters.d.ts.map