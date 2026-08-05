import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"

import {
  WEBUI_BUILD_BUDGET,
  buildWebUiBuildBaseline,
  evaluateWebUiBuildBudget,
} from "../scripts/self/lib/webui-build-baseline.mjs"
import { collectWebUiBuildBaseline } from "../scripts/self/collect-webui-build-baseline.mjs"

const temporaryDirectories: string[] = []

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    const directory = temporaryDirectories.pop()
    if (directory) rmSync(directory, { recursive: true, force: true })
  }
})

function manifestFixture() {
  return {
    "index.html": {
      file: "assets/index.js",
      name: "index",
      src: "index.html",
      isEntry: true,
      dynamicImports: ["src/pages/RunsPage.tsx"],
    },
    "src/pages/RunsPage.tsx": {
      file: "assets/RunsPage.js",
      name: "RunsPage",
      src: "src/pages/RunsPage.tsx",
      isDynamicEntry: true,
      imports: ["index.html"],
    },
  }
}

describe("task002 reproducible WebUI build baseline", () => {
  it("builds a stable asset graph and route attribution without machine paths", () => {
    const result = buildWebUiBuildBaseline({
      mode: "production",
      manifest: manifestFixture(),
      assetMetrics: {
        "assets/index.js": { bytes: 500_000, gzipBytes: 170_000 },
        "assets/RunsPage.js": { bytes: 250_000, gzipBytes: 90_000 },
      },
      routeBindings: [{ route: "/work/runs", source: "src/pages/RunsPage.tsx" }],
    })

    expect(result).toEqual({
      schemaVersion: "knowbee.webui.build-baseline:v1",
      mode: "production",
      complete: true,
      diagnostics: [],
      entry: "assets/index.js",
      assets: [
        {
          file: "assets/RunsPage.js",
          source: "src/pages/RunsPage.tsx",
          bytes: 250_000,
          gzipBytes: 90_000,
          imports: ["assets/index.js"],
          dynamicImports: [],
        },
        {
          file: "assets/index.js",
          source: "index.html",
          bytes: 500_000,
          gzipBytes: 170_000,
          imports: [],
          dynamicImports: ["assets/RunsPage.js"],
        },
      ],
      routes: [
        {
          route: "/work/runs",
          source: "src/pages/RunsPage.tsx",
          file: "assets/RunsPage.js",
          directGzipBytes: 90_000,
          importedGzipBytes: 170_000,
        },
      ],
    })
    expect(JSON.stringify(result)).not.toContain(tmpdir())
  })

  it("fails closed for a missing manifest entry, dangling asset, and unknown route source", () => {
    const result = buildWebUiBuildBaseline({
      mode: "production",
      manifest: {
        "index.html": {
          file: "assets/missing.js",
          src: "index.html",
          isEntry: true,
          dynamicImports: ["src/pages/MissingPage.tsx"],
        },
      },
      assetMetrics: {},
      routeBindings: [{ route: "/missing", source: "src/pages/MissingPage.tsx" }],
    })

    expect(result.complete).toBe(false)
    expect(result.diagnostics).toEqual([
      { reasonCode: "asset_metric_missing", reference: "assets/missing.js" },
      { reasonCode: "manifest_import_missing", reference: "src/pages/MissingPage.tsx" },
      { reasonCode: "route_source_missing", reference: "src/pages/MissingPage.tsx", route: "/missing" },
    ])
  })

  it("uses the fixed gzip ceilings and reports exact boundary behavior", () => {
    const accepted = buildWebUiBuildBaseline({
      mode: "production",
      manifest: manifestFixture(),
      assetMetrics: {
        "assets/index.js": { bytes: 900_000, gzipBytes: WEBUI_BUILD_BUDGET.initialSharedGzipBytes },
        "assets/RunsPage.js": { bytes: 600_000, gzipBytes: WEBUI_BUILD_BUDGET.routeGzipBytes },
      },
      routeBindings: [{ route: "/work/runs", source: "src/pages/RunsPage.tsx" }],
    })
    expect(evaluateWebUiBuildBudget(accepted)).toEqual({ ok: true, diagnostics: [] })

    const rejected = structuredClone(accepted)
    rejected.assets[1]!.gzipBytes += 1
    rejected.routes[0]!.directGzipBytes += 1
    expect(evaluateWebUiBuildBudget(rejected)).toEqual({
      ok: false,
      diagnostics: [
        {
          actualBytes: WEBUI_BUILD_BUDGET.initialSharedGzipBytes + 1,
          ceilingBytes: WEBUI_BUILD_BUDGET.initialSharedGzipBytes,
          file: "assets/index.js",
          reasonCode: "initial_gzip_budget_exceeded",
        },
        {
          actualBytes: WEBUI_BUILD_BUDGET.routeGzipBytes + 1,
          ceilingBytes: WEBUI_BUILD_BUDGET.routeGzipBytes,
          reasonCode: "route_gzip_budget_exceeded",
          route: "/work/runs",
        },
      ],
    })
  })

  it("collects manifest assets through the filesystem adapter", () => {
    const distDirectory = mkdtempSync(join(tmpdir(), "knowbee-ui-build-"))
    temporaryDirectories.push(distDirectory)
    mkdirSync(join(distDirectory, ".vite"), { recursive: true })
    mkdirSync(join(distDirectory, "assets"), { recursive: true })
    writeFileSync(join(distDirectory, ".vite", "manifest.json"), JSON.stringify(manifestFixture()))
    writeFileSync(join(distDirectory, "assets", "index.js"), "const value = 'entry';\n".repeat(100))
    writeFileSync(join(distDirectory, "assets", "RunsPage.js"), "export default 'runs';\n".repeat(50))

    const result = collectWebUiBuildBaseline({
      distDirectory,
      mode: "production",
      routeBindings: [{ route: "/work/runs", source: "src/pages/RunsPage.tsx" }],
    })

    expect(result.complete).toBe(true)
    expect(result.assets.every((asset) => asset.bytes > 0 && asset.gzipBytes > 0)).toBe(true)
  })
})
