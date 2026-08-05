import {
  admitWebEvidenceVerification,
  type WebEvidenceVerificationAdmission,
} from "../contracts/web-evidence-verifier.js"
import type { WebEvidencePack } from "../contracts/web-evidence-pack.js"

export interface WebEvidenceVerifierPort {
  verifyEvidence(input: Readonly<{
    requestGoal: string
    requiredFactKeys: readonly string[]
    evidencePack: WebEvidencePack
  }>): Promise<unknown>
}

export async function verifyWebEvidencePack(
  input: Readonly<{
    requestGoal: string
    requiredFactKeys: readonly string[]
    evidencePack: WebEvidencePack
  }>,
  port: WebEvidenceVerifierPort,
): Promise<WebEvidenceVerificationAdmission> {
  const requestGoal = input.requestGoal.trim()
  const requiredFactKeys = Object.freeze(input.requiredFactKeys.map((fact) => fact.trim()))
  if (
    !requestGoal ||
    requestGoal.length > 2_048 ||
    requiredFactKeys.length < 1 ||
    new Set(requiredFactKeys).size !== requiredFactKeys.length ||
    requiredFactKeys.some((fact) => !fact || fact.length > 128)
  ) {
    return Object.freeze({ ok: false, reasonCode: "web_evidence_verification_input_invalid" })
  }
  let receipt: unknown
  try {
    receipt = await port.verifyEvidence(Object.freeze({
      requestGoal,
      requiredFactKeys,
      evidencePack: input.evidencePack,
    }))
  } catch {
    return Object.freeze({ ok: false, reasonCode: "web_evidence_verification_receipt_invalid" })
  }
  return admitWebEvidenceVerification({
    receipt,
    evidencePack: input.evidencePack,
    requiredFactKeys,
  })
}
