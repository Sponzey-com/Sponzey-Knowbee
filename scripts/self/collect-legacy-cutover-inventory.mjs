#!/usr/bin/env node
import fs from "node:fs"
import path from "node:path"
import process from "node:process"
import {
  collectJsxRoutePaths,
  collectModuleReferences,
  collectNamedObjectPropertyReferences,
  collectPropertyReferences,
  collectStaticObjectArray,
} from "./lib/legacy-cutover-collector.mjs"
import { evaluateLegacyCutoverInventory } from "./lib/legacy-cutover-inventory.mjs"

const [repositoryRoot, phase10ReportPath, outputPath] = process.argv.slice(2)
if (!repositoryRoot || !phase10ReportPath || !outputPath) {
  console.error("Usage: collect-legacy-cutover-inventory.mjs <repository-root> <phase10-report> <output>")
  process.exit(2)
}

const root = path.resolve(repositoryRoot)
const webuiRoot = "packages/webui/src"
const files = readSources(root, [webuiRoot, "packages/core/src"])
const webuiFiles = files.filter((file) => file.path.startsWith(`${webuiRoot}/`))
const appPath = `${webuiRoot}/App.tsx`
const migrationPath = `${webuiRoot}/lib/route-migration.ts`
const appText = readRelative(root, appPath)
const migrationText = readRelative(root, migrationPath)
const mountedRoutes = collectJsxRoutePaths(appPath, appText)
const routeInventory = collectStaticObjectArray(migrationPath, migrationText, "UI_ROUTE_INVENTORY")
const phase10 = JSON.parse(fs.readFileSync(path.resolve(phase10ReportPath), "utf8"))

const legacyComponents = [
  ["setup/SkillSetupForm", `${webuiRoot}/components/setup/SkillSetupForm.tsx`, "/capabilities/skills"],
  ["setup/McpSetupForm", `${webuiRoot}/components/setup/McpSetupForm.tsx`, "/capabilities/mcp"],
  ["setup/MqttRuntimePanel", `${webuiRoot}/components/setup/MqttRuntimePanel.tsx`, "/capabilities/yeonjang"],
  ["setup/SubAgentAdvancedSettingsPanel", `${webuiRoot}/components/setup/SubAgentAdvancedSettingsPanel.tsx`, "/agents"],
  ["McpServersPanel", `${webuiRoot}/components/McpServersPanel.tsx`, "/capabilities/mcp"],
]
const legacyPaths = legacyComponents.map(([, source]) => source)

const candidates = routeInventory
  .filter((route) => ["redirect", "compatibility", "deprecated"].includes(route.status))
  .map((route) => {
    const mounted = mountedRoutes.filter((mountedPath) => routeMatches(mountedPath, route.path))
    return {
      candidateId: `route:${route.path}`,
      kind: "route",
      source: migrationPath,
      canonicalReplacement: route.replacementPath || "canonical-route-contract",
      activeReferences: 0,
      compatibilityReferences: mounted.length,
      migrationReferences: 0,
      evidenceComplete: true,
      externalCompatibility: "verified_required",
      evidence: mounted.map((mountedPath) => ({ path: appPath, route: mountedPath })),
    }
  })

for (const [name, source, replacement] of legacyComponents) {
  const references = collectModuleReferences(webuiFiles, source).filter((reference) => reference.path !== source)
  candidates.push({
    candidateId: `component:${name}`,
    kind: "component",
    source,
    canonicalReplacement: replacement,
    activeReferences: references.length,
    compatibilityReferences: 0,
    migrationReferences: 0,
    evidenceComplete: true,
    externalCompatibility: "verified_absent",
    evidence: references,
  })
}

for (const [method, replacement] of [
  ["testMcpServer", "/capabilities/mcp"],
  ["testSkillPath", "/capabilities/skills"],
  ["mcpServers", "/capabilities/mcp"],
  ["reloadMcpServers", "/capabilities/mcp"],
]) {
  const references = collectNamedObjectPropertyReferences(webuiFiles, "api", method, [
    `${webuiRoot}/api/client.ts`,
    `${webuiRoot}/api/adapters/local.ts`,
    `${webuiRoot}/api/adapters/types.ts`,
    ...legacyPaths,
  ])
  const compatibility = collectNamedObjectPropertyReferences(
    webuiFiles.filter((file) => legacyPaths.includes(file.path)),
    "api",
    method,
  )
  candidates.push({
    candidateId: `api:${method}`,
    kind: "api",
    source: `${webuiRoot}/api/client.ts`,
    canonicalReplacement: replacement,
    activeReferences: references.length,
    compatibilityReferences: compatibility.length,
    migrationReferences: 0,
    evidenceComplete: true,
    externalCompatibility: "verified_absent",
    evidence: [...references, ...compatibility],
  })
}

for (const [field, replacement] of [
  ["skills", "/capabilities/skills"],
  ["mcp", "/capabilities/mcp"],
  ["subAgents", "/agents"],
]) {
  const references = collectPropertyReferences(files, field, legacyPaths)
  const migration = references.filter((reference) => reference.path.startsWith("packages/core/src/control-plane/"))
  const active = references.filter((reference) => !migration.includes(reference))
  candidates.push({
    candidateId: `persisted_field:${field}`,
    kind: "persisted_field",
    source: "packages/core/src/control-plane/index.ts",
    canonicalReplacement: replacement,
    activeReferences: active.length,
    compatibilityReferences: 0,
    migrationReferences: migration.length,
    evidenceComplete: true,
    externalCompatibility: "verified_absent",
    evidence: references,
  })
}

const inventory = {
  schemaVersion: "knowbee.legacy-cutover-inventory:v1",
  generatedAt: new Date().toISOString(),
  phase10Ready: phase10.phase10Ready === true,
  repositoryPathPolicy: "relative_only",
  candidates,
}
const decision = evaluateLegacyCutoverInventory(inventory)
const report = { ...inventory, decision }
fs.mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true })
fs.writeFileSync(path.resolve(outputPath), `${JSON.stringify(report, null, 2)}\n`, "utf8")
console.log(JSON.stringify({
  output: path.relative(root, path.resolve(outputPath)),
  inventoryReady: decision.inventoryReady,
  deletionAuthorized: decision.deletionAuthorized,
  counts: decision.counts,
}))

function readSources(repositoryRoot, relativeRoots) {
  const result = []
  for (const relativeRoot of relativeRoots) walk(path.join(repositoryRoot, relativeRoot), relativeRoot, result)
  return result
}

function walk(absoluteDirectory, relativeDirectory, result) {
  for (const entry of fs.readdirSync(absoluteDirectory, { withFileTypes: true })) {
    const absolute = path.join(absoluteDirectory, entry.name)
    const relative = path.posix.join(relativeDirectory, entry.name)
    if (entry.isDirectory()) walk(absolute, relative, result)
    else if (/\.tsx?$/u.test(entry.name)) result.push({ path: relative, text: fs.readFileSync(absolute, "utf8") })
  }
}

function readRelative(repositoryRoot, relativePath) {
  return fs.readFileSync(path.join(repositoryRoot, relativePath), "utf8")
}

function routeMatches(mountedPath, inventoryPath) {
  const mountedBase = mountedPath.replace(/\/\*$/u, "")
  return mountedBase === inventoryPath || mountedPath === inventoryPath
}
