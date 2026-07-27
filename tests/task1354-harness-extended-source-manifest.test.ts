import { describe, expect, it, vi } from "vitest"
import {
  authorizeHarnessSourceMutation,
  executeAuthorizedHarnessSourceMutation,
  type HarnessMutableSourceKind,
} from "../packages/core/src/memory/harness-source-authorization.ts"

const now = Date.UTC(2026, 6, 14)
const refs = {
  harness_core: "prompts/prompt_improvement.md#harness-core",
  input_output_schema: "packages/core/src/memory/prompt-improvement-harness.ts#input-output-schema",
  activation_rollback_procedure: "prompts/prompt_improvement.md#activation-rollback-procedure",
} as const
type ExtendedKind = keyof typeof refs

function authorize(sourceKind: ExtendedKind, overrides: Record<string, unknown> = {}) {
  const sourceRef = refs[sourceKind]
  return authorizeHarnessSourceMutation({
    source: { sourceKind, sourceRef, baselineVersion: "git:abc1234", baselineChecksum: "abcdef12" },
    userRequest: { requestId: "request:extended", requester: "user:owner", requesterType: "user", requestedSourceRefs: [sourceRef], requestedAt: now - 1, expiresAt: now + 1000 },
    approval: { approvalId: "approval:extended", approvedBy: "admin:owner", approvedSourceRefs: [sourceRef], approvedAt: now - 1, expiresAt: now + 1000 },
    now,
    ...overrides,
  })
}

describe("task1354 extended harness source manifest", () => {
  it.each(Object.keys(refs) as ExtendedKind[])("authorizes exact versioned source and matching writer for %s", async (sourceKind) => {
    const write = vi.fn(async () => "saved")
    const decision = authorize(sourceKind)
    expect(decision).toMatchObject({ status: "authorized", source: { sourceKind, sourceRef: refs[sourceKind] } })
    await expect(executeAuthorizedHarnessSourceMutation({ decision, writerKind: sourceKind, write }))
      .resolves.toEqual({ status: "written", result: "saved" })
    expect(write).toHaveBeenCalledTimes(1)
  })

  it.each(Object.keys(refs) as ExtendedKind[])("requires immutable baseline lineage for %s", (sourceKind) => {
    const sourceRef = refs[sourceKind]
    expect(authorizeHarnessSourceMutation({
      source: { sourceKind, sourceRef, baselineVersion: "current", baselineChecksum: "abcdef12" },
      userRequest: { requestId: "request", requester: "user", requesterType: "user", requestedSourceRefs: [sourceRef], requestedAt: now - 1, expiresAt: now + 1 },
      approval: { approvalId: "approval", approvedBy: "admin", approvedSourceRefs: [sourceRef], approvedAt: now - 1, expiresAt: now + 1 },
      now,
    })).toEqual({ status: "blocked", reasonCode: "source_lineage_invalid" })
  })

  it("blocks core authorization at schema and procedure writers", async () => {
    const write = vi.fn()
    for (const writerKind of ["input_output_schema", "activation_rollback_procedure"] as HarnessMutableSourceKind[]) {
      await expect(executeAuthorizedHarnessSourceMutation({ decision: authorize("harness_core"), writerKind, write }))
        .resolves.toEqual({ status: "blocked", reasonCode: "writer_kind_mismatch" })
    }
    expect(write).not.toHaveBeenCalled()
  })
})
