import { describe, expect, it } from "vitest"
import {
  projectPlatformCapabilities,
  type PlatformCapabilityRuntime,
} from "../packages/core/src/capabilities/platform.ts"
import { createCapabilities } from "../packages/core/src/control-plane/index.ts"
import { DEFAULT_CONFIG } from "../packages/core/src/config/types.js"

const readyRuntime: PlatformCapabilityRuntime = {
  providerConfigured: true,
  conversationPortAvailable: true,
  planningPortAvailable: true,
  executionPortAvailable: true,
  hierarchyPortAvailable: true,
  activeSubAgentCount: 2,
}

describe("task1192 platform capability contract", () => {
  it("reports conversation, planning, execution, and delegation from explicit runtime inputs", () => {
    const projected = projectPlatformCapabilities(readyRuntime)

    expect(projected.map((item) => [item.key, item.status])).toEqual([
      ["platform.conversation", "ready"],
      ["platform.planning", "ready"],
      ["platform.execution", "ready"],
      ["agents.delegation", "ready"],
    ])
  })

  it("does not report LLM-backed capabilities as ready without a configured provider", () => {
    const projected = projectPlatformCapabilities({
      ...readyRuntime,
      providerConfigured: false,
    })

    expect(projected.slice(0, 3).every((item) => item.status === "disabled")).toBe(true)
    expect(
      projected.slice(0, 3).every((item) => item.reasonCode === "ai_provider_not_configured"),
    ).toBe(true)
  })

  it("does not report delegation as ready without a hierarchy port or active sub-agent", () => {
    const withoutPort = projectPlatformCapabilities({
      ...readyRuntime,
      hierarchyPortAvailable: false,
    }).find((item) => item.key === "agents.delegation")
    const withoutAgent = projectPlatformCapabilities({
      ...readyRuntime,
      activeSubAgentCount: 0,
    }).find((item) => item.key === "agents.delegation")

    expect(withoutPort).toEqual(
      expect.objectContaining({
        status: "error",
        reasonCode: "hierarchy_port_unavailable",
      }),
    )
    expect(withoutAgent).toEqual(
      expect.objectContaining({
        status: "disabled",
        reasonCode: "active_sub_agent_required",
      }),
    )
  })

  it("integrates the canonical platform projection without claiming an unconfigured provider", () => {
    const projected = createCapabilities({ config: DEFAULT_CONFIG })
    const platform = projected.filter((item) => item.key.startsWith("platform."))
    const delegation = projected.find((item) => item.key === "agents.delegation")

    expect(platform).toHaveLength(3)
    expect(platform.every((item) => item.status === "disabled")).toBe(true)
    expect(delegation).toEqual(
      expect.objectContaining({
        status: "disabled",
        reasonCode: "active_sub_agent_required",
      }),
    )
  })

  it("reports LLM-backed platform capabilities as ready for an explicitly configured provider", () => {
    const config = structuredClone(DEFAULT_CONFIG)
    config.ai.connection = {
      provider: "openai",
      model: "gpt-test",
      auth: { mode: "api_key", apiKey: "test-key" },
    }

    const projected = createCapabilities({ config }).filter((item) =>
      item.key.startsWith("platform."),
    )

    expect(projected.every((item) => item.status === "ready")).toBe(true)
  })
})
