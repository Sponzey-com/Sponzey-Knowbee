import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { collectRepositoryArtifactInventory } from "../packages/core/src/maintenance/repository-filesystem-inventory.ts"
import { decideRepositoryArtifactAuditCompletion } from "../scripts/self/audit-repository-artifacts.mjs"
import { scanPackageManifestReferences } from "../scripts/self/lib/repository-reference-scanner.mjs"

const roots: string[] = []

function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), "knowbee-task059-artifacts-"))
  roots.push(root)
  return root
}

function file(root: string, path: string, content = "fixture\n"): void {
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

describe("Task 059 artifact audit completion", () => {
  it("governs PROJECT and structured audit documents without inventory diagnostics", () => {
    const root = fixture()
    file(root, "PROJECT.md", "# Project\n")
    file(root, "docs/audit/project-requirement-evidence.json", "{}\n")

    const inventory = collectRepositoryArtifactInventory({ repositoryRoot: root })

    expect(inventory.diagnostics).toEqual([])
    expect(inventory.artifacts).toEqual([
      expect.objectContaining({
        artifactId: "docs/audit/project-requirement-evidence.json",
        kind: "document",
      }),
      expect.objectContaining({ artifactId: "PROJECT.md", kind: "document" }),
    ])
  })

  it("records tracked audit inputs but ignores generated .tasks command outputs", () => {
    const root = fixture()
    file(root, "PROJECT.md", "# Project\n")
    file(root, "docs/audit/project-requirement-evidence.json", "{}\n")
    file(root, "scripts/audit.mjs")
    file(root, "scripts/skeleton.mjs")
    file(
      root,
      "package.json",
      JSON.stringify({
        scripts: {
          audit:
            "node scripts/audit.mjs --document PROJECT.md --evidence docs/audit/project-requirement-evidence.json --output .tasks/project-requirement-matrix.json",
          skeleton: "node scripts/skeleton.mjs PROJECT.md .tasks/project-requirement-evidence.json",
        },
      }),
    )
    const result = scanPackageManifestReferences({
      repositoryRoot: root,
      artifactIds: [
        "PROJECT.md",
        "docs/audit/project-requirement-evidence.json",
        "scripts/audit.mjs",
        "scripts/skeleton.mjs",
        "package.json",
      ],
    })

    expect(result.complete).toBe(true)
    expect(result.diagnostics).toEqual([])
    expect(result.records.map((record) => record.targetArtifactId)).toEqual([
      "docs/audit/project-requirement-evidence.json",
      "PROJECT.md",
      "PROJECT.md",
      "scripts/audit.mjs",
      "scripts/skeleton.mjs",
    ])
  })

  it("requires complete scans and zero unknown or candidate artifacts", () => {
    expect(
      decideRepositoryArtifactAuditCompletion({
        inventoryComplete: true,
        scansComplete: true,
        counts: { referenced: 2, generated: 1, retained: 1, candidate: 0, unknown: 0 },
      }),
    ).toBe(true)
    expect(
      decideRepositoryArtifactAuditCompletion({
        inventoryComplete: true,
        scansComplete: true,
        counts: { referenced: 2, generated: 1, retained: 1, candidate: 1, unknown: 0 },
      }),
    ).toBe(false)
    expect(
      decideRepositoryArtifactAuditCompletion({
        inventoryComplete: true,
        scansComplete: false,
        counts: { referenced: 0, generated: 0, retained: 0, candidate: 0, unknown: 4 },
      }),
    ).toBe(false)
  })
})
