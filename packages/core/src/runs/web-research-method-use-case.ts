import {
  type WebResearchFingerprintPort,
  type WebResearchMethodAdmission,
  type WebResearchMethodProvider,
  type WebResearchSnapshot,
  admitWebResearchNextAction,
  createWebResearchMethodReceipt,
} from "../contracts/web-research-method.js"

export type WebResearchMethodUseCaseResult =
  | WebResearchMethodAdmission
  | Readonly<{
      ok: false
      reasonCode:
        | "web_research_context_invalid"
        | "web_research_provider_failed"
        | "web_research_provider_output_invalid"
    }>

export async function executeWebResearchMethodProposal(input: {
  runId: string
  receiptId: string
  snapshot: WebResearchSnapshot
  provider: WebResearchMethodProvider
  createFingerprint: WebResearchFingerprintPort
}): Promise<WebResearchMethodUseCaseResult> {
  if (
    !input.runId.trim() ||
    input.runId.trim() !== input.snapshot.runId ||
    !input.receiptId.trim()
  ) {
    return {
      ok: false,
      reasonCode: "web_research_context_invalid",
    }
  }
  let proposal: unknown
  try {
    proposal = await input.provider.proposeNextAction({
      runId: input.runId,
      snapshot: input.snapshot,
    })
  } catch {
    return {
      ok: false,
      reasonCode: "web_research_provider_failed",
    }
  }

  try {
    const receipt = createWebResearchMethodReceipt(
      {
        receiptId: input.receiptId,
        runId: input.runId,
        snapshot: input.snapshot,
        proposal,
      },
      input.createFingerprint,
    )
    return admitWebResearchNextAction(
      {
        runId: input.runId,
        snapshot: input.snapshot,
        proposal,
        receipt,
      },
      input.createFingerprint,
    )
  } catch {
    return {
      ok: false,
      reasonCode: "web_research_provider_output_invalid",
    }
  }
}
