import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"

import { scanExactRepositoryLiteralReferences } from "../scripts/lib/repository-reference-scanner.mjs"

const roots: string[] = []
const fixture = (): string => {
  const root = mkdtempSync(join(tmpdir(), "knowbee-literal-"))
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

describe("task1189 exact repository literal scanner", () => {
  it("records exact arrays, repo-root joins, segmented joins, and owner-relative fixtures", () => {
    const root = fixture()
    file(root, "packages/core/src/source.md")
    file(root, "packages/webui/src/component.tsx")
    file(root, "tests/fixtures/input.json")
    file(
      root,
      "tests/reference.test.ts",
      [
        "const required = ['packages/core/src/source.md']",
        "readFileSync(join(repoRoot, 'packages/core/src/source.md'))",
        "readFileSync(join(process.cwd(), 'packages', 'webui', 'src', 'component.tsx'))",
        "readFileSync(join(__dirname, 'fixtures', 'input.json'))",
        "const label = 'not/a/repository/artifact.md'",
      ].join("\n"),
    )

    const result = scanExactRepositoryLiteralReferences({
      repositoryRoot: root,
      artifactIds: [
        "packages/core/src/source.md",
        "packages/webui/src/component.tsx",
        "tests/fixtures/input.json",
        "tests/reference.test.ts",
      ],
    })

    expect(result).toEqual({
      complete: true,
      diagnostics: [],
      records: [
        {
          boundary: "test",
          targetArtifactId: "packages/core/src/source.md",
          owner: "tests/reference.test.ts",
          detail: "literal:repository-path",
        },
        {
          boundary: "test",
          targetArtifactId: "packages/webui/src/component.tsx",
          owner: "tests/reference.test.ts",
          detail: "literal:repository-path",
        },
        {
          boundary: "test",
          targetArtifactId: "tests/fixtures/input.json",
          owner: "tests/reference.test.ts",
          detail: "literal:repository-path",
        },
      ],
    })
  })
})
