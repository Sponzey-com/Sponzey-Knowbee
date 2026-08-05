import { type McpMutationRuntime } from "../capabilities/mcp-mutation-runtime.js";
import type { RuntimePaths } from "../config/paths.js";
import type { KnowbeeConfig } from "../config/types.js";
export declare function createApiMcpMutationRuntime(input: {
    config: KnowbeeConfig;
    paths: RuntimePaths;
    mcpProcessEnv: Readonly<Record<string, string | undefined>>;
    now?: () => number;
}): McpMutationRuntime;
//# sourceMappingURL=mcp-mutation-bootstrap.d.ts.map