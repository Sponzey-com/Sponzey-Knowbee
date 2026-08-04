#!/usr/bin/env node
import fs from "node:fs"
import path from "node:path"
import process from "node:process"
import {
  collectIdentifierReferences,
  collectNamedObjectPropertyReferences,
  collectStringLiteralReferences,
} from "./lib/legacy-cutover-collector.mjs"
import { evaluateLegacyRemovalProof } from "./lib/legacy-removal-proof.mjs"
import { legacyCutoverInventoryDigest } from "./lib/legacy-cutover-inventory.mjs"

const [repositoryRoot, inventoryPath, outputPath, artifactConsistencyValue, rollbackPackageValue] = process.argv.slice(2)
if (!repositoryRoot || !inventoryPath || !outputPath || !["true", "false"].includes(artifactConsistencyValue) ||
  !["true", "false"].includes(rollbackPackageValue)) {
  console.error("Usage: collect-legacy-removal-proof.mjs <repository-root> <inventory> <output> <artifact-consistency:true|false> <rollback-package:true|false>")
  process.exit(2)
}

const root = path.resolve(repositoryRoot)
const inventory = JSON.parse(fs.readFileSync(path.resolve(inventoryPath), "utf8"))
const productionFiles = readSources(root, ["packages/webui/src"])
const testFiles = readSources(root, ["tests"])
const removable = inventory.decision.candidates.filter((candidate) => candidate.classification === "removable")
const apiDefinitionFiles = [
  "packages/webui/src/api/client.ts",
  "packages/webui/src/api/adapters/local.ts",
  "packages/webui/src/api/adapters/types.ts",
]

const units = removable.map((candidate) => {
  if (candidate.kind === "component") {
    const basename = path.posix.basename(candidate.source)
    const testEvidence = collectStringLiteralReferences(testFiles, basename)
    return {
      unitId: candidate.candidateId,
      candidateIds: [candidate.candidateId],
      canonicalReplacement: candidate.canonicalReplacement,
      activeReferences: candidate.activeReferences,
      testReferences: testEvidence.length,
      generatedReferences: 0,
      unknownReferences: 0,
      evidence: [...candidate.evidence, ...testEvidence],
    }
  }
  const method = candidate.candidateId.slice("api:".length)
  const definitionEvidence = apiDefinitionFiles.flatMap((sourcePath) =>
    collectNamedObjectPropertyReferences(
      productionFiles.filter((file) => file.path === sourcePath),
      sourcePath.endsWith("client.ts") ? "api" : "localControlPlaneAdapter",
      method,
    ))
  const fallbackDefinitions = definitionEvidence.length > 0
    ? definitionEvidence
    : collectIdentifierReferences(
        productionFiles.filter((file) => apiDefinitionFiles.includes(file.path)),
        method,
      )
  return {
    unitId: candidate.candidateId,
    candidateIds: [candidate.candidateId],
    canonicalReplacement: candidate.canonicalReplacement,
    activeReferences: candidate.activeReferences,
    testReferences: 0,
    generatedReferences: fallbackDefinitions.length,
    unknownReferences: 0,
    evidence: [...candidate.evidence, ...fallbackDefinitions],
  }
})

