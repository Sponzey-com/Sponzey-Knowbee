import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import { describe, expect, it } from "vitest"

function collectSourceDocs(dir: string): string[] {
  const files: string[] = []
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    const stat = statSync(path)
    if (stat.isDirectory()) {
      files.push(...collectSourceDocs(path))
      continue
    }
    if (entry === "source.md") files.push(path)
  }
  return files
}

describe("task0903 source documentation agent name terminology", () => {
  it("keeps source docs free of legacy nickname attribution wording", () => {
    const root = process.cwd()
    const docs = [
      ...collectSourceDocs(join(root, "packages/core/src")),
      ...collectSourceDocs(join(root, "packages/webui/src")),
    ]

    for (const doc of docs) {
      const source = readFileSync(doc, "utf-8")
      expect(source, relative(root, doc)).not.toMatch(/\bnickname attribution\b/iu)
    }
  })
})
