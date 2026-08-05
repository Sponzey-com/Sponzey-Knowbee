import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import {
  buildCliCommandErrorNotice,
  formatCliCommandFailure,
} from "../packages/cli/src/command-error.ts"

describe("task0802 CLI command error boundary", () => {
  it("builds command and fatal diagnostic notices", () => {
    expect(buildCliCommandErrorNotice({
      severity: "command",
      reason: "invalid input",
    })).toMatchObject({
      kind: "cli_command_error",
      surface: "cli",
      stage: "command",
      severity: "command",
      text: "CLI command failed. Reason: invalid input",
      textSource: "cli_command_error_notice",
      finalAnswer: false,
      assistantIdentityClaim: false,
    })

    expect(buildCliCommandErrorNotice({
      severity: "fatal",
      reason: "server failed",
    }).text).toBe("CLI fatal failure. Reason: server failed")
  })

  it("formats unknown errors through the sanitizer", () => {
    const text = formatCliCommandFailure(new Error([
      "401 invalid api key: sk-cli-command-secret",
      "    at run (/Users/me/private/command.ts:12:3)",
    ].join("\n")))

    expect(text).toContain("CLI command failed. Reason: 인증 또는 접근 차단 문제로 요청이 실패했습니다.")
    expect(text).not.toContain("sk-cli-command-secret")
    expect(text).not.toContain("/Users/me/private")
  })

  it("routes CLI index command catch blocks through the shared reporter", () => {
    const source = readFileSync(join(process.cwd(), "packages/cli/src/index.ts"), "utf-8")

    expect(source).toContain("reportCliCommandFailure")
    expect(source).not.toContain("console.error(\"Error:\"")
    expect(source).not.toContain("console.error(\"Fatal:\"")
    expect(source).not.toContain("console.error(\"Fatal error:\"")
  })
})
