import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { Database } from "better-sqlite3"
import {
  closeDb,
  getTaskContinuity,
  insertSchedule,
  insertScheduleRun,
  insertSession,
  insertMessageLedgerEvent,
  listMessageLedgerEvents,
  upsertTaskContinuity,
} from "../packages/core/src/db/index.js"
import { SqliteCanonicalWorkRepository } from "../packages/core/src/db/canonical-work-repository.ts"
import { SqliteCanonicalWorkReceiptRepository } from "../packages/core/src/db/canonical-work-receipt-repository.ts"
import { SqliteCanonicalPendingResponseRepository } from "../packages/core/src/db/canonical-pending-response-repository.ts"
import { applyCanonicalWorkEvent } from "../packages/core/src/contracts/canonical-work-aggregate.ts"
import { recoverCanonicalPendingResponsesOnStartup } from "../packages/core/src/runs/canonical-pending-response-recovery-runtime.ts"
import { deliverArtifactOnce, resetArtifactDeliveryDedupeForTest } from "../packages/core/src/runs/delivery.ts"
import { getLastStartupRecoverySummary } from "../packages/core/src/runs/startup-recovery.js"
import { createRootRun, getRootRun, recoverActiveRunsOnStartup, updateRunStatus } from "../packages/core/src/runs/store.ts"
import { initializeTestDbRuntime } from "./fixtures/runtime-db.ts"
import { buildCanonicalPendingResponseReviewEnvelope } from "../packages/core/src/runs/canonical-pending-response-review.ts"
import { buildLlmResponseReviewReceipt } from "../packages/core/src/runs/user-facing-response-gate.ts"

const tempDirs: string[] = []
let db: Database
let currentStateDir = ""

function useTempState(): void {
  closeDb()
  const stateDir = mkdtempSync(join(tmpdir(), "knowbee-task006-startup-"))
  tempDirs.push(stateDir)
  currentStateDir = stateDir
  db = initializeTestDbRuntime(stateDir)
}

function seedSession(id: string, source = "webui"): void {
  insertSession({
    id,
    source,
    source_id: null,
    created_at: Date.now(),
    updated_at: Date.now(),
    summary: null,
  })
}

beforeEach(() => {
  useTempState()
})

