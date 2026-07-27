import type { DbAgentCapabilityBinding, DbMcpServerCatalogEntry, DbSkillCatalogEntry } from "../db/index.js";
import type { AnyTool } from "../tools/types.js";
import type { YeonjangRegistryInstanceView } from "../yeonjang/registry.js";
import type { LiveAcceptanceRuntimeSnapshot } from "./live-acceptance-selection-preflight.js";
export interface LiveAcceptanceRuntimeSnapshotReaders {
    readonly listBindings: () => readonly DbAgentCapabilityBinding[];
    readonly listSkillCatalogs: () => readonly DbSkillCatalogEntry[];
    readonly listMcpCatalogs: () => readonly DbMcpServerCatalogEntry[];
    readonly listTools: () => readonly Pick<AnyTool, "name" | "riskLevel" | "requiresApproval" | "sideEffect">[];
    readonly listYeonjangInstances: (capturedAt: number) => readonly YeonjangRegistryInstanceView[];
}
export declare function captureLiveAcceptanceRuntimeSnapshot(input: {
    readonly capturedAt: number;
    readonly readers: LiveAcceptanceRuntimeSnapshotReaders;
}): LiveAcceptanceRuntimeSnapshot;
//# sourceMappingURL=live-acceptance-runtime-snapshot-adapter.d.ts.map