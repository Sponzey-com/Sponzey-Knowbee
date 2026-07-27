export type WebResearchFingerprint = `sha256:${string}`
export type WebResearchFingerprintPort = (
  namespace: string,
  value: unknown,
) => WebResearchFingerprint

export type WebResearchMethodCandidate =
  | Readonly<{
      candidateId: string
      kind: "search"
      query: string
      strategyFingerprint: WebResearchFingerprint
    }>
  | Readonly<{
      candidateId: string
      kind: "fetch"
      sourceUrl: string
      evidenceRef: string
      strategyFingerprint: WebResearchFingerprint
      discovery?: WebResearchFetchCandidateDiscovery
    }>

export interface WebResearchFetchCandidateDiscovery {
  readonly origin: "fetched_document_link"
  readonly parentEvidenceRef: string
  readonly parentProvenanceRef: string
  readonly documentFinalUrl: string
  readonly observationOrdinal: number
  readonly discoveryFingerprint: WebResearchFingerprint
}

export interface WebResearchTerminalAdmission {
  readonly completionAllowed: boolean
  readonly blockedAllowed: boolean
  readonly remainingChangedCandidateIds: readonly string[]
}

export interface WebResearchSnapshot {
  readonly schemaVersion: 1
  readonly runId: string
  readonly snapshotId: string
  readonly snapshotFingerprint: WebResearchFingerprint
  readonly candidates: readonly WebResearchMethodCandidate[]
  readonly evidenceRefs: readonly string[]
  readonly attemptedStrategyFingerprints: readonly WebResearchFingerprint[]
  readonly terminalAdmission: WebResearchTerminalAdmission
}

export type WebResearchNextAction =
  | Readonly<{
      kind: "execute_search"
      candidateId: string
      query: string
      strategyFingerprint: WebResearchFingerprint
    }>
  | Readonly<{
      kind: "execute_fetch"
      candidateId: string
      sourceUrl: string
      evidenceRef: string
      strategyFingerprint: WebResearchFingerprint
    }>
  | Readonly<{
      kind: "propose_complete"
      evidenceRefs: readonly string[]
    }>
  | Readonly<{
      kind: "propose_blocked"
      evidenceRefs: readonly string[]
      reasonCode: string
    }>

export interface WebResearchMethodReceipt {
  readonly schemaVersion: 1
  readonly receiptId: string
  readonly diagnosedBy: "llm"
  readonly runId: string
  readonly snapshotId: string
  readonly snapshotFingerprint: WebResearchFingerprint
  readonly proposalFingerprint: WebResearchFingerprint
}

export interface WebResearchMethodProviderInput {
  readonly runId: string
  readonly snapshot: WebResearchSnapshot
}

export interface WebResearchMethodProvider {
  proposeNextAction(input: WebResearchMethodProviderInput): unknown | Promise<unknown>
}

export type WebResearchMethodAdmissionReason =
  | "web_research_snapshot_invalid"
  | "web_research_proposal_invalid"
  | "web_research_receipt_invalid"
  | "web_research_receipt_run_mismatch"
  | "web_research_receipt_snapshot_mismatch"
  | "web_research_receipt_proposal_mismatch"
  | "web_research_candidate_missing"
  | "web_research_candidate_mismatch"
  | "web_research_strategy_unchanged"
  | "web_research_evidence_not_admitted"
  | "web_research_completion_not_admitted"
  | "web_research_blocked_not_admitted"
  | "web_research_changed_candidate_remaining"

export type WebResearchMethodAdmission =
  | Readonly<{
      ok: true
      action: WebResearchNextAction
      receiptId: string
    }>
  | Readonly<{
      ok: false
      reasonCode: WebResearchMethodAdmissionReason
    }>

const SHA256 = /^sha256:[a-f0-9]{64}$/u

function text(value: unknown, maxLength = 2_048): string | null {
  if (typeof value !== "string") return null
  const normalized = value.trim()
  return normalized.length > 0 && normalized.length <= maxLength ? normalized : null
}

function uniqueTextList(value: unknown, maxLength = 2_048): readonly string[] | null {
  if (!Array.isArray(value)) return null
  const normalized = value.map((item) => text(item, maxLength))
  if (normalized.some((item) => item === null) || new Set(normalized).size !== normalized.length) {
    return null
  }
  return Object.freeze(normalized as string[])
}

function fingerprintList(value: unknown): readonly WebResearchFingerprint[] | null {
  const normalized = uniqueTextList(value, 80)
  if (!normalized || normalized.some((item) => !SHA256.test(item))) return null
  return Object.freeze(normalized as WebResearchFingerprint[])
}

