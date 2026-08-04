import { readFileSync, statSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { gzipSync } from "node:zlib"

import { buildWebUiBuildBaseline, evaluateWebUiBuildBudget } from "./lib/webui-build-baseline.mjs"

export const DEFAULT_WEBUI_ROUTE_BUILD_BINDINGS = Object.freeze([
  { route: "/work/runs", chunkName: "RunsPage" },
  { route: "/work/schedules", source: "src/pages/SchedulePage.tsx" },
  { route: "/agents", chunkName: "AgentsPage" },
  { route: "/capabilities/skills", source: "src/pages/SkillCatalogPage.tsx" },
  { route: "/capabilities/mcp", source: "src/pages/McpCatalogPage.tsx" },
  { route: "/capabilities/yeonjang", source: "src/pages/YeonjangCatalogPage.tsx" },
])

export function webUiBuildGateExitCode(baseline, budget) {
  return baseline.complete && budget.ok ? 0 : 1
}

export function collectWebUiBuildBaseline(input) {
  const manifestPath = join(input.distDirectory, ".vite", "manifest.json")
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"))
  const assetMetrics = {}
  for (const entry of Object.values(manifest)) {
    if (!entry || typeof entry.file !== "string" || assetMetrics[entry.file]) continue
    const assetPath = join(input.distDirectory, entry.file)
    const content = readFileSync(assetPath)
    assetMetrics[entry.file] = {
      bytes: statSync(assetPath).size,
      gzipBytes: gzipSync(content).byteLength,
    }
  }
  return buildWebUiBuildBaseline({
    mode: input.mode,
    manifest,
    assetMetrics,
    routeBindings: input.routeBindings,
  })
}

function parseArguments(argumentsList) {
  const options = { distDirectory: "", outputPath: "", mode: "production", details: false }
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index]
    if (argument === "--details") {
      options.details = true
      continue
    }
    if (argument !== "--dist" && argument !== "--output" && argument !== "--mode") {
      throw new Error(`unsupported_argument:${argument}`)
    }
    const value = argumentsList[index + 1]
    if (!value) throw new Error(`argument_value_missing:${argument}`)
    index += 1
    if (argument === "--dist") options.distDirectory = resolve(value)
    if (argument === "--output") options.outputPath = resolve(value)
    if (argument === "--mode") options.mode = value
  }
  if (!options.distDirectory) throw new Error("dist_directory_required")
  return options
}

export function runWebUiBuildBaselineCli(argumentsList) {
  const options = parseArguments(argumentsList)
  const baseline = collectWebUiBuildBaseline({
    distDirectory: options.distDirectory,
    mode: options.mode,
    routeBindings: DEFAULT_WEBUI_ROUTE_BUILD_BINDINGS,
  })
  const budget = evaluateWebUiBuildBudget(baseline)
  const report = { baseline, budget }
  if (options.outputPath) {
    writeFileSync(options.outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8")
  }
  const summary = {
    complete: baseline.complete,
    assetCount: baseline.assets.length,
    routeCount: baseline.routes.length,
    budgetOk: budget.ok,
    issueCount: baseline.diagnostics.length + budget.diagnostics.length,
  }
  process.stdout.write(`${JSON.stringify(options.details ? report : summary, null, 2)}\n`)
  return webUiBuildGateExitCode(baseline, budget)
}

const isMain = process.argv[1]
  ? resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))
  : false
if (isMain) process.exitCode = runWebUiBuildBaselineCli(process.argv.slice(2))
