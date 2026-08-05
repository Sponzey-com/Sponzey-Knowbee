import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"

import { scanDirectoryDiscoveryReferences } from "../scripts/self/lib/repository-reference-scanner.mjs"

const roots: string[] = []
const fixture = (): string => {
  const root = mkdtempSync(join(tmpdir(), "knowbee-discovery-"))
  roots.push(root)
  return root
}
const file = (root: string, path: string, content = "fixture\n"): void => {
  const absolute = join(root, path)
  mkdirSync(join(absolute, ".."), { recursive: true })
  writeFileSync(absolute, content, "utf8")
}

afterEach(() => {
  while (roots.length > 0) {
    const root = roots.pop()
    if (root) rmSync(root, { recursive: true, force: true })
  }
})

describe("task1189 directory discovery reference scanner", () => {
  it("records files consumed by an explicit fixture directory loader", () => {
    const root = fixture()
    file(root, "tests/fixtures/web/a.json")
    file(root, "tests/fixtures/web/b.json")
    file(
      root,
      "tests/fixture.test.ts",
      [
        "const dir = join(process.cwd(), 'tests/fixtures/web')",
        "const fixtures = loadFixturesFromDir(dir)",
      ].join("\n"),
    )

    const result = scanDirectoryDiscoveryReferences({
      repositoryRoot: root,
      artifactIds: [
        "tests/fixtures/web/a.json",
        "tests/fixtures/web/b.json",
        "tests/fixture.test.ts",
      ],
    })

    expect(result.complete).toBe(true)
    expect(result.records.map((record) => record.targetArtifactId)).toEqual([
      "tests/fixtures/web/a.json",
      "tests/fixtures/web/b.json",
    ])
  })

  it("applies an explicit basename filter during recursive documentation discovery", () => {
    const root = fixture()
    file(root, "packages/core/src/source.md")
    file(root, "packages/core/src/ignored.md")
    file(
      root,
      "tests/docs.test.ts",
      [
        "for (const entry of readdirSync(join(process.cwd(), 'packages/core/src'))) {",
        "  if (entry === 'source.md') files.push(entry)",
        "}",
      ].join("\n"),
    )

    const result = scanDirectoryDiscoveryReferences({
      repositoryRoot: root,
      artifactIds: [
        "packages/core/src/source.md",
        "packages/core/src/ignored.md",
        "tests/docs.test.ts",
      ],
    })

    expect(result.records.map((record) => record.targetArtifactId)).toEqual([
      "packages/core/src/source.md",
    ])
  })

  it("does not treat an unfiltered product source walk as ownership of every file", () => {
    const root = fixture()
    file(root, "packages/core/src/used.ts")
    file(root, "packages/core/src/unused.ts")
    file(
      root,
      "tests/source-walk.test.ts",
      [
        "const dir = join(process.cwd(), 'packages/core/src')",
        "const entries = readdirSync(dir)",
      ].join("\n"),
    )

    const result = scanDirectoryDiscoveryReferences({
      repositoryRoot: root,
      artifactIds: [
        "packages/core/src/used.ts",
        "packages/core/src/unused.ts",
        "tests/source-walk.test.ts",
      ],
    })

    expect(result.records).toEqual([])
  })
})