function normalizeCandidate(value: unknown): WebResearchMethodCandidate | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const candidate = value as Partial<WebResearchMethodCandidate>
  const candidateId = text(candidate.candidateId, 256)
  const strategyFingerprint = text(candidate.strategyFingerprint, 80)
  if (!candidateId || !strategyFingerprint || !SHA256.test(strategyFingerprint)) return null
  if (candidate.kind === "search") {
    const query = text(candidate.query, 512)
    return query
      ? Object.freeze({
          candidateId,
          kind: "search",
          query,
          strategyFingerprint: strategyFingerprint as WebResearchFingerprint,
        })
      : null
  }
  if (candidate.kind === "fetch") {
    const sourceUrl = text(candidate.sourceUrl, 8_192)
    const evidenceRef = text(candidate.evidenceRef, 256)
    if (!sourceUrl || !evidenceRef) return null
    let discovery: WebResearchFetchCandidateDiscovery | undefined
    if (candidate.discovery !== undefined) {
      const rawDiscovery = candidate.discovery as Partial<WebResearchFetchCandidateDiscovery>
      const parentEvidenceRef = text(rawDiscovery.parentEvidenceRef, 256)
      const parentProvenanceRef = text(rawDiscovery.parentProvenanceRef, 256)
      const documentFinalUrl = text(rawDiscovery.documentFinalUrl, 8_192)
      const discoveryFingerprint = text(rawDiscovery.discoveryFingerprint, 80)
      if (
        rawDiscovery.origin !== "fetched_document_link" ||
        !parentEvidenceRef ||
        !parentProvenanceRef ||
        !documentFinalUrl ||
        !Number.isSafeInteger(rawDiscovery.observationOrdinal) ||
        (rawDiscovery.observationOrdinal ?? 0) < 1 ||
        !discoveryFingerprint ||
        !SHA256.test(discoveryFingerprint)
      ) {
        return null
      }
      discovery = Object.freeze({
        origin: "fetched_document_link",
        parentEvidenceRef,
        parentProvenanceRef,
        documentFinalUrl,
        observationOrdinal: rawDiscovery.observationOrdinal as number,
        discoveryFingerprint: discoveryFingerprint as WebResearchFingerprint,
      })
    }
    return Object.freeze({
      candidateId,
      kind: "fetch",
      sourceUrl,
      evidenceRef,
      strategyFingerprint: strategyFingerprint as WebResearchFingerprint,
      ...(discovery ? { discovery } : {}),
    })
  }
  return null
}

function normalizeProposal(value: unknown): WebResearchNextAction | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const proposal = value as Record<string, unknown>
  if (proposal.kind === "execute_search") {
    const candidateId = text(proposal.candidateId, 256)
    const query = text(proposal.query, 512)
    const strategyFingerprint = text(proposal.strategyFingerprint, 80)
    return candidateId && query && strategyFingerprint && SHA256.test(strategyFingerprint)
      ? Object.freeze({
          kind: "execute_search",
          candidateId,
          query,
          strategyFingerprint: strategyFingerprint as WebResearchFingerprint,
        })
      : null
  }
  if (proposal.kind === "execute_fetch") {
    const candidateId = text(proposal.candidateId, 256)
    const sourceUrl = text(proposal.sourceUrl, 8_192)
    const evidenceRef = text(proposal.evidenceRef, 256)
    const strategyFingerprint = text(proposal.strategyFingerprint, 80)
    return candidateId &&
      sourceUrl &&
      evidenceRef &&
      strategyFingerprint &&
      SHA256.test(strategyFingerprint)
      ? Object.freeze({
          kind: "execute_fetch",
          candidateId,
          sourceUrl,
          evidenceRef,
          strategyFingerprint: strategyFingerprint as WebResearchFingerprint,
        })
      : null
  }
  const evidenceRefs = uniqueTextList(proposal.evidenceRefs, 256)
  if (!evidenceRefs || evidenceRefs.length === 0) return null
  if (proposal.kind === "propose_complete") {
    return Object.freeze({ kind: "propose_complete", evidenceRefs })
  }
  if (proposal.kind === "propose_blocked") {
    const reasonCode = text(proposal.reasonCode, 256)
    return reasonCode ? Object.freeze({ kind: "propose_blocked", evidenceRefs, reasonCode }) : null
  }
  return null
}

