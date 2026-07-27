import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"

import { scanMarkdownReferences } from "../scripts/lib/repository-reference-scanner.mjs"

const roots: string[] = []
const fixture = (): string => {
  const root = mkdtempSync(join(tmpdir(), "knowbee-markdown-"))
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

describe("task1189 Markdown reference scanner", () => {
  it("records local Markdown links and ignores external URLs and anchors", () => {
    const root = fixture()
    file(
      root,
      "README.md",
      [
        "[Runbook](./docs/runbook.md)",
        "[External](https://example.com/docs)",
        "[Section](#section)",
      ].join("\n"),
    )
    file(root, "docs/runbook.md")

    const result = scanMarkdownReferences({
      repositoryRoot: root,
      artifactIds: ["README.md", "docs/runbook.md"],
    })

    expect(result).toEqual({
      complete: true,
      diagnostics: [],
      records: [
        {
          boundary: "build",
          targetArtifactId: "docs/runbook.md",
          owner: "README.md",
          detail: "markdown:link",
        },
      ],
    })
  })

  it("fails closed for an unresolved local file link", () => {
    const root = fixture()
    file(root, "README.md", "[Missing](./docs/missing.md)\n")

    const result = scanMarkdownReferences({
      repositoryRoot: root,
      artifactIds: ["README.md"],
    })

    expect(result).toEqual({
      complete: false,
      records: [],
      diagnostics: [
        {
          code: "markdown_reference_unresolved",
          owner: "README.md",
          reference: "./docs/missing.md",
        },
      ],
    })
  })

  it("records repository paths used in inline and fenced command examples", () => {
    const root = fixture()
    file(
      root,
      "README.md",
      [
        "Run `bash scripts/knowbee-start.sh`.",
        "```sh",
        "node scripts/release-package.mjs --dry-run",
        "```",
      ].join("\n"),
    )
    file(root, "scripts/knowbee-start.sh")
    file(root, "scripts/release-package.mjs")

    const result = scanMarkdownReferences({
      repositoryRoot: root,
      artifactIds: ["README.md", "scripts/knowbee-start.sh", "scripts/release-package.mjs"],
    })

    expect(result.complete).toBe(true)
    expect(result.records.map((record) => record.targetArtifactId)).toEqual([
      "scripts/knowbee-start.sh",
      "scripts/release-package.mjs",
    ])
  })
})
