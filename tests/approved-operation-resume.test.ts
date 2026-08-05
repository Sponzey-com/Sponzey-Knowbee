import { describe, expect, it } from "vitest"
import { buildApprovedOperationResumeCommand } from "../packages/core/src/runs/approved-operation-resume.ts"
import type { ApprovalRegistryRow } from "../packages/core/src/runs/approval-registry.ts"

const bindingHash = `sha256:${"a".repeat(64)}` as const

function row(overrides: Partial<ApprovalRegistryRow> = {}): ApprovalRegistryRow {
  return {
    id: "approval:camera:1",
    run_id: "run:camera:1",
    request_group_id: "group:camera:1",
    channel: "telegram",
    channel_message_id: null,
    tool_name: "yeonjang_camera_capture",
    risk_level: "moderate",
    kind: "approval",
    status: "consumed",
    params_hash: "opaque",
    params_preview_json: null,
    requested_at: 1,
    expires_at: null,
    consumed_at: 2,
    decision_at: 2,
    decision_by: "telegram",
    decision_source: "user",
    superseded_by: null,
    metadata_json: null,
    operation_id: "operation:camera:prepared",
    operation_binding_hash: bindingHash,
    continuation_schema_version: 1,
    created_at: 1,
    updated_at: 2,
    ...overrides,
  }
}

describe("approved operation resume command", () => {
  it("builds one redacted immutable command from the consumed durable row", () => {
    const result = buildApprovedOperationResumeCommand({
      row: row(),
      decision: "allow_once",
      expectedBinding: {
        operationId: "operation:camera:prepared",
        operationBindingHash: bindingHash,
        continuationSchemaVersion: 1,
      },
    })

    expect(result).toEqual({
      status: "ready",
      command: {
        schemaVersion: 1,
        approvalId: "approval:camera:1",
        runId: "run:camera:1",
        requestGroupId: "group:camera:1",
        toolName: "yeonjang_camera_capture",
        decision: "allow_once",
        operationId: "operation:camera:prepared",
        operationBindingHash: bindingHash,
        continuationSchemaVersion: 1,
      },
    })
    expect(Object.isFrozen(result)).toBe(true)
    if (result.status === "ready") expect(Object.isFrozen(result.command)).toBe(true)
    expect(JSON.stringify(result)).not.toMatch(/params|target|path|token|secret/u)
  })

  it("rejects unconsumed, legacy, and wrong-operation rows", () => {
    expect(buildApprovedOperationResumeCommand({
      row: row({ status: "approved_once" }),
      decision: "allow_once",
    })).toEqual({
      status: "rejected",
      reasonCode: "approval_not_consumed",
    })
    expect(buildApprovedOperationResumeCommand({
      row: row({
        operation_id: null,
        operation_binding_hash: null,
        continuation_schema_version: null,
      }),
      decision: "allow_once",
    })).toEqual({
      status: "rejected",
      reasonCode: "approval_operation_binding_invalid",
    })
    expect(buildApprovedOperationResumeCommand({
      row: row(),
      decision: "allow_once",
      expectedBinding: {
        operationId: "operation:camera:other",
        operationBindingHash: bindingHash,
        continuationSchemaVersion: 1,
      },
    })).toEqual({
      status: "rejected",
      reasonCode: "approval_operation_binding_mismatch",
    })
  })
})