function snapshotPayload(snapshot: Omit<WebResearchSnapshot, "snapshotFingerprint">): unknown {
  return {
    schemaVersion: snapshot.schemaVersion,
    runId: snapshot.runId,
    snapshotId: snapshot.snapshotId,
    candidates: snapshot.candidates,
    evidenceRefs: snapshot.evidenceRefs,
    attemptedStrategyFingerprints: snapshot.attemptedStrategyFingerprints,
    terminalAdmission: snapshot.terminalAdmission,
  }
}

function snapshotIntegrityValid(
  snapshot: WebResearchSnapshot,
  createFingerprint: WebResearchFingerprintPort,
): boolean {
  if (snapshot.schemaVersion !== 1 || !SHA256.test(snapshot.snapshotFingerprint)) return false
  try {
    return (
      createFingerprint("web-research-snapshot:v1", snapshotPayload(snapshot)) ===
      snapshot.snapshotFingerprint
    )
  } catch {
    return false
  }
}

export function createWebResearchSnapshot(
  input: {
    runId: string
    snapshotId: string
    candidates: readonly WebResearchMethodCandidate[]
    evidenceRefs: readonly string[]
    attemptedStrategyFingerprints: readonly WebResearchFingerprint[]
    terminalAdmission: WebResearchTerminalAdmission
  },
  createFingerprint: WebResearchFingerprintPort,
): WebResearchSnapshot {
  const runId = text(input.runId, 256)
  const snapshotId = text(input.snapshotId, 256)
  const candidates = input.candidates.map(normalizeCandidate)
  const evidenceRefs = uniqueTextList(input.evidenceRefs, 256)
  const attemptedStrategyFingerprints = fingerprintList(input.attemptedStrategyFingerprints)
  const remainingChangedCandidateIds = uniqueTextList(
    input.terminalAdmission.remainingChangedCandidateIds,
    256,
  )
  if (
    !runId ||
    !snapshotId ||
    candidates.some((candidate) => candidate === null) ||
    !evidenceRefs ||
    !attemptedStrategyFingerprints ||
    !remainingChangedCandidateIds ||
    typeof input.terminalAdmission.completionAllowed !== "boolean" ||
    typeof input.terminalAdmission.blockedAllowed !== "boolean"
  ) {
    throw new Error("Web research snapshot input is invalid.")
  }
  const normalizedCandidates = candidates as WebResearchMethodCandidate[]
  const candidateIds = normalizedCandidates.map((candidate) => candidate.candidateId)
  if (new Set(candidateIds).size !== candidateIds.length) {
    throw new Error("Web research candidate IDs must be unique.")
  }
  const candidateIdSet = new Set(candidateIds)
  if (remainingChangedCandidateIds.some((candidateId) => !candidateIdSet.has(candidateId))) {
    throw new Error("Remaining changed candidates must exist in the snapshot.")
  }
  const evidenceRefSet = new Set(evidenceRefs)
  if (
    normalizedCandidates.some(
      (candidate) => candidate.kind === "fetch" && !evidenceRefSet.has(candidate.evidenceRef),
    )
  ) {
    throw new Error("Fetch candidates must reference admitted evidence.")
  }
  const withoutFingerprint = Object.freeze({
    schemaVersion: 1 as const,
    runId,
    snapshotId,
    candidates: Object.freeze(normalizedCandidates),
    evidenceRefs,
    attemptedStrategyFingerprints,
    terminalAdmission: Object.freeze({
      completionAllowed: input.terminalAdmission.completionAllowed,
      blockedAllowed: input.terminalAdmission.blockedAllowed,
      remainingChangedCandidateIds,
    }),
  })
  const snapshotFingerprint = createFingerprint(
    "web-research-snapshot:v1",
    snapshotPayload(withoutFingerprint),
  )
  if (!SHA256.test(snapshotFingerprint)) {
    throw new Error("Web research fingerprint port returned an invalid snapshot fingerprint.")
  }
  return Object.freeze({
    ...withoutFingerprint,
    snapshotFingerprint,
  })
}

export function createWebResearchMethodReceipt(
  input: {
    receiptId: string
    runId: string
    snapshot: WebResearchSnapshot
    proposal: unknown
  },
  createFingerprint: WebResearchFingerprintPort,
): WebResearchMethodReceipt {
  const receiptId = text(input.receiptId, 256)
  const runId = text(input.runId, 256)
  const proposal = normalizeProposal(input.proposal)
  if (
    !receiptId ||
    !runId ||
    !proposal ||
    input.snapshot.runId !== runId ||
    !snapshotIntegrityValid(input.snapshot, createFingerprint)
  ) {
    throw new Error("Web research method receipt input is invalid.")
  }
  const proposalFingerprint = createFingerprint("web-research-next-action:v1", proposal)
  if (!SHA256.test(proposalFingerprint)) {
    throw new Error("Web research fingerprint port returned an invalid proposal fingerprint.")
  }
  return Object.freeze({
    schemaVersion: 1 as const,
    receiptId,
    diagnosedBy: "llm" as const,
    runId,
    snapshotId: input.snapshot.snapshotId,
    snapshotFingerprint: input.snapshot.snapshotFingerprint,
    proposalFingerprint,
  })
}

