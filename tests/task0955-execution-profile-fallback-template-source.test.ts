import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { loadPromptSourceRegistry } from "../packages/core/src/memory/knowbee-md.ts"
import { buildResolvedExecutionProfile } from "../packages/core/src/runs/execution-profile.ts"

describe("task0955 execution profile fallback prompt sources", () => {
  it("registers the fallback original request context as an internal prompt source", () => {
    const registry = loadPromptSourceRegistry(process.cwd())
    const source = registry.find((item) => item.sourceId === "execution_fallback_original_request_context_user" && item.locale === "en")

    expect(source).toMatchObject({
      sourceId: "execution_fallback_original_request_context_user",
      usageScope: "internal",
      enabled: true,
    })
    expect(source?.content).toContain("## Value")
    expect(source?.content).toContain("## Out Of Scope")
  })

  it("renders fallback target, destination, context, and completion from prompt source values", () => {
    const result = buildResolvedExecutionProfile({ message: "  화면을 캡처해줘  " })

    expect(result.structuredRequest.target).toBe("화면을 캡처해줘")
    expect(result.structuredRequest.to).toBe("the current channel")
    expect(result.structuredRequest.context).toEqual(["Original user request: 화면을 캡처해줘"])
    expect(result.structuredRequest.complete_condition).toEqual([
      "Produce the requested result in the current execution.",
    ])
  })

  it("uses the file-backed default target when the fallback message is blank", () => {
    const result = buildResolvedExecutionProfile({ message: "" })

    expect(result.structuredRequest.target).toBe("Execute the requested work.")
    expect(result.structuredRequest.context).toEqual([])
  })

  it("does not keep fallback execution prompt bodies hardcoded in TypeScript", () => {
    const source = readFileSync("packages/core/src/runs/execution-profile.ts", "utf-8")

    expect(source).toContain("execution_default_target_user")
    expect(source).toContain("execution_default_destination_user")
    expect(source).toContain("execution_default_complete_condition_user")
    expect(source).toContain("execution_fallback_original_request_context_user")
    expect(source).not.toContain("Execute the requested work.")
    expect(source).not.toContain("Original user request: ${normalized}")
    expect(source).not.toContain("Produce the requested result in the current execution.")
  })
})
