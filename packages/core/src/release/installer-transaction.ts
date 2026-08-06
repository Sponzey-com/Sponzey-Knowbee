export type InstallerTransactionPhase =
  | "preflight"
  | "preflight_passed"
  | "downloaded"
  | "verified"
  | "staged"
  | "activated"
  | "service_registered"
  | "service_skipped"
  | "healthy"
  | "health_skipped"
  | "committed"
  | "failed"
  | "rolling_back"
  | "rolled_back"
  | "cancelled"

export type InstallerEvidenceKind =
  | "preflight"
  | "download"
  | "verification"
  | "stage"
  | "activation"
  | "service"
  | "service_policy"
  | "health"
  | "health_policy"
  | "commit"
  | "rollback"

export interface InstallerTransactionEvidence {
  readonly kind: InstallerEvidenceKind
  readonly receiptRef: string
}

export interface InstallerTransactionFailure {
  readonly reasonCode: string
  readonly recovery: "cleanup" | "rollback"
}

interface InstallerTransactionBase {
  readonly kind: "knowbee.installer.transaction"
  readonly schemaVersion: 1
  readonly operationId: string
  readonly idempotencyKey: string
  readonly targetFingerprint: `sha256:${string}`
  readonly desiredVersion: string
  readonly previousReleaseId: string | null
  readonly revision: number
  readonly appliedEventIds: readonly string[]
  readonly evidence: readonly InstallerTransactionEvidence[]
}

export interface InstallerTransactionNormalState extends InstallerTransactionBase {
  readonly phase: Exclude<InstallerTransactionPhase, "failed" | "rolling_back" | "rolled_back">
  readonly failure: null
}

export interface InstallerTransactionRecoveryState extends InstallerTransactionBase {
  readonly phase: "failed" | "rolling_back" | "rolled_back"
  readonly failure: InstallerTransactionFailure
}

export type InstallerTransactionState =
  | InstallerTransactionNormalState
  | InstallerTransactionRecoveryState

interface InstallerTransactionEventBase {
  readonly eventId: string
  readonly operationId: string
  readonly targetFingerprint: string
  readonly expectedRevision: number
}

type ReceiptEventType =
  | "preflight_passed"
  | "bundle_downloaded"
  | "bundle_verified"
  | "stage_prepared"
  | "service_registered"
  | "service_skipped"
  | "health_verified"
  | "health_skipped"
  | "commit_completed"
  | "rollback_completed"

export type InstallerTransactionEvent =
  | (InstallerTransactionEventBase & {
      readonly type: ReceiptEventType
      readonly receiptRef: string
    })
  | (InstallerTransactionEventBase & {
      readonly type: "activation_completed"
      readonly receiptRef: string
      readonly previousReleaseId: string | null
    })
  | (InstallerTransactionEventBase & {
      readonly type: "failure_recorded"
      readonly reasonCode: string
    })
  | (InstallerTransactionEventBase & { readonly type: "rollback_started" })
  | (InstallerTransactionEventBase & { readonly type: "cancelled" })

export type InstallerTransactionReduceResult =
  | { readonly status: "applied"; readonly state: InstallerTransactionState }
  | { readonly status: "rejected"; readonly reasonCode: string }

export type InstallerTransactionRecoveryAction =
  | { readonly action: "resume" }
  | { readonly action: "discard_stage_and_resume" }
  | { readonly action: "resume_commit" }
  | { readonly action: "resume_policy_commit" }
  | { readonly action: "cleanup" }
  | { readonly action: "rollback"; readonly previousReleaseId: string | null }
  | { readonly action: "none"; readonly reasonCode: "terminal" }

