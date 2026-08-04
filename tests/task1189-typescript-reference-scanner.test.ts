import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"

import { scanTypeScriptReferences } from "../scripts/self/lib/repository-reference-scanner.mjs"

const roots: string[] = []

function rootFixture(): string {
  const root = mkdtempSync(join(tmpdir(), "knowbee-reference-"))
  roots.push(root)
  return root
}

function file(root: string, path: string, content: string): void {
  const absolute = join(root, path)
  mkdirSync(join(absolute, ".."), { recursive: true })
  writeFileSync(absolute, content, "utf8")
}

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true })
})

describe("task1189 TypeScript reference scanner", () => {
  it("uses parsed imports and exports for runtime, test, and migration references", () => {
    const root = rootFixture()
    file(root, "packages/core/src/shared.ts", "export const shared = true\n")
    file(root, "packages/core/src/runtime.ts", [
      "import { shared } from './shared.js'",
      "export { shared as value } from './shared.js'",
    ].join("\n"))
    file(root, "tests/runtime.test.ts", "import '../packages/core/src/shared.js'\n")
    file(root, "tests/external.test.ts", "import '../packages/core/node_modules/fastify'\n")
    file(root, "packages/core/src/db/migrations.ts", "import '../shared.js'\n")

    const result = scanTypeScriptReferences({
      repositoryRoot: root,
      artifactIds: [
        "packages/core/src/shared.ts",
        "packages/core/src/runtime.ts",
        "tests/runtime.test.ts",
        "tests/external.test.ts",
        "packages/core/src/db/migrations.ts",
      ],
    })

    expect(result.complete).toBe(true)
    expect(result.diagnostics).toEqual([])
    expect(result.records).toEqual([
      {
        boundary: "migration",
        targetArtifactId: "packages/core/src/shared.ts",
        owner: "packages/core/src/db/migrations.ts",
        detail: "module:../shared.js",
      },
      {
        boundary: "runtime",
        targetArtifactId: "packages/core/src/shared.ts",
        owner: "packages/core/src/runtime.ts",
        detail: "module:./shared.js",
      },
      {
        boundary: "test",
        targetArtifactId: "packages/core/src/shared.ts",
        owner: "tests/runtime.test.ts",
        detail: "module:../packages/core/src/shared.js",
      },
    ])
  })

  it("fails closed for an unresolved relative module", () => {
    const root = rootFixture()
    file(root, "packages/core/src/runtime.ts", "import './missing.js'\n")

    const result = scanTypeScriptReferences({
      repositoryRoot: root,
      artifactIds: ["packages/core/src/runtime.ts"],
    })

    expect(result.complete).toBe(false)
    expect(result.records).toEqual([])
    expect(result.diagnostics).toEqual([{
      code: "module_unresolved",
      owner: "packages/core/src/runtime.ts",
      specifier: "./missing.js",
    }])
  })

  it("resolves a Vite query module to its file while preserving the original detail", () => {
    const root = rootFixture()
    file(root, "packages/core/src/service.ts", "export const service = true\n")
    file(root, "tests/service.test.ts", "import '../packages/core/src/service.ts?snapshot'\n")

    const result = scanTypeScriptReferences({
      repositoryRoot: root,
      artifactIds: ["packages/core/src/service.ts", "tests/service.test.ts"],
    })

    expect(result).toMatchObject({ complete: true, diagnostics: [] })
    expect(result.records).toEqual([{
      boundary: "test",
      targetArtifactId: "packages/core/src/service.ts",
      owner: "tests/service.test.ts",
      detail: "module:../packages/core/src/service.ts?snapshot",
    }])
  })
})
