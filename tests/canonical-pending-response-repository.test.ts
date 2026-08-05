import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { createHash } from "node:crypto"
import { closeDb, getDb, insertSession } from "../packages/core/src/db/index.js"
import { createRuntimePaths } from "../packages/core/src/config/paths.ts"
import { createRootRun } from "../packages/core/src/runs/store.js"
import { SqliteCanonicalPendingResponseRepository } from "../packages/core/src/db/canonical-pending-response-repository.ts"
import { buildCanonicalPendingResponseReviewEnvelope } from "../packages/core/src/runs/canonical-pending-response-review.ts"
import { buildLlmResponseReviewReceipt } from "../packages/core/src/runs/user-facing-response-gate.ts"

let root = ""

beforeEach(() => {
  closeDb()
  root = mkdtempSync(join(tmpdir(), "knowbee-pending-response-"))
  const paths = createRuntimePaths({ KNOWBEE_STATE_DIR: root }, { homeDir: root, exists: () => false })
  getDb({ paths })
  const now = Date.now()
  insertSession({ id: "session-1", source: "webui", source_id: null, created_at: now, updated_at: now, summary: null })
  createRootRun({ id: "run-1", sessionId: "session-1", prompt: "request", source: "webui" })
})

afterEach(() => {
  closeDb()
  rmSync(root, { recursive: true, force: true })
})

describe("canonical pending response repository", () => {
  function reviewEnvelope(
    rawText: string,
    responseText: string,
    terminalReportFingerprint?: `sha256:${string}`,
  ) {
    return buildCanonicalPendingResponseReviewEnvelope({
      rawText,
      rawTextSource: "llm_generated",
      contentKind: "final_report",
      expectedLanguage: "ko",
      receipt: buildLlmResponseReviewReceipt({
        rawText,
        responseText,
        rawTextSource: "llm_generated",
        contentKind: "final_report",
      }),
    }, terminalReportFingerprint)
  }

  it("stages and restores an exact final response for delivery replay", () => {
    const repository = new SqliteCanonicalPendingResponseRepository(getDb(), () => 1_000)
    expect(repository.stage({
      runId: "run-1",
      workId: "work:root:run-1",
      sessionId: "session-1",
      source: "webui",
      text: "검증된 최종 응답",
      textSource: "llm_generated",
      finalOutcome: "succeeded",
      reviewEnvelope: reviewEnvelope("검토 입력", "검증된 최종 응답"),
    })).toEqual({ staged: true })

    expect(repository.loadPending("run-1")).toMatchObject({
      runId: "run-1",
      text: "검증된 최종 응답",
      status: "pending",
      finalOutcome: "succeeded",
      reviewEnvelope: {
        rawTextSource: "llm_generated",
        contentKind: "final_report",
      },
    })
    const stored = getDb().prepare<[], { review_envelope_json: string }>(
      "SELECT review_envelope_json FROM canonical_pending_responses WHERE run_id = 'run-1'",
    ).get()
    expect(stored?.review_envelope_json).not.toContain("검토 입력")
  })

  it("accepts exact replay but rejects a different response for the same run", () => {
    const repository = new SqliteCanonicalPendingResponseRepository(getDb(), () => 1_000)
    const input = {
      runId: "run-1",
      workId: "work:root:run-1",
      sessionId: "session-1",
      source: "webui" as const,
      text: "same response",
      textSource: "llm_generated" as const,
      finalOutcome: "partial" as const,
      reviewEnvelope: reviewEnvelope(
        "review input",
        "same response",
        `sha256:${"a".repeat(64)}`,
      ),
    }
    expect(repository.stage(input)).toEqual({ staged: true })
    expect(repository.stage(input)).toEqual({ staged: true })
    expect(repository.stage({ ...input, text: "different response" })).toEqual({
      staged: false,
      reasonCode: "canonical_pending_response_conflict",
    })
  })

  it("rejects a terminal response whose review envelope has no report fingerprint", () => {
    const repository = new SqliteCanonicalPendingResponseRepository(getDb(), () => 1_000)
    expect(() => repository.stage({
      runId: "run-1",
      workId: "work:root:run-1",
      sessionId: "session-1",
      source: "webui",
      text: "partial response",
      textSource: "llm_generated",
      finalOutcome: "partial",
      reviewEnvelope: reviewEnvelope("review input", "partial response"),
    })).toThrow("canonical_terminal_report_fingerprint_required")
  })

  it("marks a consumed response and excludes it from pending scans", () => {
    const repository = new SqliteCanonicalPendingResponseRepository(getDb(), () => 1_000)
    repository.stage({
      runId: "run-1",
      workId: "work:root:run-1",
      sessionId: "session-1",
      source: "webui",
      text: "done",
      textSource: "llm_generated",
      finalOutcome: "succeeded",
      reviewEnvelope: reviewEnvelope("review input", "done"),
    })
    expect(repository.markConsumed("run-1")).toEqual({ consumed: true })
    expect(repository.loadPending("run-1")).toBeUndefined()
    expect(repository.listPending(10)).toEqual([])
  })

  it("classifies malformed, missing, and response-mismatched review envelopes without inventing a receipt", () => {
    const repository = new SqliteCanonicalPendingResponseRepository(getDb(), () => 1_000)
    repository.stage({
      runId: "run-1",
      workId: "work:root:run-1",
      sessionId: "session-1",
      source: "webui",
      text: "response",
      textSource: "llm_generated",
      finalOutcome: "succeeded",
      reviewEnvelope: reviewEnvelope("input", "response"),
    })
    getDb().prepare("UPDATE canonical_pending_responses SET review_envelope_json = ? WHERE run_id = ?")
      .run("{broken", "run-1")
    expect(repository.load("run-1")).toMatchObject({
      reviewIssue: "review_envelope_invalid",
    })
    expect(repository.load("run-1")?.reviewEnvelope).toBeUndefined()

    getDb().prepare("UPDATE canonical_pending_responses SET review_envelope_json = NULL WHERE run_id = ?")
      .run("run-1")
    expect(repository.load("run-1")).toMatchObject({
      reviewIssue: "review_envelope_missing",
    })

    const mismatched = reviewEnvelope("input", "different response")
    getDb().prepare(`
      UPDATE canonical_pending_responses
      SET review_envelope_json = ?, text_fingerprint = ?
      WHERE run_id = ?
    `).run(
      JSON.stringify(mismatched),
      `sha256:${createHash("sha256").update("response").digest("hex")}`,
      "run-1",
    )
    expect(repository.load("run-1")).toMatchObject({
      reviewIssue: "review_envelope_response_mismatch",
    })
  })
})
