import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const source = readFileSync("scripts/knowbee-start.sh", "utf8")
const stopSource = readFileSync("scripts/stop-local.sh", "utf8")
const statusSource = readFileSync("scripts/status-local.sh", "utf8")

describe("Gateway startup cleanup boundary", () => {
  it("does not treat restricted ps or kill access as proof that a PID exited", () => {
    for (const script of [source, stopSource, statusSource]) {
      const start = script.indexOf("pid_alive()")
      const end = script.indexOf("\n}", start)
      const body = script.slice(start, end)

      expect(body).toContain('kill -0 "$pid"')
      expect(body).toContain('lsof -p "$pid"')
      expect(body).toContain('ps -p "$pid"')
      expect(body).not.toContain('[[ -z "$state"')
      expect(body).toContain('[[ "$state" == Z* ]]')
    }
  })

  it("uses the single nohup owner by default and requires explicit launchctl opt-in", () => {
    expect(source).toContain(
      '[[ "${KNOWBEE_USE_LAUNCHCTL:-0}" == "1" ]]',
    )
    expect(source).toContain(
      '[[ "${KNOWBEE_DISABLE_LAUNCHCTL:-0}" != "1" ]]',
    )
  })

  it("passes the expiring field-debug bootstrap snapshot through both Gateway owners", () => {
    const noHupStart = source.indexOf("start_gateway_nohup()")
    const launchctlStart = source.indexOf("printf -v command", noHupStart)
    const noHup = source.slice(noHupStart, launchctlStart)
    const launchctl = source.slice(launchctlStart, source.indexOf("if launchctl submit", launchctlStart))

    expect(source).toContain('LOG_PURPOSE_SNAPSHOT="${KNOWBEE_LOG_PURPOSE:-}"')
    expect(source).toContain('FIELD_DEBUG_UNTIL_SNAPSHOT="${KNOWBEE_FIELD_DEBUG_UNTIL:-}"')
    expect(noHup).toContain('export KNOWBEE_LOG_PURPOSE="$LOG_PURPOSE_SNAPSHOT"')
    expect(noHup).toContain('export KNOWBEE_FIELD_DEBUG_UNTIL="$FIELD_DEBUG_UNTIL_SNAPSHOT"')
    expect(launchctl).toContain("KNOWBEE_LOG_PURPOSE=%q KNOWBEE_FIELD_DEBUG_UNTIL=%q")
    expect(launchctl).toContain('"$LOG_PURPOSE_SNAPSHOT" "$FIELD_DEBUG_UNTIL_SNAPSHOT"')
  })

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

  it("waits for the prior launchctl job to disappear before submit or nohup fallback", () => {
    expect(source).toContain("wait_launchctl_job_removed()")
    expect(source).toContain(
      'if ! wait_launchctl_job_removed "$label"; then',
    )
    const remove = source.indexOf('remove_launchctl_job "$GATEWAY_LAUNCHD_LABEL"')
    const submit = source.indexOf("launchctl submit", remove)
    expect(remove).toBeGreaterThan(0)
    expect(submit).toBeGreaterThan(remove)
  })

  it("waits for launchctl jobs to disappear before stop returns", () => {
    expect(stopSource).toContain("wait_launchctl_job_removed()")
    expect(stopSource).toContain(
      'if ! wait_launchctl_job_removed "$label"; then',
    )
    expect(stopSource).toContain(
      "launchctl 작업 제거 완료를 확인하지 못했습니다.",
    )
  })

  it("adopts the exact new launchctl job when submit reports failure after creating it", () => {
    expect(source).toContain(
      'submitted_pid="$(launchctl_job_pid "$GATEWAY_LAUNCHD_LABEL")"',
    )
    expect(source).toContain('if [[ -n "$submitted_pid" ]]; then')
    expect(source).toContain('echo "$submitted_pid" > "$GATEWAY_PID_FILE"')
    expect(source).toContain(
      "Gateway launchctl 명령은 실패를 반환했지만 생성된 작업을 계속 관찰합니다.",
    )
  })
})
