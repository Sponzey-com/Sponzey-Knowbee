import { readdirSync, readFileSync, statSync } from "node:fs"
import { relative, resolve } from "node:path"
import { describe, expect, it } from "vitest"

const root = resolve(import.meta.dirname, "..")
const sourceRoots = [
  resolve(root, "packages/core/src"),
  resolve(root, "packages/cli/src"),
]

function collectChunkDeliveryFiles(dir: string): string[] {
  const files: string[] = []
  for (const entry of readdirSync(dir)) {
    const path = resolve(dir, entry)
    const stat = statSync(path)
    if (stat.isDirectory()) {
      files.push(...collectChunkDeliveryFiles(path))
      continue
    }
    if (entry === "chunk-delivery.ts") files.push(path)
  }
  return files
}

describe("task0901 dynamic chunk delivery reviewed text gate", () => {
  it("requires every chunk delivery handler to gate text chunks to llm_reviewed", () => {
    const files = sourceRoots.flatMap(collectChunkDeliveryFiles)
    expect(files.map((file) => relative(root, file)).sort()).toEqual([
      "packages/cli/src/chunk-delivery.ts",
      "packages/core/src/api/ws/chunk-delivery.ts",
      "packages/core/src/channels/slack/chunk-delivery.ts",
      "packages/core/src/channels/telegram/chunk-delivery.ts",
    ])

    for (const file of files) {
      const source = readFileSync(file, "utf-8")
      expect(source, relative(root, file)).toContain('chunk.textSource !== "llm_reviewed"')
    }
  })
})
