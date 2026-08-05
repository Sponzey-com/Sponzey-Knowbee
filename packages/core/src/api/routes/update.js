import { authMiddleware } from "../middleware/auth.js";
import { checkForUpdates, getUpdateSnapshot, } from "../../update/service.js";
export function registerUpdateRoute(app, context) {
    app.get("/api/update/status", { preHandler: authMiddleware }, async () => {
        return getUpdateSnapshot(context);
    });
    app.post("/api/update/check", { preHandler: authMiddleware }, async () => {
        return checkForUpdates(context);
    });
}
//# sourceMappingURL=update.js.map