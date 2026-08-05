import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { ensurePromptSourceFiles } from "../packages/core/src/memory/knowbee-md.ts"
import { runPromptSourceRegression } from "../packages/core/src/memory/prompt-regression.ts"

const tempDirs: string[] = []

function createSeededPromptRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "knowbee-sub-agent-child-prompt-"))
  tempDirs.push(root)
  ensurePromptSourceFiles(root)
  return root
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

describe("task0781 sub-agent runtime child prompt alignment", () => {
  it("keeps runtime child creation disabled in canonical prompt sources", () => {
    const prompt = readFileSync(join(process.cwd(), "prompts", "sub_agent_delegation.md"), "utf-8")
    const harness = readFileSync(join(process.cwd(), "prompts", "execution_decision_harness.md"), "utf-8")
    const execution = readFileSync(join(process.cwd(), "prompts", "knowbee-execution.md"), "utf-8")
    const result = runPromptSourceRegression(process.cwd(), { locales: ["en"] })
    const scenario = result.impact.find((item) => item.id === "product_parameter_safe_defaults")

    expect(prompt).toContain("Do not create child sub-agents at runtime.")
    expect(prompt).toContain("preconfigured direct child sub-agents already present in the execution graph")
    expect(harness).toContain("Do not invent runtime child executors.")
    expect(execution).toContain("Do not invent or create child executors during execution decision.")
    expect(scenario).toEqual(expect.objectContaining({
      ok: true,
      missingMarkers: [],
    }))
  })

  it("detects when the runtime child creation ban disappears from prompt sources", () => {
    const root = createSeededPromptRoot()
    const promptPath = join(root, "prompts", "sub_agent_delegation.md")
    const prompt = readFileSync(promptPath, "utf-8")
      .replace("- Do not create child sub-agents at runtime. Delegation may use only preconfigured direct child sub-agents already present in the execution graph.\n", "")
    writeFileSync(promptPath, prompt, "utf-8")

    const result = runPromptSourceRegression(root, { locales: ["en"] })

    expect(result.ok).toBe(false)
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "impact_marker_missing",
        evidence: "product_parameter_safe_defaults:sub_agent_runtime_child_creation_disabled",
      }),
    ]))
  })
})
