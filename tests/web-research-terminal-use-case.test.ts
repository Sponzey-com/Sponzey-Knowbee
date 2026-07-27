import { createHash } from "node:crypto"
import { describe, expect, it } from "vitest"

import type { WebResearchFingerprintPort } from "../packages/core/src/contracts/web-research-method.js"
import {
  executeWebResearchTerminalProposal,
} from "../packages/core/src/runs/web-research-terminal-use-case.js"

const fingerprint: WebResearchFingerprintPort = (namespace, value) =>
  `sha256:${createHash("sha256").update(`${namespace}:${JSON.stringify(value)}`).digest("hex")}`

describe("web research terminal proposal use case", () => {
  it("admits LLM completion only for exact verified evidence", async () => {
    await expect(executeWebResearchTerminalProposal({
      runId: "run:terminal",
      evidenceRefs: ["document:1"],
      attemptedStrategyFingerprints: [],
      completionAllowed: true,
      blockedAllowed: false,
      provider: {
        proposeNextAction: () => ({
          kind: "propose_complete",
          evidenceRefs: ["document:1"],
        }),
      },
      createFingerprint: fingerprint,
    })).resolves.toMatchObject({
      ok: true,
      action: {
        kind: "propose_complete",
        evidenceRefs: ["document:1"],
      },
    })
  })

  it("rejects foreign evidence and completion without verifier permission", async () => {
    for (const [evidenceRefs, completionAllowed, reasonCode] of [
      [["document:foreign"], true, "web_research_evidence_not_admitted"],
      [["document:1"], false, "web_research_completion_not_admitted"],
    ] as const) {
      await expect(executeWebResearchTerminalProposal({
        runId: "run:terminal",
        evidenceRefs: ["document:1"],
        attemptedStrategyFingerprints: [],
        completionAllowed,
        blockedAllowed: false,
        provider: {
          proposeNextAction: () => ({ kind: "propose_complete", evidenceRefs }),
        },
        createFingerprint: fingerprint,
      })).resolves.toEqual({ ok: false, reasonCode })
    }
  })

  it("admits blocked only with explicit exhaustion permission", async () => {
    const proposal = {
      kind: "propose_blocked",
      evidenceRefs: ["document:1"],
      reasonCode: "verified_source_unavailable",
    }
    await expect(executeWebResearchTerminalProposal({
      runId: "run:terminal",
      evidenceRefs: ["document:1"],
      attemptedStrategyFingerprints: [],
      completionAllowed: false,
      blockedAllowed: false,
      provider: { proposeNextAction: () => proposal },
      createFingerprint: fingerprint,
    })).resolves.toEqual({
      ok: false,
      reasonCode: "web_research_blocked_not_admitted",
    })
    await expect(executeWebResearchTerminalProposal({
      runId: "run:terminal",
      evidenceRefs: ["document:1"],
      attemptedStrategyFingerprints: [],
      completionAllowed: false,
      blockedAllowed: true,
      provider: { proposeNextAction: () => proposal },
      createFingerprint: fingerprint,
    })).resolves.toMatchObject({
      ok: true,
      action: { kind: "propose_blocked" },
    })
  })
})
