import type { FastifyInstance } from "fastify";
import { type ChannelSmokeScenario, type ChannelSmokeTrace } from "../../channels/smoke-runner.js";
export interface ChannelSmokeRouteOptions {
    liveSmokeEnabled?: boolean;
    liveExecutor?: (scenario: ChannelSmokeScenario) => Promise<ChannelSmokeTrace>;
}
export declare function registerChannelSmokeRoute(app: FastifyInstance, options?: ChannelSmokeRouteOptions): void;
//# sourceMappingURL=channel-smoke.d.ts.map