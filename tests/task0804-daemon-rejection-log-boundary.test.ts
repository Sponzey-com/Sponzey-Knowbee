import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import {
  buildDaemonRejectionNotice,
  formatDaemonRejectionLog,
} from "../packages/cli/src/daemon-error.ts"

describe("task0804 daemon rejection log boundary", () => {
  it("builds field debug daemon rejection notice", () => {
    expect(buildDaemonRejectionNotice({
      reason: "socket closed",
    })).toEqual({
      kind: "daemon_unhandled_rejection",
      surface: "daemon",
      stage: "runtime",
      reason: "socket closed",
      text: "Daemon unhandled rejection; process kept alive. Reason: socket closed",
      logLevel: "field_debug",
      textSource: "daemon_rejection_notice",
      renderingRequired: "none",
      finalAnswer: false,
      assistantIdentityClaim: false,
    })
  })

  it("formats daemon rejection logs without raw secrets or paths", () => {
    const text = formatDaemonRejectionLog(new Error([
      "401 invalid api key: sk-daemon-secret",
      "    at boot (/Users/me/private/daemon.ts:12:3)",
    ].join("\n")))

    expect(text).toContain("Daemon unhandled rejection; process kept alive. Reason: 인증 또는 접근 차단 문제로 요청이 실패했습니다.")
    expect(text).not.toContain("sk-daemon-secret")
    expect(text).not.toContain("/Users/me/private")
  })

  it("routes serve rejection guard through daemon formatter", () => {
    const source = readFileSync(join(process.cwd(), "packages/cli/src/commands/serve.ts"), "utf-8")

    expect(source).toContain("formatDaemonRejectionLog")
    expect(source).not.toContain("function formatDaemonError")
    expect(source).not.toContain("error.stack")
    expect(source).not.toContain("formatDaemonError(reason)")
  })
})
