import type { FastifyInstance } from "fastify";
import { type UiModeRuntimeInput } from "../../ui/mode.js";
export interface UiModeRouteOptions extends Omit<UiModeRuntimeInput, "config"> {
}
export declare function registerUiModeRoute(app: FastifyInstance, options?: UiModeRouteOptions): void;
//# sourceMappingURL=ui-mode.d.ts.map