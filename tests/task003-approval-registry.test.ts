import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { closeDb, getDb, insertSession } from "../packages/core/src/db/index.js"
import { eventBus } from "../packages/core/src/events/index.js"
import {
  acquireApprovalRegistryGrant,
  consumeApprovalRegistryDecision,
  createApprovalRegistryRequest,
  getApprovalRegistryRow,
  resolveApprovalRegistryDecision,
} from "../packages/core/src/runs/approval-registry.ts"
import { createRootRun } from "../packages/core/src/runs/store.js"
import { ToolDispatcher } from "../packages/core/src/tools/dispatcher.ts"
import {
  createTestRuntimeConfigFixture,
  type TestRuntimeConfigFixture,
} from "./fixtures/runtime-config.ts"
import { initializeTestDbRuntime } from "./fixtures/runtime-db.ts"

const tempDirs: string[] = []
let runtimeFixture: TestRuntimeConfigFixture

function useTempConfig(): void {
  closeDb()
  const rootDir = mkdtempSync(join(tmpdir(), "knowbee-task003-approval-"))
  tempDirs.push(rootDir)
  runtimeFixture = createTestRuntimeConfigFixture({
    rootDir,
    configText: `{
    security: {
      approvalMode: "always",
      approvalTimeout: 60,
      approvalTimeoutFallback: "deny"
    },
    webui: { enabled: true, host: "127.0.0.1", port: 0, auth: { enabled: false } }
  }`,
  })
  initializeTestDbRuntime(runtimeFixture.paths.stateDir)
}

beforeEach(() => {
  useTempConfig()
})

