import { createHash } from "node:crypto"
import { canonicalWorkIdForRootRun } from "../contracts/canonical-work-aggregate.js"
import type { CanonicalWorkAggregate } from "../contracts/canonical-work-aggregate.js"

export interface CanonicalSimplePathReleaseDescriptor {
  runId: string
  workId: string
  classificationFingerprint: `sha256:${string}`
  answerSource: "llm_generated"
  requestFingerprint: `sha256:${string}`
  answerFingerprint: `sha256:${string}`
}

export function buildCanonicalSimplePathReleaseDescriptor(input: {
  runId: string
  classification: unknown
  answerSource: "llm_generated"
  requestText: string
  answerText: string
}): CanonicalSimplePathReleaseDescriptor {
  const runId = input.runId.trim()
  if (!runId) throw new Error("Run ID is required for simple path release.")
  const requestText = input.requestText.trim()
  const answerText = input.answerText.trim()
  if (!requestText) throw new Error("Request text is required for simple path release.")
  if (!answerText) throw new Error("LLM answer text is required for simple path release.")
  return {
    runId,
    workId: canonicalWorkIdForRootRun(runId),
    classificationFingerprint: fingerprint(JSON.stringify(input.classification)),
    answerSource: input.answerSource,
    requestFingerprint: fingerprint(requestText),
    answerFingerprint: fingerprint(answerText),
  }
}

function fingerprint(value: string): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`
}

export function releaseCanonicalSimplePath(
  descriptor: CanonicalSimplePathReleaseDescriptor,
  dependencies: {
    loadAggregate: (workId: string) => CanonicalWorkAggregate | undefined
    deleteUnstartedAggregate: (workId: string) => boolean
  },
): { ok: true } | { ok: false; reasonCode: string } {
  const aggregate = dependencies.loadAggregate(descriptor.workId)
  if (!aggregate) return { ok: false, reasonCode: "canonical_simple_path_aggregate_not_found" }
  if (
    aggregate.rootRunId !== descriptor.runId ||
    aggregate.state !== "REQUEST_RECEIVED" ||
    aggregate.revision !== 0
  ) {
    return { ok: false, reasonCode: "canonical_simple_path_already_started" }
  }
  return dependencies.deleteUnstartedAggregate(descriptor.workId)
    ? { ok: true }
    : { ok: false, reasonCode: "canonical_simple_path_release_conflict" }
}
