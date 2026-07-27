import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const root = resolve(import.meta.dirname, "..")

function readProjectFile(path: string): string {
  return readFileSync(resolve(root, path), "utf-8")
}

describe("task0876 text chunk provenance static gate", () => {
  it("keeps source-owned text chunk literals explicit", () => {
    const files = [
      "packages/core/src/agent/index.ts",
      "packages/core/src/runs/delivery.ts",
    ]

    for (const file of files) {
      const source = readProjectFile(file)
      const textChunkLiterals = [...source.matchAll(/\{[^{}]*type:\s*["']text["']\s*,[^{}]*delta:[^{}]*\}/gs)]

      expect(textChunkLiterals.length, file).toBeGreaterThan(0)
      for (const literal of textChunkLiterals) {
        expect(literal[0], file).toMatch(
          /textSource:\s*["'](?:llm_generated|llm_reviewed|runtime_deterministic|user_supplied_literal|mixed)["']/,
        )
      }
    }
  })

  it("keeps user-visible chunk handlers gated to reviewed text", () => {
    const files = [
      "packages/cli/src/chunk-delivery.ts",
      "packages/core/src/api/ws/chunk-delivery.ts",
      "packages/core/src/channels/telegram/chunk-delivery.ts",
      "packages/core/src/channels/slack/chunk-delivery.ts",
    ]

    for (const file of files) {
      const source = readProjectFile(file)
      expect(source, file).toContain('chunk.textSource !== "llm_reviewed"')
    }
  })
})
