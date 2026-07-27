import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"

import { scanWorkspaceOwnershipReferences } from "../scripts/lib/repository-reference-scanner.mjs"

const roots: string[] = []
const fixture = (): string => {
  const root = mkdtempSync(join(tmpdir(), "knowbee-workspace-"))
  roots.push(root)
  return root
}
const file = (root: string, path: string, content = "{}\n"): void => {
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

describe("task1189 workspace ownership reference scanner", () => {
  it("owns workspace metadata, member manifests, lockfile, and package build config", () => {
    const root = fixture()
    file(
      root,
      "package.json",
      JSON.stringify({ packageManager: "pnpm@10.0.0", workspaces: ["packages/*"] }),
    )
    file(root, "pnpm-workspace.yaml", 'packages:\n  - "packages/*"\n')
    file(root, "pnpm-lock.yaml", "lockfileVersion: '9.0'\n")
    file(root, "biome.json")
    file(root, "tsconfig.base.json")
    file(root, "packages/core/package.json", JSON.stringify({ name: "@knowbee/core" }))
    file(root, "packages/core/tsconfig.json")
    file(root, "packages/webui/package.json", JSON.stringify({ name: "@knowbee/webui" }))
    file(root, "packages/webui/vite.config.ts")
    file(root, "packages/webui/postcss.config.js")

    const result = scanWorkspaceOwnershipReferences({
      repositoryRoot: root,
      artifactIds: [
        "package.json",
        "pnpm-workspace.yaml",
        "pnpm-lock.yaml",
        "biome.json",
        "tsconfig.base.json",
        "packages/core/package.json",
        "packages/core/tsconfig.json",
        "packages/webui/package.json",
        "packages/webui/vite.config.ts",
        "packages/webui/postcss.config.js",
      ],
    })

    expect(result.complete).toBe(true)
    expect(result.diagnostics).toEqual([])
    expect(
      result.records.map(({ targetArtifactId, owner, detail }) => ({
        targetArtifactId,
        owner,
        detail,
      })),
    ).toEqual([
      { targetArtifactId: "biome.json", owner: "package.json", detail: "workspace:root-config" },
      {
        targetArtifactId: "package.json",
        owner: "workspace:repository",
        detail: "workspace:root-manifest",
      },
      {
        targetArtifactId: "packages/core/package.json",
        owner: "pnpm-workspace.yaml",
        detail: "workspace:member-manifest",
      },
      {
        targetArtifactId: "packages/core/tsconfig.json",
        owner: "packages/core/package.json",
        detail: "workspace:package-config",
      },
      {
        targetArtifactId: "packages/webui/package.json",
        owner: "pnpm-workspace.yaml",
        detail: "workspace:member-manifest",
      },
      {
        targetArtifactId: "packages/webui/postcss.config.js",
        owner: "packages/webui/package.json",
        detail: "workspace:package-config",
      },
      {
        targetArtifactId: "packages/webui/vite.config.ts",
        owner: "packages/webui/package.json",
        detail: "workspace:package-config",
      },
      {
        targetArtifactId: "pnpm-lock.yaml",
        owner: "package.json",
        detail: "workspace:package-manager-lock",
      },
      {
        targetArtifactId: "pnpm-workspace.yaml",
        owner: "package.json",
        detail: "workspace:definition",
      },
      {
        targetArtifactId: "tsconfig.base.json",
        owner: "package.json",
        detail: "workspace:root-config",
      },
    ])
  })

  it("fails closed when a declared workspace contains no package manifest", () => {
    const root = fixture()
    file(root, "package.json", JSON.stringify({ packageManager: "pnpm@10.0.0" }))
    file(root, "pnpm-workspace.yaml", 'packages:\n  - "missing/*"\n')

    const result = scanWorkspaceOwnershipReferences({
      repositoryRoot: root,
      artifactIds: ["package.json", "pnpm-workspace.yaml"],
    })

    expect(result).toEqual({
      complete: false,
      records: [
        {
          boundary: "build",
          targetArtifactId: "package.json",
          owner: "workspace:repository",
          detail: "workspace:root-manifest",
        },
        {
          boundary: "build",
          targetArtifactId: "pnpm-workspace.yaml",
          owner: "package.json",
          detail: "workspace:definition",
        },
      ],
      diagnostics: [
        {
          code: "workspace_pattern_unresolved",
          owner: "pnpm-workspace.yaml",
          reference: "missing/*",
        },
      ],
    })
  })
})
