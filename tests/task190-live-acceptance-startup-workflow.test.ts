import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const startScriptPath = resolve("scripts/knowbee-start.sh")

describe("task190 live acceptance startup workflow", () => {
  it("recognizes the explicit live option before rejecting a later unknown option", () => {
    const result = spawnSync("bash", [startScriptPath, "--live-acceptance", "--invalid-task190"], {
      cwd: resolve("."),
      encoding: "utf8",
    })

    expect(result.status).not.toBe(0)
    expect(result.stdout).toContain("--invalid-task190")
    expect(result.stdout).not.toContain("알 수 없는 옵션: --live-acceptance")
  })

  it("passes the immutable live gates through both Gateway launch paths and checks readiness", () => {
    const source = readFileSync(startScriptPath, "utf8")

    expect(source).toContain('LIVE_ACCEPTANCE="0"')
    expect(source).toContain("--live-acceptance)")
    expect(source.match(/KNOWBEE_LIVE_ACCEPTANCE/g)?.length).toBeGreaterThanOrEqual(2)
    expect(source.match(/KNOWBEE_CHANNEL_SMOKE_LIVE/g)?.length).toBeGreaterThanOrEqual(2)
    expect(source).toContain("smoke acceptance --check --json")
    expect(source.indexOf("start_gateway")).toBeLessThan(
      source.lastIndexOf("smoke acceptance --check --json"),
    )
  })

  it("uses a non-terminal Gateway performance budget and bounded WebUI window", () => {
    const source = readFileSync(startScriptPath, "utf8")

    expect(source).toContain('GATEWAY_STARTUP_PERFORMANCE_BUDGET_MS="30000"')
    expect(source).toContain('WEBUI_STARTUP_TIMEOUT_SECONDS="60"')
    expect(source).toContain(
      'wait_for_gateway_startup "$launched_pid" "$gateway_started_at_ms"',
    )
    expect(source).toContain("still_starting)")
    expect(source).not.toContain("GATEWAY_STARTUP_TIMEOUT_SECONDS")
    expect(source).toContain(
      'wait_for_http "WebUI" "http://$WEBUI_HOST:$WEBUI_PORT" "$WEBUI_PID_FILE" "$WEBUI_STARTUP_TIMEOUT_SECONDS" false',
    )
  })

  it("exposes the existing external signing exchange as a package workflow", () => {
    const packageJson = JSON.parse(readFileSync(resolve("package.json"), "utf8")) as {
      scripts?: Record<string, string>
    }
    expect(packageJson.scripts?.["release:live:exchange"]).toBe(
      "node scripts/live-acceptance-signing-exchange.mjs",
    )
  })

  it("documents the fail-closed live execution and external signer handoff order", () => {
    const runbook = readFileSync(resolve("docs/release-runbook.md"), "utf8")
    const requiredInOrder = [
      "--live-acceptance",
      "smoke acceptance --check",
      "smoke acceptance --request",
      "external signer",
      "release:live:exchange",
      "--live-acceptance-bundle",
    ]
    let cursor = -1
    for (const marker of requiredInOrder) {
      const next = runbook.indexOf(marker, cursor + 1)
      expect(next, `missing or out-of-order runbook marker: ${marker}`).toBeGreaterThan(cursor)
      cursor = next
    }
  })
})
