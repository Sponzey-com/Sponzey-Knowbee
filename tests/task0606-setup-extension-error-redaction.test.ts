import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("task0606 setup extension error redaction", () => {
  it("redacts setup external feature connection failures before returning messages", () => {
    const source = readFileSync("packages/core/src/control-plane/setup-extensions.ts", "utf-8")
    const testConnection = source.slice(
      source.indexOf("export async function testMcpServerConnection"),
      source.indexOf("export function buildSkillsSetupDraft"),
    )

    expect(source).toContain("function setupExtensionConnectionErrorMessage(error: unknown): string")
    expect(testConnection).toContain("const message = setupExtensionConnectionErrorMessage(error)")
    expect(testConnection).toContain("message,")
    expect(testConnection).not.toContain("redactLogText(error instanceof Error ? error.message : String(error))")
    expect(testConnection).not.toContain("message: error instanceof Error ? error.message : String(error)")
  })
})
