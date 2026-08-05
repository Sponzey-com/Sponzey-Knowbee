import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const DEFINITIONS_FORBIDDEN_POLICY_DETAILS = [
  "The root main agent may target only",
  "A SubAgent may target only",
  "Do not delegate directly to grandchildren",
  "When a Team is targeted, do not execute the Team directly",
  "If at least one suitable delegation target exists",
] as const

describe("task0264 definitions glossary boundary", () => {
  it("keeps executable delegation policy out of shared definitions", () => {
    const promptsDir = join(process.cwd(), "prompts")
    const definitions = readFileSync(join(promptsDir, "definitions.md"), "utf-8")
    const knowbeeExecution = readFileSync(join(promptsDir, "knowbee-execution.md"), "utf-8")
    const subAgentDelegation = readFileSync(join(promptsDir, "sub_agent_delegation.md"), "utf-8")

    for (const detail of DEFINITIONS_FORBIDDEN_POLICY_DETAILS) {
      expect(definitions).not.toContain(detail)
    }

    expect(definitions).toContain("defines terms only")
    expect(definitions).toContain("knowbee-execution.md")
    expect(definitions).toContain("sub_agent_delegation.md")
    expect(knowbeeExecution).toContain("## 5. Execution Order")
    expect(subAgentDelegation).toContain("direct child sub-agents")
  })
})
