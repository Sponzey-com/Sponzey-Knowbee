import type {
  GatewayStartupEvent,
  GatewayStartupSnapshot,
  GatewayStartupTransitionRejectionReason,
} from "../contracts/gateway-startup-state.js"
import { createLogger, type Logger } from "../logger/index.js"
import {
  advanceGatewayStartupEvidence,
  initializeGatewayStartupEvidence,
  type StartupEvidencePort,
} from "./gateway-startup-evidence.js"
import {
  beginGatewayStartup,
  getGatewayStartupSnapshot,
  transitionGatewayReadiness,
} from "./gateway-readiness.js"

export type GatewayStartupProgressAdvanceResult =
  | {
    readonly status: "advanced"
    readonly evidence: "stored" | "unavailable"
    readonly snapshot: GatewayStartupSnapshot
  }
  | {
    readonly status: "rejected"
    readonly reasonCode:
      | "startup_identity_mismatch"
      | GatewayStartupTransitionRejectionReason
  }

export interface GatewayStartupProgressPort {
  readonly startupId: string
  readonly pid: number
  getSnapshot(): GatewayStartupSnapshot
  advance(event: GatewayStartupEvent): Promise<GatewayStartupProgressAdvanceResult>
}

export interface GatewayStartupProductLogEvent {
  readonly event: "started" | "ready" | "failed" | "cancelled"
  readonly startupId: string
  readonly elapsedMs: number
  readonly reasonCode: string | null
}

export interface GatewayStartupFieldDebugLogEvent {
  readonly event: "evidence_unavailable"
  readonly startupId: string
  readonly state: GatewayStartupSnapshot["state"]
  readonly reasonCode: string
}

export interface GatewayStartupLogPort {
  product(event: GatewayStartupProductLogEvent): void
  fieldDebug(event: GatewayStartupFieldDebugLogEvent): void
}

export function createGatewayStartupLogPort(
  sink: Pick<Logger, "product" | "fieldDebug"> = createLogger("runtime:startup"),
): GatewayStartupLogPort {
  return Object.freeze({
    product(event: GatewayStartupProductLogEvent): void {
      sink.product("gateway_startup_transition", event)
    },
    fieldDebug(event: GatewayStartupFieldDebugLogEvent): void {
      sink.fieldDebug("gateway_startup_diagnostic", event)
    },
  })
}

export type StartGatewayStartupResult =
  | {
    readonly status: "started"
    readonly evidence: "stored" | "unavailable"
    readonly progress: GatewayStartupProgressPort
  }
  | {
    readonly status: "rejected"
    readonly reasonCode: GatewayStartupTransitionRejectionReason
  }

export async function startGatewayStartup(input: {
  readonly startupId: string
  readonly pid: number
  readonly startedAt: number
  readonly evidencePort: StartupEvidencePort
  readonly logger?: GatewayStartupLogPort
}): Promise<StartGatewayStartupResult> {
  const begun = beginGatewayStartup(input)
  if (begun.status === "rejected") return begun
  const initialEvidence = await initializeGatewayStartupEvidence({
    port: input.evidencePort,
    snapshot: begun.startup,
  })
  input.logger?.product(Object.freeze({
    event: "started",
    startupId: begun.startup.startupId,
    elapsedMs: 0,
    reasonCode: null,
  }))
  if (initialEvidence.status !== "stored") {
    input.logger?.fieldDebug(Object.freeze({
      event: "evidence_unavailable",
      startupId: begun.startup.startupId,
      state: begun.startup.state,
      reasonCode: initialEvidence.reasonCode,
    }))
  }
  const progress: GatewayStartupProgressPort = Object.freeze({
    startupId: input.startupId,
    pid: input.pid,
    getSnapshot(): GatewayStartupSnapshot {
      return getGatewayStartupSnapshot()
    },
    async advance(
      event: GatewayStartupEvent,
    ): Promise<GatewayStartupProgressAdvanceResult> {
      const current = getGatewayStartupSnapshot()
      if (current.startupId !== input.startupId || current.pid !== input.pid) {
        return { status: "rejected", reasonCode: "startup_identity_mismatch" }
      }
      const transition = transitionGatewayReadiness(event)
      if (transition.status === "rejected") return transition
      const evidence = await advanceGatewayStartupEvidence({
        port: input.evidencePort,
        startupId: input.startupId,
        pid: input.pid,
        event,
      })
      if (evidence.status !== "stored") {
        input.logger?.fieldDebug(Object.freeze({
          event: "evidence_unavailable",
          startupId: transition.startup.startupId,
          state: transition.startup.state,
          reasonCode: evidence.reasonCode,
        }))
      }
      if (
        transition.startup.state === "ready" ||
        transition.startup.state === "failed" ||
        transition.startup.state === "cancelled"
      ) {
        input.logger?.product(Object.freeze({
          event: transition.startup.state,
          startupId: transition.startup.startupId,
          elapsedMs:
            transition.startup.changedAt - transition.startup.startedAt,
          reasonCode: transition.startup.reasonCode,
        }))
      }
      return {
        status: "advanced",
        evidence: evidence.status === "stored" ? "stored" : "unavailable",
        snapshot: transition.startup,
      }
    },
  })
  return {
    status: "started",
    evidence: initialEvidence.status === "stored" ? "stored" : "unavailable",
    progress,
  }
}
