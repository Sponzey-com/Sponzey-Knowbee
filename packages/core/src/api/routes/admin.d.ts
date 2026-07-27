import type { FastifyInstance } from "fastify";
import { type UiModeRuntimeInput } from "../../ui/mode.js";
export interface AdminRouteOptions {
    uiModeRuntime?: UiModeRuntimeInput;
}
export declare function registerAdminRoute(app: FastifyInstance, options?: AdminRouteOptions): void;
//# sourceMappingURL=admin.d.ts.map