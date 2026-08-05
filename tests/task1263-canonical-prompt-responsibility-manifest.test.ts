import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import {
  CANONICAL_PROMPT_RESPONSIBILITY_MANIFEST,
  CANONICAL_PROMPT_MODULE_IDS,
  validateCanonicalPromptResponsibilityManifest,
  type CanonicalPromptResponsibilityManifestEntry,
} from "../packages/core/src/contracts/canonical-prompt-responsibility-manifest.ts"

function copyManifest(): CanonicalPromptResponsibilityManifestEntry[] {
  return CANONICAL_PROMPT_RESPONSIBILITY_MANIFEST.map((entry) => ({
    ...entry,
    ownedResponsibilityIds: [...entry.ownedResponsibilityIds],
    outOfScopeResponsibilityIds: [...entry.outOfScopeResponsibilityIds],
    dependencyModuleIds: [...entry.dependencyModuleIds],
  }))
}

function issueCodes(entries: CanonicalPromptResponsibilityManifestEntry[]): string[] {
  const result = validateCanonicalPromptResponsibilityManifest(entries)
  return result.status === "blocked" ? result.issues.map((issue) => issue.code) : []
}

describe("task1263 canonical prompt responsibility manifest", () => {
  it("assigns every canonical module one unique responsibility and valid dependencies", () => {
    expect(validateCanonicalPromptResponsibilityManifest(copyManifest())).toEqual({
      status: "eligible",
      moduleIds: [...CANONICAL_PROMPT_MODULE_IDS],
      responsibilityIds: CANONICAL_PROMPT_RESPONSIBILITY_MANIFEST.map((entry) => entry.ownedResponsibilityIds[0]),
    })
  })

  it.each([
    ["missing module", (entries: CanonicalPromptResponsibilityManifestEntry[]) => entries.slice(1), "module_missing"],
    ["duplicate module", (entries: CanonicalPromptResponsibilityManifestEntry[]) => [...entries, entries[0]!], "module_duplicate"],
    ["empty purpose", (entries: CanonicalPromptResponsibilityManifestEntry[]) => entries.map((entry, index) => index === 0 ? { ...entry, purpose: "" } : entry), "purpose_missing"],
    ["multiple owned responsibilities", (entries: CanonicalPromptResponsibilityManifestEntry[]) => entries.map((entry, index) => index === 0 ? { ...entry, ownedResponsibilityIds: ["a", "b"] } : entry), "owned_responsibility_count_invalid"],
    ["empty out of scope", (entries: CanonicalPromptResponsibilityManifestEntry[]) => entries.map((entry, index) => index === 0 ? { ...entry, outOfScopeResponsibilityIds: [] } : entry), "out_of_scope_missing"],
    ["unknown dependency", (entries: CanonicalPromptResponsibilityManifestEntry[]) => entries.map((entry, index) => index === 1 ? { ...entry, dependencyModuleIds: ["unknown"] } : entry), "dependency_unknown"],
    ["self dependency", (entries: CanonicalPromptResponsibilityManifestEntry[]) => entries.map((entry, index) => index === 1 ? { ...entry, dependencyModuleIds: [entry.moduleId] } : entry), "dependency_self"],
  ] as const)("rejects %s", (_label, mutate, expectedCode) => {
    expect(issueCodes(mutate(copyManifest()))).toContain(expectedCode)
  })

  it("rejects one responsibility owned by two modules", () => {
    const entries = copyManifest()
    entries[1] = { ...entries[1]!, ownedResponsibilityIds: [...entries[0]!.ownedResponsibilityIds] }
    expect(issueCodes(entries)).toContain("responsibility_duplicate")
  })

  it("keeps the manifest validator independent from frameworks and external state", () => {
    const source = readFileSync(
      new URL("../packages/core/src/contracts/canonical-prompt-responsibility-manifest.ts", import.meta.url),
      "utf8",
    )
    expect(source).not.toMatch(/from ["'](?:node:|react|better-sqlite3|mqtt|openai|@anthropic-ai\/sdk)/)
    expect(source).not.toMatch(/process\.env|Date\.now|fetch\(|readFile|writeFile|globalThis/)
  })
})
