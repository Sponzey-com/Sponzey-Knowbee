import { describe, expect, it } from "vitest"
import { redactUiValue } from "../packages/core/src/ui/redaction.ts"
import { redactLogText } from "../packages/core/src/logger/index.ts"
import {
  resolveControlTimelineAudience,
} from "../packages/core/src/api/routes/control-timeline.ts"

describe("internal LLM structured data audit boundary", () => {
  it("hides internal diagnosis, plan, and result structures from normal UI projections", () => {
    const projected = redactUiValue({
      status: "running",
      request_diagnosis: { goal: "Inspect account state", constraints: ["private"] },
      solutionPlan: { steps: [{ id: "step-1", tool: "web_fetch" }] },
      resultDiagnosis: { sufficiency: "sufficient", evidence_refs: ["evidence:1"] },
      publicSummary: "작업을 확인하고 있습니다.",
    }, { audience: "advanced" })

    expect(projected.value).toEqual({
      status: "running",
      request_diagnosis: "[internal-llm-data-hidden]",
      solutionPlan: "[internal-llm-data-hidden]",
      resultDiagnosis: "[internal-llm-data-hidden]",
      publicSummary: "작업을 확인하고 있습니다.",
    })
    expect(projected.redactions.filter((item) => item.reason === "internal_llm_data")).toHaveLength(3)
  })

  it("does not let a public control endpoint promote itself to developer visibility", () => {
    expect(resolveControlTimelineAudience("developer", "public")).toBe("user")
    expect(resolveControlTimelineAudience("user", "public")).toBe("user")
  })

  it("masks serialized internal LLM structures from every normal log purpose", () => {
    const serialized = JSON.stringify({
      request_diagnosis: { goal: "private internal goal" },
      solution_plan: { steps: ["private internal step"] },
    })

    expect(redactLogText(serialized, "product")).toBe("[internal-llm-data-hidden]")
    expect(redactLogText(serialized, "debug")).toBe("[internal-llm-data-hidden]")
    expect(redactLogText(serialized, "development")).toBe("[internal-llm-data-hidden]")
  })

  it("allows developer visibility only in an explicit audit route context", () => {
    expect(resolveControlTimelineAudience("developer", "audit")).toBe("developer")
    expect(resolveControlTimelineAudience("user", "audit")).toBe("user")
  })
})
