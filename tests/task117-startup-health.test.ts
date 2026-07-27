import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const root = process.cwd()

function source(path: string): string {
  return readFileSync(join(root, path), "utf8")
}

describe("Task 117 startup liveness contract", () => {
  it("exposes a bounded health route separately from the detailed status projection", () => {
    const statusRoute = source("packages/core/src/api/routes/status.ts")
    const healthStart = statusRoute.indexOf('app.get("/api/health"')
    const statusStart = statusRoute.indexOf('app.get("/api/status"')

    expect(healthStart).toBeGreaterThan(0)
    expect(statusStart).toBeGreaterThan(healthStart)
    const healthBlock = statusRoute.slice(healthStart, statusStart)
    expect(healthBlock).toContain('service: "knowbee-gateway"')
    expect(healthBlock).toContain("pid: process.pid")
    expect(healthBlock).not.toMatch(
      /createCapabilities|startupRecovery|promptSources|mcp:|mqtt:|yeonjang:|paths:|config/i,
    )
  })

  it("uses readiness and repo-owned liveness verification as the startup success gate", () => {
    const start = source("scripts/knowbee-start.sh")
    const readinessWait = start.indexOf(
      'wait_for_gateway_startup "$launched_pid" "$gateway_started_at_ms"',
    )
    const statusDiagnostic = start.indexOf("verify_gateway_status", readinessWait)
    const webuiStart = start.indexOf("start_webui", readinessWait)

    expect(start).toContain("verify_gateway_health")
    expect(start).toContain('cwd="$(pid_cwd "$pid")"')
    expect(readinessWait).toBeGreaterThan(0)
    expect(statusDiagnostic).toBeGreaterThan(readinessWait)
    expect(webuiStart).toBeGreaterThan(readinessWait)
    expect(start.slice(readinessWait, statusDiagnostic)).not.toContain("/api/status")
    expect(start).toContain("scripts/observe-gateway-startup.mjs")
  })

  it("keeps detailed status failure non-terminal after health and ownership succeed", () => {
    const start = source("scripts/knowbee-start.sh")
    expect(start).toContain("Gateway 상세 상태 조회를 건너뜁니다")
    expect(start).toContain('curl --max-time "$GATEWAY_STATUS_TIMEOUT_SECONDS"')
  })

  it("keeps local diagnostics health-first and passes status JSON explicitly", () => {
    const status = source("scripts/status-local.sh")

    expect(status).toContain("/api/health")
    expect(status).toContain("/api/status")
    expect(status).toContain('extract_status "$body"')
    expect(status).not.toContain("process.stdin")
    expect(status).not.toContain("| extract_status")
  })
})
