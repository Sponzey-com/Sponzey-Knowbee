import { describe, expect, it } from "vitest"
import {
  classifyLegacyCandidate,
  evaluateLegacyCutoverInventory,
} from "../scripts/self/lib/legacy-cutover-inventory.mjs"
import {
  collectJsxRoutePaths,
  collectModuleReferences,
  collectNamedObjectPropertyReferences,
  collectPropertyReferences,
  collectStaticObjectArray,
} from "../scripts/self/lib/legacy-cutover-collector.mjs"

const base = {
  candidateId: "component:LegacyPanel",
  kind: "component",
  source: "packages/webui/src/components/LegacyPanel.tsx",
  canonicalReplacement: "capabilities.workspace",
  activeReferences: 0,
  compatibilityReferences: 0,
  migrationReferences: 0,
  evidenceComplete: true,
  externalCompatibility: "verified_absent",
  evidence: [],
} as const

describe("Task061 legacy cutover inventory", () => {
  it("collects static routes and migration objects through the TypeScript AST", () => {
    expect(collectJsxRoutePaths("App.tsx", `
      <Routes><Route path="/legacy/*" element={<Legacy />} /><Route path={dynamic} /></Routes>
    `)).toEqual(["/legacy/*"])
    expect(collectStaticObjectArray("routes.ts", `
      const UI_ROUTE_INVENTORY: Item[] = [{ path: "/legacy", status: "redirect", replacementPath: "/work" }]
    `, "UI_ROUTE_INVENTORY")).toEqual([
      { path: "/legacy", status: "redirect", replacementPath: "/work" },
    ])
  })

  it("collects import and property references without matching comments or string contents", () => {
    const files = [
      {
        path: "src/Owner.tsx",
        text: `import { Legacy } from "./Legacy"; api.reloadMcpServers(); // api.testSkillPath`,
      },
      { path: "src/Legacy.tsx", text: `export const Legacy = () => null; const note = "reloadMcpServers"` },
    ]
    expect(collectModuleReferences(files, "src/Legacy.tsx")).toEqual([{ path: "src/Owner.tsx", line: 1 }])
    expect(collectPropertyReferences(files, "reloadMcpServers")).toEqual([{ path: "src/Owner.tsx", line: 1 }])
    expect(collectNamedObjectPropertyReferences(files, "api", "reloadMcpServers")).toEqual([
      { path: "src/Owner.tsx", line: 1 },
    ])
    expect(collectNamedObjectPropertyReferences([
      { path: "src/Data.ts", text: "selected.mcpServers; api.other()" },
    ], "api", "mcpServers")).toEqual([])
    expect(collectPropertyReferences(files, "testSkillPath")).toEqual([])
  })

  it.each([
    [{ ...base, activeReferences: 2 }, "active"],
    [{ ...base, compatibilityReferences: 1 }, "compatibility_only"],
    [{ ...base, migrationReferences: 1 }, "migration_blocked"],
    [base, "removable"],
    [{ ...base, evidenceComplete: false }, "unknown"],
    [{ ...base, externalCompatibility: "unknown" }, "unknown"],
  ] as const)("classifies evidence as %s", (candidate, expected) => {
    expect(classifyLegacyCandidate(candidate)).toBe(expected)
  })

  it("separates inventory readiness from deletion authorization", () => {
    const report = evaluateLegacyCutoverInventory({
      schemaVersion: "knowbee.legacy-cutover-inventory:v1",
      phase10Ready: false,
      candidates: [
        base,
        { ...base, candidateId: "route:/legacy", kind: "route", compatibilityReferences: 1, evidence: [{ path: "src/App.tsx" }] },
        { ...base, candidateId: "field:skills", kind: "persisted_field", migrationReferences: 3, evidence: [{ path: "src/a.ts" }, { path: "src/b.ts" }, { path: "src/c.ts" }] },
      ],
    })
    expect(report).toMatchObject({
      valid: true,
      inventoryReady: true,
      deletionAuthorized: false,
      counts: {
        removable: 1,
        compatibility_only: 1,
        migration_blocked: 1,
      },
    })
    expect(report.blockingReasons).toContain("phase10_gate_incomplete")
  })

  it("rejects a reference count that has no matching evidence rows", () => {
    const report = evaluateLegacyCutoverInventory({
      schemaVersion: "knowbee.legacy-cutover-inventory:v1",
      phase10Ready: true,
      candidates: [{ ...base, activeReferences: 1 }],
    })
    expect(report.valid).toBe(false)
    expect(report.validationErrors).toContain("candidates[0]:reference_evidence_mismatch")
  })

  it("rejects absolute paths in reference evidence", () => {
    const report = evaluateLegacyCutoverInventory({
      schemaVersion: "knowbee.legacy-cutover-inventory:v1",
      phase10Ready: true,
      candidates: [{ ...base, activeReferences: 1, evidence: [{ path: "/private/repository/file.ts" }] }],
    })
    expect(report.valid).toBe(false)
    expect(report.validationErrors).toContain("candidates[0]:reference_evidence_path_invalid")
  })

  it("rejects duplicate IDs, count mismatches and incomplete evidence", () => {
    const report = evaluateLegacyCutoverInventory({
      schemaVersion: "knowbee.legacy-cutover-inventory:v1",
      phase10Ready: true,
      candidates: [
        base,
        { ...base, activeReferences: -1 },
        { ...base, candidateId: "component:Unknown", evidenceComplete: false },
      ],
    })
    expect(report.valid).toBe(false)
    expect(report.inventoryReady).toBe(false)
    expect(report.deletionAuthorized).toBe(false)
    expect(report.validationErrors).toEqual(expect.arrayContaining([
      expect.stringContaining("candidate_id_duplicate"),
      expect.stringContaining("reference_count_invalid"),
    ]))
    expect(report.blockingReasons).toContain("unknown_candidate_evidence")
  })
})
