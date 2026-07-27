import {
  admitWebEvidenceRecovery,
  type WebEvidenceRecoveryAdmission,
} from "../contracts/web-evidence-recovery.js"
import type { WebEvidenceVerificationResult } from "../contracts/web-evidence-verifier.js"
import type { WebResearchFingerprint } from "../contracts/web-research-method.js"

export interface WebEvidenceRecoveryPort {
  proposeRecovery(input: Readonly<{
    runId: string
    unresolvedFactKeys: readonly string[]
    packFingerprint: `sha256:${string}`
    attemptedStrategyFingerprints: readonly WebResearchFingerprint[]
    allowedMethods: readonly ["search", "fetch"]
    blockedAllowed: boolean
  }>): Promise<unknown>
}

export async function planWebEvidenceRecovery(
  input: Readonly<{
    runId: string
    verification: WebEvidenceVerificationResult
    attemptedStrategyFingerprints: readonly WebResearchFingerprint[]
    blockedAllowed: boolean
    signal: AbortSignal
  }>,
  port: WebEvidenceRecoveryPort,
): Promise<WebEvidenceRecoveryAdmission> {
  if (input.signal.aborted) {
    return Object.freeze({ ok: false, reasonCode: "web_evidence_recovery_cancelled" })
  }
  const runId = input.runId.trim()
  if (!runId || runId.length > 256) {
    return Object.freeze({ ok: false, reasonCode: "web_evidence_recovery_input_invalid" })
  }
  let receipt: unknown
  try {
    receipt = await port.proposeRecovery(Object.freeze({
      runId,
      unresolvedFactKeys: input.verification.unresolvedFactKeys,
      packFingerprint: input.verification.packFingerprint,
      attemptedStrategyFingerprints: Object.freeze([
        ...input.attemptedStrategyFingerprints,
      ]),
      allowedMethods: Object.freeze(["search", "fetch"] as const),
      blockedAllowed: input.blockedAllowed,
    }))
  } catch {
    return Object.freeze({ ok: false, reasonCode: "web_evidence_recovery_receipt_invalid" })
  }
  if (input.signal.aborted) {
    return Object.freeze({ ok: false, reasonCode: "web_evidence_recovery_cancelled" })
  }
  return admitWebEvidenceRecovery({
    receipt,
    verification: input.verification,
    attemptedStrategyFingerprints: input.attemptedStrategyFingerprints,
    blockedAllowed: input.blockedAllowed,
  })
}
