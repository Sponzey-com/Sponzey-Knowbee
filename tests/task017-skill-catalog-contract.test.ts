import { performance } from "node:perf_hooks"
import { describe, expect, it } from "vitest"
import {
  adaptSetupSkillDraft,
  filterSkillCatalog,
  projectSkillCatalogItem,
  validateSkillSource,
} from "../packages/webui/src/lib/skill-catalog-contract.js"

describe("task017 skill catalog and source contract", () => {
  it("removes raw instructions, paths, checksum, and internal ids from user projection", () => {
    const projected = projectSkillCatalogItem({ skillRef: `skill_v1_${"a".repeat(24)}`, internalId: "i1", displayName: "UI UX Pro Max", description: "UI review", sourceKind: "local", validationStatus: "valid", runtimeStatus: "active", bindingCount: 2, revision: 4, absolutePath: "/private/skill", rawSkillMarkdown: "secret instructions", checksum: "abc" })
    expect(projected).toEqual({ skillRef: `skill_v1_${"a".repeat(24)}`, displayName: "UI UX Pro Max", description: "UI review", sourceKind: "local", validationStatus: "valid", runtimeStatus: "active", bindingCount: 2, revision: 4 })
  })

  it("filters a 500-item catalog by search, source, status, and binding within budget", () => {
    const items = Array.from({ length: 500 }, (_, index) => ({ skillRef: `skill_v1_${index.toString(16).padStart(24, "0")}`, displayName: `Skill ${index}`, description: index === 321 ? "interface accessibility" : "general", sourceKind: index % 2 ? "local" as const : "builtin" as const, validationStatus: "valid" as const, runtimeStatus: index === 321 ? "active" as const : "inactive" as const, bindingCount: index === 321 ? 2 : 0, revision: 1 }))
    const started = performance.now()
    const result = filterSkillCatalog(items, { search: "accessibility", sourceKind: "local", runtimeStatus: "active", boundOnly: true })
    expect(performance.now() - started).toBeLessThan(100)
    expect(result.map((item) => item.displayName)).toEqual(["Skill 321"])
  })

  it("rejects duplicate names, traversal, and incomplete filesystem evidence", () => {
    expect(validateSkillSource({ sourceKind: "local", displayName: "Known", requestedPath: "../escape", canonicalPath: "/allowed/escape", allowedRoot: "/allowed", existingNames: ["known"], evidence: { symlinkSafe: false, owned: true, manifestTrusted: false } }).reasonCodes).toEqual([
      "skill_name_duplicated", "skill_path_traversal", "skill_symlink_unverified", "skill_manifest_untrusted",
    ])
    expect(validateSkillSource({ sourceKind: "local", displayName: "Safe", requestedPath: "safe", canonicalPath: "/outside/safe", allowedRoot: "/allowed", existingNames: [], evidence: { symlinkSafe: true, owned: true, manifestTrusted: true } }).reasonCodes).toEqual(["skill_path_outside_root"])
  })

  it("adapts legacy drafts to one command owner without exposing legacy identity", () => {
    expect(adaptSetupSkillDraft({ id: "legacy-secret", label: "UI UX", description: "Review", source: "local", path: "skills/ui", enabled: true, required: false, status: "disabled" })).toEqual({
      commandOwner: "capability.command", command: "skill.validate", draft: { displayName: "UI UX", description: "Review", sourceKind: "local", requestedPath: "skills/ui", requestedEnabled: true }, canPersist: false,
    })
  })
})
