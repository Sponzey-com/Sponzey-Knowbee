import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { createWebUiLiveSmokeEvidenceReader } from "../packages/core/src/api/webui-live-smoke-evidence.ts"
import {
  closeDb,
  insertArtifactMetadata,
  insertArtifactReceipt,
  insertAuditLog,
  listArtifactMetadataForRun,
  listArtifactReceiptsForRun,
  listAuditLogsForRun,
} from "../packages/core/src/db/index.js"
import type {
  DbArtifactMetadata,
  DbArtifactReceipt,
  DbAuditLog,
  DbMessageLedgerEvent,
} from "../packages/core/src/db/index.ts"
import type { ApprovalRegistryRow } from "../packages/core/src/runs/approval-registry.ts"
import { initializeTestDbRuntime } from "./fixtures/runtime-db.ts"

const RUN = { id: "run-146", requestGroupId: "run-146" }

function auditLog(overrides: Partial<DbAuditLog> = {}): DbAuditLog {
  return {
    id: "audit-146",
    timestamp: 1,
    session_id: "session-146",
    run_id: RUN.id,
    request_group_id: RUN.requestGroupId,
    channel: "webui",
    source: "agent",
    tool_name: "screen_capture",
    params: "Bearer secret-token at /Users/private/input",
    output: '{"success":true}',
    result: "success",
    duration_ms: 1,
    approval_required: 1,
    approved_by: "user-private",
    error_code: null,
    retry_count: 0,
    stop_reason: null,
    ...overrides,
  }
}

function approval(overrides: Partial<ApprovalRegistryRow> = {}): ApprovalRegistryRow {
  return {
    id: "approval-146",
    run_id: RUN.id,
    request_group_id: RUN.requestGroupId,
    channel: "webui",
    channel_message_id: null,
    tool_name: "screen_capture",
    risk_level: "high",
    kind: "approval",
    status: "consumed",
    params_hash: "hash-146",
    params_preview_json: '{"secret":true}',
    requested_at: 1,
    expires_at: null,
    consumed_at: 2,
    decision_at: 2,
    decision_by: "user-private",
    decision_source: "webui",
    superseded_by: null,
    metadata_json: '{"path":"/Users/private"}',
    created_at: 1,
    updated_at: 2,
    ...overrides,
  }
}

function artifactMetadata(overrides: Partial<DbArtifactMetadata> = {}): DbArtifactMetadata {
  return {
    id: "artifact-146",
    source_run_id: RUN.id,
    request_group_id: RUN.requestGroupId,
    owner_channel: "webui",
    channel_target: "session-private",
    artifact_path: "/Users/private/.knowbee/artifacts/capture.png",
    mime_type: "image/png",
    size_bytes: 128,
    retention_policy: "standard",
    expires_at: null,
    metadata_json: null,
    created_at: 1,
    updated_at: 1,
    deleted_at: null,
    ...overrides,
  }
}

function artifactReceipt(overrides: Partial<DbArtifactReceipt> = {}): DbArtifactReceipt {
  return {
    id: "delivery-146",
    run_id: RUN.id,
    request_group_id: RUN.requestGroupId,
    channel: "webui",
    artifact_path: "/Users/private/.knowbee/artifacts/capture.png",
    mime_type: "image/png",
    size_bytes: 128,
    delivery_receipt_json: '{"target":"session-private"}',
    delivered_at: 2,
    created_at: 1,
    ...overrides,
  }
}

function ledgerEvent(overrides: Partial<DbMessageLedgerEvent> = {}): DbMessageLedgerEvent {
  return {
    id: "ledger-147",
    run_id: RUN.id,
    request_group_id: RUN.requestGroupId,
    session_key: "session-146",
    thread_key: RUN.requestGroupId,
    channel: "webui",
    event_kind: "final_answer_delivered",
    delivery_key: "delivery-147",
    idempotency_key: "idempotency-147",
    status: "delivered",
    summary: "private raw response",
    detail_json: '{"raw":"Bearer secret-token"}',
    created_at: 2,
    ...overrides,
  }
}