afterEach(() => {
  closeDb()
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

describe("task003 approval registry", () => {
  it("stores approval lifecycle and prevents consumed approval reuse", () => {
    const approval = createApprovalRegistryRequest({
      id: "approval-once",
      runId: "run-approval-once",
      requestGroupId: "group-approval-once",
      channel: "webui",
      toolName: "file_write",
      riskLevel: "moderate",
      kind: "approval",
      params: { path: "memo.txt", content: "hello" },
      expiresAt: Date.now() + 60_000,
    })

    expect(approval.status).toBe("requested")

    const decided = resolveApprovalRegistryDecision({
      approvalId: approval.id,
      decision: "allow_once",
      decisionBy: "tester",
      decisionSource: "webui",
    })
    expect(decided).toMatchObject({ accepted: true, status: "approved_once", decision: "allow_once" })

    const consumed = consumeApprovalRegistryDecision(approval.id)
    expect(consumed).toMatchObject({ accepted: true, status: "consumed", decision: "allow_once" })

    const reused = consumeApprovalRegistryDecision(approval.id)
    expect(reused).toMatchObject({ accepted: false, status: "consumed", reason: "already_consumed" })
  })

  it("reacquires only a consumed allow-run decision for its exact DB scope", () => {
    const runGrant = createApprovalRegistryRequest({
      id: "approval-run-reusable",
      runId: "run-reusable",
      requestGroupId: "group-reusable",
      channel: "webui",
      toolName: "file_write",
      riskLevel: "moderate",
      kind: "approval",
      params: { path: "memo.txt" },
      authorizationParams: { operationBindingHash: "binding-a" },
      expiresAt: Date.now() + 60_000,
    })
    expect(resolveApprovalRegistryDecision({
      approvalId: runGrant.id,
      decision: "allow_run",
      decisionSource: "webui",
    }).accepted).toBe(true)
    expect(consumeApprovalRegistryDecision(runGrant.id, Date.now(), {
      runId: "run-reusable",
      requestGroupId: "group-reusable",
      toolName: "file_write",
      params: { path: "memo.txt" },
      authorizationParams: { operationBindingHash: "binding-a" },
    }).accepted).toBe(true)

    expect(acquireApprovalRegistryGrant({
      runId: "run-reusable",
      requestGroupId: "group-reusable",
      toolName: "file_write",
      params: { path: "memo.txt" },
      authorizationParams: { operationBindingHash: "binding-a" },
    })).toMatchObject({
      acquired: true,
      decision: "allow_run",
      approvalId: runGrant.id,
      source: "consumed_run",
    })
    expect(acquireApprovalRegistryGrant({
      runId: "run-reusable",
      requestGroupId: "group-reusable",
      toolName: "file_write",
      params: { path: "memo.txt" },
      authorizationParams: { operationBindingHash: "binding-b" },
    })).toMatchObject({ acquired: false })

    const once = createApprovalRegistryRequest({
      id: "approval-once-not-reusable",
      runId: "run-once",
      requestGroupId: "group-once",
      channel: "webui",
      toolName: "file_write",
      riskLevel: "moderate",
      kind: "approval",
      params: { path: "once.txt" },
    })
    resolveApprovalRegistryDecision({
      approvalId: once.id,
      decision: "allow_once",
      decisionSource: "webui",
    })
    consumeApprovalRegistryDecision(once.id, Date.now(), {
      runId: "run-once",
      requestGroupId: "group-once",
      toolName: "file_write",
      params: { path: "once.txt" },
    })
    expect(acquireApprovalRegistryGrant({
      runId: "run-once",
      requestGroupId: "group-once",
      toolName: "file_write",
      params: { path: "once.txt" },
    })).toMatchObject({ acquired: false })
  })

  it("keeps timeout distinct from user denial and rejects late approval", () => {
    const approval = createApprovalRegistryRequest({
      id: "approval-expired",
      runId: "run-expired",
      channel: "telegram",
      toolName: "screen_capture",
      riskLevel: "safe",
      kind: "approval",
      params: { extensionId: "yeonjang-main" },
      expiresAt: Date.now() - 1,
    })

    const late = resolveApprovalRegistryDecision({
      approvalId: approval.id,
      decision: "allow_once",
      decisionBy: "tester",
      decisionSource: "telegram",
    })

    expect(late).toMatchObject({ accepted: false, status: "expired", reason: "late" })
    expect(getApprovalRegistryRow(approval.id)?.status).toBe("expired")
    expect(getApprovalRegistryRow(approval.id)?.decision_source).toBe("timeout")
  })

  it("rejects approval consumption outside the exact execution scope", () => {
    const approval = createApprovalRegistryRequest({
      id: "approval-scoped",
      runId: "run-scoped",
      requestGroupId: "group-scoped",
      channel: "webui",
      toolName: "shell_exec",
      riskLevel: "dangerous",
      kind: "approval",
      params: { command: "pwd" },
      metadata: { agentId: "agent:a" },
      expiresAt: Date.now() + 60_000,
    })
    expect(resolveApprovalRegistryDecision({
      approvalId: approval.id,
      decision: "allow_once",
      decisionSource: "webui",
    }).accepted).toBe(true)

    const mismatched = consumeApprovalRegistryDecision(approval.id, Date.now(), {
      runId: "run-scoped",
      requestGroupId: "group-scoped",
      toolName: "shell_exec",
      params: { command: "rm -rf target" },
      agentId: "agent:b",
    })
    expect(mismatched).toMatchObject({
      accepted: false,
      status: "approved_once",
      reason: "scope_mismatch",
    })
    expect(getApprovalRegistryRow(approval.id)?.status).toBe("approved_once")

    const exact = consumeApprovalRegistryDecision(approval.id, Date.now(), {
      runId: "run-scoped",
      requestGroupId: "group-scoped",
      toolName: "shell_exec",
      params: { command: "pwd" },
      agentId: "agent:a",
    })
    expect(exact).toMatchObject({ accepted: true, status: "consumed" })
  })

  it("persists and consumes the exact prepared operation continuation binding", () => {
    const operationBindingHash = `sha256:${"a".repeat(64)}` as const
    const approval = createApprovalRegistryRequest({
      id: "approval-operation-bound",
      runId: "run-operation-bound",
      requestGroupId: "group-operation-bound",
      channel: "telegram",
      toolName: "yeonjang_camera_capture",
      riskLevel: "moderate",
      kind: "approval",
      params: { target: "bounded-preview" },
      authorizationParams: { operationBindingHash },
      operationBinding: {
        operationId: "operation:camera:prepared",
        operationBindingHash,
        continuationSchemaVersion: 1,
      },
    })

    expect(approval).toMatchObject({
      operation_id: "operation:camera:prepared",
      operation_binding_hash: operationBindingHash,
      continuation_schema_version: 1,
    })
    resolveApprovalRegistryDecision({
      approvalId: approval.id,
      decision: "allow_once",
      decisionSource: "telegram",
    })

    expect(consumeApprovalRegistryDecision(approval.id, Date.now(), {
      runId: "run-operation-bound",
      requestGroupId: "group-operation-bound",
      toolName: "yeonjang_camera_capture",
      params: { target: "bounded-preview" },
      authorizationParams: { operationBindingHash },
      operationBinding: {
        operationId: "operation:camera:other",
        operationBindingHash,
        continuationSchemaVersion: 1,
      },
    })).toMatchObject({
      accepted: false,
      reason: "scope_mismatch",
    })

    expect(consumeApprovalRegistryDecision(approval.id, Date.now(), {
      runId: "run-operation-bound",
      requestGroupId: "group-operation-bound",
      toolName: "yeonjang_camera_capture",
      params: { target: "bounded-preview" },
      authorizationParams: { operationBindingHash },
      operationBinding: {
        operationId: "operation:camera:prepared",
        operationBindingHash,
        continuationSchemaVersion: 1,
      },
    })).toMatchObject({
      accepted: true,
      status: "consumed",
    })
  })

  it("rejects an approved decision that expires before consumption", () => {
    const now = Date.now()
    const approval = createApprovalRegistryRequest({
      id: "approval-expired-after-decision",
      runId: "run-expired-after-decision",
      channel: "webui",
      toolName: "file_write",
      riskLevel: "sensitive",
      kind: "approval",
      params: { path: "memo.txt" },
      expiresAt: now + 10,
      now,
    })
    expect(resolveApprovalRegistryDecision({
      approvalId: approval.id,
      decision: "allow_once",
      decisionSource: "webui",
      now: now + 1,
    }).accepted).toBe(true)

    expect(consumeApprovalRegistryDecision(approval.id, now + 11)).toMatchObject({
      accepted: false,
      status: "expired",
      reason: "late",
    })
  })

  it("supersedes previous requested approval for the same run and tool", () => {
    const first = createApprovalRegistryRequest({
      id: "approval-first",
      runId: "run-supersede",
      channel: "slack",
      toolName: "shell_exec",
      riskLevel: "dangerous",
      kind: "approval",
      params: { command: "date" },
    })
    const second = createApprovalRegistryRequest({
      id: "approval-second",
      runId: "run-supersede",
      channel: "slack",
      toolName: "shell_exec",
      riskLevel: "dangerous",
      kind: "approval",
      params: { command: "pwd" },
    })

    expect(getApprovalRegistryRow(first.id)).toMatchObject({ status: "superseded", superseded_by: second.id })
    expect(getApprovalRegistryRow(second.id)?.status).toBe("requested")
  })

  it("requires a consumed registry decision before executing an approval-required tool", async () => {
    insertSession({
      id: "session-dispatch-approval",
      source: "webui",
      source_id: null,
      created_at: Date.now(),
      updated_at: Date.now(),
      summary: null,
    })
    createRootRun({
      id: "run-dispatch-approval",
      sessionId: "session-dispatch-approval",
      prompt: "write a file",
      source: "webui",
    })

    const dispatcher = new ToolDispatcher({ config: runtimeFixture.config })
    const execute = vi.fn(async () => ({ success: true, output: "executed" }))
    dispatcher.register({
      name: "file_write",
      description: "requires approval",
      parameters: { type: "object", properties: {} },
      riskLevel: "moderate",
      requiresApproval: true,
      execute,
    })

    const off = eventBus.on("approval.request", ({ approvalId, resolve }) => {
      expect(approvalId).toMatch(/^[0-9a-f-]{36}$/)
      resolve("allow_once", "user")
    })

    const result = await dispatcher.dispatch(
      "file_write",
      { path: "memo.txt", content: "hello" },
      {
        sessionId: "session-dispatch-approval",
        runId: "run-dispatch-approval",
        requestGroupId: "run-dispatch-approval",
        workDir: process.cwd(),
        userMessage: "write a file",
        source: "webui",
        allowWebAccess: false,
        onProgress: () => undefined,
        signal: new AbortController().signal,
      },
    )
    off()

    expect(result).toMatchObject({ success: true, output: "executed" })
    expect(execute).toHaveBeenCalledTimes(1)
    const row = getDb().prepare<[], { status: string }>("SELECT status FROM approval_registry WHERE run_id = 'run-dispatch-approval'").get()
    expect(row?.status).toBe("consumed")

    const audit = getDb()
      .prepare<[], { params: string; output: string }>(
        "SELECT params, output FROM audit_logs WHERE tool_name = 'file_write' ORDER BY timestamp DESC LIMIT 1",
      )
      .get()
    expect(audit?.params).toContain('"name":"content"')
    expect(audit?.params).not.toContain("hello")
    expect(audit?.params).not.toContain("memo.txt")
    expect(audit?.output).toContain('"success":true')
    expect(audit?.output).not.toContain("executed")
  })
})
