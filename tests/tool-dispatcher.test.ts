import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { DEFAULT_CONFIG } from "../packages/core/src/config/types.ts"
import { applyCanonicalWorkEvent } from "../packages/core/src/contracts/canonical-work-aggregate.ts"
import { SqliteCanonicalWorkRepository } from "../packages/core/src/db/canonical-work-repository.ts"
import { SqliteApprovedOperationContinuationRepository } from "../packages/core/src/db/approved-operation-continuation-repository.ts"
import { closeDb, getDb, insertSession } from "../packages/core/src/db/index.js"
import { eventBus } from "../packages/core/src/events/index.js"
import {
  getLatestApprovalForRun,
  hashApprovalParams,
} from "../packages/core/src/runs/approval-registry.ts"
import { createRootRun } from "../packages/core/src/runs/store.ts"
import { ToolDispatcher } from "../packages/core/src/tools/dispatcher.ts"
import type {
  ToolAuthorizationReceipt,
  ToolContext,
} from "../packages/core/src/tools/types.ts"
import { initializeTestDbRuntime } from "./fixtures/runtime-db.ts"

const tempDirs: string[] = []

beforeEach(() => {
  closeDb()
  const stateDir = mkdtempSync(join(tmpdir(), "knowbee-tool-dispatcher-"))
  tempDirs.push(stateDir)
  initializeTestDbRuntime(stateDir)
})

