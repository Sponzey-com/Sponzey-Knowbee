import type { LiveAcceptanceCapability } from "./live-acceptance-admission.js"
import type {
  LiveAcceptanceBundleApproval,
  LiveAcceptanceBundleCandidate,
  LiveAcceptanceBundlePayload,
} from "./live-acceptance-bundle.js"
import {
  type CandidateBoundLiveAcceptanceProducerResult,
  type LiveAcceptanceCollectionBlocker,
  type LiveAcceptanceProducerResult,
  collectLiveAcceptancePayload,
} from "./live-acceptance-collector.js"
import {
  type LiveAcceptanceSigningRequest,
  createLiveAcceptanceSigningRequest,
} from "./live-acceptance-signing-exchange.js"

export type LiveAcceptanceRunnerStage = "channels" | "web" | "extensions" | "yeonjang"
export type LiveAcceptanceRunnerFailurePolicy = "continue_diagnostics" | "stop_on_failure"

export interface LiveAcceptanceRunnerContext {
  candidate: Readonly<LiveAcceptanceBundleCandidate>
  observedAt: number
  requiredCapabilities: readonly LiveAcceptanceCapability[]
}

export type LiveAcceptanceRunnerPortResult =
  | { status: "produced"; result: LiveAcceptanceProducerResult }
  | { status: "unavailable"; reasonCode: string }

export interface LiveAcceptanceRunnerPort {
  execute(context: LiveAcceptanceRunnerContext): Promise<LiveAcceptanceRunnerPortResult>
}

export interface LiveAcceptancePayloadSink {
  write(
    payload: Readonly<LiveAcceptanceBundlePayload>,
  ): Promise<{ status: "written" } | { status: "rejected"; reasonCode: string }>
}

export interface LiveAcceptanceSigningRequestSink {
  write(
    request: Readonly<LiveAcceptanceSigningRequest>,
  ): Promise<{ status: "written" } | { status: "rejected"; reasonCode: string }>
}

export function createSigningRequestPayloadSink(input: {
  candidate: LiveAcceptanceBundleCandidate
  requestedKeyId: string
  now: number
  requestSink: LiveAcceptanceSigningRequestSink
}): LiveAcceptancePayloadSink {
  return Object.freeze({
    async write(payload: Readonly<LiveAcceptanceBundlePayload>) {
      const created = createLiveAcceptanceSigningRequest({
        value: payload,
        expectedCandidate: input.candidate,
        requestedKeyId: input.requestedKeyId,
        now: input.now,
      })
      if (created.status === "rejected") return created
      try {
        return await input.requestSink.write(created.request)
      } catch {
        return { status: "rejected" as const, reasonCode: "live_signing_request_write_failed" }
      }
    },
  })
}

export interface LiveAcceptanceRunnerEvent {
  state:
    | "initialized"
    | "executing"
    | "validating"
    | "coverage_complete"
    | "payload_written"
    | "blocked"
    | "cancelled"
  stage?: LiveAcceptanceRunnerStage
}

export type LiveAcceptanceRunnerResult =
  | {
      status: "collected"
      payload: Readonly<LiveAcceptanceBundlePayload>
      events: readonly LiveAcceptanceRunnerEvent[]
    }
  | {
      status: "blocked" | "cancelled"
      blockers: readonly LiveAcceptanceCollectionBlocker[]
      events: readonly LiveAcceptanceRunnerEvent[]
    }

