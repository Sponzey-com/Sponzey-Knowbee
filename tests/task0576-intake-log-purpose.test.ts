import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("task intake log purpose policy", () => {
  const source = readFileSync(
    new URL("../packages/core/src/agent/intake.ts", import.meta.url),
    "utf-8",
  )

  it("keeps intake diagnostics out of product info logs", () => {
    expect(source).not.toContain('log.info("schedule management heuristic matched"')
    expect(source).not.toContain('log.info("relative schedule heuristic matched"')
    expect(source).not.toContain('log.debug("starting intake analysis"')
    expect(source).not.toContain('log.debug("finished intake analysis"')
  })

  it("classifies LLM intake analysis tracing as field-debug logs", () => {
    expect(source).not.toContain("heuristic matched")
    expect(source).toContain('log.fieldDebug("starting intake analysis"')
    expect(source).toContain('log.fieldDebug("finished intake analysis attempt"')
  })
})
