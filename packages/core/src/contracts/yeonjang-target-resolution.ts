import type { YeonjangTargetSelector } from "./yeonjang-target.js"
import {
  projectYeonjangUserFacingIdentities,
  validateYeonjangIdentityBoundarySnapshot,
  type YeonjangIdentityBoundarySnapshot,
  type YeonjangUserFacingInstanceIdentity,
} from "./yeonjang-identity-boundary.js"

export type ExactYeonjangSelector = Extract<YeonjangTargetSelector, { type: "instance_id" | "instance_alias" | "call_name" }>
export type YeonjangExactTargetStatus = "resolved" | "not_found" | "ambiguous" | "unavailable"

export interface YeonjangExactTargetReceipt {
  schemaVersion: 1
  receiptId: string
  snapshotFingerprint: string
  selectorFingerprint: string
  targetInstanceId: string
}

export interface YeonjangTargetClarificationCandidate extends YeonjangUserFacingInstanceIdentity {}

export type YeonjangExactTargetDecision =
  | { status: "resolved"; reasonCode: "exact_target_resolved"; receipt: YeonjangExactTargetReceipt }
  | { status: "not_found"; reasonCode: "target_not_found"; candidates: [] }
  | { status: "ambiguous"; reasonCode: "target_ambiguous"; candidates: YeonjangTargetClarificationCandidate[] }
  | { status: "unavailable"; reasonCode: "target_offline" | "target_degraded" | "target_untrusted"; candidates: YeonjangTargetClarificationCandidate[] }

function normalizeName(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase("en-US").replace(/[\s_-]+/g, "-").replace(/^-+|-+$/g, "")
}

function stableHash(value: string): string {
  let hash = 0xcbf29ce484222325n
  for (const byte of new TextEncoder().encode(value)) {
    hash ^= BigInt(byte)
    hash = BigInt.asUintN(64, hash * 0x100000001b3n)
  }
  return hash.toString(16).padStart(16, "0")
}

function fingerprintSnapshot(snapshot: YeonjangIdentityBoundarySnapshot): string {
  return stableHash(JSON.stringify(snapshot))
}

function fingerprintSelector(selector: ExactYeonjangSelector): string {
  switch (selector.type) {
    case "instance_id": return stableHash(`instance_id:${selector.instanceId.trim()}`)
    case "instance_alias": return stableHash(`instance_alias:${normalizeName(selector.instanceAlias)}`)
    case "call_name": return stableHash(`call_name:${normalizeName(selector.callName)}`)
  }
}

export function resolveExactYeonjangTarget(input: {
  selector: ExactYeonjangSelector
  snapshot: YeonjangIdentityBoundarySnapshot
  maxAgeMs: number
}): YeonjangExactTargetDecision {
  const snapshot = validateYeonjangIdentityBoundarySnapshot({ snapshot: input.snapshot, maxAgeMs: input.maxAgeMs })
  const selector = input.selector
  const matches = snapshot.instances.filter((instance) => {
    if (selector.type === "instance_id") return instance.instanceId === selector.instanceId.trim()
    if (selector.type === "instance_alias") return normalizeName(instance.instanceAlias) === normalizeName(selector.instanceAlias)
    const requested = normalizeName(selector.callName)
    return instance.callNames.some((name) => normalizeName(name) === requested)
  })
  if (matches.length === 0) return { status: "not_found", reasonCode: "target_not_found", candidates: [] }
  const projections = projectYeonjangUserFacingIdentities(snapshot)
  const candidateProjection = matches.map((match) => projections[snapshot.instances.indexOf(match)]!)
  if (matches.length > 1) return { status: "ambiguous", reasonCode: "target_ambiguous", candidates: candidateProjection }
  const target = matches[0]!
  if (target.trustState !== "trusted") return { status: "unavailable", reasonCode: "target_untrusted", candidates: candidateProjection }
  if (target.connectionState === "offline") return { status: "unavailable", reasonCode: "target_offline", candidates: candidateProjection }
  if (target.connectionState === "degraded") return { status: "unavailable", reasonCode: "target_degraded", candidates: candidateProjection }
  const snapshotFingerprint = fingerprintSnapshot(snapshot)
  const selectorFingerprint = fingerprintSelector(selector)
  return {
    status: "resolved",
    reasonCode: "exact_target_resolved",
    receipt: {
      schemaVersion: 1,
      receiptId: `yeonjang-target:${stableHash(`${snapshotFingerprint}:${selectorFingerprint}:${target.instanceId}`)}`,
      snapshotFingerprint,
      selectorFingerprint,
      targetInstanceId: target.instanceId,
    },
  }
}

export function authorizeExactYeonjangTarget(input: {
  receipt: YeonjangExactTargetReceipt | undefined
  selector: ExactYeonjangSelector
  snapshot: YeonjangIdentityBoundarySnapshot
  maxAgeMs: number
}): string {
  if (!input.receipt) throw new Error("Exact Yeonjang target receipt is required.")
  const decision = resolveExactYeonjangTarget(input)
  if (decision.status !== "resolved") throw new Error(`Exact Yeonjang target is no longer dispatchable: ${decision.status}.`)
  if (
    decision.receipt.receiptId !== input.receipt.receiptId
    || decision.receipt.snapshotFingerprint !== input.receipt.snapshotFingerprint
    || decision.receipt.selectorFingerprint !== input.receipt.selectorFingerprint
    || decision.receipt.targetInstanceId !== input.receipt.targetInstanceId
  ) {
    throw new Error("Exact Yeonjang target receipt does not match the current selector and snapshot.")
  }
  return input.receipt.targetInstanceId
}
