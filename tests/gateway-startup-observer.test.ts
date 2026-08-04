import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import type { GatewayStartupEvidence } from "../packages/core/src/runtime/gateway-startup-evidence.ts"
import {
  observeGatewayStartupEvidence,
  type GatewayStartupProcessPort,
} from "../packages/core/src/runtime/gateway-startup-observer.ts"

function evidence(
  state: GatewayStartupEvidence["state"],
  overrides: Partial<GatewayStartupEvidence> = {},
): GatewayStartupEvidence {
  return {
    schemaVersion: 1,
    startupId: "gateway-8123-1000",
    pid: 8123,
    state,
    startedAt: 1_000,
    changedAt: 1_100,
    reasonCode: null,
    ...overrides,
  }
}

function processPort(
  snapshot: {
    state: "running" | "exited" | "unknown"
    repositoryOwned: boolean
    listening: boolean
  } = { state: "running", repositoryOwned: true, listening: true },
): GatewayStartupProcessPort {
  return { inspect: async () => snapshot }
}

describe("Gateway startup evidence observer", () => {
  it("keeps a running startup non-terminal after the performance budget", async () => {
    const result = await observeGatewayStartupEvidence({
      evidence: evidence("initializing_core"),
      expectedPid: 8123,
      minimumStartedAt: 900,
      observedAt: 32_000,
      performanceBudgetMs: 30_000,
      processPort: processPort(),
    })

    expect(result).toEqual({
      status: "still_starting",
      state: "initializing_core",
      elapsedMs: 31_000,
      performance: "budget_exceeded",
    })
  })

  it("does not adopt stale or mismatched evidence", async () => {
    const result = await observeGatewayStartupEvidence({
      evidence: evidence("ready", { pid: 7000, startedAt: 100 }),
      expectedPid: 8123,
      minimumStartedAt: 900,
      observedAt: 2_000,
      performanceBudgetMs: 30_000,
      processPort: processPort(),
    })

    expect(result).toEqual({
      status: "still_starting",
      state: "awaiting_evidence",
      elapsedMs: 1_100,
      performance: "within_budget",
    })
  })

  it("does not fail ownership before the current process publishes evidence", async () => {
    const result = await observeGatewayStartupEvidence({
      evidence: null,
      expectedPid: 8123,
      minimumStartedAt: 900,
      observedAt: 2_000,
      performanceBudgetMs: 30_000,
      processPort: processPort({
        state: "running",
        repositoryOwned: false,
        listening: false,
      }),
    })

    expect(result).toEqual({
      status: "still_starting",
      state: "awaiting_evidence",
      elapsedMs: 1_100,
      performance: "within_budget",
    })
  })

  it("keeps permission-restricted process inspection non-terminal", async () => {
    const result = await observeGatewayStartupEvidence({
      evidence: null,
      expectedPid: 8123,
      minimumStartedAt: 900,
      observedAt: 2_000,
      performanceBudgetMs: 30_000,
      processPort: processPort({
        state: "unknown",
        repositoryOwned: false,
        listening: false,
      }),
    })

    expect(result).toEqual({
      status: "still_starting",
      state: "awaiting_evidence",
      elapsedMs: 1_100,
      performance: "within_budget",
    })
  })

  it("waits for the exact ready listener post-check", async () => {
    const result = await observeGatewayStartupEvidence({
      evidence: evidence("ready"),
      expectedPid: 8123,
      minimumStartedAt: 900,
      observedAt: 2_000,
      performanceBudgetMs: 30_000,
      processPort: processPort({
        state: "running",
        repositoryOwned: true,
        listening: false,
      }),
    })

    expect(result).toEqual({
      status: "still_starting",
      state: "verifying_ready",
      elapsedMs: 1_000,
      performance: "within_budget",
    })
  })

  it("rejects an explicit repository ownership mismatch", async () => {
    const result = await observeGatewayStartupEvidence({
      evidence: evidence("ready"),
      expectedPid: 8123,
      minimumStartedAt: 900,
      observedAt: 2_000,
      performanceBudgetMs: 30_000,
      processPort: processPort({
        state: "running",
        repositoryOwned: false,
        listening: true,
      }),
    })

    expect(result).toEqual({
      status: "failed",
      elapsedMs: 1_000,
      reasonCode: "runtime_ownership_mismatch",
    })
  })

  it("returns ready only after identity, process, ownership and listener checks", async () => {
    await expect(
      observeGatewayStartupEvidence({
        evidence: evidence("ready"),
        expectedPid: 8123,
        minimumStartedAt: 900,
        observedAt: 2_000,
        performanceBudgetMs: 30_000,
        processPort: processPort(),
      }),
    ).resolves.toEqual({ status: "ready", elapsedMs: 1_000 })
  })

  it("routes local startup through the structured observer instead of a fixed HTTP timeout", () => {
    const source = readFileSync("scripts/knowbee-start.sh", "utf8")
    const observerSource = readFileSync("scripts/self/observe-gateway-startup.mjs", "utf8")

    expect(source).toContain("scripts/self/observe-gateway-startup.mjs")
    expect(source).toContain('observer_status="$(extract_status_field status')
    expect(source).toContain("still_starting)")
    expect(source).not.toContain('GATEWAY_STARTUP_TIMEOUT_SECONDS="120"')
    expect(source).not.toContain(
      'wait_for_http "Gateway" "http://$GATEWAY_HOST:$GATEWAY_PORT/api/ready"',
    )
    expect(observerSource).toContain('return "unknown"')
    expect(observerSource).toContain("state: processState")
  })

  it("cleans only the exact terminal launch and keeps Product-only logging by default", () => {
    const source = readFileSync("scripts/knowbee-start.sh", "utf8")
    const cleanup = source.indexOf("cleanup_terminal_gateway_startup()")
    const terminal = source.indexOf("failed|cancelled)")
    const stillStarting = source.indexOf("still_starting)")
    const cleanupCall = source.indexOf(
      'cleanup_terminal_gateway_startup "$expected_pid"',
      terminal,
    )

    expect(cleanup).toBeGreaterThan(0)
    expect(cleanupCall).toBeGreaterThan(terminal)
    expect(cleanupCall).toBeLessThan(stillStarting)
    expect(source).toContain(
      '[[ "$current_job_pid" == "$expected_pid" ]]',
    )
    expect(source).toContain(
      '[[ "$(read_pid "$GATEWAY_PID_FILE")" == "$expected_pid" ]]',
    )
    expect(source).toContain('KNOWBEE_LOG_LEVEL="${KNOWBEE_LOG_LEVEL:-info}"')
    expect(source).not.toContain('KNOWBEE_LOG_LEVEL="${KNOWBEE_LOG_LEVEL:-debug}"')
  })
})