describe("Task 146 WebUI live smoke evidence reader", () => {
  it("reads tool and artifact receipts from the existing run-scoped SQLite records", () => {
    closeDb()
    const stateDir = mkdtempSync(join(tmpdir(), "knowbee-task146-smoke-evidence-"))
    try {
      initializeTestDbRuntime(stateDir)
      insertAuditLog({
        timestamp: 1,
        session_id: "session-146",
        run_id: RUN.id,
        request_group_id: RUN.requestGroupId,
        channel: "webui",
        source: "agent",
        tool_name: "screen_capture",
        params: null,
        output: null,
        result: "success",
        duration_ms: 1,
        approval_required: 1,
        approved_by: "webui",
      })
      const artifactPath = join(stateDir, "artifacts", "capture.png")
      insertArtifactMetadata({
        artifactPath,
        ownerChannel: "webui",
        sourceRunId: RUN.id,
        requestGroupId: RUN.requestGroupId,
      })
      insertArtifactReceipt({
        artifactPath,
        channel: "webui",
        runId: RUN.id,
        requestGroupId: RUN.requestGroupId,
        deliveredAt: 2,
      })

      expect(listAuditLogsForRun(RUN.id)).toHaveLength(1)
      expect(listArtifactMetadataForRun(RUN.id)).toHaveLength(1)
      expect(listArtifactReceiptsForRun(RUN.id)).toHaveLength(1)
      expect(listAuditLogsForRun("other-run")).toEqual([])
      expect(listArtifactMetadataForRun("other-run")).toEqual([])
      expect(listArtifactReceiptsForRun("other-run")).toEqual([])
    } finally {
      closeDb()
      rmSync(stateDir, { recursive: true, force: true })
    }
  })

  it("projects only bounded run-scoped tool, approval, and artifact receipts", () => {
    const read = createWebUiLiveSmokeEvidenceReader({
      listAuditLogsForRun: () => [
        auditLog(),
        auditLog({ id: "cross-group-tool", request_group_id: "other-group" }),
      ],
      getLatestApprovalForRun: () => approval(),
      listArtifactReceiptsForRun: () => [artifactReceipt()],
      listArtifactMetadataForRun: () => [artifactMetadata()],
      listMessageLedgerEvents: () => [],
      buildArtifactAccess: (metadata) => ({
        ok: true,
        filePath: metadata.artifact_path,
        fileName: "capture.png",
        mimeType: "image/png",
        previewable: true,
        downloadable: true,
        url: "/api/artifacts/capture.png",
        previewUrl: "/api/artifacts/capture.png",
        downloadUrl: "/api/artifacts/capture.png?download=1",
      }),
      isWebUiApprovalVisible: () => true,
    })

    const result = read(RUN)
    expect(result).toEqual({
      toolReceipts: [
        {
          runId: RUN.id,
          requestGroupId: RUN.requestGroupId,
          toolName: "screen_capture",
          result: "success",
        },
      ],
      approvalReceipts: [
        {
          runId: RUN.id,
          requestGroupId: RUN.requestGroupId,
          channel: "webui",
          toolName: "screen_capture",
          status: "consumed",
          uiVisible: true,
        },
      ],
      artifactReceipts: [
        {
          runId: RUN.id,
          requestGroupId: RUN.requestGroupId,
          channel: "webui",
          mode: "inline_preview",
          url: "/api/artifacts/capture.png",
        },
      ],
      capabilityReceipts: [],
      userReportDelivered: false,
      userReportDeliveryCount: 0,
    })
    expect(JSON.stringify(result)).not.toMatch(/Bearer|secret-token|\/Users\/|session-private/u)
  })

  it("drops undelivered, unsafe, or cross-scope artifacts and approvals", () => {
    const read = createWebUiLiveSmokeEvidenceReader({
      listAuditLogsForRun: () => [auditLog({ result: "unknown" })],
      getLatestApprovalForRun: () => approval({ request_group_id: "other-group" }),
      listArtifactReceiptsForRun: () => [artifactReceipt({ delivered_at: null })],
      listArtifactMetadataForRun: () => [artifactMetadata()],
      listMessageLedgerEvents: () => [],
      buildArtifactAccess: (metadata) => ({
        ok: false,
        filePath: metadata.artifact_path,
        fileName: "capture.png",
        mimeType: "image/png",
        previewable: false,
        downloadable: false,
        reason: "outside_state_artifacts",
      }),
      isWebUiApprovalVisible: () => false,
    })

    expect(read(RUN)).toEqual({
      toolReceipts: [],
      approvalReceipts: [],
      artifactReceipts: [],
      capabilityReceipts: [],
      userReportDelivered: false,
      userReportDeliveryCount: 0,
    })
  })

  it("projects bounded unsupported-capability and user-delivery evidence", () => {
    const read = createWebUiLiveSmokeEvidenceReader({
      listAuditLogsForRun: () => [
        auditLog({
          id: "unsupported-147",
          tool_name: "private_extension_name",
          result: "failed",
          error_code: "tool_not_registered",
          output: "Bearer secret-token at /Users/private/input",
        }),
        auditLog({
          id: "cross-group-unsupported-147",
          request_group_id: "other-group",
          result: "failed",
          error_code: "tool_not_registered",
        }),
      ],
      getLatestApprovalForRun: () => undefined,
      listArtifactReceiptsForRun: () => [],
      listArtifactMetadataForRun: () => [],
      listMessageLedgerEvents: () => [
        ledgerEvent(),
        ledgerEvent({
          id: "ledger-text-147",
          event_kind: "text_delivered",
          delivery_key: "delivery-147",
        }),
        ledgerEvent({ id: "cross-group-delivery-147", request_group_id: "other-group" }),
      ],
      buildArtifactAccess: () => ({
        ok: false,
        filePath: "/Users/private/input",
        fileName: "private",
        mimeType: "application/octet-stream",
        previewable: false,
        downloadable: false,
        reason: "outside_state_artifacts",
      }),
      isWebUiApprovalVisible: () => false,
    })

    const result = read(RUN)
    expect(result.capabilityReceipts).toEqual([
      {
        runId: RUN.id,
        requestGroupId: RUN.requestGroupId,
        capability: "tool_execution",
        receiptStatus: "unsupported_capability",
      },
    ])
    expect(result.userReportDelivered).toBe(true)
    expect(result.userReportDeliveryCount).toBe(1)
    expect(result.deliveryReceiptRef).toBe("ledger-147")
    expect(
      JSON.stringify({
        capabilityReceipts: result.capabilityReceipts,
        userReportDelivered: result.userReportDelivered,
      }),
    ).not.toMatch(/private_extension_name|Bearer|secret-token|\/Users\//u)
  })
})
