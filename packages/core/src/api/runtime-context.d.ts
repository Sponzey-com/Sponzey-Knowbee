import type { FastifyInstance, FastifyRequest } from "fastify";
import type { KnowbeeConfig } from "../config/types.js";
import type { RuntimePaths } from "../config/paths.js";
export interface ApiRuntimeContext {
    readonly config: KnowbeeConfig;
    readonly paths: RuntimePaths;
}
declare module "fastify" {
    interface FastifyInstance {
        knowbeeRuntimeContext: ApiRuntimeContext;
    }
}
export declare function installApiRuntimeConfig(app: FastifyInstance, config: KnowbeeConfig, paths: RuntimePaths): ApiRuntimeContext;
export declare function getApiRuntimePaths(request: Pick<FastifyRequest, "server">): RuntimePaths;
export declare function getApiRuntimeConfig(request: Pick<FastifyRequest, "server">): KnowbeeConfig;
//# sourceMappingURL=runtime-context.d.ts.map