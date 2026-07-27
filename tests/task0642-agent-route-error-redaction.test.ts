import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const agentRouteSource = readFileSync(
  new URL("../packages/core/src/api/routes/agent.ts", import.meta.url),
  "utf-8",
)

describe("task0642 agent route persistence error redaction", () => {
  it("summarizes agent persistence errors through a redacted helper", () => {
    expect(agentRouteSource).toContain('import { redactLogText } from "../../logger/index.js"')
    expect(agentRouteSource).toContain("function agentRoutePersistenceErrorSummary(error: unknown)")
    expect(agentRouteSource).toContain("return sanitizeUserFacingError(redactLogText(rawMessage))")
    expect(agentRouteSource).toContain("const sanitized = agentRoutePersistenceErrorSummary(error)")
    expect(agentRouteSource).not.toContain("sanitizeUserFacingError(error instanceof Error ? error.message : String(error))")
  })
})
