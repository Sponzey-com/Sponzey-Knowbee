import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { loadPromptSourceRegistry, loadPromptTemplate } from "../packages/core/src/memory/knowbee-md.ts"

describe("task0939 reasoning policy runtime prompt source", () => {
  it("registers reasoning policy runtime directive as a file-backed internal source", () => {
    const source = loadPromptSourceRegistry(process.cwd())
      .find((item) => item.sourceId === "reasoning_policy_runtime" && item.locale === "en")

    expect(source).toMatchObject({ sourceId: "reasoning_policy_runtime", usageScope: "internal", enabled: true })
    expect(source?.path.endsWith("prompts/reasoning_policy_runtime.md")).toBe(true)
    expect(source?.content).toContain("[Reasoning Policy]")
    expect(source?.content).toContain("Do not expose lengthy hidden reasoning")
  })

  it("renders the reasoning policy from the prompt source", () => {
    const prompt = loadPromptTemplate({ sourceId: "reasoning_policy_runtime" })

    expect(prompt).toContain("# Reasoning Runtime Policy")
    expect(prompt).toContain("[Reasoning Policy]")
    expect(prompt).toContain("Use reasoning mode before acting.")
  })

  it("does not keep the reasoning policy body hardcoded in agent index", () => {
    const source = readFileSync("packages/core/src/agent/index.ts", "utf-8")

    expect(source).toContain('sourceId: "reasoning_policy_runtime"')
    expect(source).not.toContain("Treat the current execution target as a llama/ollama-style model. Use reasoning mode")
    expect(source).not.toContain("without exposing lengthy hidden reasoning")
  })
})