const ROOT_KEYS = [
  "kind",
  "schemaVersion",
  "operationId",
  "idempotencyKey",
  "targetFingerprint",
  "desiredVersion",
  "previousReleaseId",
  "phase",
  "revision",
  "appliedEventIds",
  "evidence",
  "failure",
]
const EVIDENCE_KEYS = ["kind", "receiptRef"]
const FAILURE_KEYS = ["reasonCode", "recovery"]
const FINGERPRINT = /^sha256:[a-f0-9]{64}$/
const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/
const PHASES = new Set<InstallerTransactionPhase>([
  "preflight",
  "preflight_passed",
  "downloaded",
  "verified",
  "staged",
  "activated",
  "service_registered",
  "service_skipped",
  "healthy",
  "health_skipped",
  "committed",
  "failed",
  "rolling_back",
  "rolled_back",
  "cancelled",
])
const EVIDENCE_SEQUENCE: readonly InstallerEvidenceKind[] = [
  "preflight",
  "download",
  "verification",
  "stage",
  "activation",
  "service",
  "health",
  "commit",
]
const EVIDENCE_PATHS: readonly (readonly InstallerEvidenceKind[])[] = [
  EVIDENCE_SEQUENCE,
  [
    "preflight",
    "download",
    "verification",
    "stage",
    "activation",
    "service_policy",
    "health_policy",
    "commit",
  ],
  [
    "preflight",
    "download",
    "verification",
    "stage",
    "activation",
    "service",
    "health_policy",
    "commit",
  ],
]

type UnknownRecord = Readonly<Record<string, unknown>>

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function hasExactKeys(value: UnknownRecord, expected: readonly string[]): boolean {
  const keys = Object.keys(value)
  return keys.length === expected.length && keys.every((key) => expected.includes(key))
}

function isBoundedId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 240
}

function freezeState(state: InstallerTransactionState): InstallerTransactionState {
  const frozen = Object.freeze({
    ...state,
    appliedEventIds: Object.freeze([...state.appliedEventIds]),
    evidence: Object.freeze(state.evidence.map((item) => Object.freeze({ ...item }))),
    failure: state.failure ? Object.freeze({ ...state.failure }) : null,
  })
  return frozen as InstallerTransactionState
}

function reject(reasonCode: string): InstallerTransactionReduceResult {
  return { status: "rejected", reasonCode }
}

export function startInstallerTransaction(input: {
  readonly operationId: string
  readonly idempotencyKey: string
  readonly targetFingerprint: string
  readonly desiredVersion: string
}): InstallerTransactionState {
  if (
    !isBoundedId(input.operationId) ||
    !isBoundedId(input.idempotencyKey) ||
    !FINGERPRINT.test(input.targetFingerprint) ||
    !VERSION.test(input.desiredVersion)
  ) {
    throw new Error("installer_transaction_identity_invalid")
  }
  return freezeState({
    kind: "knowbee.installer.transaction",
    schemaVersion: 1,
    operationId: input.operationId,
    idempotencyKey: input.idempotencyKey,
    targetFingerprint: input.targetFingerprint as `sha256:${string}`,
    desiredVersion: input.desiredVersion,
    previousReleaseId: null,
    phase: "preflight",
    revision: 0,
    appliedEventIds: [],
    evidence: [],
    failure: null,
  })
}

function evidenceForEvent(event: InstallerTransactionEvent): InstallerTransactionEvidence | null {
  switch (event.type) {
    case "preflight_passed":
      return { kind: "preflight", receiptRef: event.receiptRef }
    case "bundle_downloaded":
      return { kind: "download", receiptRef: event.receiptRef }
    case "bundle_verified":
      return { kind: "verification", receiptRef: event.receiptRef }
    case "stage_prepared":
      return { kind: "stage", receiptRef: event.receiptRef }
    case "activation_completed":
      return { kind: "activation", receiptRef: event.receiptRef }
    case "service_registered":
      return { kind: "service", receiptRef: event.receiptRef }
    case "service_skipped":
      return { kind: "service_policy", receiptRef: event.receiptRef }
    case "health_verified":
      return { kind: "health", receiptRef: event.receiptRef }
    case "health_skipped":
      return { kind: "health_policy", receiptRef: event.receiptRef }
    case "commit_completed":
      return { kind: "commit", receiptRef: event.receiptRef }
    case "rollback_completed":
      return { kind: "rollback", receiptRef: event.receiptRef }
    case "failure_recorded":
    case "rollback_started":
    case "cancelled":
      return null
  }
}

