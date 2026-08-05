import { readFileSync } from "node:fs"
import { describe, expect, it, vi } from "vitest"
import {
  authorizeYeonjangSensitiveOperation,
  dispatchAuthorizedYeonjangSensitiveOperation,
  YEONJANG_SENSITIVE_EFFECTS,
  type YeonjangExplicitApprovalReceipt,
  type YeonjangPermissionSnapshot,
  type YeonjangSensitiveEffect,
} from "../packages/core/src/index.ts"

const now = Date.UTC(2026, 6, 14, 12, 0, 0)

function permissionSnapshot(
  decision: "allow" | "deny" | "approval_required" = "approval_required",
  effects: readonly YeonjangSensitiveEffect[] = YEONJANG_SENSITIVE_EFFECTS,
): YeonjangPermissionSnapshot {
  return {
    schemaVersion: 1,
    targetInstanceId: "instance:local",
    fingerprint: "permission:fingerprint:v1",
    capturedAt: now,
    entries: effects.map((effect) => ({ effect, decision, reasonCode: `policy_${decision}` })),
  }
}

function approval(overrides: Partial<YeonjangExplicitApprovalReceipt> = {}): YeonjangExplicitApprovalReceipt {
  return {
    schemaVersion: 1,
    approvalId: "approval:1",
    requestId: "request:1",
    targetInstanceId: "instance:local",
    effect: "screen_control",
    actionFingerprint: "action:screen-capture:v1",
    permissionSnapshotFingerprint: "permission:fingerprint:v1",
    decision: "allow_once",
    status: "approved",
    approvedAt: now,
    expiresAt: now + 60_000,
    ...overrides,
  }
}

function authorize(overrides: Partial<Parameters<typeof authorizeYeonjangSensitiveOperation>[0]> = {}) {
  return authorizeYeonjangSensitiveOperation({
    requestId: "request:1",
    targetInstanceId: "instance:local",
    effect: "screen_control",
    actionFingerprint: "action:screen-capture:v1",
    permissionSnapshot: permissionSnapshot(),
    approvalReceipt: approval(),
    now,
    maxPermissionAgeMs: 1_000,
    ...overrides,
  })
}

describe("task1230 Yeonjang sensitive operation permission and explicit approval", () => {
  it("defines exactly the seven GOAL-sensitive effect categories", () => {
    expect(YEONJANG_SENSITIVE_EFFECTS).toEqual([
      "file_write", "app_launch", "terminal_command", "screen_control",
      "keyboard_input", "mouse_input", "external_network",
    ])
  })

  it.each(YEONJANG_SENSITIVE_EFFECTS)("authorizes %s only with its current explicit approval", (effect) => {
    expect(authorize({ effect, approvalReceipt: approval({ effect }) })).toMatchObject({
      status: "authorized", effect, authorization: "explicit_approval",
    })
  })

  it("separates allow, deny, and approval-required permission decisions", () => {
    expect(authorize({ permissionSnapshot: permissionSnapshot("allow"), approvalReceipt: undefined })).toEqual({
      status: "authorized", effect: "screen_control", authorization: "permission",
    })
    expect(authorize({ permissionSnapshot: permissionSnapshot("deny"), approvalReceipt: approval() })).toEqual({
      status: "blocked", effect: "screen_control", reasonCode: "permission_denied",
    })
    expect(authorize({ approvalReceipt: undefined })).toEqual({
      status: "blocked", effect: "screen_control", reasonCode: "approval_missing",
    })
  })

  it("fails closed for missing and stale permission snapshots", () => {
    expect(authorize({ permissionSnapshot: permissionSnapshot("approval_required", ["file_write"]) })).toEqual({
      status: "blocked", effect: "screen_control", reasonCode: "permission_missing",
    })
    expect(authorize({ now: now + 1_001 })).toEqual({
      status: "blocked", effect: "screen_control", reasonCode: "permission_snapshot_stale",
    })
  })

  it.each([
    [{ requestId: "request:other" }, "approval_scope_mismatch"],
    [{ targetInstanceId: "instance:other" }, "approval_scope_mismatch"],
    [{ effect: "keyboard_input" }, "approval_scope_mismatch"],
    [{ actionFingerprint: "action:other" }, "approval_scope_mismatch"],
    [{ permissionSnapshotFingerprint: "permission:other" }, "approval_scope_mismatch"],
    [{ expiresAt: now }, "approval_expired"],
    [{ status: "consumed" }, "approval_consumed"],
  ] as const)("rejects invalid approval scope or lifecycle: %o", (receiptOverride, reasonCode) => {
    expect(authorize({ approvalReceipt: approval(receiptOverride) })).toEqual({
      status: "blocked", effect: "screen_control", reasonCode,
    })
  })

  it("marks allow-once approval consumed but leaves allow-run reusable for its exact request", () => {
    expect(authorize()).toMatchObject({
      status: "authorized", consumedApproval: { decision: "allow_once", status: "consumed" },
    })
    expect(authorize({ approvalReceipt: approval({ decision: "allow_run" }) })).toEqual({
      status: "authorized", effect: "screen_control", authorization: "explicit_approval",
    })
  })

  it("never invokes an execution adapter for blocked authorization", async () => {
    const execute = vi.fn(async () => "captured")
    await expect(dispatchAuthorizedYeonjangSensitiveOperation({
      authorization: authorize({ approvalReceipt: undefined }), execute,
    })).resolves.toEqual({ status: "blocked", reasonCode: "approval_missing" })
    expect(execute).not.toHaveBeenCalled()

    await expect(dispatchAuthorizedYeonjangSensitiveOperation({ authorization: authorize(), execute })).resolves.toEqual({
      status: "executed", result: "captured",
    })
    expect(execute).toHaveBeenCalledTimes(1)
  })

  it("rejects duplicate permission entries and a snapshot for another exact target", () => {
    const duplicate = permissionSnapshot()
    duplicate.entries.push({ ...duplicate.entries[0]! })
    expect(() => authorize({ permissionSnapshot: duplicate })).toThrow(/must be unique/i)
    const wrongTarget = permissionSnapshot()
    wrongTarget.targetInstanceId = "instance:remote"
    expect(() => authorize({ permissionSnapshot: wrongTarget })).toThrow(/target does not match/i)
  })

  it("keeps authorization domain independent from adapters and external state", () => {
    const source = readFileSync(new URL("../packages/core/src/contracts/yeonjang-sensitive-operation-authorization.ts", import.meta.url), "utf8")
    expect(source).not.toMatch(/from ["'](?:node:|better-sqlite3|mqtt|openai|@anthropic-ai\/sdk)/)
    expect(source).not.toMatch(/process\.env|Date\.now|fetch\(|readFile|writeFile|globalThis/)
  })
})
