import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

type Classification =
  | "public_projection"
  | "audit_projection"
  | "privileged_backup"
  | "user_artifact"
  | "domain_document"

interface Entry {
  id: string
  owner: string
  routeMarker: string
  classification: Classification
  controls: string[]
}

const inventory = JSON.parse(
  readFileSync("docs/audit/export-boundary-inventory.json", "utf8"),
) as { schemaVersion: number; entries: Entry[] }

const requiredControls: Record<Classification, string[]> = {
  public_projection: ["internal_data_redaction"],
  audit_projection: ["authenticated", "audit_route"],
  privileged_backup: ["authenticated", "explicit_post", "local_state_only", "operation_lifecycle"],
  user_artifact: ["authenticated", "data_classification", "restricted_class_rejected"],
  domain_document: ["authenticated", "domain_document_only"],
}

describe("task019 export boundary inventory", () => {
  it("classifies every known export owner with its required controls", () => {
    expect(inventory.schemaVersion).toBe(1)
    expect(new Set(inventory.entries.map((entry) => entry.id)).size).toBe(inventory.entries.length)
    expect(inventory.entries.map((entry) => entry.id).sort()).toEqual([
      "admin-diagnostic-bundle",
      "artifact-download",
      "control-timeline-audit",
      "control-timeline-public",
      "database-backup",
      "database-export",
      "masked-config-export",
      "prompt-source-export",
      "retrieval-timeline-public",
      "run-audit-export",
      "topology-export",
    ])

    for (const entry of inventory.entries) {
      expect(readFileSync(entry.owner, "utf8"), entry.id).toContain(entry.routeMarker)
      expect(entry.controls, entry.id).toEqual(
        expect.arrayContaining(requiredControls[entry.classification]),
      )
    }
  })

  it("keeps raw database and prompt archives local instead of exposing download routes", () => {
    const configRoutes = readFileSync("packages/core/src/api/routes/config-operations.ts", "utf8")
    expect(configRoutes).not.toMatch(/app\.get[^\n]+\/api\/config\/(?:db|prompt-sources)\/[^"']*(?:download|bundle)/u)
  })
})
