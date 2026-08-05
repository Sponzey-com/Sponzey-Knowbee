import { createHash } from "node:crypto"
import type { FastifyInstance } from "fastify"
import {
  type ChannelSmokeChannel,
  type ChannelSmokeRunMode,
  type ChannelSmokeScenario,
  type ChannelSmokeTrace,
  createDryRunChannelSmokeExecutor,
  getDefaultChannelSmokeScenarios,
  runPersistedChannelSmokeScenarios,
} from "../../channels/smoke-runner.js"
import {
  type DbChannelSmokeRun,
  type DbChannelSmokeStep,
  getChannelSmokeRun,
  listChannelSmokeRuns,
  listChannelSmokeSteps,
} from "../../db/index.js"
import { redactLogText } from "../../logger/index.js"
import { type SanitizedErrorSummary, sanitizeUserFacingError } from "../../runs/error-sanitizer.js"
import { authMiddleware } from "../middleware/auth.js"
import { getApiRuntimeConfig } from "../runtime-context.js"

interface ChannelSmokeRunQuery {
  limit?: string
}

interface ChannelSmokeRunBody {
  mode?: ChannelSmokeRunMode
  channel?: ChannelSmokeChannel
  scenarioIds?: string[]
  idempotencyKey?: string
}

export interface ChannelSmokeRouteOptions {
  liveSmokeEnabled?: boolean
  liveExecutor?: (scenario: ChannelSmokeScenario) => Promise<ChannelSmokeTrace>
}

function parseLimit(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? "", 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return 20
  return Math.min(parsed, 100)
}

