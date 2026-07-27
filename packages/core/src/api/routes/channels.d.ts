import type { FastifyInstance } from "fastify";
import { resolveRegisteredWebUiApproval } from "../ws/stream.js";
export interface ChannelsRouteDependencies {
    resolveRegisteredWebUiApproval: typeof resolveRegisteredWebUiApproval;
}
export declare function registerChannelsRoute(app: FastifyInstance, dependencies?: ChannelsRouteDependencies): void;
//# sourceMappingURL=channels.d.ts.map