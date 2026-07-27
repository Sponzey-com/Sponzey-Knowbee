import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { buildMainAgentIdentityPromptContext } from "../packages/core/src/agent/main-agent-identity.ts"
import { DEFAULT_CONFIG } from "../packages/core/src/config/types.ts"
import { loadPromptSourceRegistry } from "../packages/core/src/memory/knowbee-md.ts"

describe("task0922 runtime identity context prompt source", () => {
  it("registers runtime identity context as a file-backed internal prompt source", () => {
    const registry = loadPromptSourceRegistry(process.cwd())
    const source = registry.find((item) => item.sourceId === "runtime_identity_context" && item.locale === "en")

    expect(source).toMatchObject({
      sourceId: "runtime_identity_context",
      usageScope: "internal",
      enabled: true,
    })
    expect(source?.path.endsWith("prompts/runtime_identity_context.md")).toBe(true)
    expect(source?.content).toContain("{{mainAgentName}}")
    expect(source?.content).toContain("{{productName}}")
    expect(source?.content).toContain("{{productNameKo}}")
  })

  it("renders trusted runtime identity values from the prompt source", () => {
    const config = {
      ...DEFAULT_CONFIG,
      profile: {
        ...DEFAULT_CONFIG.profile,
        language: "ko",
      },
      orchestration: {
        ...DEFAULT_CONFIG.orchestration,
        knowbee: {
          ...DEFAULT_CONFIG.orchestration.knowbee,
          agentName: "마당쇠",
        },
      },
    }

    const context = buildMainAgentIdentityPromptContext(config, "ko", process.cwd())

    expect(context).toContain("[Trusted Main Agent Identity]")
    expect(context).toContain("Current main-agent self name: `마당쇠`")
    expect(context).toContain("Product name: `Knowbee` / `노비`")
    expect(context).not.toContain("{{mainAgentName}}")
  })

  it("does not keep duplicated runtime identity policy text hardcoded in TypeScript", () => {
    const source = readFileSync("packages/core/src/agent/main-agent-identity.ts", "utf-8")

    expect(source).toContain('sourceId: "runtime_identity_context"')
    expect(source).not.toContain("Current main-agent self name:")
    expect(source).not.toContain("localized default aliases")
  })
})
