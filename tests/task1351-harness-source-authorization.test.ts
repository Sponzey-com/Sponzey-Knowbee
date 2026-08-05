import { readFileSync } from "node:fs"
import { describe, expect, it, vi } from "vitest"
import {
  authorizeHarnessSourceMutation,
  executeAuthorizedHarnessSourceMutation,
  type HarnessMutableSourceKind,
} from "../packages/core/src/memory/harness-source-authorization.ts"

const now = Date.UTC(2026, 6, 14, 17)
const refs = {
  approval_policy: "packages/core/src/memory/prompt-improvement-harness.ts#approval-policy",
  state_machine: "packages/core/src/memory/prompt-improvement-harness.ts#state-machine",
  harness_core: "prompts/prompt_improvement.md#harness-core",
  input_output_schema: "packages/core/src/memory/prompt-improvement-harness.ts#input-output-schema",
  activation_rollback_procedure: "prompts/prompt_improvement.md#activation-rollback-procedure",
  test_fixture: "tests/task1357-harness-guardrail-authorization.test.ts",
} as const

function decision(sourceKind: HarnessMutableSourceKind, overrides: Record<string, unknown> = {}) {
  const sourceRef = refs[sourceKind]
  return authorizeHarnessSourceMutation({
    source: { sourceKind, sourceRef, baselineVersion: "git:abc1234", baselineChecksum: "abcdef12" },
    userRequest: { requestId: "request:user:1", requester: "user:owner", requesterType: "user", requestedSourceRefs: [sourceRef], requestedAt: now - 1000, expiresAt: now + 60_000 },
    approval: { approvalId: "approval:admin:1", approvedBy: "admin:owner", approvedSourceRefs: [sourceRef], approvedAt: now - 500, expiresAt: now + 60_000 },
    now,
    ...overrides,
  })
}

describe("task1351 harness source authorization", () => {
  it.each(["approval_policy", "state_machine"] as const)("authorizes exact explicitly requested harness source %s", (sourceKind) => {
    expect(decision(sourceKind)).toMatchObject({ status: "authorized", source: { sourceKind, sourceRef: refs[sourceKind] }, requestId: "request:user:1" })
  })

  it.each(["harness_core", "input_output_schema", "activation_rollback_procedure", "test_fixture"] as const)(
    "authorizes scoped canonical extended harness source %s",
    (sourceKind) => {
      expect(decision(sourceKind)).toMatchObject({ status: "authorized", source: { sourceKind, sourceRef: refs[sourceKind] } })
    },
  )

  it.each(["harness_core", "input_output_schema", "activation_rollback_procedure", "test_fixture"] as const)(
    "rejects canonical source ref assigned to the wrong harness kind %s",
    (sourceKind) => {
      expect(authorizeHarnessSourceMutation({
        source: { sourceKind, sourceRef: refs.approval_policy, baselineVersion: "git:abc1234", baselineChecksum: "abcdef12" },
        userRequest: { requestId: "request:user:1", requester: "user:owner", requesterType: "user", requestedSourceRefs: [refs.approval_policy], requestedAt: now - 1, expiresAt: now + 1000 },
        approval: { approvalId: "approval:1", approvedBy: "admin", approvedSourceRefs: [refs.approval_policy], approvedAt: now - 1, expiresAt: now + 1000 },
        now,
      })).toEqual({ status: "blocked", reasonCode: "source_ref_invalid" })
    },
  )

  it.each(["harness_core", "input_output_schema", "activation_rollback_procedure", "test_fixture"] as const)(
    "prevents extended harness authorization from invoking a different writer %s",
    async (sourceKind) => {
      const write = vi.fn()
      await expect(executeAuthorizedHarnessSourceMutation({ decision: decision(sourceKind), writerKind: "approval_policy", write }))
        .resolves.toEqual({ status: "blocked", reasonCode: "writer_kind_mismatch" })
      expect(write).not.toHaveBeenCalled()
    },
  )

  it.each([
    [{ userRequest: undefined }, "explicit_user_request_missing"],
    [{ userRequest: { requestId: "request:auto", requester: "agent:auto", requesterType: "agent", requestedSourceRefs: [refs.approval_policy], requestedAt: now - 1, expiresAt: now + 1 } }, "explicit_user_request_missing"],
    [{ userRequest: { requestId: "request:user", requester: "user:owner", requesterType: "user", requestedSourceRefs: [refs.approval_policy], requestedAt: now - 10, expiresAt: now } }, "request_expired"],
    [{ userRequest: { requestId: "request:user", requester: "user:owner", requesterType: "user", requestedSourceRefs: [refs.state_machine], requestedAt: now - 10, expiresAt: now + 10 } }, "request_scope_mismatch"],
    [{ approval: undefined }, "approval_missing"],
    [{ approval: { approvalId: "approval:old", approvedBy: "admin", approvedSourceRefs: [refs.approval_policy], approvedAt: now - 10, expiresAt: now } }, "approval_expired"],
    [{ approval: { approvalId: "approval:other", approvedBy: "admin", approvedSourceRefs: [refs.state_machine], approvedAt: now - 10, expiresAt: now + 10 } }, "approval_scope_mismatch"],
  ] as const)("blocks invalid explicit request or approval receipt: %s", (overrides, reasonCode) => {
    expect(decision("approval_policy", overrides as Record<string, unknown>)).toEqual({ status: "blocked", reasonCode })
  })

  it("prevents approval-policy authorization from invoking a state-machine writer", async () => {
    const write = vi.fn(async () => "unexpected")
    await expect(executeAuthorizedHarnessSourceMutation({ decision: decision("approval_policy"), writerKind: "state_machine", write }))
      .resolves.toEqual({ status: "blocked", reasonCode: "writer_kind_mismatch" })
    expect(write).not.toHaveBeenCalled()
  })

  it("writes only through the matching source-specific port", async () => {
    const write = vi.fn(async () => "saved")
    await expect(executeAuthorizedHarnessSourceMutation({ decision: decision("state_machine"), writerKind: "state_machine", write }))
      .resolves.toEqual({ status: "written", result: "saved" })
    expect(write).toHaveBeenCalledWith(expect.objectContaining({ sourceKind: "state_machine", sourceRef: refs.state_machine }))
  })

  it("keeps authorization independent from environment and persistence adapters", () => {
    const source = readFileSync(new URL("../packages/core/src/memory/harness-source-authorization.ts", import.meta.url), "utf8")
    expect(source).not.toMatch(/from ["'](?:node:|better-sqlite3|openai|@anthropic-ai\/sdk)/u)
    expect(source).not.toMatch(/process\.env|Date\.now|readFile|writeFile|fetch\(|globalThis/u)
  })
})
