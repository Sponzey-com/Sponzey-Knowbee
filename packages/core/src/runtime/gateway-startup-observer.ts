import { observeGatewayStartup } from "../contracts/gateway-startup-state.js"
import type { GatewayStartupEvidence } from "./gateway-startup-evidence.js"

export interface GatewayStartupProcessSnapshot {
  readonly state: "running" | "exited" | "unknown"
  readonly repositoryOwned: boolean
  readonly listening: boolean
}

export interface GatewayStartupProcessPort {
  inspect(pid: number): Promise<GatewayStartupProcessSnapshot>
}

export type GatewayStartupObserverResult =
  | {
      readonly status: "still_starting"
      readonly state:
        | GatewayStartupEvidence["state"]
        | "awaiting_evidence"
        | "verifying_process"
        | "verifying_ready"
      readonly elapsedMs: number
      readonly performance: "within_budget" | "budget_exceeded"
    }
  | { readonly status: "ready"; readonly elapsedMs: number }
  | { readonly status: "failed"; readonly elapsedMs: number; readonly reasonCode: string }
  | { readonly status: "cancelled"; readonly elapsedMs: number; readonly reasonCode: string }

function elapsed(input: {
  readonly observedAt: number
  readonly startedAt: number
}): number {
  return Math.max(0, input.observedAt - input.startedAt)
}

function performance(
  elapsedMs: number,
  performanceBudgetMs: number,
): "within_budget" | "budget_exceeded" {
  return elapsedMs > performanceBudgetMs ? "budget_exceeded" : "within_budget"
}

export async function observeGatewayStartupEvidence(input: {
  readonly evidence: GatewayStartupEvidence | null
  readonly expectedPid: number
  readonly minimumStartedAt: number
  readonly observedAt: number
  readonly performanceBudgetMs: number
  readonly processPort: GatewayStartupProcessPort
}): Promise<GatewayStartupObserverResult> {
  const process = await input.processPort.inspect(input.expectedPid)
  const identityElapsedMs = elapsed({
    observedAt: input.observedAt,
    startedAt: input.minimumStartedAt,
  })
  const evidence = input.evidence
  const evidenceMatches =
    evidence !== null &&
    evidence.pid === input.expectedPid &&
    evidence.startedAt >= input.minimumStartedAt
  const observationElapsedMs = evidenceMatches
    ? elapsed({ observedAt: input.observedAt, startedAt: evidence.startedAt })
    : identityElapsedMs
  if (process.state === "exited") {
    return {
      status: "failed",
      elapsedMs: observationElapsedMs,
      reasonCode: "process_exited",
    }
  }
  if (process.state === "unknown") {
    if (
      evidenceMatches
      && (evidence.state === "failed" || evidence.state === "cancelled")
    ) {
      const terminalObservation = observeGatewayStartup({
        snapshot: evidence,
        processState: "running",
        observedAt: input.observedAt,
        performanceBudgetMs: input.performanceBudgetMs,
      })
      return terminalObservation.status === "still_starting"
        ? { ...terminalObservation, state: evidence.state }
        : terminalObservation
    }
    return {
      status: "still_starting",
      state: evidenceMatches ? "verifying_process" : "awaiting_evidence",
      elapsedMs: observationElapsedMs,
      performance: performance(
        observationElapsedMs,
        input.performanceBudgetMs,
      ),
    }
  }
  if (!evidenceMatches) {
    return {
      status: "still_starting",
      state: "awaiting_evidence",
      elapsedMs: identityElapsedMs,
      performance: performance(identityElapsedMs, input.performanceBudgetMs),
    }
  }
  if (!process.repositoryOwned) {
    return {
      status: "failed",
      elapsedMs: observationElapsedMs,
      reasonCode: "runtime_ownership_mismatch",
    }
  }

  const observation = observeGatewayStartup({
    snapshot: evidence,
    processState: process.state,
    observedAt: input.observedAt,
    performanceBudgetMs: input.performanceBudgetMs,
  })
  if (observation.status !== "ready") {
    return observation.status === "still_starting"
      ? { ...observation, state: evidence.state }
      : observation
  }
  if (!process.listening) {
    return {
      status: "still_starting",
      state: "verifying_ready",
      elapsedMs: observation.elapsedMs,
      performance: performance(observation.elapsedMs, input.performanceBudgetMs),
    }
  }
  return observation
}
