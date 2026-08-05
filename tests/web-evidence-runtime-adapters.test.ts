import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { AIChunk, AIProvider, ChatParams } from "../packages/core/src/ai/types.ts"
import {
  WEB_EVIDENCE_AI_OPERATIONS,
} from "../packages/core/src/ai/web-evidence-pipeline-adapter.ts"
import {
  createDeterministicTokenEstimator,
} from "../packages/core/src/ai/web-token-estimator.ts"
import {
  createFileBackedWebEvidencePipelineAdapter,
} from "../packages/core/src/orchestration/prompt-policy-adapter.ts"
import {
  createWebEvidenceSourceFetchPort,
} from "../packages/core/src/runs/web-evidence-tool-dispatch-adapter.ts"
import type { ToolResult } from "../packages/core/src/tools/types.ts"

const roots: string[] = []

class FakeProvider implements AIProvider {
  readonly id = "fake"
  readonly supportedModels = ["fake-model"]
  readonly calls: ChatParams[] = []

  maxContextTokens(): number {
    return 16_000
  }

  async *chat(params: ChatParams): AsyncGenerator<AIChunk> {
    this.calls.push(params)
    yield { type: "text_delta", delta: "{}" }
  }
}

function promptRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "knowbee-web-evidence-runtime-"))
  roots.push(root)
  mkdirSync(join(root, "prompts"))
  for (const operation of WEB_EVIDENCE_AI_OPERATIONS) {
    writeFileSync(
      join(root, "prompts", `${operation}.md`),
      `# ${operation}\n\nSYSTEM_${operation}\n`,
    )
    writeFileSync(
      join(root, "prompts", `${operation}_json_instruction_user.md`),
      `# ${operation} instruction\n\n## Value\nReturn JSON for ${operation}.\n`,
    )
  }
  return root
}

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop() ?? "", { recursive: true, force: true })
})

describe("web evidence runtime adapters", () => {
  it("builds five distinct file-backed system blocks from one startup snapshot", async () => {
    const provider = new FakeProvider()
    const adapter = createFileBackedWebEvidencePipelineAdapter({
      provider,
      model: "fake-model",
      workDir: promptRoot(),
      observabilityContext: { runId: "run-1" },
    })

    await Promise.all([
      adapter.selectSources({} as never),
      adapter.selectChunks({} as never),
      adapter.compressEvidence({} as never),
      adapter.reviewEvidence({} as never),
      adapter.verifyEvidence({} as never),
    ])

    expect(provider.calls).toHaveLength(5)
    provider.calls.forEach((call, index) => {
      expect(call.system).toContain(`SYSTEM_${WEB_EVIDENCE_AI_OPERATIONS[index]}`)
    })
    expect(new Set(provider.calls.map((call) => call.system)).size).toBe(5)
  })

  it("fails closed when any required system source is missing", () => {
    const root = promptRoot()
    rmSync(join(root, "prompts", "web_evidence_review.md"))

    expect(() => createFileBackedWebEvidencePipelineAdapter({
      provider: new FakeProvider(),
      model: "fake-model",
      workDir: root,
    })).toThrow(/web evidence pipeline prompt sources missing.*web_evidence_review/u)
  })

  it("provides a deterministic versioned estimator without retaining text", () => {
    const estimator = createDeterministicTokenEstimator()

    expect(estimator.version).toBe("utf8-byte4-v1")
    expect(estimator.estimateTokens("12345678")).toBe(2)
    expect(estimator.estimateTokens("12345678")).toBe(2)
    expect(Object.isFrozen(estimator)).toBe(true)
    expect(JSON.stringify(estimator)).not.toContain("12345678")
  })

  it("dispatches one selected fetch with the injected context and no runtime env lookup", async () => {
    const success: ToolResult = {
      success: true,
      output: "public output",
      details: { document: {} },
    }
    const dispatch = vi.fn(async () => success)
    const context = Object.freeze({
      runId: "run-1",
      agentId: "agent:main",
      allowWebAccess: true as const,
      signal: new AbortController().signal,
    })
    const fetchSource = createWebEvidenceSourceFetchPort({
      dispatcher: { dispatch },
      context,
      freshnessPolicy: "strict_timestamp",
    })

    const result = await fetchSource({
      candidateRef: "search:1",
      url: "https://example.com/current",
      signal: context.signal,
    })

    expect(result).toBe(success)
    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(dispatch).toHaveBeenCalledWith(
      "web_fetch",
      {
        url: "https://example.com/current",
        maxLength: 200_000,
        freshnessPolicy: "strict_timestamp",
      },
      context,
    )
  })

  it("does not dispatch after cancellation", async () => {
    const controller = new AbortController()
    controller.abort()
    const dispatch = vi.fn()
    const fetchSource = createWebEvidenceSourceFetchPort({
      dispatcher: { dispatch },
      context: {
        runId: "run-1",
        agentId: "agent:main",
        allowWebAccess: true,
        signal: controller.signal,
      },
      freshnessPolicy: "normal",
    })

    expect(await fetchSource({
      candidateRef: "search:1",
      url: "https://example.com/current",
      signal: controller.signal,
    })).toEqual({
      success: false,
      output: "",
      error: "web_document_cancelled",
      details: { reasonCode: "web_document_cancelled" },
    })
    expect(dispatch).not.toHaveBeenCalled()
  })
})
