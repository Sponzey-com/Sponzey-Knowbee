import { createHash } from "node:crypto"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import type { AIChunk, AIProvider, ChatParams } from "../packages/core/src/ai/types.ts"
import {
  type WebResearchFingerprintPort,
  type WebResearchMethodProviderInput,
  type WebResearchNextAction,
  createWebResearchSnapshot,
} from "../packages/core/src/contracts/web-research-method.ts"
import { loadPromptSourceRegistry } from "../packages/core/src/memory/knowbee-md.ts"
import {
  createFileBackedWebResearchMethodProvider,
  selectWebResearchMethodPromptSources,
} from "../packages/core/src/orchestration/prompt-policy-adapter.ts"
import { executeWebResearchMethodProposal } from "../packages/core/src/runs/web-research-method-use-case.ts"

const roots: string[] = []
const SEARCH_FINGERPRINT = `sha256:${"a".repeat(64)}` as const
const FETCH_FINGERPRINT = `sha256:${"b".repeat(64)}` as const

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
  return `{${entries
    .map(([key, item]) => `${JSON.stringify(key)}:${canonicalize(item)}`)
    .join(",")}}`
}

const createFingerprint: WebResearchFingerprintPort = (namespace, value) =>
  `sha256:${createHash("sha256")
    .update(`test:${namespace}:${canonicalize(value)}`)
    .digest("hex")}`

const snapshot = createWebResearchSnapshot(
  {
    runId: "run:web-method-provider",
    snapshotId: "snapshot:web-method-provider",
    candidates: [
      {
        candidateId: "candidate:search",
        kind: "search",
        query: "current public value",
        strategyFingerprint: SEARCH_FINGERPRINT,
      },
      {
        candidateId: "candidate:fetch",
        kind: "fetch",
        sourceUrl: "https://example.test/current",
        evidenceRef: "evidence:search:1",
        strategyFingerprint: FETCH_FINGERPRINT,
      },
    ],
    evidenceRefs: ["evidence:search:1"],
    attemptedStrategyFingerprints: [],
    terminalAdmission: {
      completionAllowed: false,
      blockedAllowed: false,
      remainingChangedCandidateIds: ["candidate:search", "candidate:fetch"],
    },
  },
  createFingerprint,
)

const fetchProposal: WebResearchNextAction = {
  kind: "execute_fetch",
  candidateId: "candidate:fetch",
  sourceUrl: "https://example.test/current",
  evidenceRef: "evidence:search:1",
  strategyFingerprint: FETCH_FINGERPRINT,
}

class FakeProvider implements AIProvider {
  readonly id = "fake"
  readonly supportedModels = ["fake-model"]
  readonly calls: ChatParams[] = []

  constructor(private readonly output: (input: WebResearchMethodProviderInput) => unknown) {}

  maxContextTokens(): number {
    return 16_000
  }

  async *chat(params: ChatParams): AsyncGenerator<AIChunk> {
    this.calls.push(params)
    const payload = JSON.parse(String(params.messages[0]?.content)) as {
      input: WebResearchMethodProviderInput
    }
    yield { type: "text_delta", delta: JSON.stringify(this.output(payload.input)) }
  }
}

function promptRoot(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "knowbee-web-method-provider-"))
  roots.push(root)
  mkdirSync(join(root, "prompts"))
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(root, "prompts", name), content)
  }
  return root
}

function completePromptRoot(): string {
  return promptRoot({
    "web_research_method.md": "# Web Research Method\n\nWEB_METHOD_MARKER\n",
    "web_research_method_json_instruction_user.md":
      "# Web Research Method JSON Instruction\n\n## Value\nReturn one exact next-action JSON object.\n",
  })
}

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop() ?? "", { recursive: true, force: true })
})