const operationSpecs = [
  ["skill:list", "/capabilities/skills", "packages/webui/src/pages/SkillCatalogPage.tsx", "skillCatalog", "skillCatalog", "projectUserRecovery"],
  ["skill:detail", "/capabilities/skills", "packages/webui/src/pages/SkillCatalogPage.tsx", "skillDetail", "skillDetail", "projectUserRecovery"],
  ["skill:verify", "/capabilities/skills", "packages/webui/src/pages/SkillCatalogPage.tsx", "validateSkillSource", "validateSkillSource", "projectUserRecovery"],
  ["skill:create", "/capabilities/skills", "packages/webui/src/pages/SkillCatalogPage.tsx", "createSkill", "skillCatalog", "projectUserRecovery"],
  ["skill:update", "/capabilities/skills", "packages/webui/src/pages/SkillCatalogPage.tsx", "updateSkill", "skillDetail", "projectUserRecovery"],
  ["skill:bind", "/capabilities/skills", "packages/webui/src/pages/SkillCatalogPage.tsx", "updateSkillBinding", "skillDetail", "projectUserRecovery"],
  ["skill:delete", "/capabilities/skills", "packages/webui/src/pages/SkillCatalogPage.tsx", "deleteSkill", "skillCatalog", "projectUserRecovery"],
  ["mcp:list", "/capabilities/mcp", "packages/webui/src/pages/McpCatalogPage.tsx", "mcpCatalog", "mcpCatalog", "projectUserRecovery"],
  ["mcp:detail", "/capabilities/mcp", "packages/webui/src/pages/McpCatalogPage.tsx", "mcpCatalogDetail", "mcpCatalogDetail", "projectUserRecovery"],
  ["mcp:verify", "/capabilities/mcp", "packages/webui/src/pages/McpCatalogPage.tsx", "probeMcpDraft", "probeMcpDraft", "projectUserRecovery"],
  ["mcp:create", "/capabilities/mcp", "packages/webui/src/pages/McpCatalogPage.tsx", "createMcp", "mcpCatalogDetail", "projectUserRecovery"],
  ["mcp:update", "/capabilities/mcp", "packages/webui/src/pages/McpCatalogPage.tsx", "updateMcp", "mcpCatalogDetail", "projectUserRecovery"],
  ["mcp:status", "/capabilities/mcp", "packages/webui/src/pages/McpCatalogPage.tsx", "updateMcpStatus", "mcpCatalog", "projectUserRecovery"],
  ["mcp:bind", "/capabilities/mcp", "packages/webui/src/pages/McpCatalogPage.tsx", "updateMcpBinding", "mcpCatalogDetail", "projectUserRecovery"],
  ["mcp:delete", "/capabilities/mcp", "packages/webui/src/pages/McpCatalogPage.tsx", "deleteMcp", "mcpCatalog", "projectUserRecovery"],
  ["mcp:recover", "/capabilities/mcp", "packages/webui/src/pages/McpCatalogPage.tsx", "recoverMcp", "mcpCatalogDetail", "projectUserRecovery"],
  ["agent:capability-bind", "/agents", "packages/webui/src/pages/AgentsPage.tsx", "updateAgentCapabilityBinding", "getAgentCapabilityBindings", "projectAgentFailure"],
]

const operations = operationSpecs.map(([operationId, canonicalRoute, source, execute, validate, recover]) => {
  const files = productionFiles.filter((file) => file.path === source)
  const executionEvidence = collectNamedObjectPropertyReferences(files, "api", execute)
  const validationEvidence = collectNamedObjectPropertyReferences(files, "api", validate)
  const recoveryEvidence = collectIdentifierReferences(files, recover)
  return {
    operationId,
    canonicalRoute,
    source,
    executionEvidence,
    validationEvidence,
    recoveryEvidence,
    evidenceComplete: executionEvidence.length > 0 && validationEvidence.length > 0 && recoveryEvidence.length > 0,
  }
})

const relevantCandidateIds = new Set(removable.map((candidate) => candidate.candidateId))
const compatibilityObligations = inventory.decision.candidates.filter((candidate) =>
  relevantCandidateIds.has(candidate.candidateId) && candidate.classification === "compatibility_only").length
const proof = {
  schemaVersion: "knowbee.legacy-removal-proof:v1",
  generatedAt: new Date().toISOString(),
  sourceInventoryDigest: legacyCutoverInventoryDigest(inventory),
  phase10Ready: inventory.phase10Ready === true,
  compatibilityObligations,
  units,
  operations,
  rollback: {
    inventorySnapshot: inventory.decision.inventoryReady === true,
    rollbackPackage: rollbackPackageValue === "true",
    deepLinkCompatibility: inventory.decision.counts.compatibility_only > 0,
    artifactConsistency: artifactConsistencyValue === "true",
  },
}
const decision = evaluateLegacyRemovalProof(proof)
fs.mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true })
fs.writeFileSync(path.resolve(outputPath), `${JSON.stringify({ ...proof, decision }, null, 2)}\n`, "utf8")
console.log(JSON.stringify({
  output: path.relative(root, path.resolve(outputPath)),
  unitCount: decision.unitCount,
  operationCount: decision.operationCount,
  evidenceReady: decision.evidenceReady,
  rollbackReady: decision.rollbackReady,
  mutationAuthorized: decision.mutationAuthorized,
  blockingReasons: decision.blockingReasons,
}))

function readSources(repositoryRoot, roots) {
  const result = []
  for (const relativeRoot of roots) walk(path.join(repositoryRoot, relativeRoot), relativeRoot, result)
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
