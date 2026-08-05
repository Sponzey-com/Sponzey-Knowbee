import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

import {
  DEFAULT_SECURITY_THREAT_SURFACES,
  REQUIRED_SECURITY_THREAT_CLASSES,
  type SecurityThreatSurface,
  auditSecurityThreatInventory,
} from "../packages/core/src/maintenance/security-threat-inventory.js"

function completeFixture(): SecurityThreatSurface[] {
  return REQUIRED_SECURITY_THREAT_CLASSES.map((threatClass, index) => ({
    surfaceId: `surface:${index}`,
    threatClass,
    boundaryKind: "external_input",
    ownerSources: [{ artifactId: `src/owner-${index}.ts`, marker: `owner-${index}` }],
    mitigationTests: [{ artifactId: `tests/owner-${index}.test.ts`, marker: `test-${index}` }],
  }))
}

function fixtureReader(surfaces: readonly SecurityThreatSurface[]) {
  const artifacts = new Map<string, string>()
  for (const surface of surfaces) {
    for (const owner of surface.ownerSources) artifacts.set(owner.artifactId, owner.marker)
    for (const test of surface.mitigationTests) artifacts.set(test.artifactId, test.marker)
  }
  return (artifactId: string): string | undefined => artifacts.get(artifactId)
}

describe("task003 security threat inventory", () => {
  it("verifies stable coverage for every required threat class", () => {
    const surfaces = completeFixture().reverse()
    const result = auditSecurityThreatInventory({ surfaces, readArtifact: fixtureReader(surfaces) })

    expect(result.complete).toBe(true)
    expect(result.diagnostics).toEqual([])
    expect(result.counts).toEqual({
      requiredThreatClasses: 6,
      coveredThreatClasses: 6,
      surfaces: 6,
      verifiedSurfaces: 6,
      incompleteSurfaces: 0,
    })
    expect(result.surfaces.map((surface) => surface.surfaceId)).toEqual([
      "surface:0",
      "surface:1",
      "surface:2",
      "surface:3",
      "surface:4",
      "surface:5",
    ])
  })

  it("fails closed for duplicate IDs, missing classes, owners, tests, and markers", () => {
    const surfaces = completeFixture().slice(0, -1)
    const duplicate = surfaces[0]
    if (!duplicate) throw new Error("security threat fixture must contain at least one surface")
    surfaces.push({
      ...duplicate,
      ownerSources: [{ artifactId: "src/missing.ts", marker: "owner-missing" }],
      mitigationTests: [{ artifactId: "tests/missing.test.ts", marker: "test-missing" }],
    })
    const result = auditSecurityThreatInventory({
      surfaces,
      readArtifact: () => undefined,
    })

    expect(result.complete).toBe(false)
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(
      expect.arrayContaining([
        "duplicate_surface_id",
        "required_threat_class_missing",
        "owner_source_missing",
        "mitigation_test_missing",
      ]),
    )
  })

  it("audits the repository catalog with complete mitigation evidence", () => {
    const result = auditSecurityThreatInventory({
      surfaces: DEFAULT_SECURITY_THREAT_SURFACES,
      readArtifact(artifactId) {
        try {
          return readFileSync(artifactId, "utf8")
        } catch {
          return undefined
        }
      },
    })

    expect(result.counts.requiredThreatClasses).toBe(6)
    expect(result.counts.coveredThreatClasses).toBe(6)
    expect(result.surfaces.map((surface) => surface.threatClass)).toEqual(
      expect.arrayContaining([
        "ssrf",
        "path_traversal",
        "command_argument_injection",
        "capability_metadata_injection",
        "audit_privilege_escalation",
        "cross_owner_access",
      ]),
    )
    expect(result.complete).toBe(true)
    expect(result.diagnostics).toEqual([])
  })
})
