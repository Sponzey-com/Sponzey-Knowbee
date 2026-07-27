import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("Task 178 installed live CLI contract", () => {
  it("verifies the installed acceptance readiness option instead of source help", () => {
    const source = readFileSync("scripts/smoke-npm-install.mjs", "utf8")

    expect(source).toContain('"smoke", "acceptance", "--help"')
    expect(source).toContain('acceptanceHelpOutput.includes("--check")')
  })
})
