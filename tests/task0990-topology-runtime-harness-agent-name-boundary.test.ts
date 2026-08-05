import { describe, expect, it } from "vitest"
import { loadPromptSourceRegistry } from "../packages/core/src/memory/knowbee-md.ts"

describe("task0990 topology runtime harness agent-name boundary", () => {
  it("does not hardcode the default main-agent self name in topology runtime success text", () => {
    const registry = loadPromptSourceRegistry(process.cwd())
    const source = registry.find((item) =>
      item.sourceId === "topology_runtime_harness_text_user" && item.locale === "en"
    )

    expect(source?.content).toContain(
      "root_success_criterion=Produce a result that the current main agent can synthesize into the final user answer.",
    )
    expect(source?.content).not.toContain(
      "root_success_criterion=Produce a result that Knowbee can synthesize into the final user answer.",
    )
    expect(source?.content).not.toMatch(/root_success_criterion=.*\bKnowbee\b/u)
    expect(source?.content).not.toMatch(/root_success_criterion=.*노비/u)
  })
})
