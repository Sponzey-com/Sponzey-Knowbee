import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

interface PromptDefinition {
  sourceId: string
  enFilename: string
}

function extractPromptDefinitions(): PromptDefinition[] {
  const source = readFileSync(join(process.cwd(), "packages/core/src/memory/knowbee-md.ts"), "utf-8")
  return [...source.matchAll(
    /\{\s*sourceId:\s*"([^"]+)".*?filenames:\s*\{\s*ko:\s*"[^"]+",\s*en:\s*"([^"]+)"/gu,
  )].map((match) => ({
    sourceId: match[1]!,
    enFilename: match[2]!,
  }))
}

describe("task0915 all prompt source boundary sections", () => {
  it("requires every registered English prompt source file to declare its boundary", () => {
    const offenders: string[] = []

    for (const definition of extractPromptDefinitions()) {
      const content = readFileSync(join(process.cwd(), "prompts", definition.enFilename), "utf-8")
      if (!/^## Purpose\s*$/imu.test(content)) {
        offenders.push(`${definition.sourceId}:${definition.enFilename} missing ## Purpose`)
      }
      if (!/^## Out Of Scope\s*$/imu.test(content)) {
        offenders.push(`${definition.sourceId}:${definition.enFilename} missing ## Out Of Scope`)
      }
    }

    expect(offenders).toEqual([])
  })

  it("keeps runtime input placeholders and exact-output probes as the final effective prompt line", () => {
    const finalLineByPrompt = new Map([
      ["ai_connection_test.md", "Reply with exactly: OK"],
      ["completion_review_user.md", "{{latestAssistantMessage}}"],
      ["execution_decision_harness.md", "{{contextJson}}"],
      ["node_definition_suggestion.md", "{{inputBlock}}"],
      ["task_intake_user.md", "{{conversationContext}}"],
    ])
    const offenders: string[] = []

    for (const [filename, expectedFinalLine] of finalLineByPrompt) {
      const lines = readFileSync(join(process.cwd(), "prompts", filename), "utf-8")
        .split(/\r?\n/u)
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
      const actualFinalLine = lines.at(-1)
      if (actualFinalLine !== expectedFinalLine) {
        offenders.push(`${filename} final line must be ${expectedFinalLine}, got ${actualFinalLine ?? "<empty>"}`)
      }
    }

    expect(offenders).toEqual([])
  })
})
