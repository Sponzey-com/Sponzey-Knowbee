import type {
  CanonicalTelegramSmokeApprovalReceipt,
  CanonicalTelegramSmokeArtifactReceipt,
  CanonicalTelegramSmokeCapabilityReceipt,
  CanonicalTelegramSmokeToolReceipt,
} from "../channels/telegram-live-smoke-executor.js"
import type {
  DbArtifactReceipt,
  DbAuditLog,
  DbChannelMessageRef,
  DbDecisionTrace,
  DbMessageLedgerEvent,
} from "../db/index.js"
import { parseCapabilitySelectionDecisionTraceDetail } from "../contracts/capability-selection-decision-trace.js"
import type { ApprovalRegistryRow } from "../runs/approval-registry.js"
import type { TelegramLiveSmokeTarget } from "./server-runtime-context.js"

export interface TelegramLiveSmokeEvidenceProjection {
  providerDeliveryReceipted: boolean
  targetMatched: boolean
  userReportDelivered: boolean
  userReportDeliveryCount: number
  deliveryReceiptRef?: string
  capabilitySelectionDecisionTraceId?: string
  toolReceipts: readonly CanonicalTelegramSmokeToolReceipt[]
  approvalReceipts: readonly CanonicalTelegramSmokeApprovalReceipt[]
  artifactReceipts: readonly CanonicalTelegramSmokeArtifactReceipt[]
  capabilityReceipts: readonly CanonicalTelegramSmokeCapabilityReceipt[]
}

export interface TelegramLiveSmokeEvidenceReaderDependencies {
  listMessageLedgerEvents(input: {
    runId: string
    limit?: number
  }): readonly DbMessageLedgerEvent[]
  listChannelMessageRefsForRun(runId: string): readonly DbChannelMessageRef[]
  listDecisionTracesForRun?(runId: string): readonly DbDecisionTrace[]
  listAuditLogsForRun?(runId: string): readonly DbAuditLog[]
  getLatestApprovalForRun?(runId: string): ApprovalRegistryRow | undefined
  listArtifactReceiptsForRun?(runId: string): readonly DbArtifactReceipt[]
}

function toolResult(value: string): CanonicalTelegramSmokeToolReceipt["result"] | undefined {
  if (value === "success" || value === "failed" || value === "denied") return value
  return undefined
}

function approvalStatus(
  value: ApprovalRegistryRow["status"],
): CanonicalTelegramSmokeApprovalReceipt["status"] | undefined {
  switch (value) {
    case "requested":
    case "consumed":
    case "denied":
    case "expired":
      return value
    case "approved_once":
    case "approved_run":
      return "approved"
    default:
      return undefined
  }
}

function telegramArtifactDelivered(receipt: DbArtifactReceipt): boolean {
  if (receipt.delivered_at === null) return false
  const detail = safeObject(receipt.delivery_receipt_json)
  return (
    detail?.provider === "telegram" &&
    (detail.status === "sent" || detail.status === "delivered" || detail.status === "succeeded")
  )
}

