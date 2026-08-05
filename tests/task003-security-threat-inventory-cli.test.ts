import { describe, expect, it } from "vitest"

import { createSecurityThreatBaseline } from "../scripts/self/audit-security-threat-inventory.mjs"

describe("task003 security threat inventory CLI", () => {
  it("uses an explicit repository reader and emits no raw source content", () => {
    const reads: string[] = []
    const result = createSecurityThreatBaseline({
      repositoryRoot: "/workspace/knowbee",
      readArtifact({ repositoryRoot, artifactId }) {
        expect(repositoryRoot).toBe("/workspace/knowbee")
        reads.push(artifactId)
        return "marker-only fixture"
      },
      surfaces: [
        {
          surfaceId: "surface:fixture",
          threatClass: "ssrf",
          boundaryKind: "network_input",
          ownerSources: [{ artifactId: "src/network.ts", marker: "marker-only" }],
          mitigationTests: [{ artifactId: "tests/network.test.ts", marker: "fixture" }],
        },
      ],
      requiredThreatClasses: ["ssrf"],
    })

    expect(reads).toEqual(["src/network.ts", "tests/network.test.ts"])
    expect(result.complete).toBe(true)
    expect(JSON.stringify(result)).not.toContain("marker-only fixture")
  })
})
