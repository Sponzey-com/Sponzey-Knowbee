import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { runSoakProfile } from "../packages/core/src/runs/soak-retention.ts"

describe("task0627 soak runtime error redaction", () => {
  it("does not pass raw thrown operation errors into soak failure results", async () => {
    const source = readFileSync("packages/core/src/runs/soak-retention.ts", "utf8")

    expect(source).toContain("function soakOperationErrorMessage")
    expect(source).toContain("redactLogText")
    expect(source).not.toContain("errorMessage: error instanceof Error ? error.message : String(error)")

    const secret = "sk-task0627-secret-1234567890"
    const localPath = "/Users/me/private/soak-runner.ts"
    const summary = await runSoakProfile({
      profile: "short",
      maxOperations: 1,
      waitBetweenOperations: false,
      stopOnFailure: true,
      executeOperation: async () => {
        throw new Error(`screen_capture failed token=${secret} at ${localPath}`)
      },
    })

    expect(summary.lastFailure).toMatchObject({
      ok: false,
      errorKind: "tool_failure",
      userMessage: "도구 또는 실행 경로에서 오류가 발생했습니다.",
    })
    const serialized = JSON.stringify(summary)
    expect(serialized).not.toContain(secret)
    expect(serialized).not.toContain(localPath)
  })
})