export function createTelegramLiveSmokeEvidenceReader(
  dependencies: TelegramLiveSmokeEvidenceReaderDependencies,
): (
  run: { id: string; requestGroupId: string },
  target: TelegramLiveSmokeTarget,
) => TelegramLiveSmokeEvidenceProjection {
  return (run, target) => {
    const events = dependencies.listMessageLedgerEvents({ runId: run.id, limit: 1_000 })
    const scopedEvents = events.filter(
      (event) =>
        event.run_id === run.id &&
        event.request_group_id === run.requestGroupId &&
        event.channel === "telegram",
    )
    const refs = dependencies
      .listChannelMessageRefsForRun(run.id)
      .filter(
        (ref) =>
          ref.root_run_id === run.id &&
          ref.request_group_id === run.requestGroupId &&
          ref.source === "telegram" &&
          ref.role === "assistant",
      )

    const providerMessageIds = scopedEvents.flatMap((event) => {
      const legacyTextDelivery =
        event.event_kind === "text_delivered" &&
        (event.status === "delivered" || event.status === "succeeded")
      const providerReceipt =
        event.event_kind === "delivery_receipted" &&
        (event.status === "sent" || event.status === "delivered" || event.status === "succeeded")
      if (!legacyTextDelivery && !providerReceipt) return []
      const detail = safeObject(event.detail_json)
      const receipts = Array.isArray(detail?.deliveryReceipts)
        ? detail.deliveryReceipts
        : Array.isArray(detail?.receipts)
          ? detail.receipts
          : []
      return receipts.flatMap((value) => {
        const receipt = objectValue(value)
        return receipt?.provider === "telegram" &&
          (receipt.status === "sent" || receipt.status === "delivered") &&
          typeof receipt.messageId === "string" &&
          receipt.messageId.trim().length > 0
          ? [receipt.messageId.trim()]
          : []
      })
    })
    const providerDeliveryReceipted = providerMessageIds.length > 0
    const expectedThread = target.threadId === undefined ? null : String(target.threadId)
    const targetMatched = providerMessageIds.some((messageId) =>
      refs.some(
        (ref) =>
          ref.external_chat_id === String(target.chatId) &&
          ref.external_thread_id === expectedThread &&
          ref.external_message_id === messageId,
      ),
    )
    const deliveredUserReports = scopedEvents.filter((event) => {
      if (
        event.event_kind !== "final_answer_delivered" ||
        (event.status !== "delivered" && event.status !== "succeeded")
      ) {
        return false
      }
      return safeObject(event.detail_json)?.providerEvidence === "confirmed"
    })
    const deliveredUserReport = deliveredUserReports[0]
    const userReportDelivered = deliveredUserReport !== undefined
    const capabilitySelectionDecisionTrace = (
      dependencies.listDecisionTracesForRun?.(run.id) ?? []
    ).find((trace) => {
      if (
        trace.run_id !== run.id ||
        trace.request_group_id !== run.requestGroupId ||
        trace.channel !== "telegram" ||
        trace.decision_kind !== "capability_selection" ||
        trace.reason_code !== "capability_selection_allowed"
      ) {
        return false
      }
      const detail = safeObject(trace.sanitized_detail_json)
      if (!detail) return false
      const parsed = parseCapabilitySelectionDecisionTraceDetail(detail)
      return parsed.status === "ready" && parsed.detail.terminalStatus === "allowed"
    })

    const auditLogs = dependencies.listAuditLogsForRun?.(run.id) ?? []
    const toolReceipts = auditLogs.flatMap((row): CanonicalTelegramSmokeToolReceipt[] => {
      const result = toolResult(row.result)
      return result &&
        row.run_id === run.id &&
        row.request_group_id === run.requestGroupId &&
        row.channel === "telegram"
        ? [
            {
              runId: run.id,
              requestGroupId: run.requestGroupId,
              toolName: row.tool_name,
              result,
            },
          ]
        : []
    })
    const capabilityReceipts = auditLogs.flatMap(
      (row): CanonicalTelegramSmokeCapabilityReceipt[] =>
        row.run_id === run.id &&
        row.request_group_id === run.requestGroupId &&
        row.channel === "telegram" &&
        row.result === "failed" &&
        row.error_code === "tool_not_registered"
          ? [
              {
                runId: run.id,
                requestGroupId: run.requestGroupId,
                capability: "tool_execution",
                receiptStatus: "unsupported_capability",
              },
            ]
          : [],
    )
    const approval = dependencies.getLatestApprovalForRun?.(run.id)
    const status = approval ? approvalStatus(approval.status) : undefined
    const approvalReceipts: CanonicalTelegramSmokeApprovalReceipt[] =
      approval &&
      status &&
      approval.run_id === run.id &&
      approval.request_group_id === run.requestGroupId &&
      approval.channel === "telegram"
        ? [
            {
              runId: run.id,
              requestGroupId: run.requestGroupId,
              channel: "telegram",
              toolName: approval.tool_name,
              status,
              uiVisible: Boolean(approval.channel_message_id?.trim()),
            },
          ]
        : []
    const artifactReceipts = (dependencies.listArtifactReceiptsForRun?.(run.id) ?? []).flatMap(
      (receipt): CanonicalTelegramSmokeArtifactReceipt[] =>
        receipt.run_id === run.id &&
        receipt.request_group_id === run.requestGroupId &&
        receipt.channel === "telegram" &&
        telegramArtifactDelivered(receipt)
          ? [
              {
                runId: run.id,
                requestGroupId: run.requestGroupId,
                channel: "telegram",
                mode: "native_file",
              },
            ]
          : [],
    )

    return {
      providerDeliveryReceipted,
      targetMatched,
      userReportDelivered,
      userReportDeliveryCount: deliveredUserReports.length,
      ...(deliveredUserReport ? { deliveryReceiptRef: deliveredUserReport.id } : {}),
      ...(capabilitySelectionDecisionTrace
        ? {
            capabilitySelectionDecisionTraceId:
              capabilitySelectionDecisionTrace.id,
          }
        : {}),
      toolReceipts,
      approvalReceipts,
      artifactReceipts,
      capabilityReceipts,
    }
  }
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

function safeObject(value: string | null): Record<string, unknown> | undefined {
  if (!value) return undefined
  try {
    return objectValue(JSON.parse(value))
  } catch {
    return undefined
  }
}
