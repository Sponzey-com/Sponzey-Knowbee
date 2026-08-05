import { readdirSync, readFileSync, statSync } from "node:fs"
import { relative, resolve } from "node:path"
import { describe, expect, it } from "vitest"

const root = resolve(import.meta.dirname, "..")
const sourceRoot = resolve(root, "packages/core/src")

const allowedProcessEnvFiles = new Set([
  "packages/core/src/auth/openai-codex-oauth.ts",
  "packages/core/src/config/paths.ts",
  "packages/core/src/logger/index.ts",
  "packages/core/src/mcp/client.ts",
  "packages/core/src/runtime/startup-process-context.ts",
  "packages/core/src/version.ts",
  "packages/core/src/yeonjang/runtime-identity.ts",
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

describe("task0897 runtime environment access allowlist", () => {
  it("keeps process.env reads inside config, bootstrap, or edge adapter files", () => {
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
