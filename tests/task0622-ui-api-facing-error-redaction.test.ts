import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const scheduleComparisonSource = readFileSync(
  new URL("../packages/core/src/schedules/comparison.ts", import.meta.url),
  "utf-8",
)
const nodeSuggestionSource = readFileSync(
  new URL("../packages/core/src/topology/node-definition-suggestion.ts", import.meta.url),
  "utf-8",
)
const topologyImportSource = readFileSync(
  new URL("../packages/core/src/topology/import-export.ts", import.meta.url),
  "utf-8",
)
const memoryInspectorSource = readFileSync(
  new URL("../packages/core/src/memory/inspector.ts", import.meta.url),
  "utf-8",
)

describe("task0622 UI/API-facing error redaction", () => {
  it("sanitizes schedule comparison provider errors before userMessage", () => {
    expect(scheduleComparisonSource).toContain('import { sanitizeUserFacingError } from "../runs/error-sanitizer.js"')
    expect(scheduleComparisonSource).toContain(").userMessage")
    expect(scheduleComparisonSource).not.toContain("userMessage: err instanceof Error ? err.message")
  })

  it("sanitizes topology suggestion and import errors before UI/API output", () => {
    expect(nodeSuggestionSource).toContain('import { redactLogText } from "../logger/index.js"')
    expect(nodeSuggestionSource).toContain("function suggestionErrorUserMessage(error: Error): string")
    expect(nodeSuggestionSource).toContain("const rawMessage = error.message")
    expect(nodeSuggestionSource).toContain("const sanitized = sanitizeUserFacingError(rawMessage)")
    expect(nodeSuggestionSource).toContain("return redactLogText(sanitized.userMessage)")
    expect(nodeSuggestionSource).toContain("return suggestionErrorUserMessage(error)")
    expect(nodeSuggestionSource).not.toContain("sanitizeUserFacingError(error.message).userMessage")
    expect(nodeSuggestionSource).not.toContain("return error.message.trim()")
    expect(topologyImportSource).toContain("sanitizeUserFacingError(")
    expect(topologyImportSource).not.toContain(
      'error instanceof Error ? error.message : "Import document could not be parsed."),',
    )
  })

  it("sanitizes memory inspector provider errors before control reasons", () => {
    expect(memoryInspectorSource).toContain('import { sanitizeUserFacingError } from "../runs/error-sanitizer.js"')
    expect(memoryInspectorSource).toContain("function memoryInspectorProviderErrorReason")
    expect(memoryInspectorSource).toContain("reason: memoryInspectorProviderErrorReason(error)")
    expect(memoryInspectorSource).not.toContain(
      'reason: error instanceof Error ? error.message : "provider_resolution_failed"',
    )
    expect(memoryInspectorSource).not.toContain(
      'reason: sanitizeUserFacingError(\n            error instanceof Error ? error.message : "provider_resolution_failed",\n          ).reason',
    )
  })
})
