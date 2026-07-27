import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"

import { scanPackageManifestReferences } from "../scripts/lib/repository-reference-scanner.mjs"

const roots: string[] = []
const fixture = (): string => {
  const root = mkdtempSync(join(tmpdir(), "knowbee-manifest-"))
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

describe("task1189 package manifest reference scanner", () => {
  it("records script files as build references and packaged files as deployment references", () => {
    const root = fixture()
    file(root, "scripts/build.mjs")
    file(root, "tests/smoke.test.ts")
    file(root, "packages/app/tsconfig.json", "{}\n")
    file(root, "packages/app/bin/knowbee.js")
    file(root, "package.json", JSON.stringify({
      scripts: { build: "node scripts/build.mjs", smoke: "vitest run tests/smoke.test.ts" },
    }))
    file(root, "packages/app/package.json", JSON.stringify({
      scripts: { build: "tsc -p tsconfig.json" },
      bin: { knowbee: "./bin/knowbee.js" },
      files: ["bin"],
      main: "./dist/index.js",
    }))
    const artifactIds = [
      "package.json",
      "scripts/build.mjs",
      "tests/smoke.test.ts",
      "packages/app/package.json",
      "packages/app/tsconfig.json",
      "packages/app/bin/knowbee.js",
    ]

    const result = scanPackageManifestReferences({ repositoryRoot: root, artifactIds })

    expect(result.complete).toBe(true)
    expect(result.diagnostics).toEqual([])
    expect(result.records).toEqual([
      {
        boundary: "build",
        targetArtifactId: "packages/app/tsconfig.json",
        owner: "packages/app/package.json",
        detail: "script:build",
      },
      {
        boundary: "build",
        targetArtifactId: "scripts/build.mjs",
        owner: "package.json",
        detail: "script:build",
      },
      {
        boundary: "build",
        targetArtifactId: "tests/smoke.test.ts",
        owner: "package.json",
        detail: "script:smoke",
      },
      {
        boundary: "deployment",
        targetArtifactId: "packages/app/bin/knowbee.js",
        owner: "packages/app/package.json",
        detail: "bin:knowbee",
      },
      {
        boundary: "deployment",
        targetArtifactId: "packages/app/bin/knowbee.js",
        owner: "packages/app/package.json",
        detail: "files:bin",
      },
    ])
  })

  it("fails closed for malformed JSON and unresolved internal script paths", () => {
    const root = fixture()
    file(root, "package.json", "{not-json")
    file(root, "packages/app/package.json", JSON.stringify({
      scripts: { release: "node scripts/missing.mjs" },
    }))

    const result = scanPackageManifestReferences({
      repositoryRoot: root,
      artifactIds: ["package.json", "packages/app/package.json"],
    })

    expect(result.complete).toBe(false)
    expect(result.records).toEqual([])
    expect(result.diagnostics).toEqual([
      { code: "manifest_unreadable", owner: "package.json", reference: "" },
      {
        code: "manifest_reference_unresolved",
        owner: "packages/app/package.json",
        reference: "scripts/missing.mjs",
      },
    ])
  })

  it("maps dist entrypoints to source and records the Vite HTML entrypoint", () => {
    const root = fixture()
    file(root, "packages/core/src/index.ts")
    file(root, "packages/core/package.json", JSON.stringify({
      main: "./dist/index.js",
      types: "./dist/index.d.ts",
    }))
    file(root, "packages/webui/index.html")
    file(root, "packages/webui/package.json", JSON.stringify({
      scripts: { build: "vite build" },
    }))

    const result = scanPackageManifestReferences({
      repositoryRoot: root,
      artifactIds: [
        "packages/core/src/index.ts",
        "packages/core/package.json",
        "packages/webui/index.html",
        "packages/webui/package.json",
      ],
    })

    expect(result).toEqual({
      complete: true,
      diagnostics: [],
      records: [
        {
          boundary: "build",
          targetArtifactId: "packages/webui/index.html",
          owner: "packages/webui/package.json",
          detail: "tool:vite-entry",
        },
        {
          boundary: "deployment",
          targetArtifactId: "packages/core/src/index.ts",
          owner: "packages/core/package.json",
          detail: "entrypoint:main",
        },
        {
          boundary: "deployment",
          targetArtifactId: "packages/core/src/index.ts",
          owner: "packages/core/package.json",
          detail: "entrypoint:types",
        },
      ],
    })
  })

  it("records test files discovered by a broad Vitest script", () => {
    const root = fixture()
    file(root, "tests/a.test.ts")
    file(root, "tests/b.test.tsx")
    file(root, "package.json", JSON.stringify({ scripts: { test: "vitest run" } }))

    const result = scanPackageManifestReferences({
      repositoryRoot: root,
      artifactIds: ["package.json", "tests/a.test.ts", "tests/b.test.tsx"],
    })

    expect(result.records).toEqual([
      {
        boundary: "build",
        targetArtifactId: "tests/a.test.ts",
        owner: "package.json",
        detail: "test-suite:test",
      },
      {
        boundary: "build",
        targetArtifactId: "tests/b.test.tsx",
        owner: "package.json",
        detail: "test-suite:test",
      },
    ])
  })

  it("does not treat generated command output targets as input references", () => {
    const root = fixture()
    file(root, "scripts/audit.mjs")
    file(root, "package.json", JSON.stringify({
      scripts: {
        audit: "node scripts/audit.mjs . --output .tasks/report.json",
        redirected: "node scripts/audit.mjs > reports/audit.json",
      },
    }))

    const result = scanPackageManifestReferences({
      repositoryRoot: root,
      artifactIds: ["package.json", "scripts/audit.mjs"],
    })

    expect(result.complete).toBe(true)
    expect(result.diagnostics).toEqual([])
    expect(result.records).toEqual([
      {
        boundary: "build",
        targetArtifactId: "scripts/audit.mjs",
        owner: "package.json",
        detail: "script:audit",
      },
      {
        boundary: "build",
        targetArtifactId: "scripts/audit.mjs",
        owner: "package.json",
        detail: "script:redirected",
      },
    ])
  })
})