function safeParseJson(value: string | null): unknown {
  if (!value) return null
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function toPublicSmokeMetadata(value: string | null): Record<string, unknown> | null {
  const parsed = safeParseJson(value)
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null
  const {
    idempotencyHash: _idempotencyHash,
    requestFingerprint: _requestFingerprint,
    ...publicMetadata
  } = parsed as Record<string, unknown>
  return publicMetadata
}

function toRunResponse(row: DbChannelSmokeRun): Record<string, unknown> {
  return {
    id: row.id,
    mode: row.mode,
    status: row.status,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    counts: {
      total: row.scenario_count,
      passed: row.passed_count,
      failed: row.failed_count,
      skipped: row.skipped_count,
    },
    initiatedBy: row.initiated_by,
    summary: row.summary,
    metadata: toPublicSmokeMetadata(row.metadata_json),
  }
}

function toStepResponse(row: DbChannelSmokeStep): Record<string, unknown> {
  return {
    id: row.id,
    runId: row.run_id,
    scenarioId: row.scenario_id,
    channel: row.channel,
    scenarioKind: row.scenario_kind,
    status: row.status,
    reason: row.reason,
    failures: safeParseJson(row.failures_json) ?? [],
    trace: safeParseJson(row.trace_json),
    auditLogId: row.audit_log_id,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  }
}

function resolveScenarios(body: ChannelSmokeRunBody): ChannelSmokeScenario[] {
  const scenarios = getDefaultChannelSmokeScenarios()
  const byId = new Map(scenarios.map((scenario) => [scenario.id, scenario]))
  if (Array.isArray(body.scenarioIds) && body.scenarioIds.length > 0) {
    const resolved = body.scenarioIds
      .map((id) => byId.get(id))
      .filter((item): item is ChannelSmokeScenario => Boolean(item))
    if (resolved.length !== body.scenarioIds.length) {
      const unknown = body.scenarioIds.filter((id) => !byId.has(id))
      throw new Error(`unknown smoke scenario: ${unknown.join(", ")}`)
    }
    return resolved
  }
  return body.channel
    ? scenarios.filter((scenario) => scenario.channel === body.channel)
    : scenarios
}

function channelSmokeRouteErrorSummary(error: unknown): SanitizedErrorSummary {
  const rawMessage = error instanceof Error ? error.message : String(error)
  return sanitizeUserFacingError(redactLogText(rawMessage))
}

function smokeRequestFingerprint(
  mode: ChannelSmokeRunMode,
  scenarios: readonly ChannelSmokeScenario[],
): string {
  return createHash("sha256")
    .update(JSON.stringify({
      mode,
      scenarioIds: scenarios.map((scenario) => scenario.id),
    }))
    .digest("hex")
}

function smokeIdempotencyHash(value: string): string {
  return createHash("sha256").update(value).digest("hex")
}

function readSmokeRunMetadata(run: DbChannelSmokeRun): Record<string, unknown> {
  const parsed = safeParseJson(run.metadata_json)
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? parsed as Record<string, unknown>
    : {}
}

export function registerChannelSmokeRoute(
  app: FastifyInstance,
  options: ChannelSmokeRouteOptions = {},
): void {
  const liveSmokeEnabled = options.liveSmokeEnabled === true

  app.get<{ Querystring: ChannelSmokeRunQuery }>(
    "/api/channel-smoke/runs",
    { preHandler: authMiddleware },
    async (req) => {
      return { runs: listChannelSmokeRuns(parseLimit(req.query.limit)).map(toRunResponse) }
    },
  )

  app.get<{ Params: { id: string } }>(
    "/api/channel-smoke/runs/:id",
    { preHandler: authMiddleware },
    async (req, reply) => {
      const run = getChannelSmokeRun(req.params.id)
      if (!run) return reply.status(404).send({ error: "Channel smoke run not found" })
      return {
        run: toRunResponse(run),
        steps: listChannelSmokeSteps(req.params.id).map(toStepResponse),
      }
    },
  )

  app.post<{ Body: ChannelSmokeRunBody }>(
    "/api/channel-smoke/runs",
    { preHandler: authMiddleware },
    async (req, reply) => {
      const mode = req.body?.mode ?? "dry-run"
      if (mode !== "dry-run" && mode !== "live-run")
        return reply.status(400).send({ error: "invalid smoke mode" })
      if (mode === "live-run" && !liveSmokeEnabled) {
        return reply
          .status(400)
          .send({ error: "live channel smoke requires KNOWBEE_CHANNEL_SMOKE_LIVE=1" })
      }
      if (mode === "live-run" && !options.liveExecutor) {
        return reply.status(503).send({ error: "live_channel_smoke_executor_unavailable" })
      }

      let scenarios: ChannelSmokeScenario[]
      try {
        scenarios = resolveScenarios(req.body ?? {})
      } catch (error) {
        const sanitized = channelSmokeRouteErrorSummary(error)
        return reply.status(400).send({
          error: sanitized.userMessage,
          kind: sanitized.kind,
          actionHint: sanitized.actionHint,
        })
      }

      const idempotencyKey = req.body?.idempotencyKey?.trim() ?? ""
      if (idempotencyKey.length > 256) {
        return reply.status(400).send({ error: "channel_smoke_idempotency_key_invalid" })
      }
      const idempotencyHash = idempotencyKey
        ? smokeIdempotencyHash(idempotencyKey)
        : null
      const requestFingerprint = smokeRequestFingerprint(mode, scenarios)
      if (idempotencyHash) {
        const activeRun = listChannelSmokeRuns(200).find((run) => {
          const metadata = readSmokeRunMetadata(run)
          return (
            run.status === "running"
            && metadata.idempotencyHash === idempotencyHash
          )
        })
        if (activeRun) {
          const metadata = readSmokeRunMetadata(activeRun)
          if (metadata.requestFingerprint !== requestFingerprint) {
            return reply.status(409).send({
              error: "channel_smoke_idempotency_key_conflict",
            })
          }
          return {
            ok: true,
            reused: true,
            mode: activeRun.mode,
            runId: activeRun.id,
            status: activeRun.status,
            counts: {
              total: activeRun.scenario_count,
              passed: activeRun.passed_count,
              failed: activeRun.failed_count,
              skipped: activeRun.skipped_count,
            },
            summary: activeRun.summary,
            results: [],
          }
        }
      }

      const config = getApiRuntimeConfig(req)
      const result = await runPersistedChannelSmokeScenarios({
        config,
        mode,
        scenarios,
        initiatedBy: "webui",
        metadata: {
          route: "/api/channel-smoke/runs",
          requestFingerprint,
          ...(idempotencyHash ? { idempotencyHash } : {}),
        },
        executeScenario:
          mode === "live-run" && options.liveExecutor
            ? options.liveExecutor
            : createDryRunChannelSmokeExecutor(),
      })
      return {
        ok: result.status !== "failed",
        mode: result.mode,
        runId: result.runId,
        status: result.status,
        counts: result.counts,
        summary: result.summary,
        results: result.results.map((item) => ({
          scenarioId: item.scenario.id,
          channel: item.scenario.channel,
          kind: item.scenario.kind,
          status: item.status,
          reason: item.reason,
          failures: item.failures,
          auditLogId: item.auditLogId,
        })),
      }
    },
  )
}
