import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const source = readFileSync("scripts/knowbee-start.sh", "utf8")

describe("Gateway startup cleanup boundary", () => {
  it("limits terminal cleanup to the exact launchctl job, repo PID and PID file", () => {
    expect(source).toContain('[[ "$current_job_pid" == "$expected_pid" ]]')
    expect(source).toContain(
      'pid_alive "$expected_pid" && pid_belongs_to_repo "$expected_pid"',
    )
    expect(source).toContain(
      '[[ "$(read_pid "$GATEWAY_PID_FILE")" == "$expected_pid" ]]',
    )
    expect(source).toContain('kill "$expected_pid"')
    expect(source).toContain('kill -9 "$expected_pid"')
  })

  it("invokes cleanup for explicit terminal results but not still-starting", () => {
    const terminal = source.indexOf("failed|cancelled)")
    const cleanup = source.indexOf(
      'cleanup_terminal_gateway_startup "$expected_pid"',
      terminal,
    )
    const stillStarting = source.indexOf("still_starting)", terminal)

    expect(terminal).toBeGreaterThan(0)
    expect(cleanup).toBeGreaterThan(terminal)
    expect(stillStarting).toBeGreaterThan(cleanup)
    expect(source.slice(stillStarting, source.indexOf(";;", stillStarting))).not.toContain(
      "cleanup_terminal_gateway_startup",
    )
  })
})