function expectedTransition(
  phase: InstallerTransactionPhase,
  type: InstallerTransactionEvent["type"],
): InstallerTransactionPhase | undefined {
  const transitions: Readonly<
    Partial<Record<InstallerTransactionEvent["type"], InstallerTransactionPhase>>
  > = {
    preflight_passed: "preflight_passed",
    bundle_downloaded: "downloaded",
    bundle_verified: "verified",
    stage_prepared: "staged",
    activation_completed: "activated",
    service_registered: "service_registered",
    service_skipped: "service_skipped",
    health_verified: "healthy",
    health_skipped: "health_skipped",
    commit_completed: "committed",
    rollback_started: "rolling_back",
    rollback_completed: "rolled_back",
  }
  const requiredPhase: Partial<
    Record<InstallerTransactionEvent["type"], InstallerTransactionPhase>
  > = {
    preflight_passed: "preflight",
    bundle_downloaded: "preflight_passed",
    bundle_verified: "downloaded",
    stage_prepared: "verified",
    activation_completed: "staged",
    service_registered: "activated",
    service_skipped: "activated",
    health_verified: "service_registered",
    health_skipped: "service_registered",
    rollback_started: "failed",
    rollback_completed: "rolling_back",
  }
  if (type === "health_skipped" && phase === "service_skipped") return "health_skipped"
  if (type === "commit_completed" && (phase === "healthy" || phase === "health_skipped")) {
    return "committed"
  }
  return requiredPhase[type] === phase ? transitions[type] : undefined
}

function isTerminal(phase: InstallerTransactionPhase): boolean {
  return phase === "committed" || phase === "rolled_back" || phase === "cancelled"
}

function requiresRollback(phase: InstallerTransactionPhase): boolean {
  return (
    phase === "activated" ||
    phase === "service_registered" ||
    phase === "service_skipped" ||
    phase === "healthy" ||
    phase === "health_skipped" ||
    phase === "failed" ||
    phase === "rolling_back"
  )
}

export function reduceInstallerTransaction(
  state: InstallerTransactionState,
  event: InstallerTransactionEvent,
): InstallerTransactionReduceResult {
  if (event.operationId !== state.operationId) {
    return reject("installer_event_operation_mismatch")
  }
  if (event.targetFingerprint !== state.targetFingerprint) {
    return reject("installer_event_target_mismatch")
  }
  if (state.appliedEventIds.includes(event.eventId)) {
    return reject("installer_event_duplicate")
  }
  if (event.expectedRevision !== state.revision) {
    return reject("installer_event_revision_mismatch")
  }
  if (!isBoundedId(event.eventId)) return reject("installer_event_invalid")
  if (isTerminal(state.phase)) {
    return reject(`installer_transition_invalid:${state.phase}:${event.type}`)
  }

  let nextPhase: InstallerTransactionPhase | undefined
  let failure = state.failure
  let previousReleaseId = state.previousReleaseId
  if (event.type === "failure_recorded") {
    if (
      !isBoundedId(event.reasonCode) ||
      state.phase === "failed" ||
      state.phase === "rolling_back"
    ) {
      return reject(`installer_transition_invalid:${state.phase}:${event.type}`)
    }
    const recovery = requiresRollback(state.phase) ? "rollback" : "cleanup"
    nextPhase = "failed"
    failure = { reasonCode: event.reasonCode, recovery }
  } else if (event.type === "cancelled") {
    if (state.phase === "failed" || state.phase === "rolling_back") {
      return reject(`installer_transition_invalid:${state.phase}:${event.type}`)
    }
    if (requiresRollback(state.phase)) {
      nextPhase = "failed"
      failure = { reasonCode: "installer_cancelled", recovery: "rollback" }
    } else {
      nextPhase = "cancelled"
      failure = null
    }
  } else {
    nextPhase = expectedTransition(state.phase, event.type)
    if (!nextPhase) return reject(`installer_transition_invalid:${state.phase}:${event.type}`)
    if (event.type === "rollback_started" && state.failure?.recovery !== "rollback") {
      return reject(`installer_transition_invalid:${state.phase}:${event.type}`)
    }
    if (event.type === "activation_completed") previousReleaseId = event.previousReleaseId
  }

  const eventEvidence = evidenceForEvent(event)
  const next = {
    ...state,
    phase: nextPhase,
    revision: state.revision + 1,
    appliedEventIds: [...state.appliedEventIds, event.eventId],
    evidence: eventEvidence ? [...state.evidence, eventEvidence] : state.evidence,
    previousReleaseId,
    failure,
  } as InstallerTransactionState
  return { status: "applied", state: freezeState(next) }
}

