import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { readFileSync, statSync } from "node:fs"
import { pathToFileURL } from "node:url"
import { describe, expect, it } from "vitest"

interface StartupBundleManifest {
  schemaVersion: 2
  entryPoint: string
  entryPointSha256: string
  artifact: string
  sourceMap: string
  metafile: string
  repositoryOwnedJavaScriptFiles: string[]
  repositoryOwnedJavaScriptFileCount: number
  bundleBytes: number
  bundleSha256: string
  bundledInputsSha256: string
  externalPackages: string[]
  bundledInputs: string[]
  preservedImportMetaUrlInputs: string[]
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T
}

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex")
}

function sha256FileSet(paths: readonly string[]): string {
  const hash = createHash("sha256")
  for (const path of [...paths].sort()) {
    hash.update(path)
    hash.update("\0")
    hash.update(readFileSync(path))
    hash.update("\0")
  }
  return hash.digest("hex")
}

function buildStartupBundle(): StartupBundleManifest {
  execFileSync("node", ["scripts/self/build-gateway-startup-bundle.mjs"], {
    cwd: process.cwd(),
    stdio: "pipe",
  })
  return readJson<StartupBundleManifest>(
    "packages/core/dist/runtime/serve-bundle.manifest.json",
  )
}

describe("Gateway startup bundle", () => {
  it("keeps source and bundle entries import-safe with the same public exports", () => {
    const source = readFileSync("packages/cli/src/serve-entry.ts", "utf8")
    expect(source).toContain("export async function runServeEntry")
    expect(source).toContain("isDirectServeEntry")

    const inspectExports = (path: string): string[] => {
      const script = [
        `const module = await import(${JSON.stringify(pathToFileURL(path).href)})`,
        "console.log(JSON.stringify(Object.keys(module).sort()))",
      ].join(";")
      return JSON.parse(
        execFileSync("node", ["--input-type=module", "--eval", script], {
          cwd: process.cwd(),
          encoding: "utf8",
        }).trim(),
      ) as string[]
    }

    const manifest = buildStartupBundle()
    const sourceExports = inspectExports("packages/cli/dist/serve-entry.js")
    const bundleExports = inspectExports(manifest.artifact)
    expect(sourceExports).toEqual(["runServeEntry", "serveCommand"])
    expect(bundleExports).toEqual(sourceExports)
  })

  it("uses a directly pinned bundler and emits deterministic artifacts", () => {
    const pkg = readJson<{
      devDependencies?: Record<string, string>
      scripts?: Record<string, string>
    }>("package.json")
    expect(pkg.devDependencies?.esbuild).toMatch(/^\d+\.\d+\.\d+$/)
    expect(pkg.scripts?.["gateway:bundle"]).toBe(
      "node scripts/self/build-gateway-startup-bundle.mjs",
    )

    const first = buildStartupBundle()
    const firstBundleHash = sha256(first.artifact)
    const second = buildStartupBundle()

    expect(second).toEqual(first)
    expect(sha256(second.artifact)).toBe(firstBundleHash)
    expect(second.bundleSha256).toBe(firstBundleHash)
  })

  it("meets the repository-owned file and bundle size budgets", () => {
    const manifest = buildStartupBundle()

    expect(manifest.schemaVersion).toBe(2)
    expect(manifest.entryPoint).toBe("packages/cli/dist/serve-entry.js")
    expect(manifest.entryPointSha256).toBe(sha256(manifest.entryPoint))
    expect(manifest.bundledInputsSha256).toBe(
      sha256FileSet(manifest.bundledInputs),
    )
    expect(manifest.repositoryOwnedJavaScriptFileCount).toBe(
      manifest.repositoryOwnedJavaScriptFiles.length,
    )
    expect(manifest.repositoryOwnedJavaScriptFileCount).toBeLessThanOrEqual(10)
    expect(manifest.repositoryOwnedJavaScriptFiles).toEqual([manifest.artifact])
    expect(manifest.bundleBytes).toBe(statSync(manifest.artifact).size)
    expect(manifest.bundleBytes).toBeLessThanOrEqual(12 * 1024 * 1024)
  })

  it("keeps native packages external and writes only repository-relative paths", () => {
    const manifest = buildStartupBundle()
    const serialized = JSON.stringify(manifest)
    const metafile = readFileSync(manifest.metafile, "utf8")

    expect(manifest.externalPackages).toContain("better-sqlite3")
    expect(manifest.bundledInputs).toContain(
      "packages/core/dist/runtime/bootstrap.js",
    )
    expect(serialized).not.toContain(process.cwd())
    expect(metafile).not.toContain(process.cwd())
    expect(serialized).not.toMatch(/\/Users\/|\/private\/|[A-Za-z]:\\\\/)
  })

  it("preserves module-relative asset URLs and runtime-discovered plugin imports", () => {
    const manifest = buildStartupBundle()
    const bundle = readFileSync(manifest.artifact, "utf8")

    expect(manifest.preservedImportMetaUrlInputs).toEqual([
      "packages/core/dist/api/server.js",
      "packages/core/dist/memory/knowbee-md.js",
      "packages/core/dist/scheduler/system-cron.js",
      "packages/core/dist/update/service.js",
      "packages/core/dist/version.js",
    ])
    expect(bundle).toContain("await import(entryPath)")
    expect(bundle).toContain("../../../webui/dist")
    expect(bundle).toContain("../api/server.js")
    expect(bundle).not.toContain(process.cwd())
  })
})
