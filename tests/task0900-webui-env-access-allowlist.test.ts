import { readdirSync, readFileSync, statSync } from "node:fs"
import { relative, resolve } from "node:path"
import { describe, expect, it } from "vitest"

const root = resolve(import.meta.dirname, "..")
const webuiRoot = resolve(root, "packages/webui")
const sourceRoot = resolve(webuiRoot, "src")

const allowedProcessEnvFiles = new Set([
  "packages/webui/vite.config.ts",
])

function listSourceFiles(dir: string): string[] {
  const files: string[] = []
  for (const entry of readdirSync(dir)) {
    const path = resolve(dir, entry)
    const stat = statSync(path)
    if (stat.isDirectory()) {
      files.push(...listSourceFiles(path))
      continue
    }
    if (/\.(?:ts|tsx)$/u.test(entry) && !entry.endsWith(".d.ts")) files.push(path)
  }
  return files
}

describe("task0900 WebUI environment access allowlist", () => {
  it("keeps WebUI environment reads at the Vite bootstrap boundary", () => {
    const files = [
      resolve(webuiRoot, "vite.config.ts"),
      ...listSourceFiles(sourceRoot),
    ]
    const processEnvOffenders: string[] = []
    const importMetaEnvOffenders: string[] = []

    for (const file of files) {
      const source = readFileSync(file, "utf-8")
      const relativePath = relative(root, file)

      if (source.includes("process.env") && !allowedProcessEnvFiles.has(relativePath)) {
        processEnvOffenders.push(relativePath)
      }
      if (source.includes("import.meta.env")) importMetaEnvOffenders.push(relativePath)
    }

    expect(processEnvOffenders).toEqual([])
    expect(importMetaEnvOffenders).toEqual([])
  })
})
