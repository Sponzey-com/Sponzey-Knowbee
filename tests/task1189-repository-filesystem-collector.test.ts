import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"

import {
  collectRepositoryArtifactInventory,
} from "../packages/core/src/maintenance/repository-filesystem-inventory.js"

const roots: string[] = []

function fixtureRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "knowbee-inventory-"))
  roots.push(root)
  return root
}

function file(root: string, path: string): void {
  const absolute = join(root, path)
  mkdirSync(join(absolute, ".."), { recursive: true })
  writeFileSync(absolute, "fixture\n", "utf8")
}

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true })
})

describe("task1189 repository filesystem collector", () => {
  it("collects governed files from an explicit repository root in stable order", () => {
    const root = fixtureRoot()
    file(root, "package.json")
    file(root, "tsconfig.base.json")
    file(root, "prompts/identity.md")
    file(root, "packages/core/src/agent.ts")
    file(root, "packages/core/src/agent.js")
    file(root, "docs/guide.md")
    file(root, "tests/fixtures/input.json")
    file(root, "packages/webui/src/assets/logo.svg")
    file(root, ".temp/result.json")
    file(root, "backups/state.json")

    const result = collectRepositoryArtifactInventory({ repositoryRoot: root })

    expect(result.complete).toBe(true)
    expect(result.diagnostics).toEqual([])
    expect(result.artifacts.map(({ artifactId, kind }) => [artifactId, kind])).toEqual([
      [".temp/result.json", "temporary"],
      ["backups/state.json", "backup"],
      ["docs/guide.md", "document"],
      ["package.json", "configuration"],
      ["packages/core/src/agent.js", "generated_output"],
      ["packages/core/src/agent.ts", "source"],
      ["packages/webui/src/assets/logo.svg", "ui_asset"],
      ["prompts/identity.md", "prompt"],
      ["tests/fixtures/input.json", "test_fixture"],
      ["tsconfig.base.json", "configuration"],
    ])
  })

  it("does not follow symlinks and reports unclassified governed-root files", () => {
    const root = fixtureRoot()
    file(root, "prompts/identity.md")
    file(root, "prompts/unclassified.txt")
    symlinkSync(root, join(root, "prompts/loop"))

    const result = collectRepositoryArtifactInventory({ repositoryRoot: root })

    expect(result.complete).toBe(false)
    expect(result.artifacts.map((artifact) => artifact.artifactId)).toEqual(["prompts/identity.md"])
    expect(result.diagnostics).toEqual([
      { code: "symlink_skipped", artifactId: "prompts/loop" },
      { code: "artifact_unclassified", artifactId: "prompts/unclassified.txt" },
    ])
  })

  it("fails closed when the explicit repository root cannot be read", () => {
    const result = collectRepositoryArtifactInventory({
      repositoryRoot: join(fixtureRoot(), "missing"),
    })

    expect(result).toEqual({
      complete: false,
      artifacts: [],
      diagnostics: [{ code: "repository_root_unreadable", artifactId: "." }],
    })
  })
})
