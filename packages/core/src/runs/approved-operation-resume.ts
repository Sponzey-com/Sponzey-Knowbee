import type {
  ApprovalOperationBinding,
  ApprovalRegistryRow,
} from "./approval-registry.js"

export interface ApprovedOperationResumeCommand {
  readonly schemaVersion: 1
  readonly approvalId: string
  readonly runId: string
  readonly requestGroupId: string | null
  readonly toolName: string
  readonly decision: "allow_once" | "allow_run"
  readonly operationId: string
  readonly operationBindingHash: `sha256:${string}`
  readonly continuationSchemaVersion: 1
}

export type ApprovedOperationResumeCommandResult =
  | {
      readonly status: "ready"
      readonly command: ApprovedOperationResumeCommand
    }
  | {
      readonly status: "rejected"
      readonly reasonCode:
        | "approval_not_consumed"
        | "approval_operation_binding_invalid"
        | "approval_operation_binding_mismatch"
    }

const HASH_PATTERN = /^sha256:[a-f0-9]{64}$/u

export function buildApprovedOperationResumeCommand(input: {
  row: ApprovalRegistryRow
  decision: "allow_once" | "allow_run"
  expectedBinding?: ApprovalOperationBinding
}): ApprovedOperationResumeCommandResult {
  if (input.row.status !== "consumed") {
    return Object.freeze({
      status: "rejected" as const,
      reasonCode: "approval_not_consumed" as const,
    })
  }
  if (
    !input.row.operation_id?.trim()
    || !input.row.operation_binding_hash
    || !HASH_PATTERN.test(input.row.operation_binding_hash)
    || input.row.continuation_schema_version !== 1
  ) {
    return Object.freeze({
      status: "rejected" as const,
      reasonCode: "approval_operation_binding_invalid" as const,
    })
  }
  if (
    input.expectedBinding
    && (
      input.row.operation_id !== input.expectedBinding.operationId
      || input.row.operation_binding_hash
        !== input.expectedBinding.operationBindingHash
      || input.row.continuation_schema_version
        !== input.expectedBinding.continuationSchemaVersion
    )
  ) {
    return Object.freeze({
      status: "rejected" as const,
      reasonCode: "approval_operation_binding_mismatch" as const,
    })
  }

  return Object.freeze({
    status: "ready" as const,
    command: Object.freeze({
      schemaVersion: 1 as const,
      approvalId: input.row.id,
      runId: input.row.run_id,
      requestGroupId: input.row.request_group_id,
      toolName: input.row.tool_name,
      decision: input.decision,
      operationId: input.row.operation_id,
      operationBindingHash:
        input.row.operation_binding_hash as `sha256:${string}`,
      continuationSchemaVersion: 1 as const,
    }),
  })
}
