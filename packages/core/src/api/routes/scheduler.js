import { authMiddleware } from "../middleware/auth.js";
import { scheduler } from "../../scheduler/index.js";
import { getApiRuntimeConfig } from "../runtime-context.js";
export function registerSchedulerRoute(app) {
    // GET /api/scheduler/health
    app.get("/api/scheduler/health", { preHandler: authMiddleware }, async (req) => {
        const config = getApiRuntimeConfig(req);
        return scheduler.getHealth(config);
    });
}
//# sourceMappingURL=scheduler.js.map