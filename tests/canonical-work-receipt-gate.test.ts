import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { createRuntimePaths } from "../packages/core/src/config/paths.ts"
import { closeDb, getDb, insertSession } from "../packages/core/src/db/index.js"
import {
  applyCanonicalRunTransition,
  createRootRun,
  getRootRun,
} from "../packages/core/src/runs/store.ts"
import {
  buildCanonicalIntakeDiagnosisDescriptor,
  recordCanonicalIntakeDiagnosis,
} from "../packages/core/src/runs/canonical-intake-diagnosis.ts"
import { recordCanonicalIntakePlanPolicy } from "../packages/core/src/runs/canonical-intake-plan-policy.ts"
import { recordCanonicalExecutionAdmission } from "../packages/core/src/runs/canonical-execution-admission.ts"
import { recordCanonicalAttemptEvidence } from "../packages/core/src/runs/canonical-attempt-evidence.ts"
import {
  buildCanonicalRecoveryReentryDescriptor,
  recordCanonicalRecoveryReentry,
} from "../packages/core/src/runs/canonical-recovery-reentry.ts"
import { canonicalWorkIdForRootRun } from "../packages/core/src/contracts/canonical-work-aggregate.ts"
import {
  CANONICAL_EVENT_RECEIPT_KINDS,
  validateCanonicalWorkReceiptForEvent,
  type CanonicalWorkReceiptKind,
} from "../packages/core/src/contracts/canonical-work-receipt.ts"
import { SqliteCanonicalWorkReceiptRepository } from "../packages/core/src/db/canonical-work-receipt-repository.ts"
import { SqliteCanonicalWorkRepository } from "../packages/core/src/db/canonical-work-repository.ts"
import {
  buildCanonicalSimplePathReleaseDescriptor,
  releaseCanonicalSimplePath,
} from "../packages/core/src/runs/canonical-simple-path.ts"
import {
  buildCanonicalAnalysisRevisionDescriptor,
  recordCanonicalAnalysisRevision,
} from "../packages/core/src/runs/canonical-analysis-revision.ts"

let root = ""
let paths: ReturnType<typeof createRuntimePaths>
const fingerprint = `sha256:${"a".repeat(64)}`

function db() {
  return getDb({ paths })
}
function workId(runId = "run:1") {
  return canonicalWorkIdForRootRun(runId)
}
function receipts() {
  return new SqliteCanonicalWorkReceiptRepository(db(), () => 1_000)
}
function issue(receiptId: string, kind: CanonicalWorkReceiptKind, targetWorkId = workId()) {
  return receipts().issue({
    receiptId,
    workId: targetWorkId,
    kind,
    evidenceFingerprint: fingerprint,
    evidenceRefs: [`evidence:${receiptId}`],
  })
}

beforeEach(() => {
  closeDb()
  root = mkdtempSync(join(tmpdir(), "knowbee-canonical-receipt-"))
  paths = createRuntimePaths({ KNOWBEE_STATE_DIR: root }, { homeDir: root, exists: () => false })
  db()
  const now = Date.now()
  insertSession({
    id: "session:1",
    source: "webui",
    source_id: "user:1",
    created_at: now,
    updated_at: now,
    summary: "test",
  })
  createRootRun({ id: "run:1", sessionId: "session:1", prompt: "request", source: "webui" })
  createRootRun({ id: "run:2", sessionId: "session:1", prompt: "other request", source: "webui" })
})

afterEach(() => {
  closeDb()
  rmSync(root, { recursive: true, force: true })
})