export function recoverInstallerTransaction(
  state: InstallerTransactionState,
): InstallerTransactionRecoveryAction {
  switch (state.phase) {
    case "preflight":
    case "preflight_passed":
    case "downloaded":
    case "verified":
      return { action: "resume" }
    case "staged":
      return { action: "discard_stage_and_resume" }
    case "activated":
    case "service_registered":
    case "rolling_back":
      return { action: "rollback", previousReleaseId: state.previousReleaseId }
    case "service_skipped":
      return { action: "resume_policy_commit" }
    case "healthy":
    case "health_skipped":
      return { action: "resume_commit" }
    case "failed":
      return state.failure.recovery === "rollback"
        ? { action: "rollback", previousReleaseId: state.previousReleaseId }
        : { action: "cleanup" }
    case "committed":
    case "rolled_back":
    case "cancelled":
      return { action: "none", reasonCode: "terminal" }
  }
}

function parseEvidence(value: unknown): readonly InstallerTransactionEvidence[] | undefined {
  if (!Array.isArray(value) || value.length > 16) return undefined
  const parsed: InstallerTransactionEvidence[] = []
  for (const item of value) {
    if (
      !isRecord(item) ||
      !hasExactKeys(item, EVIDENCE_KEYS) ||
      typeof item.kind !== "string" ||
      ![...new Set(EVIDENCE_PATHS.flat()), "rollback"].includes(
        item.kind as InstallerEvidenceKind,
      ) ||
      !isBoundedId(item.receiptRef)
    ) {
      return undefined
    }
    parsed.push({ kind: item.kind as InstallerEvidenceKind, receiptRef: item.receiptRef })
  }
  const normal = parsed.filter((item) => item.kind !== "rollback")
  if (!EVIDENCE_PATHS.some((path) => normal.every((item, index) => item.kind === path[index])))
    return undefined
  const rollbackIndex = parsed.findIndex((item) => item.kind === "rollback")
  if (rollbackIndex >= 0 && rollbackIndex !== parsed.length - 1) return undefined
  return parsed
}

function evidenceMatchesPhase(
  phase: InstallerTransactionPhase,
  evidence: readonly InstallerTransactionEvidence[],
  failure: InstallerTransactionFailure | null,
): boolean {
  const rollbackRecorded = evidence.at(-1)?.kind === "rollback"
  const completedSteps = evidence.filter((item) => item.kind !== "rollback").length
  const exactSteps: Partial<Record<InstallerTransactionPhase, number>> = {
    preflight: 0,
    preflight_passed: 1,
    downloaded: 2,
    verified: 3,
    staged: 4,
    activated: 5,
    service_registered: 6,
    service_skipped: 6,
    healthy: 7,
    health_skipped: 7,
    committed: 8,
  }
  const exact = exactSteps[phase]
  if (exact !== undefined) {
    const lastKind = evidence.at(-1)?.kind
    const phaseKind: Partial<Record<InstallerTransactionPhase, InstallerEvidenceKind>> = {
      service_registered: "service",
      service_skipped: "service_policy",
      healthy: "health",
      health_skipped: "health_policy",
      committed: "commit",
    }
    return (
      !rollbackRecorded &&
      completedSteps === exact &&
      failure === null &&
      (phaseKind[phase] === undefined || lastKind === phaseKind[phase])
    )
  }
  if (phase === "cancelled") return !rollbackRecorded && completedSteps < 5 && failure === null
  if (phase === "rolled_back") {
    return rollbackRecorded && completedSteps >= 5 && failure?.recovery === "rollback"
  }
  if (phase === "rolling_back") {
    return !rollbackRecorded && completedSteps >= 5 && failure?.recovery === "rollback"
  }
  if (phase === "failed") {
    if (rollbackRecorded || !failure) return false
    return failure.recovery === "rollback" ? completedSteps >= 5 : completedSteps < 5
  }
  return false
}

