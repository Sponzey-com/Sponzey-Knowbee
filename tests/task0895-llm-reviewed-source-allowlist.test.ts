import { readdirSync, readFileSync, statSync } from "node:fs"
import { relative, resolve } from "node:path"
import { describe, expect, it } from "vitest"

const root = resolve(import.meta.dirname, "..")
const sourceRoot = resolve(root, "packages/core/src")

const allowedFiles = new Set([
  "packages/core/src/channels/notice-rendering.ts",
  "packages/core/src/channels/telegram/commands.ts",
  "packages/core/src/runs/delivery.ts",
  "packages/core/src/runs/canonical-result-final-delivery.ts",
  "packages/core/src/runs/final-response-renderer.ts",
  "packages/core/src/runs/loop-directive-application.ts",
  "packages/core/src/runs/user-facing-notice-rendering.ts",
  "packages/core/src/runs/verified-failure-report-rendering.ts",
  "packages/core/src/runs/yeonjang-target-clarification.ts",
  "packages/core/src/runs/no-yeonjang-capability-guidance.ts",
  "packages/core/src/scheduler/final-response.ts",
])

function listTypeScriptSourceFiles(dir: string): string[] {
  const files: string[] = []
  for (const entry of readdirSync(dir)) {
    const path = resolve(dir, entry)
    const stat = statSync(path)
    if (stat.isDirectory()) {
      files.push(...listTypeScriptSourceFiles(path))
      continue
    }
    if (entry.endsWith(".ts") && !entry.endsWith(".d.ts")) files.push(path)
  }
  return files
}

describe("task0895 LLM reviewed provenance allowlist", () => {
  it("keeps llm_reviewed literals inside final-response or final-delivery boundaries", () => {
    const offenders: string[] = []
    const pattern = /\b(?:textSource|userMessageSource):\s*"llm_reviewed"/u

    for (const file of listTypeScriptSourceFiles(sourceRoot)) {
      const source = readFileSync(file, "utf-8")
      if (!pattern.test(source)) continue

      const relativePath = relative(root, file)
      if (!allowedFiles.has(relativePath)) offenders.push(relativePath)
    }

    expect(offenders).toEqual([])
  })
})