describe("canonical work receipt contract", () => {
  it("defines one explicit compatible receipt kind for every canonical event", () => {
    expect(Object.keys(CANONICAL_EVENT_RECEIPT_KINDS)).toHaveLength(15)
    expect(CANONICAL_EVENT_RECEIPT_KINDS).toMatchObject({
      DIAGNOSIS_ACCEPTED: "diagnosis",
      ANALYSIS_REVISED: "analysis_revision",
      POLICY_ALLOWED: "policy",
      EXECUTION_STARTED: "execution",
      RESULT_BLOCKED: "blocker",
      REPORT_DELIVERED: "delivery",
    })
  })

  it("rejects cross-work, mismatched-kind, consumed, and malformed evidence", () => {
    const base = {
      receiptId: "receipt:1",
      workId: workId(),
      kind: "diagnosis" as const,
      evidenceFingerprint: fingerprint,
      evidenceRefs: ["evidence:1"],
      issuedAt: 1_000,
    }
    expect(
      validateCanonicalWorkReceiptForEvent({
        receipt: base,
        workId: workId(),
        event: "DIAGNOSIS_ACCEPTED",
      }),
    ).toEqual({ ok: true })
    expect(
      validateCanonicalWorkReceiptForEvent({
        receipt: base,
        workId: workId("run:2"),
        event: "DIAGNOSIS_ACCEPTED",
      }),
    ).toEqual({ ok: false, reasonCode: "receipt_scope_mismatch" })
    expect(
      validateCanonicalWorkReceiptForEvent({
        receipt: base,
        workId: workId(),
        event: "POLICY_ALLOWED",
      }),
    ).toEqual({ ok: false, reasonCode: "receipt_kind_mismatch" })
    expect(
      validateCanonicalWorkReceiptForEvent({
        receipt: { ...base, consumedRevision: 1 },
        workId: workId(),
        event: "DIAGNOSIS_ACCEPTED",
      }),
    ).toEqual({ ok: false, reasonCode: "receipt_already_consumed" })
  })

  it("finds the latest consumed receipt by work and kind for restart recovery", () => {
    issue("receipt:cancellation:run:1:older", "cancellation")
    expect(
      receipts().consume({
        receiptId: "receipt:cancellation:run:1:older",
        workId: workId(),
        revision: 1,
      }),
    ).toEqual({ consumed: true })

    expect(receipts().findLatestConsumedByKind(workId(), "cancellation")).toMatchObject({
      receiptId: "receipt:cancellation:run:1:older",
      workId: workId(),
      kind: "cancellation",
      consumedRevision: 1,
    })
  })
})

