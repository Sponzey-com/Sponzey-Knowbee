import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("task1080 tool dispatcher config fragments", () => {
  it("uses ToolContext config fragments before falling back to runtime config", () => {
    const dispatcherSource = readFileSync("packages/core/src/tools/dispatcher.ts", "utf-8")
    const agentSource = readFileSync("packages/core/src/agent/index.ts", "utf-8")
    const schedulerContractSource = readFileSync("packages/core/src/scheduler/contract-executor.ts", "utf-8")

    expect(dispatcherSource).toContain("function buildRuntimeToolContext(input: {")
    expect(dispatcherSource).toContain("ctx: ToolContext")
    expect(dispatcherSource).toContain("config: ToolRuntimeConfigSnapshot")
    expect(dispatcherSource).toContain("const securityConfig = ctx.securityConfig ?? config.security")
    expect(dispatcherSource).toContain("const { runtimeToolContext, securityConfig } = buildRuntimeToolContext({")
    expect(dispatcherSource).toContain("config: this.config")
    expect(dispatcherSource).not.toContain("getConfig")

    for (const fragment of [
      "mqttConfig: config.mqtt",
      "securityConfig: config.security",
      "searchConfig: config.search",
      "memoryConfig: config.memory",
    ]) {
      expect(agentSource).toContain(fragment)
    }

    expect(schedulerContractSource).toContain("config: params.config")
  })
})