function receiptValid(value: unknown): value is WebResearchMethodReceipt {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  const receipt = value as Partial<WebResearchMethodReceipt>
  return (
    receipt.schemaVersion === 1 &&
    receipt.diagnosedBy === "llm" &&
    Boolean(text(receipt.receiptId, 256)) &&
    Boolean(text(receipt.runId, 256)) &&
    Boolean(text(receipt.snapshotId, 256)) &&
    SHA256.test(receipt.snapshotFingerprint ?? "") &&
    SHA256.test(receipt.proposalFingerprint ?? "")
  )
}

function rejected(reasonCode: WebResearchMethodAdmissionReason): WebResearchMethodAdmission {
  return Object.freeze({ ok: false, reasonCode })
}

export function admitWebResearchNextAction(
  input: {
    runId: string
    snapshot: WebResearchSnapshot
    proposal: unknown
    receipt: unknown
  },
  createFingerprint: WebResearchFingerprintPort,
): WebResearchMethodAdmission {
  const runId = text(input.runId, 256)
  if (
    !runId ||
    input.snapshot.runId !== runId ||
    !snapshotIntegrityValid(input.snapshot, createFingerprint)
  ) {
    return rejected("web_research_snapshot_invalid")
  }
  const proposal = normalizeProposal(input.proposal)
  if (!proposal) return rejected("web_research_proposal_invalid")
  if (!receiptValid(input.receipt)) return rejected("web_research_receipt_invalid")
  if (input.receipt.runId !== runId) {
    return rejected("web_research_receipt_run_mismatch")
  }
  if (
    input.receipt.snapshotId !== input.snapshot.snapshotId ||
    input.receipt.snapshotFingerprint !== input.snapshot.snapshotFingerprint
  ) {
    return rejected("web_research_receipt_snapshot_mismatch")
  }
  let proposalFingerprint: WebResearchFingerprint
  try {
    proposalFingerprint = createFingerprint("web-research-next-action:v1", proposal)
  } catch {
    return rejected("web_research_receipt_proposal_mismatch")
  }
  if (input.receipt.proposalFingerprint !== proposalFingerprint) {
    return rejected("web_research_receipt_proposal_mismatch")
  }

  if (proposal.kind === "execute_search" || proposal.kind === "execute_fetch") {
    const candidate = input.snapshot.candidates.find(
      (item) => item.candidateId === proposal.candidateId,
    )
    if (!candidate) return rejected("web_research_candidate_missing")
    const exactCandidate =
      proposal.kind === "execute_search" && candidate.kind === "search"
        ? candidate.query === proposal.query &&
          candidate.strategyFingerprint === proposal.strategyFingerprint
        : proposal.kind === "execute_fetch" && candidate.kind === "fetch"
          ? candidate.sourceUrl === proposal.sourceUrl &&
            candidate.evidenceRef === proposal.evidenceRef &&
            candidate.strategyFingerprint === proposal.strategyFingerprint
          : false
    if (!exactCandidate) return rejected("web_research_candidate_mismatch")
    if (input.snapshot.attemptedStrategyFingerprints.includes(proposal.strategyFingerprint)) {
      return rejected("web_research_strategy_unchanged")
    }
    return Object.freeze({
      ok: true,
      action: proposal,
      receiptId: input.receipt.receiptId,
    })
  }

  const admittedEvidence = new Set(input.snapshot.evidenceRefs)
  if (proposal.evidenceRefs.some((evidenceRef) => !admittedEvidence.has(evidenceRef))) {
    return rejected("web_research_evidence_not_admitted")
  }
  if (proposal.kind === "propose_complete") {
    if (!input.snapshot.terminalAdmission.completionAllowed) {
      return rejected("web_research_completion_not_admitted")
    }
  } else {
    if (input.snapshot.terminalAdmission.remainingChangedCandidateIds.length > 0) {
      return rejected("web_research_changed_candidate_remaining")
    }
    if (!input.snapshot.terminalAdmission.blockedAllowed) {
      return rejected("web_research_blocked_not_admitted")
    }
  }
  return Object.freeze({
    ok: true,
    action: proposal,
    receiptId: input.receipt.receiptId,
  })
}