afterEach(() => {
  resetArtifactDeliveryDedupeForTest()
  closeDb()
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

describe("task006 startup recovery chaos fixtures", () => {
  it("replays a staged canonical response after a crash before delivery", async () => {
    seedSession("session-outbox")
    createRootRun({
      id: "run-outbox",
      sessionId: "session-outbox",
      requestGroupId: "group-outbox",
      prompt: "결과 전달",
      source: "webui",
    })
    updateRunStatus("run-outbox", "running", "최종 전달 대기", true)
    const repository = new SqliteCanonicalWorkRepository(db, () => Date.now())
    let aggregate = repository.load("work:root:run-outbox")
    if (!aggregate) throw new Error("canonical aggregate expected")
    for (const [event, receiptRef] of [
      ["DIAGNOSIS_ACCEPTED", "outbox:diagnosis"],
      ["POLICY_ALLOWED", "outbox:policy"],
      ["EXECUTION_STARTED", "outbox:execution"],
      ["ATTEMPT_RECORDED", "outbox:attempt"],
      ["ALL_CRITERIA_VERIFIED", "outbox:verification"],
    ] as const) {
      const applied = applyCanonicalWorkEvent({ aggregate, expectedRevision: aggregate.revision, event, receiptRef })
      if (!applied.applied) throw new Error("canonical transition fixture failed")
      repository.save({ aggregate: applied.aggregate, expectedRevision: aggregate.revision })
      aggregate = applied.aggregate
    }
    const pendingRepository = new SqliteCanonicalPendingResponseRepository(db, () => Date.now())
    const rawText = "복구 대상 검토 입력"
    const responseText = "복구해서 전달할 최종 응답"
    pendingRepository.stage({
      runId: "run-outbox",
      workId: "work:root:run-outbox",
      sessionId: "session-outbox",
      source: "webui",
      text: responseText,
      textSource: "llm_reviewed",
      finalOutcome: "succeeded",
      reviewEnvelope: buildCanonicalPendingResponseReviewEnvelope({
        rawText,
        rawTextSource: "llm_reviewed",
        contentKind: "final_report",
        expectedLanguage: "ko",
        receipt: buildLlmResponseReviewReceipt({
          rawText,
          responseText,
          rawTextSource: "llm_reviewed",
          contentKind: "final_report",
        }),
      }),
    })
    closeDb()
    db = initializeTestDbRuntime(currentStateDir)

    const stagedRecovery = recoverActiveRunsOnStartup()
    expect(stagedRecovery).toContainEqual(expect.objectContaining({
      id: "run-outbox",
      status: "awaiting_user",
    }))
    expect(getLastStartupRecoverySummary().runs).toContainEqual(expect.objectContaining({
      runId: "run-outbox",
      recoveryStatus: "pending_delivery",
      duplicateRisk: true,
    }))

    const result = await recoverCanonicalPendingResponsesOnStartup()
    const restoredRepository = new SqliteCanonicalWorkRepository(db, () => Date.now())
    const restoredPendingRepository = new SqliteCanonicalPendingResponseRepository(db, () => Date.now())

    expect(result).toEqual({ recovered: 1, failed: 0, skipped: 0 })
    expect(restoredRepository.load("work:root:run-outbox")?.state).toBe("USER_REPORT")
    expect(getRootRun("run-outbox")?.status).toBe("completed")
    expect(restoredPendingRepository.load("run-outbox")?.status).toBe("consumed")
  })

  it("replays one receipt-authorized cancellation report after restart", async () => {
    seedSession("session-cancel-outbox")
    createRootRun({
      id: "run-cancel-outbox",
      sessionId: "session-cancel-outbox",
      requestGroupId: "group-cancel-outbox",
      prompt: "취소 후 보고",
      source: "webui",
    })
    const workId = "work:root:run-cancel-outbox"
    const workRepository = new SqliteCanonicalWorkRepository(db, () => Date.now())
    const receiptRepository = new SqliteCanonicalWorkReceiptRepository(db, () => Date.now())
    const receiptId = "receipt:cancellation:run-cancel-outbox:restart"
    expect(
      receiptRepository.issue({
        receiptId,
        workId,
        kind: "cancellation",
        evidenceFingerprint: `sha256:${"c".repeat(64)}`,
        evidenceRefs: ["cancellation-token:restart"],
      }),
    ).toEqual({ issued: true })
    const aggregate = workRepository.load(workId)
    if (!aggregate) throw new Error("canonical aggregate expected")
    const cancelled = applyCanonicalWorkEvent({
      aggregate,
      expectedRevision: aggregate.revision,
      event: "USER_CANCELLED",
      receiptRef: receiptId,
    })
    if (!cancelled.applied) throw new Error("canonical cancellation fixture failed")
    expect(workRepository.save({ aggregate: cancelled.aggregate, expectedRevision: 0 })).toEqual({
      saved: true,
    })
    expect(receiptRepository.consume({ receiptId, workId, revision: 1 })).toEqual({
      consumed: true,
    })
    updateRunStatus("run-cancel-outbox", "cancelled", "취소됨", false)
    const rawText = "취소 보고 검토 입력"
    const responseText = "요청한 실행을 취소했습니다."
    new SqliteCanonicalPendingResponseRepository(db, () => Date.now()).stage({
      runId: "run-cancel-outbox",
      workId,
      sessionId: "session-cancel-outbox",
      source: "webui",
      text: responseText,
      textSource: "llm_reviewed",
      finalOutcome: "cancelled",
      reviewEnvelope: buildCanonicalPendingResponseReviewEnvelope({
        rawText,
        rawTextSource: "llm_reviewed",
        contentKind: "final_report",
        expectedLanguage: "ko",
        receipt: buildLlmResponseReviewReceipt({
          rawText,
          responseText,
          rawTextSource: "llm_reviewed",
          contentKind: "final_report",
        }),
      }),
    })
    closeDb()
    db = initializeTestDbRuntime(currentStateDir)

    const result = await recoverCanonicalPendingResponsesOnStartup()

    expect(result).toEqual({ recovered: 1, failed: 0, skipped: 0 })
    expect(new SqliteCanonicalWorkRepository(db, () => Date.now()).load(workId)?.state).toBe(
      "USER_REPORT",
    )
    expect(
      listMessageLedgerEvents({ runId: "run-cancel-outbox", limit: 100 }).filter(
        (event) => event.event_kind === "final_answer_delivered",
      ),
    ).toHaveLength(1)
  })

  it("keeps a legacy pending response when its review envelope is missing", async () => {
    seedSession("session-unreviewed")
    createRootRun({
      id: "run-unreviewed",
      sessionId: "session-unreviewed",
      requestGroupId: "group-unreviewed",
      prompt: "결과 전달",
      source: "webui",
    })
    updateRunStatus("run-unreviewed", "running", "최종 전달 대기", true)
    const workRepository = new SqliteCanonicalWorkRepository(db, () => Date.now())
    let aggregate = workRepository.load("work:root:run-unreviewed")
    if (!aggregate) throw new Error("canonical aggregate expected")
    for (const [event, receiptRef] of [
      ["DIAGNOSIS_ACCEPTED", "unreviewed:diagnosis"],
      ["POLICY_ALLOWED", "unreviewed:policy"],
      ["EXECUTION_STARTED", "unreviewed:execution"],
      ["ATTEMPT_RECORDED", "unreviewed:attempt"],
      ["ALL_CRITERIA_VERIFIED", "unreviewed:verification"],
    ] as const) {
      const applied = applyCanonicalWorkEvent({
        aggregate,
        expectedRevision: aggregate.revision,
        event,
        receiptRef,
      })
      if (!applied.applied) throw new Error("canonical transition fixture failed")
      workRepository.save({ aggregate: applied.aggregate, expectedRevision: aggregate.revision })
      aggregate = applied.aggregate
    }
    const rawText = "검토 입력"
    const responseText = "전달하면 안 되는 레거시 응답"
    const pendingRepository = new SqliteCanonicalPendingResponseRepository(db, () => Date.now())
    pendingRepository.stage({
      runId: "run-unreviewed",
      workId: "work:root:run-unreviewed",
      sessionId: "session-unreviewed",
      source: "webui",
      text: responseText,
      textSource: "llm_reviewed",
      finalOutcome: "succeeded",
      reviewEnvelope: buildCanonicalPendingResponseReviewEnvelope({
        rawText,
        rawTextSource: "llm_reviewed",
        contentKind: "final_report",
        expectedLanguage: "ko",
        receipt: buildLlmResponseReviewReceipt({
          rawText,
          responseText,
          rawTextSource: "llm_reviewed",
          contentKind: "final_report",
        }),
      }),
    })
    db.prepare("UPDATE canonical_pending_responses SET review_envelope_json = NULL WHERE run_id = ?")
      .run("run-unreviewed")
    closeDb()
    db = initializeTestDbRuntime(currentStateDir)

    const result = await recoverCanonicalPendingResponsesOnStartup()
    const restoredPending = new SqliteCanonicalPendingResponseRepository(db, () => Date.now())

    expect(result).toEqual({ recovered: 0, failed: 1, skipped: 0 })
    expect(restoredPending.loadPending("run-unreviewed")).toMatchObject({
      status: "pending",
      reviewIssue: "review_envelope_missing",
    })
    expect(new SqliteCanonicalWorkRepository(db, () => Date.now())
      .load("work:root:run-unreviewed")?.state).toBe("SUCCEEDED")
    expect(listMessageLedgerEvents({ runId: "run-unreviewed", limit: 100 }))
      .not.toContainEqual(expect.objectContaining({ event_kind: "final_answer_delivered" }))
  })

  it("finishes a committed canonical delivery after restart without sending it again", () => {
    seedSession("session-canonical", "telegram")
    createRootRun({
      id: "run-canonical",
      sessionId: "session-canonical",
      requestGroupId: "group-canonical",
      prompt: "완료 결과 전송",
      source: "telegram",
    })
    updateRunStatus("run-canonical", "running", "최종 전달 전이 대기", true)
    const repository = new SqliteCanonicalWorkRepository(db, () => Date.now())
    let aggregate = repository.load("work:root:run-canonical")
    if (!aggregate) throw new Error("canonical aggregate expected")
    for (const [event, receiptRef] of [
      ["DIAGNOSIS_ACCEPTED", "fixture:diagnosis"],
      ["POLICY_ALLOWED", "fixture:policy"],
      ["EXECUTION_STARTED", "fixture:execution"],
      ["ATTEMPT_RECORDED", "fixture:attempt"],
      ["ALL_CRITERIA_VERIFIED", "fixture:verification"],
    ] as const) {
      const applied = applyCanonicalWorkEvent({ aggregate, expectedRevision: aggregate.revision, event, receiptRef })
      if (!applied.applied) throw new Error("canonical transition fixture failed")
      repository.save({ aggregate: applied.aggregate, expectedRevision: aggregate.revision })
      aggregate = applied.aggregate
    }
    insertMessageLedgerEvent({
      id: "ledger-canonical-final",
      runId: "run-canonical",
      requestGroupId: "group-canonical",
      sessionKey: "session-canonical",
      threadKey: "group-canonical",
      channel: "telegram",
      eventKind: "final_answer_delivered",
      deliveryKey: "final:run-canonical:telegram",
      idempotencyKey: "final-answer:run-canonical:telegram",
      status: "delivered",
      summary: "committed before restart",
      detail: { providerEvidence: "confirmed" },
    })

    const recovered = recoverActiveRunsOnStartup()

    expect(recovered.map((run) => run.id)).toContain("run-canonical")
    expect(repository.load("work:root:run-canonical")?.state).toBe("USER_REPORT")
    expect(getRootRun("run-canonical")?.status).toBe("completed")
    expect(getLastStartupRecoverySummary().runs).toContainEqual(expect.objectContaining({
      runId: "run-canonical",
      recoveryStatus: "delivered",
      duplicateRisk: false,
    }))
  })

  it("quarantines a terminal RootRun with a non-terminal aggregate without changing its history", () => {
    seedSession("session-terminal-mismatch")
    createRootRun({
      id: "run-terminal-mismatch",
      sessionId: "session-terminal-mismatch",
      requestGroupId: "group-terminal-mismatch",
      prompt: "종료 이력 보존",
      source: "webui",
    })
    updateRunStatus(
      "run-terminal-mismatch",
      "failed",
      "검증된 기존 실패 요약",
      false,
    )
    const before = getRootRun("run-terminal-mismatch")
    const continuityBefore = getTaskContinuity("group-terminal-mismatch")

    expect(recoverActiveRunsOnStartup()).toEqual([])
    expect(recoverActiveRunsOnStartup()).toEqual([])

    expect(getRootRun("run-terminal-mismatch")).toEqual(before)
    expect(getTaskContinuity("group-terminal-mismatch")).toEqual(continuityBefore)
    expect(
      db.prepare<[], { count: number }>(
        `SELECT COUNT(*) AS count
         FROM diagnostic_events
         WHERE run_id = 'run-terminal-mismatch'
           AND kind = 'canonical_startup_reconciliation_required'`,
      ).get()?.count,
    ).toBe(1)
    expect(getLastStartupRecoverySummary().runs).toContainEqual(expect.objectContaining({
      runId: "run-terminal-mismatch",
      previousStatus: "failed",
      recoveryStatus: "stale",
      duplicateRisk: false,
    }))
  })

  it("interrupts a manifest mismatch without overwriting the existing run summary or events", () => {
    seedSession("session-manifest-mismatch")
    createRootRun({
      id: "run-manifest-mismatch",
      sessionId: "session-manifest-mismatch",
      requestGroupId: "group-manifest-mismatch",
      prompt: "manifest 보호",
      source: "webui",
    })
    updateRunStatus(
      "run-manifest-mismatch",
      "running",
      "재시작 전 검증된 진행 요약",
      true,
    )
    db.prepare("UPDATE root_runs SET runtime_manifest_id = ? WHERE id = ?")
      .run("manifest:previous-runtime", "run-manifest-mismatch")
    const repository = new SqliteCanonicalWorkRepository(db, () => Date.now())
    const aggregate = repository.load("work:root:run-manifest-mismatch")
    if (!aggregate) throw new Error("canonical aggregate expected")
    const analyzed = applyCanonicalWorkEvent({
      aggregate,
      expectedRevision: aggregate.revision,
      event: "DIAGNOSIS_ACCEPTED",
      receiptRef: "manifest-mismatch:diagnosis",
    })
    if (!analyzed.applied) throw new Error("canonical transition fixture failed")
    repository.save({ aggregate: analyzed.aggregate, expectedRevision: aggregate.revision })
    const before = getRootRun("run-manifest-mismatch")

    expect(recoverActiveRunsOnStartup()).toContainEqual(expect.objectContaining({
      id: "run-manifest-mismatch",
      status: "interrupted",
      summary: "재시작 전 검증된 진행 요약",
    }))
    const afterFirstRecovery = getRootRun("run-manifest-mismatch")
    expect(afterFirstRecovery?.recentEvents).toEqual(before?.recentEvents)
    expect(getTaskContinuity("group-manifest-mismatch")).toMatchObject({
      status: "interrupted",
      lastGoodState: "재시작 전 검증된 진행 요약",
    })

    expect(recoverActiveRunsOnStartup()).toEqual([])
    expect(getRootRun("run-manifest-mismatch")).toEqual(afterFirstRecovery)
    const diagnostics = db.prepare<[], { count: number; detail_json: string }>(
      `SELECT COUNT(*) AS count, detail_json
       FROM diagnostic_events
       WHERE run_id = 'run-manifest-mismatch'
         AND kind = 'canonical_startup_reconciliation_required'`,
    ).get()
    expect(diagnostics?.count).toBe(1)
    expect(JSON.parse(diagnostics?.detail_json ?? "{}")).toMatchObject({
      reasonCode: "canonical_recovery_manifest_mismatch",
      aggregateState: "SOLUTION_ANALYZED",
      aggregateRevision: 1,
    })
  })

  it("keeps pending approval as awaiting approval without auto execution", () => {
    seedSession("session-approval")
    createRootRun({
      id: "run-approval",
      sessionId: "session-approval",
      requestGroupId: "group-approval",
      prompt: "메인 화면 캡처",
      source: "webui",
    })
    updateRunStatus("run-approval", "awaiting_approval", "screen_capture 승인 대기", true)

    const recovered = recoverActiveRunsOnStartup()
    const run = getRootRun("run-approval")
    const continuity = getTaskContinuity("group-approval")
    const summary = getLastStartupRecoverySummary()

    expect(recovered.map((item) => item.id)).toContain("run-approval")
    expect(run?.status).toBe("awaiting_approval")
    expect(continuity).toMatchObject({
      lineageRootRunId: "group-approval",
      status: "awaiting_approval",
      pendingApprovals: ["approval:run-approval"],
      pendingDelivery: [],
    })
    expect(summary.awaitingApprovalCount).toBe(1)
    expect(summary.runs[0]).toMatchObject({ recoveryStatus: "awaiting_approval", duplicateRisk: false })
  })

  it("marks running tool state without receipt as interrupted and does not rerun", () => {
    seedSession("session-running")
    createRootRun({
      id: "run-running",
      sessionId: "session-running",
      requestGroupId: "group-running",
      prompt: "파일 삭제 실행",
      source: "webui",
    })
    updateRunStatus("run-running", "running", "도구 실행 중", true)

    const recovered = recoverActiveRunsOnStartup()
    const run = getRootRun("run-running")
    const continuity = getTaskContinuity("group-running")
    const summary = getLastStartupRecoverySummary()

    expect(recovered.map((item) => item.id)).toContain("run-running")
    expect(run?.status).toBe("interrupted")
    expect(run?.canCancel).toBe(false)
    expect(continuity?.status).toBe("interrupted")
    expect(summary.interruptedRunCount).toBe(1)
    expect(summary.runs[0]).toMatchObject({ recoveryStatus: "interrupted", duplicateRisk: true })
  })

  it("keeps completed tool with pending delivery in user-confirmation state", () => {
    seedSession("session-delivery", "slack")
    createRootRun({
      id: "run-delivery",
      sessionId: "session-delivery",
      requestGroupId: "group-delivery",
      prompt: "캡처해서 슬랙으로 보내줘",
      source: "slack",
    })
    updateRunStatus("run-delivery", "running", "파일 전달 대기", true)
    upsertTaskContinuity({
      lineageRootRunId: "group-delivery",
      lastToolReceipt: "screen_capture:/tmp/screen.png",
      pendingDelivery: ["slack:file:/tmp/screen.png"],
      status: "pending_delivery",
    })

    recoverActiveRunsOnStartup()
    const run = getRootRun("run-delivery")
    const continuity = getTaskContinuity("group-delivery")
    const summary = getLastStartupRecoverySummary()

    expect(run?.status).toBe("awaiting_user")
    expect(continuity).toMatchObject({
      status: "pending_delivery",
      pendingDelivery: ["slack:file:/tmp/screen.png"],
      lastToolReceipt: "screen_capture:/tmp/screen.png",
    })
    expect(summary.pendingDeliveryCount).toBe(1)
    expect(summary.runs[0]).toMatchObject({ recoveryStatus: "pending_delivery", duplicateRisk: true })
  })

  it("does not duplicate completed artifact delivery after restart", async () => {
    seedSession("session-delivered", "telegram")
    createRootRun({
      id: "run-delivered",
      sessionId: "session-delivered",
      requestGroupId: "group-delivered",
      prompt: "사진 보내줘",
      source: "telegram",
    })
    upsertTaskContinuity({
      lineageRootRunId: "group-delivered",
      lastDeliveryReceipt: "telegram:/tmp/photo.png",
      pendingDelivery: [],
      status: "delivered",
    })

    recoverActiveRunsOnStartup()
    const deliveryTask = vi.fn(async () => "sent")
    const result = await deliverArtifactOnce({
      runId: "run-delivered",
      channel: "telegram",
      filePath: "/tmp/photo.png",
      task: deliveryTask,
    })

    expect(getRootRun("run-delivered")?.status).toBe("completed")
    expect(result).toBeUndefined()
    expect(deliveryTask).not.toHaveBeenCalled()
    expect(getLastStartupRecoverySummary().deliveredCount).toBe(1)
  })

  it("marks unfinished schedule runs interrupted on startup", () => {
    const now = Date.now()
    insertSchedule({
      id: "schedule-1",
      name: "TASK006 chaos schedule",
      cron_expression: "*/5 * * * *",
      prompt: "상태 보고",
      enabled: 1,
      target_channel: "webui",
      target_session_id: null,
      execution_driver: "internal",
      origin_run_id: null,
      origin_request_group_id: null,
      model: null,
      max_retries: 0,
      timeout_sec: 60,
      created_at: now,
      updated_at: now,
    })
    insertScheduleRun({
      id: "schedule-run-open",
      schedule_id: "schedule-1",
      started_at: now,
      finished_at: null,
      success: null,
      summary: null,
      error: null,
    })

    recoverActiveRunsOnStartup()
    const row = db
      .prepare<[string], { finished_at: number | null; success: number | null; error: string | null }>(
        "SELECT finished_at, success, error FROM schedule_runs WHERE id = ?",
      )
      .get("schedule-run-open")

    expect(row?.finished_at).toBeTypeOf("number")
    expect(row?.success).toBe(0)
    expect(row?.error).toContain("daemon restart")
    expect(getLastStartupRecoverySummary().interruptedScheduleRunCount).toBe(1)
  })

  it("uses artifact delivery lock to avoid concurrent duplicate sends", async () => {
    let resolveDelivery: ((value: string) => void) | undefined
    const deliveryTask = vi.fn(() => new Promise<string>((resolve) => { resolveDelivery = resolve }))

    const first = deliverArtifactOnce({ runId: "run-lock", channel: "slack", filePath: "/tmp/locked.png", task: deliveryTask })
    const second = deliverArtifactOnce({ runId: "run-lock", channel: "slack", filePath: "/tmp/locked.png", task: deliveryTask })

    resolveDelivery?.("sent")

    await expect(first).resolves.toBe("sent")
    await expect(second).resolves.toBeUndefined()
    expect(deliveryTask).toHaveBeenCalledTimes(1)
  })
})
