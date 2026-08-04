import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"

import { scanFilesystemLiteralReferences } from "../scripts/self/lib/repository-reference-scanner.mjs"

const roots: string[] = []
const fixture = (): string => {
  const root = mkdtempSync(join(tmpdir(), "knowbee-fs-reference-"))
  roots.push(root)
  return root
}
const file = (root: string, path: string, content = "fixture\n"): void => {
  const absolute = join(root, path)
  mkdirSync(join(absolute, ".."), { recursive: true })
  writeFileSync(absolute, content, "utf8")
}

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true })
})

describe("task1189 filesystem literal reference scanner", () => {
  it("uses the TypeScript AST for root, owner-relative, and import.meta URL file references", () => {
    const root = fixture()
    file(root, "AGENTS.md")
    file(root, "scripts/start.sh")
    file(root, "docs/guide.md")
    file(root, "tests/reference.test.ts", [
      "readFileSync('AGENTS.md', 'utf8')",
      "readFileSync('../scripts/start.sh', 'utf8')",
      "readFileSync(new URL('../docs/guide.md', import.meta.url), 'utf8')",
    ].join("\n"))

    const result = scanFilesystemLiteralReferences({
      repositoryRoot: root,
      artifactIds: [
        "AGENTS.md",
        "scripts/start.sh",
        "docs/guide.md",
        "tests/reference.test.ts",
      ],
    })

    expect(result).toEqual({
      complete: true,
      diagnostics: [],
      records: [
        {
          boundary: "test",
          targetArtifactId: "AGENTS.md",
          owner: "tests/reference.test.ts",
          detail: "filesystem:readFileSync",
        },
        {
          boundary: "test",
          targetArtifactId: "docs/guide.md",
          owner: "tests/reference.test.ts",
          detail: "filesystem:readFileSync",
        },
        {
          boundary: "test",
          targetArtifactId: "scripts/start.sh",
          owner: "tests/reference.test.ts",
          detail: "filesystem:readFileSync",
        },
      ],
    })
  })

  it("fails closed for a governed literal path that does not resolve", () => {
    const root = fixture()
    file(root, "tests/reference.test.ts", "readFileSync('docs/missing.md', 'utf8')\n")

    const result = scanFilesystemLiteralReferences({
      repositoryRoot: root,
      artifactIds: ["tests/reference.test.ts"],
    })

    expect(result).toEqual({
      complete: false,
      records: [],
      diagnostics: [{
        code: "filesystem_reference_unresolved",
        owner: "tests/reference.test.ts",
        reference: "docs/missing.md",
      }],
    })
  })

  it("ignores an existing repository file intentionally excluded from artifact inventory", () => {
    const root = fixture()
    file(root, ".tasks/phase001/goal.md")
    file(root, "tests/reference.test.ts", "readFileSync('../.tasks/phase001/goal.md', 'utf8')\n")

    const result = scanFilesystemLiteralReferences({
      repositoryRoot: root,
      artifactIds: ["tests/reference.test.ts"],
    })

    expect(result).toEqual({ complete: true, records: [], diagnostics: [] })
  })
})
