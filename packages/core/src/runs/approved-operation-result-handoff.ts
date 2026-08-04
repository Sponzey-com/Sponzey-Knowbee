import {
  buildPersistedToolResultBlock,
} from "../agent/index.js"
import {
  getMessagesForRun,
  getDb,
  getArtifactMetadata,
  insertMessageIfAbsent,
  listArtifactReceiptsForRun,
} from "../db/index.js"
import { SqliteCanonicalWorkRepository } from "../db/canonical-work-repository.js"
import {
  SqliteCanonicalWorkReceiptRepository,
} from "../db/canonical-work-receipt-repository.js"
import type { ToolResult } from "../tools/types.js"
import type { ApprovedOperationContinuation } from "./approved-operation-continuation.js"
import {
  buildCanonicalRecoveredAttemptEvidenceDescriptor,
  recordCanonicalAttemptEvidence,
} from "./canonical-attempt-evidence.js"
import {
  appendRunEvent,
  applyCanonicalRunTransition,
  getRootRun,
} from "./store.js"
import type { RecoveredExecutionAttempt } from "./execution-cycle-pass.js"

export type ApprovedOperationResultHandoffResult =
  | { readonly ok: true; readonly inserted: boolean }
  | { readonly ok: false; readonly reasonCode: string }

export type LoadRecoveredApprovedOperationAttemptResult =
  | {
      readonly ok: true
      readonly attempt: RecoveredExecutionAttempt
    }
  | { readonly ok: false; readonly reasonCode: string }

function handoffMessageId(continuationId: string): string {
  return `${continuationId}:tool-result`
}

function hasPersistedToolResultBlock(value: string | null | undefined): boolean {
  if (!value) return false
  try {
    const parsed: unknown = JSON.parse(value)
    return Array.isArray(parsed) && parsed.some((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return false
      const block = item as Record<string, unknown>
      return block.type === "tool_result"
        && typeof block.tool_use_id === "string"
        && block.tool_use_id.trim().length > 0
        && typeof block.content === "string"
    })
  } catch {
    return false
  }
}

function boundedResultEvidenceRefs(result: ToolResult): string[] {
  if (!result.details || typeof result.details !== "object"
      || Array.isArray(result.details)) {
    return []
  }
  const details = result.details as Record<string, unknown>
  const verification = details.artifactVerification
    && typeof details.artifactVerification === "object"
    && !Array.isArray(details.artifactVerification)
    ? details.artifactVerification as Record<string, unknown>
    : details
  return typeof verification.artifactRef === "string"
      && verification.artifactRef.startsWith("artifact:")
    ? [verification.artifactRef]
    : []
}

function recordRecoveredAttempt(input: {
  continuation: ApprovedOperationContinuation
  persistedToolResultContent: string
  result: ToolResult
}): { ok: true } | { ok: false; reasonCode: string } {
  const descriptor = buildCanonicalRecoveredAttemptEvidenceDescriptor({
    runId: input.continuation.runId,
    continuationId: input.continuation.continuationId,
    toolName: input.continuation.toolName,
    operationId: input.continuation.operationId,
    operationBindingHash: input.continuation.operationBindingHash,
    persistedToolResultContent: input.persistedToolResultContent,
    evidenceRefs: boundedResultEvidenceRefs(input.result),
  })
  const database = getDb()
  const aggregate = new SqliteCanonicalWorkRepository(
    database,
    () => Date.now(),
  ).load(descriptor.workId)
  if (!aggregate) {
    return {
      ok: false,
      reasonCode: "approval_continuation_canonical_work_missing",
    }
  }
  const receiptRepository = new SqliteCanonicalWorkReceiptRepository(
    database,
    () => Date.now(),
  )
  return recordCanonicalAttemptEvidence(descriptor, {
    issueReceipt: (receipt) => receiptRepository.issue(receipt),
    loadReceipt: (receiptId) => receiptRepository.load(receiptId),
    applyAttemptTransition: ({ runId, workId, receiptRef }) =>
      applyCanonicalRunTransition({
        runId,
        workId,
        expectedRevision: aggregate.revision,
        event: "ATTEMPT_RECORDED",
        receiptRef,
      }),
  })
}

