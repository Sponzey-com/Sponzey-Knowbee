import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("task1122 AI internal provider helper config boundary", () => {
  it("keeps internal provider helpers from reading active config implicitly", () => {
    const source = readFileSync("packages/core/src/ai/index.ts", "utf-8")

    expect(source).toContain("function isOpenAIOAuthConfigured(connection: AIConnectionConfig): boolean")
    expect(source).toContain("return isOpenAIOAuthConfigured(connection)")
    expect(source).not.toContain("function isOpenAIOAuthConfigured(connection = getActiveAIConnection()): boolean")
    expect(source).not.toContain("function hasConfiguredConnection(")
  })
})
