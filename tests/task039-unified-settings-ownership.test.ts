import { existsSync, readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { getUiRouteInventory } from "../packages/webui/src/lib/route-migration.ts"
import {
  UNIFIED_SETTINGS_ROUTE_OWNERSHIP,
  UNIFIED_SETTINGS_SECTIONS,
  type UnifiedSettingsRouteOwnership,
  canTransitionCompatibilityLifecycle,
  validateUnifiedSettingsOwnership,
} from "../packages/webui/src/lib/unified-settings-ownership.ts"

describe("task039 unified settings ownership manifest", () => {
  it("assigns each section to one authoritative user route without exposing internal contracts", () => {
    const active = UNIFIED_SETTINGS_ROUTE_OWNERSHIP.filter(
      (item) => item.classification === "active_owner",
    )
    const ownerBySection = new Map<string, string[]>()
    for (const item of active) {
      for (const sectionId of item.sectionIds) {
        ownerBySection.set(sectionId, [
          ...(ownerBySection.get(sectionId) ?? []),
          item.path ?? item.sourceFile,
        ])
      }
    }

    expect(active.map((item) => item.path)).toEqual(["/settings", "/agents", "/work/schedules"])
    expect(UNIFIED_SETTINGS_SECTIONS.map((section) => section.id)).toEqual([
      "basics",
      "ai",
      "connections",
      "sub_agents",
      "automation",
      "memory",
      "permissions",
      "diagnostics",
    ])
    expect([...ownerBySection.values()].every((owners) => owners.length === 1)).toBe(true)
    expect(
      UNIFIED_SETTINGS_SECTIONS.find((section) => section.id === "sub_agents")
        ?.agentInspectorSections,
    ).toEqual([
      "identity_role",
      "model",
      "skill_mcp",
      "memory",
      "permissions",
      "delegation",
      "monitoring",
    ])
    expect(UNIFIED_SETTINGS_SECTIONS.every((section) => section.exposesRawContract === false)).toBe(
      true,
    )
  })

  it("distinguishes active compatibility surfaces from removable dead candidates", () => {
    const advancedAi = UNIFIED_SETTINGS_ROUTE_OWNERSHIP.find((item) => item.path === "/advanced/ai")
    const legacyEnterprise = UNIFIED_SETTINGS_ROUTE_OWNERSHIP.find(
      (item) => item.sourceFile === "packages/webui/src/pages/EnterpriseTopologyPage.tsx",
    )

    expect(advancedAi).toEqual(
      expect.objectContaining({
        classification: "compatibility_redirect",
        lifecycle: "redirect_only",
        replacementPath: "/settings",
        component: "UnifiedRouteRedirect",
      }),
    )
    expect(advancedAi?.evidence.productionImports.length).toBeGreaterThan(0)
    expect(legacyEnterprise).toEqual(
      expect.objectContaining({
        classification: "dead_candidate",
        lifecycle: "removable",
        path: null,
      }),
    )
    expect(legacyEnterprise?.evidence.productionImports).toEqual([])
    expect(legacyEnterprise?.evidence.testReferences.length).toBeGreaterThan(0)
  })

  it("rejects duplicate owners, missing replacements, unsafe dead candidates, and missing sources", () => {
    const firstOwner = UNIFIED_SETTINGS_ROUTE_OWNERSHIP[0]
    const advancedAiOwner = UNIFIED_SETTINGS_ROUTE_OWNERSHIP.find(
      (item) => item.path === "/advanced/ai",
    )
    const deadOwner = UNIFIED_SETTINGS_ROUTE_OWNERSHIP.find(
      (item) => item.classification === "dead_candidate",
    )
    expect(firstOwner).toBeDefined()
    expect(advancedAiOwner).toBeDefined()
    expect(deadOwner).toBeDefined()
    if (!firstOwner || !advancedAiOwner || !deadOwner) {
      throw new Error("unified_settings_test_fixture_missing")
    }
    const duplicate: UnifiedSettingsRouteOwnership = {
      ...firstOwner,
      path: "/duplicate",
    }
    const missingReplacement: UnifiedSettingsRouteOwnership = {
      ...advancedAiOwner,
      replacementPath: null,
    }
    const unsafeDead: UnifiedSettingsRouteOwnership = {
      ...deadOwner,
      evidence: {
        productionImports: ["packages/webui/src/App.tsx"],
        testReferences: [],
      },
    }

    const result = validateUnifiedSettingsOwnership({
      sections: UNIFIED_SETTINGS_SECTIONS,
      routes: [...UNIFIED_SETTINGS_ROUTE_OWNERSHIP, duplicate, missingReplacement, unsafeDead],
      sourceExists: (path) => path !== duplicate.sourceFile,
    })

    expect(result.ok).toBe(false)
    expect(result.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "duplicate_active_owner",
        "compatibility_replacement_missing",
        "dead_candidate_has_production_import",
        "source_missing",
      ]),
    )
  })

  it("validates the repository manifest and explicit compatibility state transitions", () => {
    const result = validateUnifiedSettingsOwnership({
      sections: UNIFIED_SETTINGS_SECTIONS,
      routes: UNIFIED_SETTINGS_ROUTE_OWNERSHIP,
      sourceExists: existsSync,
    })

    expect(result).toEqual({ ok: true, issues: [] })
    expect(canTransitionCompatibilityLifecycle("active", "deprecated")).toBe(true)
    expect(canTransitionCompatibilityLifecycle("deprecated", "redirect_only")).toBe(true)
    expect(canTransitionCompatibilityLifecycle("redirect_only", "removable")).toBe(true)
    expect(canTransitionCompatibilityLifecycle("active", "removable")).toBe(false)
    expect(canTransitionCompatibilityLifecycle("removable", "active")).toBe(false)
  })

  it("requires every settings and sub-agent compatibility route to have an ownership record", () => {
    const ownedPaths = new Set(
      UNIFIED_SETTINGS_ROUTE_OWNERSHIP.map((item) => item.path).filter(Boolean),
    )
    const settingsPath =
      /^\/(?:advanced\/)?(?:settings|ai|channels|extensions|memory|tools|release|topology|enterprise-topology|orchestration)(?:\/|$)/
    const auditedRoutes = getUiRouteInventory().filter(
      (item) => item.component === "SettingsPage" || settingsPath.test(item.path),
    )

    expect(auditedRoutes.length).toBeGreaterThan(0)
    expect(auditedRoutes.filter((item) => !ownedPaths.has(item.path))).toEqual([])
  })

  it("keeps the ownership contract free of hidden IO, environment, and product mode choices", () => {
    const source = readFileSync("packages/webui/src/lib/unified-settings-ownership.ts", "utf8")

    expect(source).not.toMatch(
      /process\.env|localStorage|sessionStorage|fetch\(|readFile|writeFile/,
    )
    expect(source).not.toMatch(/label(?:Ko|En)\s*:\s*["'][^"']*(?:초보|고급|Beginner|Advanced)/)
    expect(source).not.toContain('mode: "beginner"')
    expect(source).not.toContain('mode: "advanced"')
  })
})
