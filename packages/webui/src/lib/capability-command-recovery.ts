import { projectUserRecovery } from "./user-recovery"

export type CapabilityCommandRecoveryCode =
  | "capability_command_authorization"
  | "capability_command_conflict"
  | "capability_command_unavailable"
  | "capability_command_rejected"
  | "capability_command_unverified"
  | "capability_command_failed"

export function projectCapabilityCommandFailure(cause: unknown): CapabilityCommandRecoveryCode {
  const projection = projectUserRecovery(cause, "mutation")
  if (projection.kind === "authentication" || projection.kind === "authorization")
    return "capability_command_authorization"
  if (projection.kind === "conflict") return "capability_command_conflict"
  if (projection.kind === "unavailable") return "capability_command_unavailable"
  if (projection.kind === "invalid_input" || projection.kind === "unsupported")
    return "capability_command_rejected"
  return "capability_command_failed"
}

export function projectCapabilityReceiptReason(
  reasonCode: string | null | undefined,
): CapabilityCommandRecoveryCode {
  if (
    reasonCode === "permission_denied" ||
    reasonCode === "authentication_required" ||
    reasonCode === "yeonjang_recovery_action_denied"
  )
    return "capability_command_authorization"
  if (
    reasonCode === "mutation_revision_conflict" ||
    reasonCode === "persisted_revision_mismatch" ||
    reasonCode === "stale_revision"
  )
    return "capability_command_conflict"
  if (
    reasonCode === "service_unavailable" ||
    reasonCode === "network_unavailable" ||
    reasonCode === "yeonjang_unavailable"
  )
    return "capability_command_unavailable"
  if (
    reasonCode === "yeonjang_recovery_projection_not_verified" ||
    reasonCode === "yeonjang_binding_projection_not_verified"
  )
    return "capability_command_unverified"
  if (
    reasonCode === "validation_failed" ||
    reasonCode === "unsupported_operation" ||
    reasonCode === "yeonjang_recovery_rejected" ||
    reasonCode === "yeonjang_binding_rejected"
  )
    return "capability_command_rejected"
  return "capability_command_failed"
}

export function capabilityCommandRecoveryText(code: string | null, language: "ko" | "en"): string {
  const korean = language === "ko"
  if (code === "capability_command_authorization")
    return korean
      ? "이 작업에 필요한 권한이 없습니다. 권한을 확인한 뒤 다시 시도하세요."
      : "You do not have permission for this action. Check access, then try again."
  if (code === "capability_command_conflict")
    return korean
      ? "다른 변경이 먼저 반영되었습니다. 최신 상태를 불러온 뒤 다시 확인하세요."
      : "Another change was applied first. Load the latest state, then review it again."
  if (code === "capability_command_unavailable")
    return korean
      ? "연장에 일시적으로 연결할 수 없습니다. 연결 상태를 확인한 뒤 다시 시도하세요."
      : "Yeonjang is temporarily unavailable. Check the connection, then try again."
  if (code === "capability_command_rejected")
    return korean
      ? "현재 상태에서는 이 변경을 적용할 수 없습니다. 최신 상태와 입력을 확인하세요."
      : "This change cannot be applied in the current state. Review the latest state and input."
  if (code === "capability_command_unverified")
    return korean
      ? "변경 결과를 확인하지 못했습니다. 최신 상태를 다시 불러오세요."
      : "The result could not be verified. Load the latest state."
  return korean
    ? "작업을 완료하지 못했습니다. 최신 상태를 확인한 뒤 다시 시도하세요."
    : "The action could not be completed. Review the latest state, then try again."
}
