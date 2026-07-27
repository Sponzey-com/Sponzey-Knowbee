import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("task1074 scheduler Slack delivery config snapshot", () => {
  it("passes explicit config snapshots into default Slack delivery helpers", () => {
    const source = readFileSync("packages/core/src/scheduler/contract-executor.ts", "utf-8")

    expect(source).toContain("async function defaultSlackTextDelivery(sessionId: string, text: string, config: KnowbeeConfig)")
    expect(source).toContain("async function defaultSlackFileDelivery(sessionId: string, filePath: string, config: KnowbeeConfig, caption?: string)")
    expect(source).toContain("defaultSlackTextDelivery(sessionId, text, params.config)")
    expect(source).toContain("defaultSlackFileDelivery(sessionId, filePath, params.config, caption)")
    expect(source).not.toContain("async function defaultSlackTextDelivery(sessionId: string, text: string):")
    expect(source).not.toContain("async function defaultSlackFileDelivery(sessionId: string, filePath: string, caption?: string):")
    expect(source).not.toContain("params.dependencies?.config ?? getConfig()")
  })
})
