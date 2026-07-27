import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { describe, expect, it } from "vitest"

function collectSourceFiles(dir: URL): URL[] {
  const files: URL[] = []
  for (const entry of readdirSync(dir)) {
    const next = new URL(`${entry}${statSync(new URL(entry, dir)).isDirectory() ? "/" : ""}`, dir)
    const stat = statSync(next)
    if (stat.isDirectory()) {
      files.push(...collectSourceFiles(next))
      continue
    }
    if (/\.(?:ts|js|d\.ts)$/u.test(entry) && !entry.endsWith(".map")) files.push(next)
  }
  return files
}

describe("legacy LLM source removal", () => {
  it("keeps the obsolete core llm source tree removed", () => {
    expect(existsSync(new URL("../packages/core/src/llm/", import.meta.url))).toBe(false)
  })

  it("does not import the obsolete core llm provider path", () => {
    const files = collectSourceFiles(new URL("../packages/core/src/", import.meta.url))

    for (const file of files) {
      const source = readFileSync(file, "utf-8")

      expect(source, file.pathname).not.toMatch(/from\s+["'][^"']*(?:^|\/|\.)llm(?:\/|["'])/u)
    }
  })
})