afterEach(() => {
  closeDb()
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

describe("tool dispatcher source filtering", () => {
  it("does not apply removed discovery-search transition blocking to direct web fetches", async () => {
    insertSession({
      id: "session-web-transition",
      source: "webui",
      source_id: null,
      created_at: Date.now(),
      updated_at: Date.now(),
      summary: null,
    })
    createRootRun({
      id: "run-web-transition",
      sessionId: "session-web-transition",
      prompt: "현재 주가를 확인해줘",
      source: "webui",
      requestGroupId: "group-web-transition",
    })
    const config = {
      ...DEFAULT_CONFIG,
      security: { ...DEFAULT_CONFIG.security, approvalMode: "off" as const },
    }
    const execute = vi.fn(async () => ({
      success: true,
      output: "URL: https://finance.example/quote/000660",
      details: {
        sourceEvidence: [{ sourceUrl: "https://finance.example/quote/000660" }],
      },
    }))
    const context = {
      sessionId: "session-web-transition",
      runId: "run-web-transition",
      requestGroupId: "group-web-transition",
      workDir: process.cwd(),
      userMessage: "현재 주가를 확인해줘",
      source: "webui" as const,
      allowWebAccess: true,
      onProgress: () => undefined,
      signal: new AbortController().signal,
    }
    const firstDispatcher = new ToolDispatcher({ config })
    firstDispatcher.register({
      name: "web_fetch",
      description: "fetches a direct quote URL",
      parameters: { type: "object", properties: {} },
      riskLevel: "safe",
      requiresApproval: false,
      execute,
    })

    const detach = eventBus.on("approval.request", ({ resolve }) => resolve("allow_run"))
    await expect(firstDispatcher.dispatch("web_fetch", { url: "https://finance.example/quote/000660" }, context))
      .resolves.toMatchObject({ success: true })

    const restartedDispatcher = new ToolDispatcher({ config })
    restartedDispatcher.register({
      name: "web_fetch",
      description: "fetches another direct quote URL",
      parameters: { type: "object", properties: {} },
      riskLevel: "safe",
      requiresApproval: false,
      execute,
    })
    const second = await restartedDispatcher.dispatch(
      "web_fetch",
      { url: "https://finance.example/quote/005930" },
      context,
    )
    detach()

    expect(execute).toHaveBeenCalledTimes(2)
    expect(second).toMatchObject({
      success: true,
    })
  })

  it("resumes the waiting tool when approval is resolved without a WebSocket subscriber", async () => {
    insertSession({
      id: "session-rest-approval",
      source: "webui",
      source_id: null,
      created_at: Date.now(),
      updated_at: Date.now(),
      summary: null,
    })
    createRootRun({
      id: "run-rest-approval",
      sessionId: "session-rest-approval",
      prompt: "현재 값을 조회해줘",
      source: "webui",
    })
    const dispatcher = new ToolDispatcher({ config: DEFAULT_CONFIG })
    const execute = vi.fn(async () => ({ success: true, output: "current value" }))
    dispatcher.register({
      name: "approval_probe",
      description: "REST approval continuation probe",
      parameters: { type: "object", properties: {} },
      riskLevel: "safe",
      requiresApproval: true,
      execute,
    })
    const abortController = new AbortController()
    let markRequested: (() => void) | undefined
    const requested = new Promise<void>((resolve) => {
      markRequested = resolve
    })
    const detach = eventBus.on("approval.request", () => markRequested?.())

    try {
      const dispatch = dispatcher.dispatch("approval_probe", { query: "current value" }, {
        sessionId: "session-rest-approval",
        runId: "run-rest-approval",
        requestGroupId: "run-rest-approval",
        workDir: process.cwd(),
        userMessage: "현재 값을 조회해줘",
        source: "webui",
        allowWebAccess: true,
        onProgress: () => undefined,
        signal: abortController.signal,
      })

      await requested
      expect(dispatcher.resolvePendingInteraction("run-rest-approval", "allow_run")).toBe(true)
      await vi.waitFor(() => expect(execute).toHaveBeenCalledTimes(1))
      await expect(dispatch).resolves.toMatchObject({ success: true, output: "current value" })
    } finally {
      abortController.abort()
      detach()
    }
  })

  it("commits an exact approvalId decision before waking the live tool waiter", async () => {
    insertSession({
      id: "session-durable-approval-command",
      source: "webui",
      source_id: null,
      created_at: Date.now(),
      updated_at: Date.now(),
      summary: null,
    })
    createRootRun({
      id: "run-durable-approval-command",
      sessionId: "session-durable-approval-command",
      prompt: "승인 후 실행해줘",
      source: "webui",
      requestGroupId: "group-durable-approval-command",
    })
    const dispatcher = new ToolDispatcher({ config: DEFAULT_CONFIG })
    const execute = vi.fn(async () => ({ success: true, output: "approved result" }))
    dispatcher.register({
      name: "durable_approval_probe",
      description: "durable approval decision command probe",
      parameters: { type: "object", properties: {} },
      riskLevel: "safe",
      requiresApproval: true,
      execute,
    })
    let markRequested: (() => void) | undefined
    const requested = new Promise<void>((resolve) => {
      markRequested = resolve
    })
    const detach = eventBus.on("approval.request", () => markRequested?.())
    const abortController = new AbortController()

    try {
      const dispatch = dispatcher.dispatch(
        "durable_approval_probe",
        { query: "exact" },
        {
          sessionId: "session-durable-approval-command",
          runId: "run-durable-approval-command",
          requestGroupId: "group-durable-approval-command",
          workDir: process.cwd(),
          userMessage: "승인 후 실행해줘",
          source: "webui",
          allowWebAccess: true,
          onProgress: () => undefined,
          signal: abortController.signal,
        },
      )

      await requested
      const approval = getLatestApprovalForRun("run-durable-approval-command")
      expect(approval?.status).toBe("requested")
      expect(dispatcher.resolveApprovalDecision({
        approvalId: approval?.id ?? "",
        runId: "wrong-run",
        decision: "allow_once",
        decisionBy: "webui",
        decisionSource: "user",
      })).toMatchObject({ accepted: false, reasonCode: "approval_run_mismatch" })
      expect(dispatcher.resolveApprovalDecision({
        approvalId: approval?.id ?? "",
        runId: "run-durable-approval-command",
        decision: "allow_once",
        decisionBy: "webui",
        decisionSource: "user",
      })).toMatchObject({ accepted: true, wokeLiveWaiter: true })
      expect(dispatcher.resolveApprovalDecision({
        approvalId: approval?.id ?? "",
        runId: "run-durable-approval-command",
        decision: "allow_once",
        decisionBy: "webui",
        decisionSource: "user",
      })).toMatchObject({ accepted: false, reasonCode: "approval_already_final" })

      await expect(dispatch).resolves.toMatchObject({
        success: true,
        output: "approved result",
      })
      expect(execute).toHaveBeenCalledTimes(1)
      expect(getLatestApprovalForRun("run-durable-approval-command")?.status).toBe("consumed")
    } finally {
      abortController.abort()
      detach()
    }
  })

  it("signals the durable consumer when approval is committed without the original waiter", async () => {
    insertSession({
      id: "session-restarted-approval-command",
      source: "telegram",
      source_id: "chat-restarted",
      created_at: Date.now(),
      updated_at: Date.now(),
      summary: null,
    })
    createRootRun({
      id: "run-restarted-approval-command",
      sessionId: "session-restarted-approval-command",
      prompt: "capture after restart",
      source: "telegram",
      requestGroupId: "group-restarted-approval-command",
    })
    const beforeRestart = new ToolDispatcher({ config: DEFAULT_CONFIG })
    beforeRestart.register({
      name: "restart_continuation_probe",
      description: "restart continuation wake probe",
      parameters: { type: "object", properties: {} },
      riskLevel: "moderate",
      requiresApproval: true,
      sideEffect: {
        effectClass: "local_write",
        compensationSupport: "irreversible",
        canonicalOperation: (params: Record<string, unknown>) => ({
          targetId: params.targetId,
        }),
        targetRef: (params: Record<string, unknown>) =>
          String(params.targetId),
        expectedState: () => ({ captured: true }),
        observe: async (params: Record<string, unknown>) => ({
          available: true,
          targetRef: String(params.targetId),
          expectedState: { captured: true },
          observedState: { captured: true },
        }),
      },
      execute: vi.fn(async () => ({ success: true, output: "captured" })),
    })
    const abortController = new AbortController()
    let markRequested: (() => void) | undefined
    const requested = new Promise<void>((resolve) => {
      markRequested = resolve
    })
    const wakeSignals: Array<{ continuationId: string; runId: string }> = []
    const detachRequest = eventBus.on(
      "approval.request",
      () => markRequested?.(),
    )
    const detachWake = eventBus.on(
      "approval.continuation.enqueued",
      (event) => wakeSignals.push(event),
    )
    const dispatch = beforeRestart.dispatch(
      "restart_continuation_probe",
      { targetId: "camera-main" },
      {
        sessionId: "session-restarted-approval-command",
        runId: "run-restarted-approval-command",
        requestGroupId: "group-restarted-approval-command",
        workDir: process.cwd(),
        userMessage: "capture after restart",
        source: "telegram",
        allowWebAccess: false,
        onProgress: () => undefined,
        signal: abortController.signal,
      },
    )

    try {
      await requested
      const approval = getLatestApprovalForRun(
        "run-restarted-approval-command",
      )
      const afterRestart = new ToolDispatcher({ config: DEFAULT_CONFIG })
      expect(afterRestart.resolveApprovalDecision({
        approvalId: approval?.id ?? "",
        runId: "run-restarted-approval-command",
        decision: "allow_once",
        decisionBy: "telegram",
        decisionSource: "user",
      })).toEqual({
        accepted: true,
        wokeLiveWaiter: false,
        approvalId: approval?.id,
      })
      expect(wakeSignals).toEqual([
        {
          continuationId:
            `approval-continuation:${approval?.id ?? ""}`,
          runId: "run-restarted-approval-command",
        },
      ])
      expect(getDb().prepare(
        `SELECT status
         FROM approved_operation_continuations
         WHERE approval_id = ?`,
      ).get(approval?.id)).toEqual({ status: "pending" })
    } finally {
      abortController.abort()
      detachRequest()
      detachWake()
      await dispatch
    }
  })

  it("does not start a side effect when another continuation owner already holds the lease", async () => {
    insertSession({
      id: "session-continuation-lease",
      source: "webui",
      source_id: null,
      created_at: Date.now(),
      updated_at: Date.now(),
      summary: null,
    })
    createRootRun({
      id: "run-continuation-lease",
      sessionId: "session-continuation-lease",
      prompt: "capture once",
      source: "webui",
      requestGroupId: "group-continuation-lease",
    })
    const dispatcher = new ToolDispatcher({ config: DEFAULT_CONFIG })
    const execute = vi.fn(async () => ({ success: true, output: "captured" }))
    dispatcher.register({
      name: "continuation_claim_probe",
      description: "continuation lease conflict probe",
      parameters: { type: "object", properties: {} },
      riskLevel: "moderate",
      requiresApproval: true,
      sideEffect: {
        effectClass: "local_write",
        compensationSupport: "irreversible",
        canonicalOperation: (params: Record<string, unknown>) => ({
          targetId: params.targetId,
        }),
        targetRef: (params: Record<string, unknown>) =>
          String(params.targetId),
        expectedState: () => ({ captured: true }),
        observe: async (params: Record<string, unknown>) => ({
          available: true,
          targetRef: String(params.targetId),
          expectedState: { captured: true },
          observedState: { captured: true },
        }),
      },
      execute,
    })
    const detach = eventBus.on("approval.request", ({ resolve }) => {
      resolve("allow_once")
      expect(
        new SqliteApprovedOperationContinuationRepository(getDb()).claimNext({
          ownerId: "other-runtime",
          leaseMs: 120_000,
        }),
      ).toMatchObject({ status: "claimed" })
    })

    try {
      await expect(dispatcher.dispatch(
        "continuation_claim_probe",
        { targetId: "camera-a" },
        {
          sessionId: "session-continuation-lease",
          runId: "run-continuation-lease",
          requestGroupId: "group-continuation-lease",
          workDir: process.cwd(),
          userMessage: "capture once",
          source: "webui",
          allowWebAccess: false,
          onProgress: () => undefined,
          signal: new AbortController().signal,
        },
      )).resolves.toMatchObject({
        success: false,
        error: "APPROVAL_CONTINUATION_CLAIM_REJECTED",
      })
    } finally {
      detach()
    }
    expect(execute).not.toHaveBeenCalled()
  })

  it("does not reuse allow_run approval for a different side-effect tool", async () => {
    insertSession({
      id: "session-operation-scope",
      source: "webui",
      source_id: null,
      created_at: Date.now(),
      updated_at: Date.now(),
      summary: null,
    })
    createRootRun({
      id: "run-operation-scope",
      sessionId: "session-operation-scope",
      prompt: "capture and deliver",
      source: "webui",
      requestGroupId: "group-operation-scope",
    })
    const dispatcher = new ToolDispatcher({ config: DEFAULT_CONFIG })
    const capture = vi.fn(async () => ({ success: true, output: "captured" }))
    const delivery = vi.fn(async () => ({ success: true, output: "delivered" }))
    dispatcher.register({
      name: "capture_probe",
      description: "capture approval scope probe",
      parameters: { type: "object", properties: {} },
      riskLevel: "moderate",
      requiresApproval: true,
      execute: capture,
    })
    dispatcher.register({
      name: "delivery_probe",
      description: "delivery approval scope probe",
      parameters: { type: "object", properties: {} },
      riskLevel: "moderate",
      requiresApproval: true,
      execute: delivery,
    })
    const approvals: string[] = []
    const detach = eventBus.on("approval.request", ({ toolName, resolve }) => {
      approvals.push(toolName)
      resolve(approvals.length === 1 ? "allow_run" : "deny")
    })
    const context = {
      sessionId: "session-operation-scope",
      runId: "run-operation-scope",
      requestGroupId: "group-operation-scope",
      workDir: process.cwd(),
      userMessage: "capture and deliver",
      source: "webui" as const,
      allowWebAccess: false,
      onProgress: () => undefined,
      signal: new AbortController().signal,
    }

    try {
      await expect(dispatcher.dispatch("capture_probe", { targetId: "target-a" }, context))
        .resolves.toMatchObject({ success: true })
      await expect(dispatcher.dispatch("capture_probe", { targetId: "target-a" }, context))
        .resolves.toMatchObject({ success: true })
      await expect(dispatcher.dispatch("capture_probe", { targetId: "target-b" }, context))
        .resolves.toMatchObject({ success: false, error: "denied" })
      await expect(dispatcher.dispatch("delivery_probe", {}, context))
        .resolves.toMatchObject({ success: false, error: "denied" })
    } finally {
      detach()
    }

    expect(approvals).toEqual(["capture_probe", "capture_probe", "delivery_probe"])
    expect(capture).toHaveBeenCalledTimes(2)
    expect(delivery).not.toHaveBeenCalled()
  })

  it("reuses an exact allow-run registry decision after dispatcher restart", async () => {
    insertSession({
      id: "session-approval-restart",
      source: "webui",
      source_id: null,
      created_at: Date.now(),
      updated_at: Date.now(),
      summary: null,
    })
    createRootRun({
      id: "run-approval-restart",
      sessionId: "session-approval-restart",
      prompt: "run exact approved operation",
      source: "webui",
      requestGroupId: "group-approval-restart",
    })
    const execute = vi.fn(async () => ({ success: true, output: "executed" }))
    const register = (dispatcher: ToolDispatcher) => dispatcher.register({
      name: "approval_restart_probe",
      description: "restart-safe approval registry probe",
      parameters: {
        type: "object",
        properties: { value: { type: "string" } },
      },
      riskLevel: "moderate",
      requiresApproval: true,
      execute,
    })
    const approvals: string[] = []
    const detach = eventBus.on("approval.request", ({ approvalId, resolve }) => {
      approvals.push(approvalId)
      resolve("allow_run")
    })
    const context = {
      sessionId: "session-approval-restart",
      runId: "run-approval-restart",
      requestGroupId: "group-approval-restart",
      workDir: process.cwd(),
      userMessage: "run exact approved operation",
      source: "webui" as const,
      allowWebAccess: false,
      onProgress: () => undefined,
      signal: new AbortController().signal,
    }

    try {
      const first = new ToolDispatcher({ config: DEFAULT_CONFIG })
      register(first)
      await expect(first.dispatch(
        "approval_restart_probe",
        { value: "exact" },
        context,
      )).resolves.toMatchObject({ success: true })

      const restarted = new ToolDispatcher({ config: DEFAULT_CONFIG })
      register(restarted)
      await expect(restarted.dispatch(
        "approval_restart_probe",
        { value: "exact" },
        context,
      )).resolves.toMatchObject({ success: true })
    } finally {
      detach()
    }

    expect(approvals).toHaveLength(1)
    expect(execute).toHaveBeenCalledTimes(2)
  })

  it("reuses approval and side-effect evidence for cosmetic params of one canonical operation", async () => {
    insertSession({
      id: "session-canonical-operation",
      source: "webui",
      source_id: null,
      created_at: Date.now(),
      updated_at: Date.now(),
      summary: null,
    })
    createRootRun({
      id: "run-canonical-operation",
      sessionId: "session-canonical-operation",
      prompt: "capture once",
      source: "webui",
      requestGroupId: "group-canonical-operation",
    })
    const canonicalRepository = new SqliteCanonicalWorkRepository(
      getDb(),
      () => Date.now(),
    )
    for (const event of [
      "DIAGNOSIS_ACCEPTED",
      "POLICY_ALLOWED",
      "EXECUTION_STARTED",
    ] as const) {
      const aggregate = canonicalRepository.load(
        "work:root:run-canonical-operation",
      )
      if (!aggregate) throw new Error("canonical aggregate missing")
      const transition = applyCanonicalWorkEvent({
        aggregate,
        expectedRevision: aggregate.revision,
        event,
        receiptRef: `fixture:${event}`,
      })
      if (!transition.applied) throw new Error(transition.reasonCode)
      expect(canonicalRepository.save({
        aggregate: transition.aggregate,
        expectedRevision: aggregate.revision,
      })).toEqual({ saved: true })
    }
    const dispatcher = new ToolDispatcher({ config: DEFAULT_CONFIG })
    const execute = vi.fn(async () => ({ success: true, output: "captured" }))
    dispatcher.register({
      name: "canonical_operation_probe",
      description: "canonical side-effect operation probe",
      parameters: { type: "object", properties: {} },
      riskLevel: "moderate",
      requiresApproval: true,
      sideEffect: {
        effectClass: "local_write",
        compensationSupport: "irreversible",
        canonicalOperation: (params: Record<string, unknown>) => ({
          targetId: params.targetId,
        }),
        targetRef: (params: Record<string, unknown>) => String(params.targetId),
        expectedState: () => ({ captured: true }),
        observe: async (params: Record<string, unknown>) => ({
          available: true,
          targetRef: String(params.targetId),
          expectedState: { captured: true },
          observedState: { captured: true },
        }),
      },
      execute,
    })
    const approvals: string[] = []
    const approvalBindings: Array<{
      operationId: string | null
      operationBindingHash: string | null
      continuationSchemaVersion: number | null
    }> = []
    const detach = eventBus.on("approval.request", ({ approvalId, toolName, resolve }) => {
      approvals.push(toolName)
      const row = getLatestApprovalForRun("run-canonical-operation")
      expect(row?.id).toBe(approvalId)
      approvalBindings.push({
        operationId: row?.operation_id ?? null,
        operationBindingHash: row?.operation_binding_hash ?? null,
        continuationSchemaVersion: row?.continuation_schema_version ?? null,
      })
      resolve(approvals.length === 1 ? "allow_run" : "deny")
    })
    const context = {
      sessionId: "session-canonical-operation",
      runId: "run-canonical-operation",
      requestGroupId: "group-canonical-operation",
      workDir: process.cwd(),
      userMessage: "capture once",
      source: "webui" as const,
      allowWebAccess: false,
      onProgress: () => undefined,
      signal: new AbortController().signal,
    }

    try {
      const firstResult = await dispatcher.dispatch("canonical_operation_probe", {
        targetId: "camera-a",
        outputPath: "/first",
        timeoutSec: 30,
      }, context)
      expect(firstResult).toMatchObject({
        success: true,
      })
      expect(canonicalRepository.load(
        "work:root:run-canonical-operation",
      )).toMatchObject({
        state: "EXECUTING",
        transitions: expect.arrayContaining([
          expect.objectContaining({ event: "APPROVAL_REQUESTED" }),
          expect.objectContaining({ event: "APPROVAL_CONSUMED" }),
        ]),
      })
      expect(getDb().prepare(
        `SELECT approval_id, operation_id, status
         FROM approved_operation_continuations
         WHERE run_id = ?`,
      ).all("run-canonical-operation")).toEqual([
        expect.objectContaining({
          operation_id: expect.stringMatching(/^operation:/u),
          status: "completed",
        }),
      ])
      await expect(dispatcher.dispatch("canonical_operation_probe", {
        targetId: "camera-a",
        outputPath: "/second",
        timeoutSec: 60,
      }, context)).resolves.toMatchObject({
        success: true,
        details: { kind: "side_effect_duplicate_verified" },
      })
      await expect(dispatcher.dispatch("canonical_operation_probe", {
        targetId: "camera-b",
        outputPath: "/second",
        timeoutSec: 60,
      }, context)).resolves.toMatchObject({
        success: false,
        error: "denied",
      })
    } finally {
      detach()
    }

    expect(approvals).toEqual([
      "canonical_operation_probe",
      "canonical_operation_probe",
    ])
    expect(approvalBindings).toEqual([
      {
        operationId: expect.stringMatching(/^operation:/u),
        operationBindingHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/u),
        continuationSchemaVersion: 1,
      },
      {
        operationId: expect.stringMatching(/^operation:/u),
        operationBindingHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/u),
        continuationSchemaVersion: 1,
      },
    ])
    expect(execute).toHaveBeenCalledTimes(1)
  })

  it("keeps a Telegram artifact delivery continuation pending until provider delivery is receipted", async () => {
    const sessionId = "session-telegram-delivery-continuation"
    const runId = "run-telegram-delivery-continuation"
    const requestGroupId = "group-telegram-delivery-continuation"
    insertSession({
      id: sessionId,
      source: "telegram",
      source_id: "telegram:7001:main",
      created_at: Date.now(),
      updated_at: Date.now(),
      summary: null,
    })
    createRootRun({
      id: runId,
      sessionId,
      prompt: "사진을 이 대화로 보내줘",
      source: "telegram",
      requestGroupId,
    })
    const canonicalRepository = new SqliteCanonicalWorkRepository(
      getDb(),
      () => Date.now(),
    )
    for (const event of [
      "DIAGNOSIS_ACCEPTED",
      "POLICY_ALLOWED",
      "EXECUTION_STARTED",
    ] as const) {
      const aggregate = canonicalRepository.load(`work:root:${runId}`)
      if (!aggregate) throw new Error("canonical aggregate missing")
      const transition = applyCanonicalWorkEvent({
        aggregate,
        expectedRevision: aggregate.revision,
        event,
        receiptRef: `fixture:${event}`,
      })
      if (!transition.applied) throw new Error(transition.reasonCode)
      expect(canonicalRepository.save({
        aggregate: transition.aggregate,
        expectedRevision: aggregate.revision,
      })).toEqual({ saved: true })
    }
    const execute = vi.fn(async () => ({
      success: true,
      output: "prepared",
    }))
    const dispatcher = new ToolDispatcher({ config: DEFAULT_CONFIG })
    dispatcher.register({
      name: "telegram_send_file",
      description: "Telegram artifact delivery continuation probe",
      parameters: {
        type: "object",
        properties: { artifactRef: { type: "string" } },
      },
      riskLevel: "moderate",
      requiresApproval: true,
      channelCapability: {
        kind: "direct_artifact_delivery",
        channel: "telegram",
      },
      execute,
    })
    const requested = new Promise<void>((resolveRequested) => {
      const detach = eventBus.on("approval.request", ({ resolve }) => {
        detach()
        resolve("allow_once")
        resolveRequested()
      })
    })
    const dispatch = dispatcher.dispatch(
      "telegram_send_file",
      {
        artifactRef:
          "artifact:11111111-1111-4111-8111-111111111111",
      },
      {
        sessionId,
        runId,
        requestGroupId,
        workDir: process.cwd(),
        userMessage: "사진을 이 대화로 보내줘",
        source: "telegram",
        allowWebAccess: false,
        onProgress: () => undefined,
        signal: new AbortController().signal,
      },
    )
    await requested
    await expect(dispatch).resolves.toMatchObject({ success: true })

    const approval = getLatestApprovalForRun(runId)
    expect(approval).toMatchObject({
      status: "consumed",
      tool_name: "telegram_send_file",
      operation_id: expect.stringMatching(/^operation:/u),
      operation_binding_hash:
        expect.stringMatching(/^sha256:[a-f0-9]{64}$/u),
      continuation_schema_version: 1,
    })
    expect(getDb().prepare(
      `SELECT status, operation_id
       FROM approved_operation_continuations
       WHERE approval_id = ?`,
    ).get(approval?.id)).toEqual({
      status: "pending",
      operation_id: approval?.operation_id,
    })
    expect(execute).toHaveBeenCalledOnce()
  })

  it("returns prior manual-intervention state without reapproval or redispatch for a cosmetic retry", async () => {
    insertSession({
      id: "session-canonical-manual",
      source: "webui",
      source_id: null,
      created_at: Date.now(),
      updated_at: Date.now(),
      summary: null,
    })
    createRootRun({
      id: "run-canonical-manual",
      sessionId: "session-canonical-manual",
      prompt: "capture once",
      source: "webui",
      requestGroupId: "group-canonical-manual",
    })
    const dispatcher = new ToolDispatcher({ config: DEFAULT_CONFIG })
    const execute = vi.fn(async () => ({ success: true, output: "capture uncertain" }))
    dispatcher.register({
      name: "canonical_manual_probe",
      description: "canonical manual-intervention probe",
      parameters: { type: "object", properties: {} },
      riskLevel: "moderate",
      requiresApproval: true,
      sideEffect: {
        effectClass: "local_write",
        compensationSupport: "irreversible",
        canonicalOperation: (params: Record<string, unknown>) => ({
          targetId: params.targetId,
        }),
        targetRef: (params: Record<string, unknown>) => String(params.targetId),
        expectedState: () => ({ captured: true }),
        observe: async (params: Record<string, unknown>) => ({
          available: true,
          targetRef: String(params.targetId),
          expectedState: { captured: true },
          observedState: { captured: false },
        }),
      },
      execute,
    })
    const approvals: string[] = []
    const detach = eventBus.on("approval.request", ({ toolName, resolve }) => {
      approvals.push(toolName)
      resolve("allow_run")
    })
    const context = {
      sessionId: "session-canonical-manual",
      runId: "run-canonical-manual",
      requestGroupId: "group-canonical-manual",
      workDir: process.cwd(),
      userMessage: "capture once",
      source: "webui" as const,
      allowWebAccess: false,
      onProgress: () => undefined,
      signal: new AbortController().signal,
    }

    try {
      await expect(dispatcher.dispatch("canonical_manual_probe", {
        targetId: "camera-a",
        outputPath: "/first",
        timeoutSec: 30,
      }, context)).resolves.toMatchObject({
        success: false,
        error: "SIDE_EFFECT_MANUAL_INTERVENTION",
      })
      await expect(dispatcher.dispatch("canonical_manual_probe", {
        targetId: "camera-a",
        outputPath: "/second",
        timeoutSec: 60,
      }, context)).resolves.toMatchObject({
        success: false,
        error: "SIDE_EFFECT_MANUAL_INTERVENTION",
        details: {
          kind: "side_effect_manual_intervention",
          reasonCode: "side_effect_existing_manual_intervention",
        },
      })
    } finally {
      detach()
    }

    expect(approvals).toEqual(["canonical_manual_probe"])
    expect(execute).toHaveBeenCalledTimes(1)
    expect(getDb().prepare(
      `SELECT status FROM approved_operation_continuations
       WHERE run_id = ?`,
    ).all("run-canonical-manual")).toEqual([
      { status: "completed" },
    ])
  })

  it.each(["allow_once", "allow_run"] as const)(
    "binds $approvalDecision approval through the side-effect ledger to the exact execution target",
    async (approvalDecision) => {
      insertSession({
        id: "session-target-approval",
        source: "telegram",
        source_id: "chat-current",
        created_at: Date.now(),
        updated_at: Date.now(),
        summary: null,
      })
      createRootRun({
        id: "run-target-approval",
        sessionId: "session-target-approval",
        prompt: "deliver the artifact",
        source: "telegram",
        requestGroupId: "group-target-approval",
      })
      const dispatcher = new ToolDispatcher({ config: DEFAULT_CONFIG })
      let observedReceipt: Readonly<ToolAuthorizationReceipt> | undefined
      const execute = vi.fn(async (
        params: Record<string, unknown>,
        ctx: ToolContext,
      ) => {
        observedReceipt = ctx.authorizationReceipt
        return {
          success: true,
          output: String(params.artifactRef),
        }
      })
      dispatcher.register({
        name: "target_approval_probe",
        description: "target-bound approval probe",
        parameters: {
          type: "object",
          properties: { artifactRef: { type: "string" } },
        },
        riskLevel: "moderate",
        requiresApproval: true,
        sideEffect: {
          effectClass: "external_write",
          compensationSupport: "irreversible",
          canonicalOperation: (operationParams: Record<string, unknown>) => ({
            artifactRef: operationParams.artifactRef,
          }),
          targetRef: () => "telegram:current-chat",
          expectedState: () => ({ delivered: true }),
          observe: async () => ({
            available: true,
            targetRef: "telegram:current-chat",
            expectedState: { delivered: true },
            observedState: { delivered: true },
          }),
        },
        execute,
      })
      const approvals: Array<Record<string, unknown>> = []
      const detach = eventBus.on("approval.request", ({ params, resolve }) => {
        approvals.push(params)
        resolve(approvals.length === 1 ? approvalDecision : "deny")
      })
      const context = {
        sessionId: "session-target-approval",
        runId: "run-target-approval",
        requestGroupId: "group-target-approval",
        workDir: process.cwd(),
        userMessage: "deliver the artifact",
        source: "telegram" as const,
        allowWebAccess: false,
        onProgress: () => undefined,
        signal: new AbortController().signal,
      }
      const params = { artifactRef: "artifact:camera:opaque" }
      const targetA = {
        authorizationScope: {
          executionTargetFingerprint: `sha256:${"a".repeat(64)}`,
        },
      }
      const targetB = {
        authorizationScope: {
          executionTargetFingerprint: `sha256:${"b".repeat(64)}`,
        },
      }

      try {
        const first = await dispatcher.dispatch("target_approval_probe", params, context, targetA)
        expect(first.error).toBeUndefined()
        expect(first).toMatchObject({ success: true })
        if (approvalDecision === "allow_run") {
          await expect(dispatcher.dispatch("target_approval_probe", params, context, targetA))
            .resolves.toMatchObject({ success: true })
        }
        await expect(dispatcher.dispatch("target_approval_probe", params, context, targetB))
          .resolves.toMatchObject({ success: false, error: "denied" })
      } finally {
        detach()
      }

      expect(approvals).toEqual([params, params])
      expect(JSON.stringify(approvals)).not.toContain("executionTargetFingerprint")
      const latestApproval = getLatestApprovalForRun("run-target-approval")
      expect(latestApproval?.params_hash).toBe(hashApprovalParams({
        toolParams: params,
        executionTargetFingerprint: targetB.authorizationScope.executionTargetFingerprint,
      }))
      expect(JSON.parse(latestApproval?.params_preview_json ?? "null")).toEqual(params)
      expect(observedReceipt).toMatchObject({
        executionTargetFingerprint: targetA.authorizationScope.executionTargetFingerprint,
      })
      expect(execute).toHaveBeenCalledTimes(1)
      expect(execute).toHaveBeenNthCalledWith(1, params, expect.anything())
    },
  )

  it("binds duplicate suppression to target scope without changing Tool params", async () => {
    insertSession({
      id: "session-target-dedupe",
      source: "telegram",
      source_id: "chat-current",
      created_at: Date.now(),
      updated_at: Date.now(),
      summary: null,
    })
    createRootRun({
      id: "run-target-dedupe",
      sessionId: "session-target-dedupe",
      prompt: "deliver the artifact",
      source: "telegram",
      requestGroupId: "group-target-dedupe",
    })
    const dispatcher = new ToolDispatcher({
      config: {
        ...DEFAULT_CONFIG,
        security: { ...DEFAULT_CONFIG.security, approvalMode: "off" },
      },
    })
    const execute = vi.fn(async (params: Record<string, unknown>) => ({
      success: true,
      output: String(params.artifactRef),
    }))
    dispatcher.register({
      name: "telegram_send_file",
      description: "target-bound dedupe probe",
      parameters: {
        type: "object",
        properties: { artifactRef: { type: "string" } },
      },
      riskLevel: "safe",
      requiresApproval: false,
      execute,
    })
    const context = {
      sessionId: "session-target-dedupe",
      runId: "run-target-dedupe",
      requestGroupId: "group-target-dedupe",
      workDir: process.cwd(),
      userMessage: "deliver the artifact",
      source: "telegram" as const,
      allowWebAccess: false,
      onProgress: () => undefined,
      signal: new AbortController().signal,
    }
    const params = { artifactRef: "artifact:camera:opaque" }
    const targetA = {
      authorizationScope: {
        executionTargetFingerprint: `sha256:${"a".repeat(64)}`,
      },
    }
    const targetB = {
      authorizationScope: {
        executionTargetFingerprint: `sha256:${"b".repeat(64)}`,
      },
    }

    await expect(dispatcher.dispatch("telegram_send_file", params, context, targetA))
      .resolves.toMatchObject({ success: true })
    await expect(dispatcher.dispatch("telegram_send_file", params, context, targetB))
      .resolves.toMatchObject({ success: true, output: "artifact:camera:opaque" })
    await expect(dispatcher.dispatch("telegram_send_file", params, context, targetB))
      .resolves.toMatchObject({ success: true, details: { kind: "duplicate_tool_suppressed" } })

    expect(execute).toHaveBeenCalledTimes(2)
    expect(execute).toHaveBeenNthCalledWith(1, params, expect.anything())
    expect(execute).toHaveBeenNthCalledWith(2, params, expect.anything())
  })

  it("snapshots explicit evidence source metadata at registration", async () => {
    const dispatcher = new ToolDispatcher({
      config: {
        ...DEFAULT_CONFIG,
        security: { ...DEFAULT_CONFIG.security, approvalMode: "off" },
      },
    })
    const tool = {
      name: "external_quote_probe",
      description: "source metadata probe",
      parameters: { type: "object" as const, properties: {} },
      riskLevel: "safe" as const,
      requiresApproval: false,
      evidenceSourceKind: "mcp" as const,
      async execute() {
        return { success: true, output: "quote=123" }
      },
    }
    dispatcher.register(tool)
    ;(tool as { evidenceSourceKind: string }).evidenceSourceKind = "skill"

    const result = await dispatcher.dispatch("external_quote_probe", {}, {
      sessionId: "session-source",
      runId: "run-source",
      requestGroupId: "group-source",
      workDir: process.cwd(),
      userMessage: "quote",
      source: "webui",
      allowWebAccess: false,
      onProgress: () => undefined,
      signal: new AbortController().signal,
    })

    expect(result.evidenceSource).toMatchObject({
      sourceKind: "mcp",
      trustClass: "untrusted_external",
      instructionIsolation: "data_only",
    })
    expect(result.evidenceSource?.sourceRef).toMatch(/^tool-result:mcp:[a-f0-9]{64}$/u)
    expect(JSON.stringify(result.evidenceSource)).not.toContain("quote=123")
    expect(JSON.stringify(result.evidenceSource)).not.toContain("group-source")
  })

  it("preserves the same evidence source receipt when an exact call is deduplicated", async () => {
    insertSession({
      id: "session-source-replay",
      source: "webui",
      source_id: null,
      created_at: Date.now(),
      updated_at: Date.now(),
      summary: null,
    })
    createRootRun({
      id: "run-source-replay",
      sessionId: "session-source-replay",
      prompt: "quote",
      source: "webui",
      requestGroupId: "group-source-replay",
    })
    const dispatcher = new ToolDispatcher({
      config: {
        ...DEFAULT_CONFIG,
        security: { ...DEFAULT_CONFIG.security, approvalMode: "off" },
      },
    })
    const execute = vi.fn(async () => ({ success: true, output: "capture" }))
    dispatcher.register({
      name: "web_fetch",
      description: "dedupe source probe",
      parameters: { type: "object", properties: {} },
      riskLevel: "safe",
      requiresApproval: false,
      evidenceSourceKind: "mcp",
      execute,
    })
    const context = {
      sessionId: "session-source-replay",
      runId: "run-source-replay",
      requestGroupId: "group-source-replay",
      workDir: process.cwd(),
      userMessage: "capture",
      source: "webui" as const,
      allowWebAccess: true,
      onProgress: () => undefined,
      signal: new AbortController().signal,
    }

    const detach = eventBus.on("approval.request", ({ resolve }) => resolve("allow_once"))
    const first = await dispatcher.dispatch("web_fetch", { url: "https://finance.example/quote" }, context)
    const replay = await dispatcher.dispatch("web_fetch", { url: "https://finance.example/quote" }, context)
    detach()

    expect(execute).toHaveBeenCalledTimes(1)
    expect(replay.evidenceSource).toEqual(first.evidenceSource)
    expect(replay.evidenceSource?.sourceKind).toBe("mcp")
  })

  it("does not execute a sensitive Yeonjang operation when safe-default approval is denied", async () => {
    insertSession({
      id: "session-sensitive-boundary",
      source: "webui",
      source_id: null,
      created_at: Date.now(),
      updated_at: Date.now(),
      summary: null,
    })
    createRootRun({
      id: "run-sensitive-boundary",
      sessionId: "session-sensitive-boundary",
      prompt: "파일을 변경해줘",
      source: "webui",
    })
    const dispatcher = new ToolDispatcher({
      config: {
        ...DEFAULT_CONFIG,
        security: {
          ...DEFAULT_CONFIG.security,
          approvalMode: "off",
        },
      },
    })
    const execute = vi.fn(async () => ({ success: true, output: "must not execute" }))
    dispatcher.register({
      name: "file_write",
      description: "sensitive boundary probe",
      parameters: { type: "object", properties: {} },
      riskLevel: "safe",
      requiresApproval: false,
      execute,
    })
    const detach = eventBus.on("approval.request", ({ resolve }) => resolve("deny"))

    try {
      const result = await dispatcher.dispatch("file_write", {}, {
        sessionId: "session-sensitive-boundary",
        runId: "run-sensitive-boundary",
        requestGroupId: "run-sensitive-boundary",
        workDir: process.cwd(),
        userMessage: "파일을 변경해줘",
        source: "webui",
        allowWebAccess: false,
        onProgress: () => undefined,
        signal: new AbortController().signal,
      })

      expect(result).toMatchObject({ success: false, error: "denied" })
      expect(execute).not.toHaveBeenCalled()
    } finally {
      detach()
    }
  })

  it("passes an exact policy authorization receipt to the tool adapter", async () => {
    const dispatcher = new ToolDispatcher({ config: DEFAULT_CONFIG })
    let observedReceipt: Readonly<ToolAuthorizationReceipt> | undefined
    dispatcher.register({
      name: "receipt_probe",
      description: "captures dispatcher authorization",
      parameters: { type: "object", properties: { value: { type: "string" } } },
      riskLevel: "safe",
      requiresApproval: false,
      async execute(_params, ctx) {
        observedReceipt = ctx.authorizationReceipt
        return { success: true, output: "ok" }
      },
    })
    const params = { value: "exact-scope" }

    const result = await dispatcher.dispatch("receipt_probe", params, {
      sessionId: "session-receipt",
      runId: "run-receipt",
      requestGroupId: "group-receipt",
      workDir: process.cwd(),
      userMessage: "probe",
      source: "webui",
      allowWebAccess: false,
      onProgress: () => undefined,
      signal: new AbortController().signal,
    })

    expect(result.success).toBe(true)
    expect(observedReceipt).toMatchObject({
      toolName: "receipt_probe",
      paramsHash: hashApprovalParams(params),
      runId: "run-receipt",
      requestGroupId: "group-receipt",
    })
    expect(observedReceipt?.policyDecisionId).toEqual(expect.any(String))
  })

  it("rejects channel-specific tools on unsupported sources", async () => {
    const dispatcher = new ToolDispatcher({ config: DEFAULT_CONFIG })
    dispatcher.register({
      name: "telegram_send_file",
      description: "telegram only",
      parameters: { type: "object", properties: {} },
      riskLevel: "safe",
      requiresApproval: false,
      availableSources: ["telegram"],
      async execute() {
        return { success: true, output: "ok" }
      },
    })

    const result = await dispatcher.dispatch(
      "telegram_send_file",
      {},
      {
        sessionId: "session-1",
        runId: "run-1",
        workDir: process.cwd(),
        userMessage: "send it to slack",
        source: "slack",
        allowWebAccess: false,
        onProgress: () => undefined,
        signal: new AbortController().signal,
      },
    )

    expect(result.success).toBe(false)
    expect(result.error).toBe("TOOL_SOURCE_NOT_SUPPORTED")
  })

  it("emits request group metadata on tool lifecycle events", async () => {
    const dispatcher = new ToolDispatcher({ config: DEFAULT_CONFIG })
    dispatcher.register({
      name: "echo_tool",
      description: "returns ok",
      parameters: { type: "object", properties: {} },
      riskLevel: "safe",
      requiresApproval: false,
      async execute() {
        return { success: true, output: "ok" }
      },
    })

    const seenBefore: Array<{ requestGroupId?: string; toolName: string }> = []
    const seenAfter: Array<{ requestGroupId?: string; toolName: string }> = []
    const detachBefore = eventBus.on("tool.before", (payload) => {
      seenBefore.push({ requestGroupId: payload.requestGroupId, toolName: payload.toolName })
    })
    const detachAfter = eventBus.on("tool.after", (payload) => {
      seenAfter.push({ requestGroupId: payload.requestGroupId, toolName: payload.toolName })
    })

    try {
      const result = await dispatcher.dispatch(
        "echo_tool",
        {},
        {
          sessionId: "session-1",
          runId: "run-1",
          requestGroupId: "group-1",
          workDir: process.cwd(),
          userMessage: "run it",
          source: "webui",
          allowWebAccess: false,
          onProgress: () => undefined,
          signal: new AbortController().signal,
        },
      )

      expect(result.success).toBe(true)
      expect(seenBefore).toContainEqual({ requestGroupId: "group-1", toolName: "echo_tool" })
      expect(seenAfter).toContainEqual({ requestGroupId: "group-1", toolName: "echo_tool" })
    } finally {
      detachBefore()
      detachAfter()
    }
  })

  it("redacts thrown tool errors before returning tool results", async () => {
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true)
    const dispatcher = new ToolDispatcher({ config: DEFAULT_CONFIG })
    const secret = "sk-task0584-tool-secret-1234567890"
    const localPath = "/Users/dongwooshin/private/tool-secret.txt"
    dispatcher.register({
      name: "throwing_tool",
      description: "throws",
      parameters: { type: "object", properties: {} },
      riskLevel: "safe",
      requiresApproval: false,
      async execute() {
        throw new Error(`provider failed token=${secret} path=${localPath}`)
      },
    })

    const result = await dispatcher.dispatch(
      "throwing_tool",
      {},
      {
        sessionId: "session-redaction",
        runId: "run-redaction",
        workDir: process.cwd(),
        userMessage: "run throwing tool",
        source: "webui",
        allowWebAccess: false,
        onProgress: () => undefined,
        signal: new AbortController().signal,
      },
    )

    const logOutput = stderr.mock.calls.map((call) => String(call[0])).join("")
    const resultText = JSON.stringify(result)
    expect(result.success).toBe(false)
    expect(resultText).toContain("token=***")
    expect(resultText).toContain("[internal-path-redacted]")
    expect(logOutput).toContain("token=***")
    expect(logOutput).toContain("[internal-path-redacted]")
    expect(`${resultText}\n${logOutput}`).not.toContain(secret)
    expect(`${resultText}\n${logOutput}`).not.toContain(localPath)
    stderr.mockRestore()
  })

  it("does not use raw error expressions for dispatcher failure payloads", () => {
    const source = readFileSync(
      new URL("../packages/core/src/tools/dispatcher.ts", import.meta.url),
      "utf-8",
    )

    expect(source).toContain("function safeDispatcherErrorMessage")
    expect(source).toContain("const message = safeDispatcherErrorMessage(error)")
    expect(source).toContain("const msg = safeDispatcherErrorMessage(err)")
    expect(source).not.toContain(
      "approval continuity update failed: ${error instanceof Error ? error.message : String(error)}",
    )
    expect(source).not.toContain(
      "const message = error instanceof Error ? error.message : String(error)",
    )
    expect(source).not.toContain("const msg = err instanceof Error ? err.message : String(err)")
  })
})