describe("web research method provider runtime", () => {
  it("uses the dedicated English prompt and admits the LLM-selected exact candidate", async () => {
    const root = completePromptRoot()
    const sources = selectWebResearchMethodPromptSources({
      sources: loadPromptSourceRegistry(root),
      locale: "en",
    })
    expect(sources.map((source) => source.sourceId)).toEqual(["web_research_method"])

    const aiProvider = new FakeProvider(() => fetchProposal)
    const provider = createFileBackedWebResearchMethodProvider({
      provider: aiProvider,
      model: "fake-model",
      workDir: root,
      observabilityContext: { runId: snapshot.runId },
    })
    const result = await executeWebResearchMethodProposal({
      runId: snapshot.runId,
      receiptId: "receipt:web-method-provider",
      snapshot,
      provider,
      createFingerprint,
    })

    expect(result).toEqual({
      ok: true,
      action: fetchProposal,
      receiptId: "receipt:web-method-provider",
    })
    expect(aiProvider.calls).toHaveLength(1)
    expect(aiProvider.calls[0]?.system).toContain("WEB_METHOD_MARKER")
    expect(aiProvider.calls[0]?.observability).toMatchObject({
      stage: "planning",
      operationCode: "web_research_method",
    })
    const payload = JSON.parse(String(aiProvider.calls[0]?.messages[0]?.content))
    expect(payload).toMatchObject({
      kind: "web_research_method",
      instruction: "Return one exact next-action JSON object.",
      input: {
        runId: snapshot.runId,
        snapshot,
      },
    })
  })

  it("rejects a model-selected candidate value that is absent from the snapshot", async () => {
    const root = completePromptRoot()
    const provider = createFileBackedWebResearchMethodProvider({
      provider: new FakeProvider(() => ({
        ...fetchProposal,
        sourceUrl: "https://invented.example/current",
      })),
      model: "fake-model",
      workDir: root,
    })

    await expect(
      executeWebResearchMethodProposal({
        runId: snapshot.runId,
        receiptId: "receipt:web-method-provider",
        snapshot,
        provider,
        createFingerprint,
      }),
    ).resolves.toEqual({
      ok: false,
      reasonCode: "web_research_candidate_mismatch",
    })
  })

  it("fails closed without exposing malformed model output", async () => {
    const root = completePromptRoot()
    const aiProvider = new FakeProvider(() => fetchProposal)
    aiProvider.chat = async function* (params: ChatParams): AsyncGenerator<AIChunk> {
      this.calls.push(params)
      yield { type: "text_delta", delta: "secret malformed response" }
    }
    const provider = createFileBackedWebResearchMethodProvider({
      provider: aiProvider,
      model: "fake-model",
      workDir: root,
    })

    const result = await executeWebResearchMethodProposal({
      runId: snapshot.runId,
      receiptId: "receipt:web-method-provider",
      snapshot,
      provider,
      createFingerprint,
    })

    expect(result).toEqual({
      ok: false,
      reasonCode: "web_research_provider_output_invalid",
    })
    expect(JSON.stringify(result)).not.toContain("secret malformed response")
  })

  it("rejects a mismatched run before sending the snapshot to the model", async () => {
    let calls = 0
    const result = await executeWebResearchMethodProposal({
      runId: "run:foreign",
      receiptId: "receipt:web-method-provider",
      snapshot,
      provider: {
        proposeNextAction: () => {
          calls += 1
          return fetchProposal
        },
      },
      createFingerprint,
    })

    expect(result).toEqual({
      ok: false,
      reasonCode: "web_research_context_invalid",
    })
    expect(calls).toBe(0)
  })

  it("returns a redacted typed failure when the model provider fails", async () => {
    const result = await executeWebResearchMethodProposal({
      runId: snapshot.runId,
      receiptId: "receipt:web-method-provider",
      snapshot,
      provider: {
        proposeNextAction: () => {
          throw new Error("secret provider payload")
        },
      },
      createFingerprint,
    })

    expect(result).toEqual({
      ok: false,
      reasonCode: "web_research_provider_failed",
    })
    expect(JSON.stringify(result)).not.toContain("secret provider payload")
  })

  it("fails closed when the dedicated prompt source is missing", () => {
    const root = promptRoot({
      "web_research_method_json_instruction_user.md":
        "# Web Research Method JSON Instruction\n\n## Value\nReturn JSON.\n",
    })

    expect(() =>
      createFileBackedWebResearchMethodProvider({
        provider: new FakeProvider(() => fetchProposal),
        model: "fake-model",
        workDir: root,
      }),
    ).toThrow(/web research method prompt sources missing: web_research_method/iu)
  })

  it("contains no deterministic natural-language method router", () => {
    const source = [
      readFileSync("packages/core/src/ai/web-research-method-adapter.ts", "utf8"),
      readFileSync("packages/core/src/runs/web-research-method-use-case.ts", "utf8"),
    ].join("\n")

    expect(source).not.toMatch(
      /userMessage|keyword|locale|includes\(["'][^"']+["']\)|new\s+URL\(|process\.env/u,
    )
  })
})
