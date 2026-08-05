import type { ChannelSmokeScenario, ChannelSmokeTrace } from "../channels/smoke-runner.js";
import type { RuntimePaths } from "../config/paths.js";
import type { KnowbeeConfig } from "../config/types.js";
import { type ApiServerRuntimeContext } from "./server-runtime-context.js";
type ChannelLiveSmokeExecutor = (scenario: ChannelSmokeScenario) => Promise<ChannelSmokeTrace>;
export declare function createAvailableChannelSmokeLiveExecutor(input: {
    readonly webui?: ChannelLiveSmokeExecutor;
    readonly telegram?: ChannelLiveSmokeExecutor;
    readonly slack?: ChannelLiveSmokeExecutor;
}): ChannelLiveSmokeExecutor | undefined;
export declare function startServer(cfg: KnowbeeConfig, paths: RuntimePaths, runtime: ApiServerRuntimeContext): Promise<void>;
export declare function closeServer(): Promise<void>;
export {};
//# sourceMappingURL=server.d.ts.map