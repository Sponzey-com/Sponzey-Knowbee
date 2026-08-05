import { readdirSync, readFileSync, statSync } from "node:fs"
import { relative, resolve } from "node:path"
import { describe, expect, it } from "vitest"

const root = resolve(import.meta.dirname, "..")
const sourceRoot = resolve(root, "packages/cli/src")

const allowedProcessEnvFiles = new Set([
  "packages/cli/src/runtime-env.ts",
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

describe("task0899 CLI process env access allowlist", () => {
  it("keeps CLI process.env reads inside the runtime env snapshot helper", () => {
    const offenders: string[] = []

    for (const file of listTypeScriptSourceFiles(sourceRoot)) {
      const source = readFileSync(file, "utf-8")
      if (!source.includes("process.env")) continue

      const relativePath = relative(root, file)
      if (!allowedProcessEnvFiles.has(relativePath)) offenders.push(relativePath)
    }

    expect(offenders).toEqual([])
  })
})
