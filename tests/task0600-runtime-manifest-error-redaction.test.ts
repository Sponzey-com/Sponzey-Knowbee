import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("task0600 runtime manifest diagnostic redaction", () => {
  it("redacts prompt registry catch errors before manifest diagnostics", () => {
    const source = readFileSync("packages/core/src/runtime/manifest.ts", "utf-8")
    const promptSourceReader = source.slice(
      source.indexOf("function readPromptSources"),
      source.indexOf("function tableExists"),
    )

    expect(source).toContain("function runtimeManifestErrorMessage(error: unknown): string")
    expect(promptSourceReader).toContain("const message = runtimeManifestErrorMessage(error)")
    expect(promptSourceReader).toContain('diagnostics: [{ severity: "error", code: "prompt_registry_unreadable", message }]')
    expect(promptSourceReader).not.toContain("redactLogText(error instanceof Error ? error.message : String(error))")
    expect(promptSourceReader).not.toContain('message: error instanceof Error ? error.message : String(error)')
  })
})