export function handoffApprovedOperationResult(input: {
  continuation: ApprovedOperationContinuation
  toolUseId: string
  result: ToolResult
}): ApprovedOperationResultHandoffResult {
  const run = getRootRun(input.continuation.runId)
  if (
    !run
    || run.requestGroupId
      !== (input.continuation.requestGroupId ?? input.continuation.runId)
  ) {
    return {
      ok: false,
      reasonCode: "approval_continuation_run_binding_invalid",
    }
  }
  const toolUseId = input.toolUseId.trim()
  if (!toolUseId) {
    return {
      ok: false,
      reasonCode: "approval_continuation_tool_use_id_missing",
    }
  }
  const block = buildPersistedToolResultBlock({
    toolName: input.continuation.toolName,
    toolUseId,
    result: input.result,
  })
  const id = handoffMessageId(input.continuation.continuationId)
  const toolCalls = JSON.stringify([block])
  const existing = getMessagesForRun(run.sessionId, run.id).find(
    (message) => message.id === id,
  )
  if (existing) {
    const exact = existing.role === "user"
      && existing.content === ""
      && existing.tool_calls === toolCalls
    if (!exact) {
      return {
        ok: false,
        reasonCode: "approval_continuation_tool_result_conflict",
      }
    }
    const recorded = recordRecoveredAttempt({
      continuation: input.continuation,
      persistedToolResultContent: block.content,
      result: input.result,
    })
    return recorded.ok
      ? { ok: true, inserted: false }
      : recorded
  }
  const inserted = insertMessageIfAbsent({
    id,
    session_id: run.sessionId,
    root_run_id: run.id,
    role: "user",
    content: "",
    tool_calls: toolCalls,
    tool_call_id: null,
    created_at: Date.now(),
  })
  if (!inserted) {
    return {
      ok: false,
      reasonCode: "approval_continuation_tool_result_conflict",
    }
  }
  const recorded = recordRecoveredAttempt({
    continuation: input.continuation,
    persistedToolResultContent: block.content,
    result: input.result,
  })
  if (!recorded.ok) return recorded
  appendRunEvent(
    run.id,
    `approved_operation_result_handed_off:${input.continuation.toolName}`,
  )
  return { ok: true, inserted: true }
}

export function loadRecoveredApprovedOperationAttempt(
  runId: string,
): LoadRecoveredApprovedOperationAttemptResult {
  const run = getRootRun(runId)
  if (!run) {
    return {
      ok: false,
      reasonCode: "approval_continuation_run_binding_invalid",
    }
  }
  const database = getDb()
  const aggregate = new SqliteCanonicalWorkRepository(
    database,
    () => Date.now(),
  ).load(`work:root:${run.id}`)
  if (aggregate?.state !== "RESULT_REVIEW") {
    return {
      ok: false,
      reasonCode: "approval_continuation_result_review_not_ready",
    }
  }
  const receipt = new SqliteCanonicalWorkReceiptRepository(
    database,
    () => Date.now(),
  ).findLatestConsumedByKind(aggregate.workId, "attempt")
  const evidenceRefs = receipt?.evidenceRefs.filter((ref) =>
    ref.startsWith("side-effect-operation:")
    || ref.startsWith("artifact:"))
  if (!receipt || !evidenceRefs?.some((ref) => ref.startsWith("artifact:"))) {
    return {
      ok: false,
      reasonCode: "approval_continuation_verified_artifact_evidence_missing",
    }
  }
  const deliveredArtifacts = evidenceRefs.flatMap((ref) => {
    if (!ref.startsWith("artifact:")) return []
    const artifact = getArtifactMetadata(ref.slice("artifact:".length))
    if (!artifact) return []
    const delivery = listArtifactReceiptsForRun(run.id).find(
      (candidate) =>
        candidate.delivered_at !== null
        && candidate.artifact_path === artifact.artifact_path
        && candidate.channel === run.source,
    )
    if (!delivery) return []
    return [{
      toolName:
        run.source === "telegram"
          ? "telegram_send_file"
          : `${run.source}_send_file`,
      channel: run.source,
      filePath: artifact.artifact_path,
      ...(artifact.mime_type ? { mimeType: artifact.mime_type } : {}),
      ...(artifact.size_bytes !== null
        ? { sizeBytes: artifact.size_bytes }
        : {}),
    }]
  })
  const resultMessageExists = getMessagesForRun(run.sessionId, run.id).some(
    (message) =>
      message.id.startsWith("approval-continuation:")
      && message.id.endsWith(":tool-result")
      && message.role === "user"
      && hasPersistedToolResultBlock(message.tool_calls),
  )
  if (!resultMessageExists) {
    return {
      ok: false,
      reasonCode: "approval_continuation_tool_result_handoff_missing",
    }
  }
  return {
    ok: true,
    attempt: {
      preview: "A verified side-effect artifact is ready for result review and requested delivery.",
      canonicalAttemptEvidenceRefs: [...evidenceRefs],
      ...(deliveredArtifacts.length > 0
        ? { successfulFileDeliveries: deliveredArtifacts }
        : {}),
    },
  }
}
