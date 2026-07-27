import type { FastifyInstance } from "fastify";
import { type CapabilityProjectionOptions } from "../../control-plane/index.js";
import { type UpdateRuntimeContext } from "../../update/service.js";
export interface StatusRouteOptions extends Omit<CapabilityProjectionOptions, "config"> {
    updateRuntime: UpdateRuntimeContext;
}
export declare function registerStatusRoute(app: FastifyInstance, options: StatusRouteOptions): void;
//# sourceMappingURL=status.d.ts.map