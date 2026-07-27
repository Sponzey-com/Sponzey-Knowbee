import type { FastifyInstance } from "fastify"
import { authMiddleware } from "../middleware/auth.js"
import {
  checkForUpdates,
  getUpdateSnapshot,
  type UpdateRuntimeContext,
} from "../../update/service.js"

export function registerUpdateRoute(app: FastifyInstance, context: UpdateRuntimeContext): void {
  app.get("/api/update/status", { preHandler: authMiddleware }, async () => {
    return getUpdateSnapshot(context)
  })

  app.post("/api/update/check", { preHandler: authMiddleware }, async () => {
    return checkForUpdates(context)
  })
}
