import type { FastifyInstance } from "fastify"
import type { LiveAcceptanceBundleApproval } from "../../release/live-acceptance-bundle.js"
import {
  type LiveAcceptanceExecutionSelection,
  validateLiveAcceptanceExecutionRequest,
} from "../../release/live-acceptance-execution-request.js"
import type { LiveAcceptanceRunnerResult } from "../../release/live-acceptance-runner.js"
import { authMiddleware, getApiAuthenticationPrincipal } from "../middleware/auth.js"

export type LiveAcceptanceRouteExecutor = (input: {
  candidate: Readonly<{ appVersion: string; gitTag: string | null; gitCommit: string | null }>
  approval: Readonly<LiveAcceptanceBundleApproval>
  selection: Readonly<LiveAcceptanceExecutionSelection>
  requestedKeyId: string
  signal: AbortSignal
}) => Promise<LiveAcceptanceRunnerResult>

export const LIVE_ACCEPTANCE_READINESS_CAPABILITIES = Object.freeze([
  "webui",
  "telegram",
  "slack",
  "web",
  "skill",
  "mcp",
  "yeonjang",
] as const)

export type LiveAcceptanceReadinessCapability =
  (typeof LIVE_ACCEPTANCE_READINESS_CAPABILITIES)[number]

export type LiveAcceptanceReadinessReasonCode =
  | "live_acceptance_webui_target_unavailable"
  | "live_acceptance_telegram_target_unavailable"
  | "live_acceptance_slack_target_unavailable"
  | "live_acceptance_web_runtime_unavailable"
  | "live_acceptance_skill_selection_unavailable"
  | "live_acceptance_mcp_selection_unavailable"
  | "live_acceptance_yeonjang_selection_unavailable"

export type LiveAcceptanceCapabilityReadiness =
  | Readonly<{ capability: LiveAcceptanceReadinessCapability; status: "ready" }>
  | Readonly<{
      capability: LiveAcceptanceReadinessCapability
      status: "unavailable"
      reasonCode: LiveAcceptanceReadinessReasonCode
    }>

export interface LiveAcceptanceRouteOptions {
  readonly enabled: boolean
  readonly execute?: LiveAcceptanceRouteExecutor
  readonly inspectReadiness?: () => readonly LiveAcceptanceCapabilityReadiness[]
  readonly now: () => number
}

const UNAVAILABLE_REASON: Readonly<
  Record<LiveAcceptanceReadinessCapability, LiveAcceptanceReadinessReasonCode>
> = Object.freeze({
  webui: "live_acceptance_webui_target_unavailable",
  telegram: "live_acceptance_telegram_target_unavailable",
  slack: "live_acceptance_slack_target_unavailable",
  web: "live_acceptance_web_runtime_unavailable",
  skill: "live_acceptance_skill_selection_unavailable",
  mcp: "live_acceptance_mcp_selection_unavailable",
  yeonjang: "live_acceptance_yeonjang_selection_unavailable",
})

function unavailableCapability(
  capability: LiveAcceptanceReadinessCapability,
): LiveAcceptanceCapabilityReadiness {
  return Object.freeze({
    capability,
    status: "unavailable",
    reasonCode: UNAVAILABLE_REASON[capability],
  })
}

function inspectBoundedReadiness(
  inspect: LiveAcceptanceRouteOptions["inspectReadiness"],
): readonly LiveAcceptanceCapabilityReadiness[] {
  let reported: readonly LiveAcceptanceCapabilityReadiness[] = []
  try {
    reported = inspect?.() ?? []
  } catch {
    reported = []
  }
  return Object.freeze(
    LIVE_ACCEPTANCE_READINESS_CAPABILITIES.map((capability) => {
      const item = reported.find((candidate) => candidate.capability === capability)
      if (item?.status === "ready") {
        return Object.freeze({ capability, status: "ready" as const })
      }
      if (item?.status === "unavailable" && item.reasonCode === UNAVAILABLE_REASON[capability]) {
        return Object.freeze({
          capability,
          status: "unavailable" as const,
          reasonCode: item.reasonCode,
        })
      }
      return unavailableCapability(capability)
    }),
  )
}

interface LiveAcceptanceRequestEventSource {
  readonly aborted: boolean
  once(event: "aborted", listener: () => void): unknown
  off(event: "aborted", listener: () => void): unknown
}

