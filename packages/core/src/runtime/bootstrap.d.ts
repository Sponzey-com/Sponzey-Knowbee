import { closeServer } from "../api/server.js";
import { type RuntimePaths } from "../config/paths.js";
import type { KnowbeeConfig } from "../config/types.js";
import { type BrowserFocusRuntimeBootstrapOptions } from "../yeonjang/browser-focus-runtime-bootstrap.js";
import type { GatewayStartupProgressPort } from "./gateway-startup-coordinator.js";
import { type McpStartupPort } from "./mcp-startup-port.js";
export interface BootstrapOptions {
    runtimePaths?: RuntimePaths;
    startupProgress?: GatewayStartupProgressPort;
    mcpStartupPort?: McpStartupPort;
    browserFocusExecutionAdmission?: Omit<BrowserFocusRuntimeBootstrapOptions, "trustedExtensionIds" | "connectionPassword">;
}
export declare function bootstrap(config?: KnowbeeConfig, options?: BootstrapOptions): KnowbeeConfig;
export declare function bootstrapRuntime(config?: KnowbeeConfig, options?: BootstrapOptions): Promise<KnowbeeConfig>;
export declare function bootstrapAsync(config?: KnowbeeConfig, options?: BootstrapOptions): Promise<KnowbeeConfig>;
export { closeServer };
//# sourceMappingURL=bootstrap.d.ts.map