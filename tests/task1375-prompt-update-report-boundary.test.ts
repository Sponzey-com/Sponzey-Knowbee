import { readFileSync } from "node:fs"
import { describe, expect, it, vi } from "vitest"
import {
  authorizePromptUpdateReport,
  publishAuthorizedPromptUpdateReport,
  type PromptSourceWriteReceipt,
} from "../packages/core/src/contracts/prompt-update-report-boundary.ts"
import type { CompletePromptActivationDecision } from "../packages/core/src/contracts/complete-prompt-activation.ts"

const write: PromptSourceWriteReceipt = {
  sourceRef: "prompt:final_response",
  sourceVersion: "v2",
  sourceChecksum: "sha:v2",
  writtenAt: 100,
  evidenceRef: "write:1375",
}

const activation: CompletePromptActivationDecision = {
  status: "authorized",
  activationId: "activation:1375",
  sourceRef: write.sourceRef,
  sourceVersion: write.sourceVersion,
  loaderId: "gateway:123",
  activatedAt: 200,
  method: "reload",
  testIds: ["prompt-regression"],
  rollbackSourceRef: "git:abc1234",
  evidenceRefs: ["activation:complete:1375"],
}

describe("task1375 prompt update report boundary", () => {
  it("authorizes an activation-pending fact when only the prompt source write is proven", () => {
    expect(authorizePromptUpdateReport({ requestedClaim: "source_updated_activation_pending", write }))
      .toEqual({
        status: "authorized",
        claimCode: "source_updated_activation_pending",
        sourceRef: write.sourceRef,
        sourceVersion: write.sourceVersion,
        activeNow: false,
        evidenceRefs: ["write:1375"],
      })
  })

  it("authorizes runtime-loaded facts only for matching complete activation evidence", () => {
    expect(authorizePromptUpdateReport({ requestedClaim: "source_updated_runtime_loaded", write, activation }))
      .toEqual({
        status: "authorized",
        claimCode: "source_updated_runtime_loaded",
        sourceRef: write.sourceRef,
        sourceVersion: write.sourceVersion,
        activeNow: true,
        loaderId: "gateway:123",
        activatedAt: 200,
        activationMethod: "reload",
        evidenceRefs: ["write:1375", "activation:complete:1375"],
      })
  })

  it("rejects a generic prompt-updated claim and activation claims without complete evidence", () => {
    expect(authorizePromptUpdateReport({ requestedClaim: "prompt_updated", write }))
      .toEqual({ status: "blocked", reasonCode: "generic_update_claim_forbidden" })
    expect(authorizePromptUpdateReport({ requestedClaim: "source_updated_runtime_loaded", write }))
      .toEqual({ status: "blocked", reasonCode: "activation_evidence_missing" })
    expect(authorizePromptUpdateReport({
      requestedClaim: "source_updated_runtime_loaded",
      write,
      activation: { status: "blocked", reasonCode: "activation_tests_blocked" },
    })).toEqual({ status: "blocked", reasonCode: "activation_evidence_missing" })
  })

  it("rejects invalid write evidence and activation lineage mismatches", () => {
    expect(authorizePromptUpdateReport({ requestedClaim: "source_updated_activation_pending", write: { ...write, evidenceRef: "" } }))
      .toEqual({ status: "blocked", reasonCode: "source_write_evidence_invalid" })
    expect(authorizePromptUpdateReport({
      requestedClaim: "source_updated_runtime_loaded",
      write,
      activation: { ...activation, sourceVersion: "v3" },
    })).toEqual({ status: "blocked", reasonCode: "activation_lineage_mismatch" })
  })

  it("invokes the LLM report adapter only for authorized structured facts", async () => {
    const renderWithLlm = vi.fn(async () => "사용자 언어 보고")
    const blocked = authorizePromptUpdateReport({ requestedClaim: "prompt_updated", write })
    await expect(publishAuthorizedPromptUpdateReport({ decision: blocked, renderWithLlm }))
      .resolves.toEqual(blocked)
    expect(renderWithLlm).not.toHaveBeenCalled()

    const authorized = authorizePromptUpdateReport({ requestedClaim: "source_updated_activation_pending", write })
    await expect(publishAuthorizedPromptUpdateReport({ decision: authorized, renderWithLlm }))
      .resolves.toEqual({ status: "reported", text: "사용자 언어 보고" })
    expect(renderWithLlm).toHaveBeenCalledWith(authorized)
  })

  it("uses only explicit receipts and an injected LLM report adapter", () => {
    const source = readFileSync(new URL("../packages/core/src/contracts/prompt-update-report-boundary.ts", import.meta.url), "utf8")
    expect(source).not.toMatch(/process\.env|Date\.now|readFile|writeFile|fetch\(|globalThis/u)
  })

  it("assigns fact ownership and localized rendering to separate canonical prompt modules", () => {
    const improvement = readFileSync(new URL("../prompts/prompt_improvement.md", import.meta.url), "utf8")
    const finalResponse = readFileSync(new URL("../prompts/final_response.md", import.meta.url), "utf8")
    expect(improvement).toContain("Never emit a generic prompt-updated completion claim")
    expect(improvement).toContain("Emit `source_updated_activation_pending` only from a verified prompt source write")
    expect(improvement).toContain("Emit `source_updated_runtime_loaded` only when complete activation evidence matches")
    expect(finalResponse).toContain("Render `source_updated_activation_pending` as a concise statement")
    expect(finalResponse).toContain("Render `source_updated_runtime_loaded` as a concise statement")
    expect(finalResponse).toContain("do not replace these claims with a generic prompt-updated completion statement")
  })
})
