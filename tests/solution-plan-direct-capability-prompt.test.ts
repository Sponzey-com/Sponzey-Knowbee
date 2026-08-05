import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { SOLUTION_PLAN_RESPONSE_TOOL } from "../packages/core/src/ai/solution-plan-response-tool.ts"

describe("solution-plan direct capability prompt", () => {
  it("requires the LLM to preserve an approved direct side effect instead of substituting shell", () => {
    const prompt = readFileSync(
      join(process.cwd(), "prompts", "solution_plan_json_instruction_user.md"),
      "utf8",
    )

    expect(prompt).toContain("`approval_tool:<capability-id>`")
    expect(prompt).toContain("`approved_capability:<capability-id>`")
    expect(prompt).toContain("purpose-specific capability")
    expect(prompt).toContain("generic shell")
    expect(prompt).toContain("`requiredCapabilityRefs`")
    expect(prompt).toContain("already made by prior LLM")
    expect(prompt).toMatch(/exactly one provided\s+`capability:` reference/u)
  })

  it("puts the exact capability-ref rule in the response Tool schema seen by the LLM", () => {
    const inputRefs = (
      SOLUTION_PLAN_RESPONSE_TOOL.input_schema.properties?.steps as {
        items?: {
          properties?: {
            input_refs?: { description?: string }
          }
        }
      }
    ).items?.properties?.input_refs

    expect(inputRefs?.description).toContain("exactly one provided capability reference")
    expect(inputRefs?.description).toContain("approved_capability")
  })
})
