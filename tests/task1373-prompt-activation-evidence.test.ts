import { readFileSync } from "node:fs"
import { describe, expect, it, vi } from "vitest"
import {
  DOCUMENTED_PROMPT_ACTIVATION_METHODS,
  PROMPT_ACTIVATION_LOADER_KINDS,
  authorizePromptActivationEvidence,
  publishPromptActivationEvidence,
  type PromptActivationEvidenceReceipt,
  type PromptActivationMethodEvidence,
} from "../packages/core/src/contracts/prompt-activation-evidence.ts"

const now = 1_000

function methodEvidence(method: PromptActivationMethodEvidence["method"]): PromptActivationMethodEvidence {
  if (method === "restart") return { method, previousRuntimeSnapshotId: "runtime:old", nextRuntimeSnapshotId: "runtime:new", evidenceRef: "activation:restart" }
  if (method === "reload") return { method, reloadReceiptId: "reload:1373", runtimeSnapshotId: "runtime:new", evidenceRef: "activation:reload" }
  return { method, registryVersionRef: "registry:prompts:v2", runtimeSnapshotId: "runtime:new", evidenceRef: "activation:registry" }
}

function receipt(overrides: Partial<PromptActivationEvidenceReceipt> = {}): PromptActivationEvidenceReceipt {
  return {
    activationId: "activation:1373",
    sourceRef: "prompt:identity",
    sourceVersion: "v2",
    sourceChecksum: "sha:v2",
    sourceWrittenAt: 800,
    activatedAt: 900,
    issuedAt: 910,
    expiresAt: 1_100,
    loader: { kind: "process", loaderId: "gateway:pid:123", runtimeId: "runtime:gateway", runtimeSnapshotId: "runtime:new", evidenceRef: "loader:gateway" },
    methodEvidence: methodEvidence("restart"),
    ...overrides,
  }
}

function authorize(overrides: Partial<Parameters<typeof authorizePromptActivationEvidence>[0]> = {}) {
  return authorizePromptActivationEvidence({ receipt: receipt(), expectedRuntimeId: "runtime:gateway", expectedRuntimeSnapshotId: "runtime:new", now, ...overrides })
}

describe("task1373 prompt activation evidence", () => {
  it.each(PROMPT_ACTIVATION_LOADER_KINDS)("records an exact %s loader identity", (kind) => {
    expect(authorize({ receipt: receipt({ loader: { ...receipt().loader, kind } }) })).toMatchObject({ status: "authorized", loaderId: "gateway:pid:123" })
  })

  it("blocks missing loader identity and runtime mismatches", () => {
    expect(authorize({ receipt: receipt({ loader: { ...receipt().loader, loaderId: "" } }) })).toEqual({ status: "blocked", reasonCode: "activation_loader_invalid" })
    expect(authorize({ expectedRuntimeId: "runtime:other" })).toEqual({ status: "blocked", reasonCode: "activation_runtime_mismatch" })
    expect(authorize({ expectedRuntimeSnapshotId: "runtime:other" })).toEqual({ status: "blocked", reasonCode: "activation_runtime_mismatch" })
  })

  it("requires activation after source write and a current bounded receipt", () => {
    expect(authorize({ receipt: receipt({ activatedAt: 799 }) })).toEqual({ status: "blocked", reasonCode: "activation_timestamp_invalid" })
    expect(authorize({ receipt: receipt({ issuedAt: now + 1 }) })).toEqual({ status: "blocked", reasonCode: "activation_timestamp_invalid" })
    expect(authorize({ receipt: receipt({ expiresAt: now }) })).toEqual({ status: "blocked", reasonCode: "activation_receipt_expired" })
  })

  it.each(DOCUMENTED_PROMPT_ACTIVATION_METHODS)("publishes exact %s method evidence", async (method) => {
    const publish = vi.fn(async () => method)
    const decision = authorize({ receipt: receipt({ methodEvidence: methodEvidence(method) }) })
    await expect(publishPromptActivationEvidence({ decision, publish })).resolves.toEqual({ status: "published", result: method })
    expect(publish).toHaveBeenCalledWith(expect.objectContaining({ method }))
  })

  it.each(DOCUMENTED_PROMPT_ACTIVATION_METHODS)("blocks mismatched %s method evidence before publish", async (method) => {
    const publish = vi.fn()
    const evidence = methodEvidence(method)
    const invalid = method === "restart"
      ? { ...evidence, nextRuntimeSnapshotId: "runtime:other" }
      : { ...evidence, runtimeSnapshotId: "runtime:other" }
    const decision = authorize({ receipt: receipt({ methodEvidence: invalid as PromptActivationMethodEvidence }) })
    expect(decision).toEqual({ status: "blocked", reasonCode: "activation_method_evidence_mismatch" })
    await publishPromptActivationEvidence({ decision, publish })
    expect(publish).not.toHaveBeenCalled()
  })

  it("uses only injected loader, clock, and method receipts", () => {
    const source = readFileSync(new URL("../packages/core/src/contracts/prompt-activation-evidence.ts", import.meta.url), "utf8")
    expect(source).not.toMatch(/process\.(?:pid|env)|Date\.now|readFile|writeFile|fetch\(|globalThis/u)
  })
})