interface LiveAcceptanceResponseEventSource {
  readonly writableEnded: boolean
  once(event: "close", listener: () => void): unknown
  off(event: "close", listener: () => void): unknown
}

export function bindLiveAcceptanceRequestCancellation(input: {
  readonly request: LiveAcceptanceRequestEventSource
  readonly response: LiveAcceptanceResponseEventSource
}): Readonly<{ signal: AbortSignal; dispose: () => void }> {
  const controller = new AbortController()
  let disposed = false
  const abort = () => {
    if (!disposed && !controller.signal.aborted) controller.abort()
  }
  const close = () => {
    if (!input.response.writableEnded) abort()
  }
  const dispose = () => {
    if (disposed) return
    disposed = true
    input.request.off("aborted", abort)
    input.response.off("close", close)
  }
  input.request.once("aborted", abort)
  input.response.once("close", close)
  if (input.request.aborted) abort()
  return Object.freeze({ signal: controller.signal, dispose })
}

function projectResult(result: LiveAcceptanceRunnerResult): Record<string, unknown> {
  const events = result.events.map(({ state, stage }) => ({ state, ...(stage ? { stage } : {}) }))
  if (result.status === "collected") {
    return {
      status: "collected",
      evidenceCount: result.payload.evidence.length,
      events,
    }
  }
  return {
    status: result.status,
    blockers: result.blockers.slice(0, 16).map(({ capability, reasonCode }) => ({
      capability,
      reasonCode: /^live_[a-z0-9_]{1,123}$/u.test(reasonCode)
        ? reasonCode
        : "live_acceptance_blocked",
    })),
    events,
  }
}

export function registerLiveAcceptanceRoute(
  app: FastifyInstance,
  options: LiveAcceptanceRouteOptions,
): void {
  app.get("/api/live-acceptance/readiness", { preHandler: authMiddleware }, async (req, reply) => {
    const principal = getApiAuthenticationPrincipal(req)
    if (!principal || principal.role !== "administrator") {
      return reply.status(403).send({ error: "live_acceptance_authentication_required" })
    }
    if (!options.enabled) {
      return {
        status: "disabled",
        reasonCode: "live_acceptance_disabled",
      }
    }
    const capabilities = inspectBoundedReadiness(options.inspectReadiness)
    if (!options.execute) {
      return {
        status: "unavailable",
        reasonCode: "live_acceptance_executor_unavailable",
        capabilities,
      }
    }
    if (capabilities.some((capability) => capability.status !== "ready")) {
      return {
        status: "unavailable",
        reasonCode: "live_acceptance_prerequisites_unavailable",
        capabilities,
      }
    }
    return { status: "ready", capabilities }
  })

  app.post<{ Body: unknown }>(
    "/api/live-acceptance/runs",
    { preHandler: authMiddleware },
    async (req, reply) => {
      const principal = getApiAuthenticationPrincipal(req)
      if (!principal || principal.role !== "administrator") {
        return reply.status(403).send({ error: "live_acceptance_authentication_required" })
      }
      if (!options.enabled) {
        return reply.status(400).send({ error: "live_acceptance_disabled" })
      }
      if (!options.execute) {
        return reply.status(503).send({ error: "live_acceptance_executor_unavailable" })
      }
      const now = options.now()
      const validated = validateLiveAcceptanceExecutionRequest(req.body, now)
      if (validated.status === "rejected") {
        return reply.status(400).send({ error: validated.reasonCode })
      }
      const authorization = validated.request.authorization
      const approval: LiveAcceptanceBundleApproval = Object.freeze({
        decision: "approved",
        authorizationStatus: "active",
        authorizationId: authorization.authorizationId,
        auditEventId: authorization.auditEventId,
        principalType: "authenticated_user",
        principalId: principal.principalRef,
        authenticationId: principal.authenticationMethod,
        roles: ["release_administrator"],
        approvedAt: authorization.approvedAt,
        expiresAt: authorization.expiresAt,
        redactionStatus: "verified",
      })
      const lifecycle = bindLiveAcceptanceRequestCancellation({
        request: req.raw,
        response: reply.raw,
      })
      try {
        const result = await options.execute({
          candidate: validated.request.candidate,
          approval,
          selection: validated.request.selection,
          requestedKeyId: validated.request.requestedKeyId,
          signal: lifecycle.signal,
        })
        return projectResult(result)
      } catch {
        return reply.status(503).send({ error: "live_acceptance_execution_failed" })
      } finally {
        lifecycle.dispose()
      }
    },
  )
}