export async function runLiveAcceptanceCollection(input: {
  candidate: LiveAcceptanceBundleCandidate
  approval: LiveAcceptanceBundleApproval
  ports: Readonly<Record<LiveAcceptanceRunnerStage, LiveAcceptanceRunnerPort>>
  payloadSink: LiveAcceptancePayloadSink
  failurePolicy: LiveAcceptanceRunnerFailurePolicy
  now: number
  maxEvidenceAgeMs: number
  isCancelled: () => boolean
}): Promise<LiveAcceptanceRunnerResult> {
  const events: LiveAcceptanceRunnerEvent[] = [{ state: "initialized" }]
  const stages: readonly {
    id: LiveAcceptanceRunnerStage
    capabilities: readonly LiveAcceptanceCapability[]
  }[] = [
    { id: "channels", capabilities: ["webui", "telegram", "slack"] },
    { id: "web", capabilities: ["web"] },
    { id: "extensions", capabilities: ["skill", "mcp"] },
    { id: "yeonjang", capabilities: ["yeonjang"] },
  ]
  const produced = new Map<LiveAcceptanceRunnerStage, CandidateBoundLiveAcceptanceProducerResult>()
  let failed = false

  for (const stage of stages) {
    if (input.isCancelled()) {
      events.push({ state: "cancelled", stage: stage.id })
      return {
        status: "cancelled",
        blockers: Object.freeze(
          stage.capabilities.map((capability) => ({
            capability,
            reasonCode: "live_collection_cancelled",
          })),
        ),
        events: Object.freeze(events),
      }
    }
    if (failed && input.failurePolicy === "stop_on_failure") {
      produced.set(
        stage.id,
        unavailableResult(input.candidate, stage.capabilities, "live_stage_skipped"),
      )
      continue
    }
    events.push({ state: "executing", stage: stage.id })
    let result: LiveAcceptanceRunnerPortResult
    try {
      result = await input.ports[stage.id].execute({
        candidate: Object.freeze({ ...input.candidate }),
        observedAt: input.now,
        requiredCapabilities: stage.capabilities,
      })
    } catch {
      result = { status: "unavailable", reasonCode: "live_stage_execution_failed" }
    }
    events.push({ state: "validating", stage: stage.id })
    if (result.status === "unavailable") {
      failed = true
      produced.set(
        stage.id,
        unavailableResult(input.candidate, stage.capabilities, result.reasonCode),
      )
    } else {
      if (result.result.rejected.length > 0) failed = true
      produced.set(stage.id, {
        candidate: Object.freeze({ ...input.candidate }),
        result: result.result,
      })
    }
  }

  const collection = collectLiveAcceptancePayload({
    candidate: input.candidate,
    approval: input.approval,
    channels: requiredResult(produced, "channels"),
    web: requiredResult(produced, "web"),
    extensions: requiredResult(produced, "extensions"),
    yeonjang: requiredResult(produced, "yeonjang"),
    now: input.now,
    maxEvidenceAgeMs: input.maxEvidenceAgeMs,
  })
  if (collection.status === "blocked") {
    events.push({ state: "blocked" })
    return {
      status: "blocked",
      blockers: collection.blockers,
      events: Object.freeze(events),
    }
  }
  events.push({ state: "coverage_complete" })
  if (input.isCancelled()) {
    events.push({ state: "cancelled" })
    return {
      status: "cancelled",
      blockers: Object.freeze([
        { capability: "collection", reasonCode: "live_collection_cancelled" },
      ]),
      events: Object.freeze(events),
    }
  }
  let writeResult: Awaited<ReturnType<LiveAcceptancePayloadSink["write"]>>
  try {
    writeResult = await input.payloadSink.write(collection.payload)
  } catch {
    writeResult = { status: "rejected", reasonCode: "live_payload_write_failed" }
  }
  if (writeResult.status === "rejected") {
    events.push({ state: "blocked" })
    return {
      status: "blocked",
      blockers: Object.freeze([{ capability: "collection", reasonCode: writeResult.reasonCode }]),
      events: Object.freeze(events),
    }
  }
  events.push({ state: "payload_written" })
  return {
    status: "collected",
    payload: collection.payload,
    events: Object.freeze(events),
  }
}

function unavailableResult(
  candidate: LiveAcceptanceBundleCandidate,
  capabilities: readonly LiveAcceptanceCapability[],
  reasonCode: string,
): CandidateBoundLiveAcceptanceProducerResult {
  return {
    candidate: Object.freeze({ ...candidate }),
    result: {
      accepted: [],
      rejected: capabilities.map((capability) => ({
        scenarioId: `${capability}-live`,
        capability,
        reasonCode,
      })),
    },
  }
}

function requiredResult(
  values: ReadonlyMap<LiveAcceptanceRunnerStage, CandidateBoundLiveAcceptanceProducerResult>,
  stage: LiveAcceptanceRunnerStage,
): CandidateBoundLiveAcceptanceProducerResult {
  const value = values.get(stage)
  if (!value) throw new Error(`live_collection_stage_missing:${stage}`)
  return value
}
