import type { FastifyInstance } from "fastify"
import { authMiddleware } from "../middleware/auth.js"
import { buildYeonjangFleetProjection } from "../../yeonjang/topology.js"
import { buildYeonjangBroadcastPolicyProjection } from "../../yeonjang/broadcast-policy.js"
import {
  approveYeonjangInstancePairing,
  assignYeonjangLocalMarker,
  listYeonjangGovernanceHistory,
  renameYeonjangRegistryInstance,
  updateYeonjangInstanceTrustState,
  type YeonjangInstanceTrustState,
} from "../../yeonjang/registry.js"

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

function refreshFleetResponse() {
  const projection = buildYeonjangFleetProjection()
  const broadcastPolicies = buildYeonjangBroadcastPolicyProjection()
  const governanceHistory = listYeonjangGovernanceHistory({ limit: 20 })
  return {
    ok: true,
    summary: projection.summary,
    instances: projection.instances,
    diffSummaries: projection.diffSummaries,
    defaultTarget: projection.summary.defaultTarget,
    promptProjection: projection.promptProjection,
    broadcastPolicies,
    governanceHistory,
  }
}

export function registerYeonjangInstancesRoute(app: FastifyInstance): void {
  app.get("/api/yeonjang/instances", { preHandler: authMiddleware }, async () => refreshFleetResponse())

  app.post("/api/yeonjang/instances/:instanceId/pairing/approve", { preHandler: authMiddleware }, async (request, reply) => {
    const params = request.params as { instanceId?: string }
    const body = (request.body ?? {}) as {
      pairingSecret?: string
      actor?: string
      ownerUserId?: string
      workspaceScopeId?: string
      reason?: string
    }
    const result = approveYeonjangInstancePairing({
      instanceId: normalizeString(params.instanceId),
      pairingSecret: normalizeString(body.pairingSecret),
      actor: normalizeString(body.actor) || "webui:operator",
      ...(normalizeString(body.ownerUserId) ? { ownerUserId: normalizeString(body.ownerUserId) } : {}),
      ...(normalizeString(body.workspaceScopeId) ? { workspaceScopeId: normalizeString(body.workspaceScopeId) } : {}),
      ...(normalizeString(body.reason) ? { reason: normalizeString(body.reason) } : {}),
    })
    if (!result.ok) {
      return reply.status(result.code === "instance_not_found" ? 404 : 400).send(result)
    }
    return refreshFleetResponse()
  })

  app.post("/api/yeonjang/instances/:instanceId/trust", { preHandler: authMiddleware }, async (request, reply) => {
    const params = request.params as { instanceId?: string }
    const body = (request.body ?? {}) as {
      trustState?: YeonjangInstanceTrustState
      actor?: string
      reason?: string
    }
    const result = updateYeonjangInstanceTrustState({
      instanceId: normalizeString(params.instanceId),
      trustState: (normalizeString(body.trustState) || "pending") as YeonjangInstanceTrustState,
      actor: normalizeString(body.actor) || "webui:operator",
      ...(normalizeString(body.reason) ? { reason: normalizeString(body.reason) } : {}),
    })
    if (!result.ok) {
      return reply.status(result.code === "instance_not_found" ? 404 : 400).send(result)
    }
    return refreshFleetResponse()
  })

  app.post("/api/yeonjang/instances/:instanceId/rename", { preHandler: authMiddleware }, async (request, reply) => {
    const params = request.params as { instanceId?: string }
    const body = (request.body ?? {}) as {
      instanceAlias?: string
      displayName?: string
      actor?: string
      reason?: string
    }
    const result = renameYeonjangRegistryInstance({
      instanceId: normalizeString(params.instanceId),
      ...(normalizeString(body.instanceAlias) ? { instanceAlias: normalizeString(body.instanceAlias) } : {}),
      ...(normalizeString(body.displayName) ? { displayName: normalizeString(body.displayName) } : {}),
      actor: normalizeString(body.actor) || "webui:operator",
      ...(normalizeString(body.reason) ? { reason: normalizeString(body.reason) } : {}),
    })
    if (!result.ok) {
      return reply.status(result.code === "instance_not_found" ? 404 : 400).send(result)
    }
    return refreshFleetResponse()
  })

  app.post("/api/yeonjang/instances/:instanceId/local-marker", { preHandler: authMiddleware }, async (request, reply) => {
    const params = request.params as { instanceId?: string }
    const body = (request.body ?? {}) as {
      actor?: string
      reason?: string
    }
    const result = assignYeonjangLocalMarker({
      instanceId: normalizeString(params.instanceId),
      actor: normalizeString(body.actor) || "webui:operator",
      ...(normalizeString(body.reason) ? { reason: normalizeString(body.reason) } : {}),
    })
    if (!result.ok) {
      return reply.status(404).send(result)
    }
    return refreshFleetResponse()
  })
}
