import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

import {
  CAPABILITY_MIGRATION_CHECKPOINTS,
  CURRENT_CAPABILITY_OWNER_BASELINE,
  CURRENT_PLATFORM_CAPABILITY_MATRIX,
  REQUIRED_PLATFORM_CAPABILITY_IDS,
  SUPPORTED_DESKTOP_PLATFORMS,
  validateCapabilityMigration,
  validateCapabilityOwnership,
  validatePlatformCapabilityMatrix,
  type CapabilityOwnerInventory,
} from "../packages/webui/src/lib/capability-source-baseline.js"

function validOwner(overrides: Partial<CapabilityOwnerInventory> = {}): CapabilityOwnerInventory {
  return {
    aggregateId: "skill_catalog",
    draftOwner: "capability.application.draft",
    persistedOwners: ["capability.repository"],
    writeOwners: ["capability.command"],
    runtimeOwner: "capability.runtime_projection",
    persistedRevision: "present",
    runtimeRevision: "present",
    runtimeApplyMode: "command",
    legacyGapReasonCodes: [],
    ...overrides,
  }
}

describe("task005 capability source and platform baseline", () => {
  it("diagnoses duplicate writers, missing revisions, and direct runtime mutation", () => {
    const result = validateCapabilityOwnership([
      validOwner({
        writeOwners: ["setup.save", "catalog.upsert"],
        persistedRevision: "missing",
        runtimeRevision: "missing",
        runtimeApplyMode: "direct_adapter_mutation",
      }),
    ])

    expect(result.ok).toBe(false)
    expect(result.diagnostics.map((item) => item.reasonCode)).toEqual([
      "write_owner_duplicated",
      "persisted_revision_missing",
      "runtime_revision_missing",
      "runtime_use_case_bypassed",
    ])
  })

  it("requires the ordered migration checkpoints and one accountable owner per checkpoint", () => {
    expect(validateCapabilityMigration(CAPABILITY_MIGRATION_CHECKPOINTS)).toEqual({
      ok: true,
      diagnostics: [],
    })

    const invalid = validateCapabilityMigration([
      CAPABILITY_MIGRATION_CHECKPOINTS[0],
      CAPABILITY_MIGRATION_CHECKPOINTS[2],
      { ...CAPABILITY_MIGRATION_CHECKPOINTS[3], owner: "" },
    ])
    expect(invalid.ok).toBe(false)
    expect(invalid.diagnostics).toHaveLength(5)
    expect(invalid.diagnostics.map((item) => item.reasonCode)).toEqual(expect.arrayContaining([
      "migration_checkpoint_missing",
      "migration_checkpoint_owner_missing",
      "migration_checkpoint_order_invalid",
    ]))
  })

  it("requires an explicit, user-explainable state for every capability on every desktop OS", () => {
    const complete = validatePlatformCapabilityMatrix(CURRENT_PLATFORM_CAPABILITY_MATRIX)
    expect(complete.ok).toBe(true)
    expect(complete.diagnostics).toEqual([])

    const incomplete = CURRENT_PLATFORM_CAPABILITY_MATRIX.filter(
      (item) => !(item.capabilityId === "screen_capture" && item.platform === "linux"),
    ).map((item) =>
      item.capabilityId === "app_launch" && item.platform === "windows"
        ? { ...item, status: "unknown" as const, userFacingReasonCode: "" }
        : item,
    )
    const result = validatePlatformCapabilityMatrix(incomplete)
    expect(result.ok).toBe(false)
    expect(result.diagnostics).toContainEqual({
      capabilityId: "screen_capture",
      platform: "linux",
      reasonCode: "platform_state_missing",
    })
    expect(result.diagnostics).toContainEqual({
      capabilityId: "app_launch",
      platform: "windows",
      reasonCode: "platform_state_unknown",
    })
    expect(result.diagnostics).toContainEqual({
      capabilityId: "app_launch",
      platform: "windows",
      reasonCode: "platform_reason_missing",
    })
  })

  it("covers each required capability for macOS, Windows, and Linux exactly once", () => {
    expect(CURRENT_PLATFORM_CAPABILITY_MATRIX).toHaveLength(
      REQUIRED_PLATFORM_CAPABILITY_IDS.length * SUPPORTED_DESKTOP_PLATFORMS.length,
    )
    expect(new Set(
      CURRENT_PLATFORM_CAPABILITY_MATRIX.map((item) => `${item.capabilityId}:${item.platform}`),
    ).size).toBe(CURRENT_PLATFORM_CAPABILITY_MATRIX.length)
  })

  it("records current source gaps without environment, I/O, or logging side effects", () => {
    const current = validateCapabilityOwnership(CURRENT_CAPABILITY_OWNER_BASELINE)
    expect(current.ok).toBe(false)
    expect(new Set(current.diagnostics.map((item) => item.reasonCode))).toEqual(new Set([
      "write_owner_duplicated",
      "persisted_revision_missing",
      "runtime_revision_missing",
      "runtime_use_case_bypassed",
    ]))

    const source = readFileSync("packages/webui/src/lib/capability-source-baseline.ts", "utf8")
    expect(source).not.toMatch(/process\.env|fetch\(|readFile|writeFile/)
    expect(source).not.toMatch(/console\.|logger\./)
  })
})
