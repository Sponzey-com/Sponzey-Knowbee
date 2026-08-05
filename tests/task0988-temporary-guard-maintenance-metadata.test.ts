import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"
import { criticalDecisionAuditEntries } from "../packages/core/src/runs/critical-decision-audit.ts"

function readRepoFile(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf-8")
}

describe("task0988 temporary guard maintenance metadata", () => {
  it("requires temporary guards to declare owner, active caller evidence, removal condition, validation plan, and source marker", () => {
    const temporaryEntries = criticalDecisionAuditEntries.filter((entry) => entry.category === "temporary-guard")
    for (const entry of temporaryEntries) {
      expect(entry.maintenanceOwner?.trim(), `${entry.id} maintenance owner`).toBeTruthy()
      expect(entry.activeCallerEvidence?.length, `${entry.id} active caller evidence`).toBeGreaterThan(0)
      expect(entry.activeCallerEvidence?.every((item) => item.trim().length > 0), `${entry.id} active caller evidence item`).toBe(true)
      expect(entry.removalCondition?.trim(), `${entry.id} removal condition`).toBeTruthy()
      expect(entry.validationPlan?.trim(), `${entry.id} validation plan`).toBeTruthy()
      expect(entry.sourceMarker?.trim(), `${entry.id} source marker`).toBeTruthy()

      const source = readRepoFile(entry.file)
      expect(source, `${entry.file} should contain ${entry.id} marker`).toContain(entry.sourceMarker)
    }
  })

  it("keeps temporary guard metadata concrete enough for cleanup review", () => {
    for (const entry of criticalDecisionAuditEntries.filter((candidate) => candidate.category === "temporary-guard")) {
      expect(entry.removalCondition, `${entry.id} removal condition should name replacement boundary`).toMatch(
        /structured|IntentContract|work order|recovery key|receipt|request group id|run id/iu,
      )
      expect(entry.validationPlan, `${entry.id} validation plan should name executable checks`).toMatch(
        /test|tests|static-critical-decision-guard|Run /iu,
      )
      expect(entry.maintenanceOwner, `${entry.id} owner should identify a module boundary`).toMatch(/^[a-z0-9/.-]+$/iu)
    }
  })
})
