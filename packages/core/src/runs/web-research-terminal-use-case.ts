import {
  createWebResearchSnapshot,
  type WebResearchFingerprintPort,
  type WebResearchMethodProvider,
  type WebResearchMethodAdmission,
} from "../contracts/web-research-method.js"
import { executeWebResearchMethodProposal } from "./web-research-method-use-case.js"

export async function executeWebResearchTerminalProposal(input: Readonly<{
  runId: string
  evidenceRefs: readonly string[]
  attemptedStrategyFingerprints: readonly `sha256:${string}`[]
  completionAllowed: boolean
  blockedAllowed: boolean
  provider: WebResearchMethodProvider
  createFingerprint: WebResearchFingerprintPort
}>): Promise<WebResearchMethodAdmission | Readonly<{
  ok: false
  reasonCode:
    | "web_research_terminal_context_invalid"
    | "web_research_context_invalid"
    | "web_research_provider_failed"
    | "web_research_provider_output_invalid"
}>> {
  if (!input.runId.trim() || input.evidenceRefs.length === 0) {
    return Object.freeze({
      ok: false,
      reasonCode: "web_research_terminal_context_invalid" as const,
    })
  }
  const snapshot = createWebResearchSnapshot({
    runId: input.runId,
    snapshotId: `snapshot:web-terminal:${input.runId}`,
    candidates: [],
    evidenceRefs: input.evidenceRefs,
    attemptedStrategyFingerprints: input.attemptedStrategyFingerprints,
    terminalAdmission: {
      completionAllowed: input.completionAllowed,
      blockedAllowed: input.blockedAllowed,
      remainingChangedCandidateIds: [],
    },
  }, input.createFingerprint)
  const receiptFingerprint = input.createFingerprint("web-terminal-receipt:v1", {
    runId: input.runId,
    snapshotFingerprint: snapshot.snapshotFingerprint,
  })
  return executeWebResearchMethodProposal({
    runId: input.runId,
    receiptId: `receipt:web-terminal:${receiptFingerprint.slice("sha256:".length, 39)}`,
    snapshot,
    provider: input.provider,
    createFingerprint: input.createFingerprint,
  })
}
