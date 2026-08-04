import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"

import { scanTsConfigReferences } from "../scripts/self/lib/repository-reference-scanner.mjs"

const roots: string[] = []
const fixture = (): string => {
  const root = mkdtempSync(join(tmpdir(), "knowbee-tsconfig-"))
  roots.push(root)
  return root
}
const file = (root: string, path: string, content: string): void => {
  const absolute = join(root, path)
  mkdirSync(join(absolute, ".."), { recursive: true })
  writeFileSync(absolute, content, "utf8")
}

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true })
})

describe("task1189 tsconfig reference scanner", () => {
  it("uses the TypeScript config parser for extends and include references", () => {
    const root = fixture()
    file(root, "tsconfig.base.json", JSON.stringify({ compilerOptions: { strict: true } }))
    file(root, "packages/app/tsconfig.json", JSON.stringify({
      extends: "../../tsconfig.base.json",
      include: ["src/**/*.ts"],
    }))
    file(root, "packages/app/src/index.ts", "export {}\n")
    file(root, "packages/app/src/unused.ts", "export {}\n")

    const result = scanTsConfigReferences({
      repositoryRoot: root,
      artifactIds: [
        "tsconfig.base.json",
        "packages/app/tsconfig.json",
        "packages/app/src/index.ts",
        "packages/app/src/unused.ts",
      ],
    })

    expect(result.complete).toBe(true)
    expect(result.diagnostics).toEqual([])
    expect(result.records).toEqual([
      {
        boundary: "build",
        targetArtifactId: "packages/app/src/index.ts",
        owner: "packages/app/tsconfig.json",
        detail: "tsconfig:file",
      },
      {
        boundary: "build",
        targetArtifactId: "packages/app/src/unused.ts",
        owner: "packages/app/tsconfig.json",
        detail: "tsconfig:file",
      },
      {
        boundary: "build",
        targetArtifactId: "tsconfig.base.json",
        owner: "packages/app/tsconfig.json",
        detail: "tsconfig:extends",
      },
    ])
  })

  it("fails closed when a tsconfig cannot be parsed", () => {
    const root = fixture()
    file(root, "packages/app/tsconfig.json", "{broken")

    const result = scanTsConfigReferences({
      repositoryRoot: root,
      artifactIds: ["packages/app/tsconfig.json"],
    })

    expect(result.complete).toBe(false)
    expect(result.records).toEqual([])
    expect(result.diagnostics).toEqual([{
      code: "tsconfig_invalid",
      owner: "packages/app/tsconfig.json",
      reference: "",
    }])
  })
})