export type InstallerTransactionSnapshotParseResult =
  | { readonly status: "accepted"; readonly state: InstallerTransactionState }
  | { readonly status: "rejected"; readonly reasonCode: "installer_snapshot_invalid" }

export function parseInstallerTransactionSnapshot(
  value: unknown,
): InstallerTransactionSnapshotParseResult {
  if (!isRecord(value) || !hasExactKeys(value, ROOT_KEYS)) {
    return { status: "rejected", reasonCode: "installer_snapshot_invalid" }
  }
  const evidence = parseEvidence(value.evidence)
  const eventIds = value.appliedEventIds
  if (
    value.kind !== "knowbee.installer.transaction" ||
    value.schemaVersion !== 1 ||
    !isBoundedId(value.operationId) ||
    !isBoundedId(value.idempotencyKey) ||
    typeof value.targetFingerprint !== "string" ||
    !FINGERPRINT.test(value.targetFingerprint) ||
    typeof value.desiredVersion !== "string" ||
    !VERSION.test(value.desiredVersion) ||
    (value.previousReleaseId !== null && !isBoundedId(value.previousReleaseId)) ||
    typeof value.phase !== "string" ||
    !PHASES.has(value.phase as InstallerTransactionPhase) ||
    !Number.isSafeInteger(value.revision) ||
    (value.revision as number) < 0 ||
    !Array.isArray(eventIds) ||
    eventIds.some((item) => !isBoundedId(item)) ||
    new Set(eventIds).size !== eventIds.length ||
    eventIds.length !== value.revision ||
    !evidence
  ) {
    return { status: "rejected", reasonCode: "installer_snapshot_invalid" }
  }

  const recoveryPhase =
    value.phase === "failed" || value.phase === "rolling_back" || value.phase === "rolled_back"
  let failure: InstallerTransactionFailure | null = null
  if (recoveryPhase) {
    if (
      !isRecord(value.failure) ||
      !hasExactKeys(value.failure, FAILURE_KEYS) ||
      !isBoundedId(value.failure.reasonCode) ||
      (value.failure.recovery !== "cleanup" && value.failure.recovery !== "rollback") ||
      ((value.phase === "rolling_back" || value.phase === "rolled_back") &&
        value.failure.recovery !== "rollback")
    ) {
      return { status: "rejected", reasonCode: "installer_snapshot_invalid" }
    }
    failure = { reasonCode: value.failure.reasonCode, recovery: value.failure.recovery }
  } else if (value.failure !== null) {
    return { status: "rejected", reasonCode: "installer_snapshot_invalid" }
  }
  if (!evidenceMatchesPhase(value.phase as InstallerTransactionPhase, evidence, failure)) {
    return { status: "rejected", reasonCode: "installer_snapshot_invalid" }
  }

  const state = {
    kind: "knowbee.installer.transaction",
    schemaVersion: 1,
    operationId: value.operationId,
    idempotencyKey: value.idempotencyKey,
    targetFingerprint: value.targetFingerprint as `sha256:${string}`,
    desiredVersion: value.desiredVersion,
    previousReleaseId: value.previousReleaseId as string | null,
    phase: value.phase as InstallerTransactionPhase,
    revision: value.revision as number,
    appliedEventIds: eventIds as string[],
    evidence,
    failure,
  } as InstallerTransactionState
  return { status: "accepted", state: freezeState(state) }
}
