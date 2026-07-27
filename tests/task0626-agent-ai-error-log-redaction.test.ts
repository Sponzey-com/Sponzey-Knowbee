import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { redactLogText } from "../packages/core/src/logger/index.ts"

describe("task0626 agent AI error log redaction", () => {
  it("keeps agent runtime AI error logs behind the product log redaction boundary", () => {
    const source = readFileSync("packages/core/src/agent/index.ts", "utf8")

    expect(source).toContain("redactLogText")
    expect(source).toContain("function agentRuntimeErrorMessage")
    expect(source).not.toContain("log.error(`AI error: ${msg}`)")
    expect(source).toContain("log.error(`AI error: ${agentRuntimeErrorMessage(err)}`)")

    const redacted = redactLogText(
      "401 invalid api key sk-task0626-secret-1234567890 at /Users/me/private/app.ts runId=run-secret",
    )
    expect(redacted).not.toContain("sk-task0626-secret")
    expect(redacted).not.toContain("/Users/me/private")
    expect(redacted).not.toContain("run-secret")
  })
})
