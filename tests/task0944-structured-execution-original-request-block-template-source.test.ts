import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { loadPromptSourceRegistry } from "../packages/core/src/memory/knowbee-md.ts"
import { buildStructuredExecutionBrief } from "../packages/core/src/runs/request-prompt.ts"

const executionSemantics = {
  filesystemEffect: "none" as const,
  privilegedOperation: "none" as const,
  artifactDelivery: "none" as const,
  approvalRequired: false,
  approvalTool: "external_action" as const,
}

function buildPrompt(originalRequest: string | undefined): string {
  return buildStructuredExecutionBrief({
    header: "[Root Task Execution]",
    introLines: ["This request has completed intake."],
    originalRequest,
    structuredRequest: {
      source_language: "ko",
      normalized_english: "Summarize the report.",
      target: "A concise report summary",
      to: "current channel",
      context: ["Report path: /tmp/report.md"],
      complete_condition: ["Return only verified facts."],
    },
    executionSemantics,
    closingLines: ["Execute the actual work in checklist order."],
  })
}

describe("task0944 structured execution original request block prompt source", () => {
  it("registers the original request block as a file-backed internal prompt source", () => {
    const registry = loadPromptSourceRegistry(process.cwd())
    const source = registry.find((item) =>
      item.sourceId === "structured_execution_original_request_block_user" && item.locale === "en")

    expect(source).toMatchObject({
      sourceId: "structured_execution_original_request_block_user",
      usageScope: "internal",
      enabled: true,
    })
    expect(source?.path.endsWith("prompts/structured_execution_original_request_block_user.md")).toBe(true)
    expect(source?.content).toContain("## Value")
    expect(source?.content).toContain("{{originalRequest}}")
  })

  it("renders only the Value section into the structured execution brief", () => {
    const prompt = buildPrompt("보고서를 요약해줘")

    expect(prompt).toContain("Original user request:\n보고서를 요약해줘")
    expect(prompt).toContain("# Structured Execution Brief")
    expect(prompt).not.toContain("# Structured Execution Original Request Block")
    expect(prompt).not.toContain("## Value")
  })

  it("omits the block when the original request is blank", () => {
    const prompt = buildPrompt("  ")

    expect(prompt).not.toContain("Original user request:")
    expect(prompt).toContain("[target]\nA concise report summary")
  })

  it("does not keep the original request block body hardcoded in request-prompt TypeScript", () => {
    const source = readFileSync("packages/core/src/runs/request-prompt.ts", "utf-8")

    expect(source).toContain("structured_execution_original_request_block_user")
    expect(source).not.toContain("Original user request:\\n${")
    expect(source).not.toContain("Original user request:")
  })
})
