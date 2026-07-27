export const DOCUMENTED_PROMPT_ACTIVATION_METHODS = ["restart", "reload", "registry_activation"] as const
export const PROMPT_ACTIVATION_LOADER_KINDS = ["process", "agent"] as const

export type DocumentedPromptActivationMethod = typeof DOCUMENTED_PROMPT_ACTIVATION_METHODS[number]
export type PromptActivationLoaderKind = typeof PROMPT_ACTIVATION_LOADER_KINDS[number]

export interface PromptActivationLoaderReceipt {
  kind: PromptActivationLoaderKind
  loaderId: string
  runtimeId: string
  runtimeSnapshotId: string
  evidenceRef: string
}

export type PromptActivationMethodEvidence =
  | { method: "restart"; previousRuntimeSnapshotId: string; nextRuntimeSnapshotId: string; evidenceRef: string }
  | { method: "reload"; reloadReceiptId: string; runtimeSnapshotId: string; evidenceRef: string }
  | { method: "registry_activation"; registryVersionRef: string; runtimeSnapshotId: string; evidenceRef: string }

export interface PromptActivationEvidenceReceipt {
  activationId: string
  sourceRef: string
  sourceVersion: string
  sourceChecksum: string
  sourceWrittenAt: number
  activatedAt: number
  issuedAt: number
  expiresAt: number
  loader: PromptActivationLoaderReceipt
  methodEvidence: PromptActivationMethodEvidence
}

export type PromptActivationEvidenceDecision =
  | { status: "authorized"; activationId: string; sourceRef: string; sourceVersion: string; sourceChecksum: string; loaderId: string; activatedAt: number; method: DocumentedPromptActivationMethod; evidenceRefs: string[] }
  | { status: "blocked"; reasonCode:
      | "activation_identity_invalid"
      | "activation_loader_invalid"
      | "activation_runtime_mismatch"
      | "activation_timestamp_invalid"
      | "activation_receipt_expired"
      | "activation_method_invalid"
      | "activation_method_evidence_mismatch" }

function exact(value: string): string {
  return value.trim()
}

export function authorizePromptActivationEvidence(input: {
  receipt: PromptActivationEvidenceReceipt
  expectedRuntimeId: string
  expectedRuntimeSnapshotId: string
  now: number
}): PromptActivationEvidenceDecision {
  const receipt = input.receipt
  if (!exact(receipt.activationId) || !exact(receipt.sourceRef) || !exact(receipt.sourceVersion) || !exact(receipt.sourceChecksum)) {
    return { status: "blocked", reasonCode: "activation_identity_invalid" }
  }
  const loader = receipt.loader
  if (!PROMPT_ACTIVATION_LOADER_KINDS.includes(loader.kind) || !exact(loader.loaderId)
    || !exact(loader.runtimeId) || !exact(loader.runtimeSnapshotId) || !exact(loader.evidenceRef)) {
    return { status: "blocked", reasonCode: "activation_loader_invalid" }
  }
  if (loader.runtimeId !== input.expectedRuntimeId || loader.runtimeSnapshotId !== input.expectedRuntimeSnapshotId) {
    return { status: "blocked", reasonCode: "activation_runtime_mismatch" }
  }
  if (![receipt.sourceWrittenAt, receipt.activatedAt, receipt.issuedAt, receipt.expiresAt, input.now].every((value) => Number.isSafeInteger(value) && value >= 0)
    || receipt.activatedAt < receipt.sourceWrittenAt || receipt.issuedAt < receipt.activatedAt || receipt.issuedAt > input.now) {
    return { status: "blocked", reasonCode: "activation_timestamp_invalid" }
  }
  if (receipt.expiresAt <= input.now || receipt.expiresAt <= receipt.issuedAt) {
    return { status: "blocked", reasonCode: "activation_receipt_expired" }
  }
  const evidence = receipt.methodEvidence
  if (!DOCUMENTED_PROMPT_ACTIVATION_METHODS.includes(evidence.method)) {
    return { status: "blocked", reasonCode: "activation_method_invalid" }
  }
  let methodEvidenceValid = false
  if (evidence.method === "restart") {
    methodEvidenceValid = Boolean(exact(evidence.previousRuntimeSnapshotId)
      && exact(evidence.nextRuntimeSnapshotId) === loader.runtimeSnapshotId
      && evidence.previousRuntimeSnapshotId !== evidence.nextRuntimeSnapshotId
      && exact(evidence.evidenceRef))
  } else if (evidence.method === "reload") {
    methodEvidenceValid = Boolean(exact(evidence.reloadReceiptId)
      && evidence.runtimeSnapshotId === loader.runtimeSnapshotId && exact(evidence.evidenceRef))
  } else {
    methodEvidenceValid = Boolean(exact(evidence.registryVersionRef)
      && evidence.runtimeSnapshotId === loader.runtimeSnapshotId && exact(evidence.evidenceRef))
  }
  if (!methodEvidenceValid) return { status: "blocked", reasonCode: "activation_method_evidence_mismatch" }
  return {
    status: "authorized",
    activationId: receipt.activationId,
    sourceRef: receipt.sourceRef,
    sourceVersion: receipt.sourceVersion,
    sourceChecksum: receipt.sourceChecksum,
    loaderId: loader.loaderId,
    activatedAt: receipt.activatedAt,
    method: evidence.method,
    evidenceRefs: [loader.evidenceRef, evidence.evidenceRef],
  }
}

export async function publishPromptActivationEvidence<T>(input: {
  decision: PromptActivationEvidenceDecision
  publish: (authorization: Extract<PromptActivationEvidenceDecision, { status: "authorized" }>) => Promise<T>
}): Promise<{ status: "published"; result: T } | Extract<PromptActivationEvidenceDecision, { status: "blocked" }>> {
  if (input.decision.status !== "authorized") return input.decision
  return { status: "published", result: await input.publish(input.decision) }
}
