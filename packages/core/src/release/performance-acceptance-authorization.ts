import type {
  PerformanceAcceptanceAuthorizationPort,
  PerformanceAcceptanceAuthorizationReceipt,
  PerformanceAcceptanceMatrixCandidate,
} from "../maintenance/performance-acceptance-matrix.js"
import { validatePerformanceAcceptanceMatrix } from "../maintenance/performance-acceptance-matrix.js"
import type { ReleaseAdministratorPrincipal } from "./release-administrator.js"

export interface PerformanceAcceptanceAuthorizationRecord
  extends PerformanceAcceptanceAuthorizationReceipt {
  authenticationId: string
}

export interface PerformanceAcceptanceAuthorizationBinding {
  scope: "performance_release_gate"
  matrixId: string
  matrixVersion: number
  baselineVersion: string
}

export interface PerformanceAcceptanceAuthorizationRepository {
  append(record: Readonly<PerformanceAcceptanceAuthorizationRecord>): {
    status: "stored" | "duplicate_id"
  }
  findLatest(
    binding: Readonly<PerformanceAcceptanceAuthorizationBinding>,
  ): Readonly<PerformanceAcceptanceAuthorizationRecord> | undefined
}

export interface PerformanceAcceptanceMatrixSelector {
  matrixId: string
  matrixVersion: number
  baselineVersion: string
}

export type SelectedPerformanceAcceptanceMatrix = {
  status: "selected"
  candidate: Readonly<PerformanceAcceptanceMatrixCandidate>
  authorizationPort: PerformanceAcceptanceAuthorizationPort
}

export function selectPerformanceAcceptanceMatrix(input: {
  selector: PerformanceAcceptanceMatrixSelector
  repository: PerformanceAcceptanceAuthorizationRepository
}): SelectedPerformanceAcceptanceMatrix | { status: "baseline_only"; reasonCodes: string[] } {
  const { selector } = input
  if (
    !selector.matrixId.trim() ||
    selector.matrixId !== selector.matrixId.trim() ||
    !Number.isSafeInteger(selector.matrixVersion) ||
    selector.matrixVersion < 1 ||
    !selector.baselineVersion.trim() ||
    selector.baselineVersion !== selector.baselineVersion.trim()
  ) {
    return { status: "baseline_only", reasonCodes: ["performance_matrix_selector_invalid"] }
  }

  let record: Readonly<PerformanceAcceptanceAuthorizationRecord> | undefined
  try {
    record = input.repository.findLatest({
      scope: "performance_release_gate",
      matrixId: selector.matrixId,
      matrixVersion: selector.matrixVersion,
      baselineVersion: selector.baselineVersion,
    })
  } catch {
    return {
      status: "baseline_only",
      reasonCodes: ["performance_matrix_selection_unavailable"],
    }
  }
  if (!record) {
    return { status: "baseline_only", reasonCodes: ["performance_matrix_selection_missing"] }
  }
  if (record.decision !== "approved") {
    return {
      status: "baseline_only",
      reasonCodes: ["performance_matrix_selection_not_approved"],
    }
  }
  if (
    record.scope !== "performance_release_gate" ||
    record.matrixId !== selector.matrixId ||
    record.matrixVersion !== selector.matrixVersion ||
    record.baselineVersion !== selector.baselineVersion
  ) {
    return {
      status: "baseline_only",
      reasonCodes: ["performance_matrix_selection_binding_mismatch"],
    }
  }

  const validation = validatePerformanceAcceptanceMatrix({
    schemaVersion: 1,
    matrixId: record.matrixId,
    matrixVersion: record.matrixVersion,
    baselineVersion: record.baselineVersion,
    baselineSnapshot: record.baselineSnapshot,
    thresholds: { ...record.thresholdSnapshot },
  })
  if (validation.status === "baseline_only") {
    return {
      status: "baseline_only",
      reasonCodes: ["performance_matrix_selection_record_invalid"],
    }
  }
  const authorization = Object.freeze({
    ...record,
    thresholdSnapshot: validation.candidate.thresholds,
    baselineSnapshot: validation.candidate.baselineSnapshot,
  })
  return {
    status: "selected",
    candidate: validation.candidate,
    authorizationPort: { resolve: () => authorization },
  }
}

export function authorizePerformanceAcceptanceMatrix(input: {
  candidate: PerformanceAcceptanceMatrixCandidate
  decision: PerformanceAcceptanceAuthorizationRecord["decision"]
  principal: ReleaseAdministratorPrincipal
  authorizationId: string
  decidedAt: number
  repository: PerformanceAcceptanceAuthorizationRepository
}):
  | { status: "recorded"; record: Readonly<PerformanceAcceptanceAuthorizationRecord> }
  | { status: "rejected"; reasonCode: string } {
  if (!input.principal.authenticationId.trim()) {
    return {
      status: "rejected",
      reasonCode: "performance_authorization_authentication_required",
    }
  }
  if (
    input.principal.principalType !== "authenticated_user" ||
    !input.principal.principalId.trim()
  ) {
    return { status: "rejected", reasonCode: "performance_authorization_principal_invalid" }
  }
  if (!input.principal.roles.includes("release_administrator")) {
    return { status: "rejected", reasonCode: "performance_authorization_role_required" }
  }
  if (
    !input.authorizationId.trim() ||
    !Number.isSafeInteger(input.decidedAt) ||
    input.decidedAt < 0
  ) {
    return { status: "rejected", reasonCode: "performance_authorization_command_invalid" }
  }
  if (
    input.decision !== "approved" &&
    input.decision !== "denied" &&
    input.decision !== "revoked"
  ) {
    return { status: "rejected", reasonCode: "performance_authorization_decision_invalid" }
  }
  const validation = validatePerformanceAcceptanceMatrix(input.candidate)
  if (validation.status === "baseline_only") {
    return {
      status: "rejected",
      reasonCode: `performance_authorization_candidate_invalid:${validation.reasonCodes[0] ?? "unknown"}`,
    }
  }

  const record: Readonly<PerformanceAcceptanceAuthorizationRecord> = Object.freeze({
    schemaVersion: 1,
    authorizationId: input.authorizationId.trim(),
    decision: input.decision,
    actorType: "administrator",
    actorId: input.principal.principalId.trim(),
    authenticationId: input.principal.authenticationId.trim(),
    scope: "performance_release_gate",
    matrixId: validation.candidate.matrixId,
    matrixVersion: validation.candidate.matrixVersion,
    baselineVersion: validation.candidate.baselineVersion,
    thresholdSnapshot: validation.candidate.thresholds,
    baselineSnapshot: validation.candidate.baselineSnapshot,
    approvedAt: input.decidedAt,
  })
  try {
    if (input.repository.append(record).status === "duplicate_id") {
      return { status: "rejected", reasonCode: "performance_authorization_id_duplicate" }
    }
  } catch {
    return { status: "rejected", reasonCode: "performance_authorization_repository_failed" }
  }
  return { status: "recorded", record }
}

export function createPerformanceAcceptanceAuthorizationPort(
  repository: PerformanceAcceptanceAuthorizationRepository,
): PerformanceAcceptanceAuthorizationPort {
  return {
    resolve(candidate) {
      try {
        const record = repository.findLatest({
          scope: "performance_release_gate",
          matrixId: candidate.matrixId,
          matrixVersion: candidate.matrixVersion,
          baselineVersion: candidate.baselineVersion,
        })
        return record?.decision === "approved" ? record : undefined
      } catch {
        return undefined
      }
    },
  }
}
