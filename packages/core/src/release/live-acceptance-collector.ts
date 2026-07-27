import {
  type LiveAcceptanceCapability,
  type LiveAcceptanceEvidence,
  admitLiveAcceptance,
} from "./live-acceptance-admission.js"
import type {
  LiveAcceptanceBundleApproval,
  LiveAcceptanceBundleCandidate,
  LiveAcceptanceBundlePayload,
} from "./live-acceptance-bundle.js"
import { validateLiveAcceptanceBundlePayload } from "./live-acceptance-bundle.js"

export interface LiveAcceptanceProducerResult {
  accepted: readonly LiveAcceptanceEvidence[]
  rejected: readonly {
    scenarioId: string
    capability?: LiveAcceptanceCapability
    reasonCode: string
  }[]
}

export interface CandidateBoundLiveAcceptanceProducerResult {
  candidate: LiveAcceptanceBundleCandidate
  result: LiveAcceptanceProducerResult
}

export interface LiveAcceptanceCollectionInput {
  candidate: LiveAcceptanceBundleCandidate
  approval: LiveAcceptanceBundleApproval
  channels: CandidateBoundLiveAcceptanceProducerResult
  web: CandidateBoundLiveAcceptanceProducerResult
  extensions: CandidateBoundLiveAcceptanceProducerResult
  yeonjang: CandidateBoundLiveAcceptanceProducerResult
  now: number
  maxEvidenceAgeMs: number
}

export interface LiveAcceptanceCollectionBlocker {
  capability: LiveAcceptanceEvidence["capability"] | "collection"
  reasonCode: string
  sourceReasonCode?: string
}

export type LiveAcceptanceCollectionResult =
  | { status: "collected"; payload: Readonly<LiveAcceptanceBundlePayload> }
  | { status: "blocked"; blockers: readonly LiveAcceptanceCollectionBlocker[] }

export function collectLiveAcceptancePayload(
  input: LiveAcceptanceCollectionInput,
): LiveAcceptanceCollectionResult {
  const required: readonly LiveAcceptanceCapability[] = [
    "webui",
    "telegram",
    "slack",
    "web",
    "skill",
    "mcp",
    "yeonjang",
  ]
  const sources = [
    { bound: input.channels, capabilities: ["webui", "telegram", "slack"] as const },
    { bound: input.web, capabilities: ["web"] as const },
    { bound: input.extensions, capabilities: ["skill", "mcp"] as const },
    { bound: input.yeonjang, capabilities: ["yeonjang"] as const },
  ]
  const blockers: LiveAcceptanceCollectionBlocker[] = []
  const evidence: LiveAcceptanceEvidence[] = []
  const seenScenarioKeys = new Set<string>()
  const seenEvidenceRefs = new Set<string>()

  for (const source of sources) {
    if (
      source.bound.candidate.appVersion !== input.candidate.appVersion ||
      source.bound.candidate.gitTag !== input.candidate.gitTag ||
      source.bound.candidate.gitCommit !== input.candidate.gitCommit
    ) {
      blockers.push({ capability: "collection", reasonCode: "live_collection_candidate_mismatch" })
      continue
    }
    const acceptedCapabilities = new Set(
      source.bound.result.accepted.map((item) => item.capability),
    )
    for (const rejected of source.bound.result.rejected) {
      const affected = rejected.capability
        ? [rejected.capability]
        : source.capabilities.filter((capability) => !acceptedCapabilities.has(capability))
      for (const capability of affected.length > 0 ? affected : ["collection" as const]) {
        blockers.push({
          capability,
          reasonCode: "live_collection_producer_rejected",
          sourceReasonCode: rejected.reasonCode,
        })
      }
    }
    for (const item of source.bound.result.accepted) {
      if (!source.capabilities.includes(item.capability as never)) {
        blockers.push({
          capability: item.capability,
          reasonCode: "live_collection_source_capability_mismatch",
        })
        continue
      }
      const scenarioKey = `${item.capability}:${item.scenarioId}`
      if (seenScenarioKeys.has(scenarioKey)) {
        blockers.push({
          capability: item.capability,
          reasonCode: "live_collection_capability_duplicate",
        })
        continue
      }
      if (seenEvidenceRefs.has(item.evidenceRef)) {
        blockers.push({
          capability: item.capability,
          reasonCode: "live_collection_evidence_ref_duplicate",
        })
        continue
      }
      seenScenarioKeys.add(scenarioKey)
      seenEvidenceRefs.add(item.evidenceRef)
      evidence.push(item)
    }
  }

  for (const capability of required) {
    const admission = admitLiveAcceptance({
      audience: "public",
      requiredCapabilities: [capability],
      evidence,
      now: input.now,
      maxAgeMs: input.maxEvidenceAgeMs,
    })
    for (const reasonCode of admission.reasonCodes) blockers.push({ capability, reasonCode })
  }
  if (blockers.length > 0) {
    return { status: "blocked", blockers: Object.freeze(blockers) }
  }

  const payload: LiveAcceptanceBundlePayload = {
    kind: "knowbee.release.live_acceptance_bundle",
    schemaVersion: 2,
    candidate: input.candidate,
    approval: input.approval,
    evidence,
  }
  const validated = validateLiveAcceptanceBundlePayload({
    value: payload,
    expectedCandidate: input.candidate,
    now: input.now,
  })
  if (validated.status === "rejected") {
    return {
      status: "blocked",
      blockers: Object.freeze([{ capability: "collection", reasonCode: validated.reasonCode }]),
    }
  }
  return { status: "collected", payload: validated.payload }
}
