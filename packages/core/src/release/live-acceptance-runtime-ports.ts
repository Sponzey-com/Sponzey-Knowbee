import type { PersistedChannelSmokeRunResult } from "../channels/smoke-runner.js"
import type { ExtensionLiveSmokeSummary } from "../runs/extension-live-smoke.js"
import type { WebRetrievalLiveSmokeSummary } from "../runs/web-retrieval-smoke.js"
import type { YeonjangLiveSmokeSummary } from "../runs/yeonjang-live-smoke.js"
import { produceChannelLiveAcceptanceEvidence } from "./channel-live-acceptance-evidence.js"
import { produceExtensionLiveAcceptanceEvidence } from "./extension-live-acceptance-evidence.js"
import type {
  LiveAcceptanceBundleApproval,
  LiveAcceptanceBundleCandidate,
} from "./live-acceptance-bundle.js"
import type {
  LiveAcceptanceRunnerContext,
  LiveAcceptanceRunnerPort,
  LiveAcceptanceRunnerStage,
} from "./live-acceptance-runner.js"
import {
  type LiveAcceptanceRunnerFailurePolicy,
  type LiveAcceptanceRunnerResult,
  type LiveAcceptanceSigningRequestSink,
  createSigningRequestPayloadSink,
  runLiveAcceptanceCollection,
} from "./live-acceptance-runner.js"
import { produceWebLiveAcceptanceEvidence } from "./web-live-acceptance-evidence.js"
import { produceYeonjangLiveAcceptanceEvidence } from "./yeonjang-live-acceptance-evidence.js"

export type LiveAcceptanceRuntimeStageReadiness =
  | { status: "ready" }
  | { status: "unavailable"; reasonCode: string }

export interface LiveAcceptanceRuntimePreflightSnapshot {
  capturedAt: number
  stages: Readonly<Record<LiveAcceptanceRunnerStage, LiveAcceptanceRuntimeStageReadiness>>
}

export interface LiveAcceptanceRuntimeExecutors {
  channels(context: LiveAcceptanceRunnerContext): Promise<PersistedChannelSmokeRunResult>
  web(context: LiveAcceptanceRunnerContext): Promise<WebRetrievalLiveSmokeSummary>
  extensions(context: LiveAcceptanceRunnerContext): Promise<ExtensionLiveSmokeSummary>
  yeonjang(context: LiveAcceptanceRunnerContext): Promise<YeonjangLiveSmokeSummary>
}

export function createLiveAcceptanceRuntimePorts(input: {
  preflight: LiveAcceptanceRuntimePreflightSnapshot
  executors: LiveAcceptanceRuntimeExecutors
  maxWebSourceAgeMs: number
  maxYeonjangSessionAgeMs: number
  maxPreflightAgeMs: number
}): Readonly<Record<LiveAcceptanceRunnerStage, LiveAcceptanceRunnerPort>> {
  const preflight = Object.freeze({
    capturedAt: input.preflight.capturedAt,
    stages: Object.freeze(
      Object.fromEntries(
        Object.entries(input.preflight.stages).map(([stage, readiness]) => [
          stage,
          Object.freeze({ ...readiness }),
        ]),
      ) as Record<LiveAcceptanceRunnerStage, LiveAcceptanceRuntimeStageReadiness>,
    ),
  })
  const expected = {
    channels: ["webui", "telegram", "slack"],
    web: ["web"],
    extensions: ["skill", "mcp"],
    yeonjang: ["yeonjang"],
  } as const

  function port(stage: LiveAcceptanceRunnerStage): LiveAcceptanceRunnerPort {
    return Object.freeze({
      async execute(context: LiveAcceptanceRunnerContext) {
        const readiness = preflight.stages[stage]
        if (readiness.status === "unavailable") return readiness
        if (
          input.maxPreflightAgeMs <= 0 ||
          preflight.capturedAt > context.observedAt ||
          context.observedAt - preflight.capturedAt > input.maxPreflightAgeMs
        ) {
          return {
            status: "unavailable" as const,
            reasonCode: "live_preflight_stale",
          }
        }
        if (
          context.requiredCapabilities.length !== expected[stage].length ||
          context.requiredCapabilities.some(
            (capability, index) => capability !== expected[stage][index],
          )
        ) {
          return {
            status: "unavailable" as const,
            reasonCode: "live_stage_capability_contract_mismatch",
          }
        }
        if (stage === "channels") {
          return {
            status: "produced" as const,
            result: produceChannelLiveAcceptanceEvidence(await input.executors.channels(context)),
          }
        }
        if (stage === "web") {
          return {
            status: "produced" as const,
            result: produceWebLiveAcceptanceEvidence({
              run: await input.executors.web(context),
              now: context.observedAt,
              maxSourceAgeMs: input.maxWebSourceAgeMs,
            }),
          }
        }
        if (stage === "extensions") {
          return {
            status: "produced" as const,
            result: produceExtensionLiveAcceptanceEvidence(
              await input.executors.extensions(context),
            ),
          }
        }
        return {
          status: "produced" as const,
          result: produceYeonjangLiveAcceptanceEvidence({
            run: await input.executors.yeonjang(context),
            now: context.observedAt,
            maxSessionAgeMs: input.maxYeonjangSessionAgeMs,
          }),
        }
      },
    })
  }

  return Object.freeze({
    channels: port("channels"),
    web: port("web"),
    extensions: port("extensions"),
    yeonjang: port("yeonjang"),
  })
}

export async function runProductionLiveAcceptance(input: {
  candidate: LiveAcceptanceBundleCandidate
  approval: LiveAcceptanceBundleApproval
  preflight: LiveAcceptanceRuntimePreflightSnapshot
  executors: LiveAcceptanceRuntimeExecutors
  maxPreflightAgeMs: number
  maxWebSourceAgeMs: number
  maxYeonjangSessionAgeMs: number
  maxEvidenceAgeMs: number
  failurePolicy: LiveAcceptanceRunnerFailurePolicy
  requestedKeyId: string
  requestSink: LiveAcceptanceSigningRequestSink
  now: number
  isCancelled: () => boolean
}): Promise<LiveAcceptanceRunnerResult> {
  const ports = createLiveAcceptanceRuntimePorts({
    preflight: input.preflight,
    executors: input.executors,
    maxPreflightAgeMs: input.maxPreflightAgeMs,
    maxWebSourceAgeMs: input.maxWebSourceAgeMs,
    maxYeonjangSessionAgeMs: input.maxYeonjangSessionAgeMs,
  })
  return runLiveAcceptanceCollection({
    candidate: input.candidate,
    approval: input.approval,
    ports,
    payloadSink: createSigningRequestPayloadSink({
      candidate: input.candidate,
      requestedKeyId: input.requestedKeyId,
      now: input.now,
      requestSink: input.requestSink,
    }),
    failurePolicy: input.failurePolicy,
    now: input.now,
    maxEvidenceAgeMs: input.maxEvidenceAgeMs,
    isCancelled: input.isCancelled,
  })
}
