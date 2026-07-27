import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { ensurePromptSourceFiles } from "../packages/core/src/memory/knowbee-md.ts"
import { runPromptSourceRegression } from "../packages/core/src/memory/prompt-regression.ts"

const tempDirs: string[] = []

function createSeededPromptRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "knowbee-product-parameter-prompts-"))
  tempDirs.push(root)
  ensurePromptSourceFiles(root)
  return root
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

describe("task0774 product parameter prompt alignment", () => {
  it("keeps GOAL 11 safe defaults visible in English prompt sources", () => {
    const result = runPromptSourceRegression(process.cwd(), { locales: ["en"] })
    const scenario = result.impact.find((item) => item.id === "product_parameter_safe_defaults")

    expect(scenario).toEqual(expect.objectContaining({
      ok: true,
      missingMarkers: [],
    }))
  })

  it("detects when Yeonjang sensitive approval defaults disappear from prompt sources", () => {
    const root = createSeededPromptRoot()
    const yeonjangPath = join(root, "prompts", "yeonjang_policy.md")
    const prompt = readFileSync(yeonjangPath, "utf-8")
      .replace("- File changes, app execution, terminal commands, screen control, camera capture, keyboard input, mouse input, and external network calls require approval before dispatch.\n", "")
    writeFileSync(yeonjangPath, prompt, "utf-8")

    const result = runPromptSourceRegression(root, { locales: ["en"] })

    expect(result.ok).toBe(false)
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "impact_marker_missing",
        evidence: "product_parameter_safe_defaults:yeonjang_sensitive_approval",
      }),
    ]))
  })
})
