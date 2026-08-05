import type { FastifyInstance } from "fastify"
import {
  type ControlEventSeverity,
  type ControlExportAudience,
  type ControlExportFormat,
  type ControlTimelineQuery,
  exportControlTimeline,
  getControlTimeline,
} from "../../control-plane/timeline.js"
import {
  AUTHENTICATED_API_AUDIT_DEPENDENCIES,
  type AuditAccessRuntimeDependencies,
  auditAccessHttpFailure,
  authorizeAndRecordAuditAccess,
} from "../audit-access-runtime.js"
import { authMiddleware } from "../middleware/auth.js"

interface ControlTimelineQuerystring {
  runId?: string
  requestGroupId?: string
  correlationId?: string
  eventType?: string
  component?: string
  severity?: string
  limit?: string
  audience?: string
  format?: string
  purpose?: string
}

function parseLimit(value: string | undefined): number | undefined {
  const parsed = Number.parseInt(value ?? "", 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined
  return Math.min(parsed, 2_000)
}

function parseSeverity(value: string | undefined): ControlEventSeverity | undefined {
  return value === "debug" || value === "info" || value === "warning" || value === "error"
    ? value
    : undefined
}

function parseAudience(value: string | undefined): ControlExportAudience {
  return value === "developer" ? "developer" : "user"
}

export type ControlTimelineExposureContext = "public" | "audit"

export function resolveControlTimelineAudience(
  requestedAudience: string | undefined,
  exposureContext: ControlTimelineExposureContext,
): ControlExportAudience {
  if (exposureContext !== "audit") return "user"
  return parseAudience(requestedAudience)
}

function parseFormat(value: string | undefined): ControlExportFormat {
  return value === "json" ? "json" : "markdown"
}

function toTimelineQuery(query: ControlTimelineQuerystring): ControlTimelineQuery {
  const severity = parseSeverity(query.severity)
  const limit = parseLimit(query.limit)
  return {
    ...(query.runId ? { runId: query.runId } : {}),
    ...(query.requestGroupId ? { requestGroupId: query.requestGroupId } : {}),
    ...(query.correlationId ? { correlationId: query.correlationId } : {}),
    ...(query.eventType ? { eventType: query.eventType } : {}),
    ...(query.component ? { component: query.component } : {}),
    ...(severity ? { severity } : {}),
    ...(limit ? { limit } : {}),
  }
}

export function registerControlTimelineRoute(
  app: FastifyInstance,
  auditDependencies: AuditAccessRuntimeDependencies = AUTHENTICATED_API_AUDIT_DEPENDENCIES,
): void {
  app.get<{ Querystring: ControlTimelineQuerystring }>(
    "/api/control/timeline",
    { preHandler: authMiddleware },
    async (req) => ({
      timeline: getControlTimeline(
        toTimelineQuery(req.query),
        resolveControlTimelineAudience(req.query.audience, "public"),
      ),
    }),
  )

  app.get<{ Querystring: ControlTimelineQuerystring }>(
    "/api/control/timeline/export",
    { preHandler: authMiddleware },
    async (req) => ({
      export: exportControlTimeline({
        ...toTimelineQuery(req.query),
        audience: resolveControlTimelineAudience(req.query.audience, "public"),
        format: parseFormat(req.query.format),
      }),
    }),
  )

  app.get<{ Querystring: ControlTimelineQuerystring }>(
    "/api/audit/control/timeline",
    { preHandler: authMiddleware },
    async (req, reply) => {
      const query = toTimelineQuery(req.query)
      const audience = resolveControlTimelineAudience(req.query.audience, "audit")
      if (audience === "developer") {
        const decision = authorizeAndRecordAuditAccess({
          request: req,
          purpose: req.query.purpose,
          operation: "view",
          ...(req.query.runId ? { runId: req.query.runId } : {}),
          ...(req.query.requestGroupId ? { requestGroupId: req.query.requestGroupId } : {}),
          dependencies: auditDependencies,
        })
        if (!decision.allowed) {
          const failure = auditAccessHttpFailure(decision)
          return reply.status(failure.statusCode).send(failure.body)
        }
      }
      return { timeline: getControlTimeline(query, audience) }
    },
  )

  app.get<{ Querystring: ControlTimelineQuerystring }>(
    "/api/audit/control/timeline/export",
    { preHandler: authMiddleware },
    async (req, reply) => {
      const query = toTimelineQuery(req.query)
      const audience = resolveControlTimelineAudience(req.query.audience, "audit")
      if (audience === "developer") {
        const decision = authorizeAndRecordAuditAccess({
          request: req,
          purpose: req.query.purpose,
          operation: "export",
          ...(req.query.runId ? { runId: req.query.runId } : {}),
          ...(req.query.requestGroupId ? { requestGroupId: req.query.requestGroupId } : {}),
          dependencies: auditDependencies,
        })
        if (!decision.allowed) {
          const failure = auditAccessHttpFailure(decision)
          return reply.status(failure.statusCode).send(failure.body)
        }
      }
      return {
        export: exportControlTimeline({
          ...query,
          audience,
          format: parseFormat(req.query.format),
        }),
      }
    },
  )
}
