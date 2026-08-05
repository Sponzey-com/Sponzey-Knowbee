import type { ArtifactAccessDescriptor } from "../artifacts/lifecycle.js"
import type {
  CanonicalWebUiSmokeApprovalReceipt,
  CanonicalWebUiSmokeArtifactReceipt,
  CanonicalWebUiSmokeCapabilityReceipt,
  CanonicalWebUiSmokeToolReceipt,
} from "../channels/webui-live-smoke-executor.js"
import type {
  DbArtifactMetadata,
  DbArtifactReceipt,
  DbAuditLog,
  DbMessageLedgerEvent,
} from "../db/index.js"
import type { ApprovalRegistryRow } from "../runs/approval-registry.js"

export interface WebUiLiveSmokeEvidenceProjection {
  toolReceipts: readonly CanonicalWebUiSmokeToolReceipt[]
  approvalReceipts: readonly CanonicalWebUiSmokeApprovalReceipt[]
  artifactReceipts: readonly CanonicalWebUiSmokeArtifactReceipt[]
  capabilityReceipts: readonly CanonicalWebUiSmokeCapabilityReceipt[]
  userReportDelivered: boolean
  userReportDeliveryCount: number
  deliveryReceiptRef?: string
}

export interface WebUiLiveSmokeEvidenceReaderDependencies {
  listAuditLogsForRun(runId: string): readonly DbAuditLog[]
  getLatestApprovalForRun(runId: string): ApprovalRegistryRow | undefined
  listArtifactReceiptsForRun(runId: string): readonly DbArtifactReceipt[]
  listArtifactMetadataForRun(runId: string): readonly DbArtifactMetadata[]
  listMessageLedgerEvents(input: {
    runId: string
    limit?: number
  }): readonly DbMessageLedgerEvent[]
  buildArtifactAccess(metadata: DbArtifactMetadata): ArtifactAccessDescriptor
  isWebUiApprovalVisible(): boolean
}

function toolResult(value: string): CanonicalWebUiSmokeToolReceipt["result"] | undefined {
  if (value === "success" || value === "failed" || value === "denied") return value
  return undefined
}

function approvalStatus(
  value: ApprovalRegistryRow["status"],
): CanonicalWebUiSmokeApprovalReceipt["status"] | undefined {
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

export function createWebUiLiveSmokeEvidenceReader(
  dependencies: WebUiLiveSmokeEvidenceReaderDependencies,
): (run: { id: string; requestGroupId: string }) => WebUiLiveSmokeEvidenceProjection {
  return (run) => {
    const auditLogs = dependencies.listAuditLogsForRun(run.id)
    const toolReceipts = auditLogs.flatMap((row): CanonicalWebUiSmokeToolReceipt[] => {
      const result = toolResult(row.result)
      return result && row.request_group_id === run.requestGroupId && row.channel === "webui"
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

    const capabilityReceipts = auditLogs.flatMap((row): CanonicalWebUiSmokeCapabilityReceipt[] =>
      row.result === "failed" &&
      row.error_code === "tool_not_registered" &&
      row.request_group_id === run.requestGroupId &&
      row.channel === "webui"
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

    const deliveredEvents = dependencies
      .listMessageLedgerEvents({ runId: run.id, limit: 1_000 })
      .filter(
        (event) =>
          event.request_group_id === run.requestGroupId &&
          event.channel === "webui" &&
          (event.event_kind === "text_delivered" ||
            event.event_kind === "final_answer_delivered") &&
          (event.status === "delivered" || event.status === "succeeded"),
      )
    const canonicalDeliveries = deliveredEvents.filter(
      (event) => event.event_kind === "final_answer_delivered",
    )
    const deliveredUserReports =
      canonicalDeliveries.length > 0
        ? canonicalDeliveries
        : deliveredEvents.filter((event) => event.event_kind === "text_delivered")
    const deliveredUserReport = deliveredUserReports[0]
    const userReportDelivered = deliveredUserReport !== undefined

    const approval = dependencies.getLatestApprovalForRun(run.id)
    const status = approval ? approvalStatus(approval.status) : undefined
    const approvalReceipts: CanonicalWebUiSmokeApprovalReceipt[] =
      approval &&
      status &&
      approval.request_group_id === run.requestGroupId &&
      approval.channel === "webui"
        ? [
            {
              runId: run.id,
              requestGroupId: run.requestGroupId,
              channel: "webui",
              toolName: approval.tool_name,
              status,
              uiVisible: approval.decision_by === "webui" || dependencies.isWebUiApprovalVisible(),
            },
          ]
        : []

    const deliveredPaths = new Set(
      dependencies
        .listArtifactReceiptsForRun(run.id)
        .filter(
          (receipt) =>
            receipt.request_group_id === run.requestGroupId &&
            receipt.channel === "webui" &&
            receipt.delivered_at !== null,
        )
        .map((receipt) => receipt.artifact_path),
    )
    const artifactReceipts = dependencies
      .listArtifactMetadataForRun(run.id)
      .flatMap((metadata): CanonicalWebUiSmokeArtifactReceipt[] => {
        if (
          metadata.request_group_id !== run.requestGroupId ||
          metadata.owner_channel !== "webui" ||
          !deliveredPaths.has(metadata.artifact_path)
        ) {
          return []
        }
        const access = dependencies.buildArtifactAccess(metadata)
        if (!access.ok) return []
        const mode = access.previewable ? ("inline_preview" as const) : ("download_link" as const)
        const url = access.previewable ? access.previewUrl : access.downloadUrl
        return url
          ? [
              {
                runId: run.id,
                requestGroupId: run.requestGroupId,
                channel: "webui",
                mode,
                url,
              },
            ]
          : []
      })

    return {
      toolReceipts,
      approvalReceipts,
      artifactReceipts,
      capabilityReceipts,
      userReportDelivered,
      userReportDeliveryCount: deliveredUserReports.length,
      ...(deliveredUserReport ? { deliveryReceiptRef: deliveredUserReport.id } : {}),
    }
  }
}
