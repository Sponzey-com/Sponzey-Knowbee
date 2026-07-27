import type { McpServerStatus } from "../mcp/registry.js";
import type { AnyTool } from "../tools/types.js";
import type { YeonjangRegistryInstanceView } from "../yeonjang/registry.js";
import type { CapabilityRuntimeHealthObservation } from "./canonical-capability-snapshot.js";
export declare function projectMcpRuntimeHealthObservations(input: {
    statuses: McpServerStatus[];
    observedAt: number;
}): CapabilityRuntimeHealthObservation[];
export declare function projectYeonjangRuntimeHealthObservations(input: {
    instances: YeonjangRegistryInstanceView[];
    tools: AnyTool[];
    methodSnapshots: Array<{
        instanceId: string;
        methods: string[];
    }>;
    observedAt: number;
}): CapabilityRuntimeHealthObservation[];
//# sourceMappingURL=runtime-capability-health.d.ts.map