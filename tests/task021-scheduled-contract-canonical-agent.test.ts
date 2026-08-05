import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("task021 scheduled contract canonical agent", () => {
  it("removes direct agent execution and duplicate final rendering from the contract executor", () => {
    const source = readFileSync("packages/core/src/scheduler/contract-executor.ts", "utf8")

    expect(source).not.toContain('import { runAgent } from "../agent/index.js"')
    expect(source).not.toContain("runAgentImpl")
    expect(source).not.toContain("renderScheduledFinalResponse")
    expect(source).toContain('import { startIngressRun } from "../runs/ingress.js"')
    expect(source).toContain("startIngressRunImpl?: typeof startIngressRun")
    expect(source).toContain("runId: params.scheduleRunId")
    expect(source).toContain("await started.finished")
    expect(source).toContain("retryable: false")
  })
})