describe("canonical transition receipt gate", () => {
  it("removes only the unstarted canonical aggregate for an LLM-classified simple path", () => {
    const descriptor = buildCanonicalSimplePathReleaseDescriptor({
      runId: "run:1",
      classification: { category: "direct_answer", mode: "direct_answer", nonReplyActionCount: 0 },
      answerSource: "llm_generated",
      requestText: "hello",
      answerText: "Hello.",
    })
    const repository = new SqliteCanonicalWorkRepository(db(), () => 1)
    expect(
      releaseCanonicalSimplePath(descriptor, {
        loadAggregate: (targetWorkId) => repository.load(targetWorkId),
        deleteUnstartedAggregate: (targetWorkId) =>
          db()
            .prepare(`
        DELETE FROM canonical_work_aggregates
        WHERE work_id = ? AND state = 'REQUEST_RECEIVED' AND revision = 0
      `)
            .run(targetWorkId).changes === 1,
      }),
    ).toEqual({ ok: true })
    expect(repository.load(descriptor.workId)).toBeUndefined()
    expect(getRootRun("run:1")).toBeDefined()
  })

  it("issues intake evidence, applies diagnosis atomically, and treats an exact retry as idempotent", () => {
    const descriptor = buildCanonicalIntakeDiagnosisDescriptor({
      runId: "run:1",
      intake: { intent: { category: "task_intake" }, action_items: [] },
    })
    const record = () =>
      recordCanonicalIntakeDiagnosis(descriptor, {
        issueReceipt: (receipt) => receipts().issue(receipt),
        loadReceipt: (receiptId) => receipts().load(receiptId),
        applyDiagnosisTransition: ({ runId, workId, receiptRef }) =>
          applyCanonicalRunTransition({
            runId,
            workId,
            expectedRevision: 0,
            event: "DIAGNOSIS_ACCEPTED",
            receiptRef,
          }),
      })

    expect(record()).toEqual({ ok: true })
    expect(receipts().load(descriptor.receiptId)).toMatchObject({
      workId: descriptor.workId,
      kind: "diagnosis",
      consumedRevision: 1,
    })
    expect(getRootRun("run:1")).toMatchObject({ status: "running" })
    expect(new SqliteCanonicalWorkRepository(db(), () => 1).load(descriptor.workId)).toMatchObject({
      state: "SOLUTION_ANALYZED",
      revision: 1,
    })
    expect(record()).toEqual({ ok: true })
    expect(new SqliteCanonicalWorkRepository(db(), () => 1).load(descriptor.workId)).toMatchObject({
      state: "SOLUTION_ANALYZED",
      revision: 1,
    })
  })

  it("persists and consumes an analysis revision receipt idempotently", () => {
    issue("receipt:diagnosis-analysis-revision", "diagnosis")
    applyCanonicalRunTransition({
      runId: "run:1",
      workId: workId(),
      expectedRevision: 0,
      event: "DIAGNOSIS_ACCEPTED",
      receiptRef: "receipt:diagnosis-analysis-revision",
    })
    const built = buildCanonicalAnalysisRevisionDescriptor({
      runId: "run:1",
      previousAnalysisFingerprint: `sha256:${"a".repeat(64)}`,
      revisedAnalysisFingerprint: `sha256:${"b".repeat(64)}`,
      safeEvidenceRefs: ["failure:llm_output_schema_invalid"],
    })
    if (!built.ok) throw new Error(built.reasonCode)
    const record = () =>
      recordCanonicalAnalysisRevision(built.descriptor, 1, {
        issueReceipt: (receipt) => receipts().issue(receipt),
        loadReceipt: (receiptId) => receipts().load(receiptId),
        applyRevisionTransition: ({ runId, workId: targetWorkId, expectedRevision, receiptRef }) =>
          applyCanonicalRunTransition({
            runId,
            workId: targetWorkId,
            expectedRevision,
            event: "ANALYSIS_REVISED",
            receiptRef,
          }),
      })

    expect(record()).toEqual({ ok: true })
    expect(receipts().load(built.descriptor.receiptId)).toMatchObject({
      kind: "analysis_revision",
      consumedRevision: 2,
    })
    expect(new SqliteCanonicalWorkRepository(db(), () => 1).load(workId())).toMatchObject({
      state: "SOLUTION_ANALYZED",
      revision: 2,
    })
    expect(record()).toEqual({ ok: true })
  })

  it("issues an allowed policy receipt at revision two and treats an exact retry as idempotent", () => {
    issue("receipt:diagnosis-policy", "diagnosis")
    expect(
      applyCanonicalRunTransition({
        runId: "run:1",
        workId: workId(),
        expectedRevision: 0,
        event: "DIAGNOSIS_ACCEPTED",
        receiptRef: "receipt:diagnosis-policy",
      }),
    ).toMatchObject({ status: "applied" })
    const descriptor = {
      runId: "run:1",
      workId: workId(),
      receiptId: "receipt:policy:run:1:test",
      kind: "policy" as const,
      evidenceFingerprint: `sha256:${"b".repeat(64)}` as const,
      evidenceRefs: ["plan-policy-decision:run:1:test"],
    }
    const record = () =>
      recordCanonicalIntakePlanPolicy(descriptor, {
        issueReceipt: (receipt) => receipts().issue(receipt),
        loadReceipt: (receiptId) => receipts().load(receiptId),
        applyPolicyTransition: ({ runId, workId: targetWorkId, receiptRef }) =>
          applyCanonicalRunTransition({
            runId,
            workId: targetWorkId,
            expectedRevision: 1,
            event: "POLICY_ALLOWED",
            receiptRef,
          }),
      })
    expect(record()).toEqual({ ok: true })
    expect(receipts().load(descriptor.receiptId)).toMatchObject({ consumedRevision: 2 })
    expect(new SqliteCanonicalWorkRepository(db(), () => 1).load(descriptor.workId)).toMatchObject({
      state: "POLICY_VALIDATED",
      revision: 2,
    })
    expect(record()).toEqual({ ok: true })
    expect(new SqliteCanonicalWorkRepository(db(), () => 1).load(descriptor.workId)).toMatchObject({
      revision: 2,
    })
  })

  it("consumes an execution admission at revision three and rejects duplicate advancement", () => {
    issue("receipt:diagnosis-execution", "diagnosis")
    applyCanonicalRunTransition({
      runId: "run:1",
      workId: workId(),
      expectedRevision: 0,
      event: "DIAGNOSIS_ACCEPTED",
      receiptRef: "receipt:diagnosis-execution",
    })
    issue("receipt:policy-execution", "policy")
    applyCanonicalRunTransition({
      runId: "run:1",
      workId: workId(),
      expectedRevision: 1,
      event: "POLICY_ALLOWED",
      receiptRef: "receipt:policy-execution",
    })
    const descriptor = {
      runId: "run:1",
      workId: workId(),
      receiptId: "receipt:execution:run:1:test",
      kind: "execution" as const,
      evidenceFingerprint: `sha256:${"c".repeat(64)}` as const,
      evidenceRefs: ["execution-binding:run:1:test", "cancellation-token:root-run:run:1"],
    }
    const record = () =>
      recordCanonicalExecutionAdmission(descriptor, {
        issueReceipt: (receipt) => receipts().issue(receipt),
        loadReceipt: (receiptId) => receipts().load(receiptId),
        applyExecutionTransition: ({ runId, workId: targetWorkId, receiptRef }) =>
          applyCanonicalRunTransition({
            runId,
            workId: targetWorkId,
            expectedRevision: 2,
            event: "EXECUTION_STARTED",
            receiptRef,
          }),
      })
    expect(record()).toEqual({ ok: true })
    expect(receipts().load(descriptor.receiptId)).toMatchObject({ consumedRevision: 3 })
    expect(new SqliteCanonicalWorkRepository(db(), () => 1).load(descriptor.workId)).toMatchObject({
      state: "EXECUTING",
      revision: 3,
    })
    expect(record()).toEqual({ ok: true })
  })

  it("consumes attempt evidence at revision four and preserves idempotency", () => {
    issue("receipt:d4", "diagnosis")
    applyCanonicalRunTransition({
      runId: "run:1",
      workId: workId(),
      expectedRevision: 0,
      event: "DIAGNOSIS_ACCEPTED",
      receiptRef: "receipt:d4",
    })
    issue("receipt:p4", "policy")
    applyCanonicalRunTransition({
      runId: "run:1",
      workId: workId(),
      expectedRevision: 1,
      event: "POLICY_ALLOWED",
      receiptRef: "receipt:p4",
    })
    issue("receipt:e4", "execution")
    applyCanonicalRunTransition({
      runId: "run:1",
      workId: workId(),
      expectedRevision: 2,
      event: "EXECUTION_STARTED",
      receiptRef: "receipt:e4",
    })
    const descriptor = {
      runId: "run:1",
      workId: workId(),
      receiptId: "receipt:attempt:run:1:test",
      kind: "attempt" as const,
      evidenceFingerprint: `sha256:${"d".repeat(64)}` as const,
      evidenceRefs: ["attempt-preview:run:1:test"],
    }
    const record = () =>
      recordCanonicalAttemptEvidence(descriptor, {
        issueReceipt: (receipt) => receipts().issue(receipt),
        loadReceipt: (receiptId) => receipts().load(receiptId),
        applyAttemptTransition: ({ runId, workId: targetWorkId, receiptRef }) =>
          applyCanonicalRunTransition({
            runId,
            workId: targetWorkId,
            expectedRevision: 3,
            event: "ATTEMPT_RECORDED",
            receiptRef,
          }),
      })
    expect(record()).toEqual({ ok: true })
    expect(receipts().load(descriptor.receiptId)).toMatchObject({ consumedRevision: 4 })
    expect(new SqliteCanonicalWorkRepository(db(), () => 1).load(descriptor.workId)).toMatchObject({
      state: "RESULT_REVIEW",
      revision: 4,
    })
    expect(record()).toEqual({ ok: true })
  })

  it("returns through recovery policy and execution gates before recording a second attempt", () => {
    issue("receipt:d8", "diagnosis")
    applyCanonicalRunTransition({
      runId: "run:1",
      workId: workId(),
      expectedRevision: 0,
      event: "DIAGNOSIS_ACCEPTED",
      receiptRef: "receipt:d8",
    })
    issue("receipt:p8", "policy")
    applyCanonicalRunTransition({
      runId: "run:1",
      workId: workId(),
      expectedRevision: 1,
      event: "POLICY_ALLOWED",
      receiptRef: "receipt:p8",
    })
    issue("receipt:e8", "execution")
    applyCanonicalRunTransition({
      runId: "run:1",
      workId: workId(),
      expectedRevision: 2,
      event: "EXECUTION_STARTED",
      receiptRef: "receipt:e8",
    })
    issue("receipt:a8-1", "attempt")
    applyCanonicalRunTransition({
      runId: "run:1",
      workId: workId(),
      expectedRevision: 3,
      event: "ATTEMPT_RECORDED",
      receiptRef: "receipt:a8-1",
    })

    const built = buildCanonicalRecoveryReentryDescriptor({
      runId: "run:1",
      previousResult: "first raw result",
      strategy: { message: "use another method", targetId: "provider:openai" },
      allowedTargetIds: new Set(["provider:openai"]),
      cancellationTokenId: "root-run:run:1",
      signalAborted: false,
    })
    if (!built.ok) throw new Error(built.reasonCode)
    expect(
      recordCanonicalRecoveryReentry(built.descriptor, 4, {
        issueReceipt: (receipt) => receipts().issue(receipt),
        loadReceipt: (receiptId) => receipts().load(receiptId),
        applyTransition: ({ runId, workId: targetWorkId, expectedRevision, event, receiptRef }) =>
          applyCanonicalRunTransition({
            runId,
            workId: targetWorkId,
            expectedRevision,
            event,
            receiptRef,
          }),
      }),
    ).toEqual({ ok: true })
    expect(new SqliteCanonicalWorkRepository(db(), () => 1).load(workId())).toMatchObject({
      state: "EXECUTING",
      revision: 7,
    })

    const secondAttempt = {
      runId: "run:1",
      workId: workId(),
      receiptId: "receipt:attempt:run:1:second",
      kind: "attempt" as const,
      evidenceFingerprint: `sha256:${"e".repeat(64)}` as const,
      evidenceRefs: ["attempt-preview:run:1:second"],
    }
    expect(
      recordCanonicalAttemptEvidence(secondAttempt, {
        issueReceipt: (receipt) => receipts().issue(receipt),
        loadReceipt: (receiptId) => receipts().load(receiptId),
        applyAttemptTransition: ({ runId, workId: targetWorkId, receiptRef }) =>
          applyCanonicalRunTransition({
            runId,
            workId: targetWorkId,
            expectedRevision: 7,
            event: "ATTEMPT_RECORDED",
            receiptRef,
          }),
      }),
    ).toEqual({ ok: true })
    expect(receipts().load(secondAttempt.receiptId)).toMatchObject({ consumedRevision: 8 })
    expect(new SqliteCanonicalWorkRepository(db(), () => 1).load(workId())).toMatchObject({
      state: "RESULT_REVIEW",
      revision: 8,
    })
  })

  it("stores only evidence fingerprints and refs and rejects malformed or duplicate issuance", () => {
    const columns = (
      db().prepare("PRAGMA table_info(canonical_work_receipts)").all() as Array<{ name: string }>
    ).map((row) => row.name)
    expect(columns).toEqual(
      expect.arrayContaining(["evidence_fingerprint", "evidence_refs_json", "consumed_revision"]),
    )
    expect(columns).not.toEqual(expect.arrayContaining(["payload", "prompt", "result_json"]))
    expect(
      receipts().issue({
        receiptId: "receipt:bad",
        workId: workId(),
        kind: "diagnosis",
        evidenceFingerprint: "not-a-sha",
        evidenceRefs: ["evidence:bad"],
      }),
    ).toEqual({ issued: false, reasonCode: "receipt_invalid" })
    expect(issue("receipt:unique", "diagnosis")).toEqual({ issued: true })
    expect(issue("receipt:unique", "diagnosis")).toEqual({
      issued: false,
      reasonCode: "receipt_already_exists",
    })
  })

  it("rejects missing, cross-work, and mismatched-kind receipts without changing state", () => {
    expect(
      applyCanonicalRunTransition({
        runId: "run:1",
        expectedRevision: 0,
        event: "DIAGNOSIS_ACCEPTED",
        receiptRef: "receipt:missing",
      }),
    ).toEqual({ status: "receipt_rejected", reasonCode: "receipt_not_found" })
    issue("receipt:cross", "diagnosis", workId("run:2"))
    expect(
      applyCanonicalRunTransition({
        runId: "run:1",
        expectedRevision: 0,
        event: "DIAGNOSIS_ACCEPTED",
        receiptRef: "receipt:cross",
      }),
    ).toEqual({ status: "receipt_rejected", reasonCode: "receipt_scope_mismatch" })
    issue("receipt:kind", "policy")
    expect(
      applyCanonicalRunTransition({
        runId: "run:1",
        expectedRevision: 0,
        event: "DIAGNOSIS_ACCEPTED",
        receiptRef: "receipt:kind",
      }),
    ).toEqual({ status: "receipt_rejected", reasonCode: "receipt_kind_mismatch" })
  })

  it("consumes a valid receipt at the accepted revision and rejects replay", () => {
    expect(issue("receipt:diagnosis", "diagnosis")).toEqual({ issued: true })
    expect(
      applyCanonicalRunTransition({
        runId: "run:1",
        expectedRevision: 0,
        event: "DIAGNOSIS_ACCEPTED",
        receiptRef: "receipt:diagnosis",
      }),
    ).toMatchObject({ status: "applied", aggregate: { revision: 1 } })
    expect(receipts().load("receipt:diagnosis")).toMatchObject({ consumedRevision: 1 })
    expect(
      applyCanonicalRunTransition({
        runId: "run:1",
        expectedRevision: 1,
        event: "POLICY_ALLOWED",
        receiptRef: "receipt:diagnosis",
      }),
    ).toEqual({ status: "receipt_rejected", reasonCode: "receipt_already_consumed" })
  })

  it("rolls back receipt consumption when RootRun projection persistence fails", () => {
    issue("receipt:rollback", "diagnosis")
    db().exec(
      `CREATE TRIGGER reject_receipt_projection BEFORE UPDATE OF status ON root_runs WHEN OLD.id = 'run:1' BEGIN SELECT RAISE(ABORT, 'forced failure'); END;`,
    )
    expect(
      applyCanonicalRunTransition({
        runId: "run:1",
        expectedRevision: 0,
        event: "DIAGNOSIS_ACCEPTED",
        receiptRef: "receipt:rollback",
      }),
    ).toEqual({
      status: "persistence_failed",
      reasonCode: "canonical_run_transition_persistence_failed",
    })
    expect(receipts().load("receipt:rollback")).not.toHaveProperty("consumedRevision")
  })
})
