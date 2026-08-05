import { beforeEach, describe, expect, it, vi } from "vitest"
import { DEFAULT_CONFIG } from "../packages/core/src/config/types.ts"
import { AIProviderInvocationError } from "../packages/core/src/ai/provider-failure.ts"
import { createTestAgentRuntimeDependencies } from "./fixtures/agent-runtime.ts"

const getAllMock = vi.fn(() => [])
const dispatchMock = vi.fn()
const insertMessageMock = vi.fn()
const insertAuditLogMock = vi.fn()
const getMessagesForRunMock = vi.fn(() => [])
const buildMemoryContextMock = vi.fn(async () => "")
const testAgentRuntime = createTestAgentRuntimeDependencies("/tmp/knowbee-run-agent-streaming")

function buildDirectEvidenceReceipt(
  operation: string,
  input: Record<string, any>,
): unknown {
  if (operation === "web_research_method") {
    return {
      kind: "propose_complete",
      evidenceRefs: input.snapshot.evidenceRefs,
    }
  }
  if (operation === "web_source_selection") {
    return {
      snapshotFingerprint: input.snapshot.snapshotFingerprint,
      budgetFingerprint: input.snapshot.budgetFingerprint,
      selections: [{
        candidateRef: input.snapshot.candidates[0].candidateRef,
        relevanceScore: 0.99,
        reason: "The source directly addresses the required current value.",
        factKeys: ["current value"],
      }],
    }
  }
  if (operation === "web_chunk_selection") {
    return {
      snapshotFingerprint: input.snapshot.snapshotFingerprint,
      budgetFingerprint: input.snapshot.budgetFingerprint,
      selections: [{
        chunkRef: input.snapshot.chunks[0].chunkRef,
        relevanceScore: 0.99,
        factKeys: ["current value"],
      }],
    }
  }
  if (operation === "web_evidence_compression") {
    return {
      budgetFingerprint: input.source.budgetFingerprint,
      evidenceRef: input.source.evidenceRef,
      units: [{
        claim: "The current value is 100.",
        evidence: "Current value is 100 at 10:00 KST.",
        chunkRefs: [input.selectedChunks[0].chunkRef],
        factKey: "current value",
        supportType: "direct",
        confidence: 0.99,
      }],
      unresolvedFactKeys: [],
    }
  }
  if (operation === "web_evidence_review") {
    return {
      budgetFingerprint: input.budgetFingerprint,
      evidenceSnapshotFingerprint: input.evidenceSnapshotFingerprint,
      duplicateGroups: [],
      conflicts: [],
      unresolvedFactKeys: [],
    }
  }
  return {
    packFingerprint: input.evidencePack.packFingerprint,
    budgetFingerprint: input.evidencePack.budgetFingerprint,
    status: "sufficient",
    answerDraft: "The current value is 100 at 10:00 KST.",
    supportedUnitRefs: [input.evidencePack.units[0].unitRef],
    unresolvedFactKeys: [],
  }
}

vi.mock("../packages/core/src/db/index.js", () => ({
  getDb: () => ({
    prepare: () => ({ run: vi.fn() }),
  }),
  insertSession: vi.fn(),
  getSession: vi.fn(() => null),
  insertMessage: (...args: unknown[]) => insertMessageMock(...args),
  insertAuditLog: (...args: unknown[]) => insertAuditLogMock(...args),
  getMessages: vi.fn(() => []),
  getMessagesForRequestGroup: vi.fn(() => []),
  getMessagesForRequestGroupWithRunMeta: vi.fn(() => []),
  getMessagesForRun: (...args: unknown[]) => getMessagesForRunMock(...args),
  getPromptSourceStates: vi.fn(() => []),
  insertDiagnosticEvent: vi.fn(),
  insertMemoryItem: vi.fn(),
  markMessagesCompressed: vi.fn(),
  updateRunPromptSourceSnapshot: vi.fn(),
  upsertPromptSources: vi.fn(),
}))

vi.mock("../packages/core/src/memory/store.js", () => ({
  buildMemoryContext: (...args: unknown[]) => buildMemoryContextMock(...args),
}))

vi.mock("../packages/core/src/memory/knowbee-md.js", () => ({
  loadKnowbeeMd: vi.fn(() => ""),
  loadBundledPromptTemplate: vi.fn(() => ""),
  loadPromptSourceRegistry: vi.fn(() => [
    "web_source_selection",
    "web_source_selection_json_instruction_user",
    "web_chunk_selection",
    "web_chunk_selection_json_instruction_user",
    "web_evidence_compression",
    "web_evidence_compression_json_instruction_user",
    "web_evidence_review",
    "web_evidence_review_json_instruction_user",
    "web_evidence_verification",
    "web_evidence_verification_json_instruction_user",
    "web_research_method",
    "web_research_method_json_instruction_user",
  ].map((sourceId, index) => ({
    sourceId,
    locale: "en",
    usageScope: "internal",
    enabled: true,
    priority: index,
    path: `/tmp/prompts/${sourceId}.md`,
    checksum: `sha256:${String(index).padStart(64, "0")}`,
    content: `# ${sourceId}`,
  }))),
  loadPromptTemplate: vi.fn((input: { sourceId?: string; variables?: Record<string, unknown> } = {}) => {
    if (input.sourceId === "runtime_identity_context") {
      return [
        "[Trusted Main Agent Identity]",
        `- Current main-agent self name: \`${String(input.variables?.["mainAgentName"] ?? "")}\`.`,
      ].join("\n")
    }
    if (input.sourceId === "profile_context_user_header_user") {
      return "## Value\n[User Profile]"
    }
    return "# Test System Prompt\n\nYou are {{mainAgentName}}."
  }),
  loadSystemPromptSourceAssembly: vi.fn(() => null),
}))

vi.mock("../packages/core/src/memory/prompt-fragments.js", () => ({
  loadPromptValue: vi.fn((sourceId: string, variables: Record<string, unknown> = {}) => {
    return [
      "runtime_header=[Runtime]",
      `today_line=Today: ${String(variables["today"] ?? "")}`,
      "instruction_chain_header=[Instruction Chain]",
      "selected_instruction_skill_header=[Selected Instruction Skill]",
      "no_output=(no output)",
      "tool_failure_header=[Tool Failure]",
      "tool_label=Tool:",
      "error_label=Error:",
      "details_header=[Details]",
    ].join("\n")
  }),
}))

vi.mock("../packages/core/src/instructions/merge.js", () => ({
  createInstructionRuntimeContext: vi.fn((stateDir: string) => ({
    globalStateDir: stateDir,
    fallbackBoundaryDir: stateDir,
  })),
  loadMergedInstructions: vi.fn(() => ({ mergedText: "" })),
}))

vi.mock("../packages/core/src/tools/runtime-dispatcher.js", () => ({
  toolDispatcher: {
    getAll: (...args: unknown[]) => getAllMock(...args),
    get: (name: string) =>
      getAllMock().find((tool: { name?: string }) => tool.name === name),
    isToolAvailableForSource: () => true,
    dispatch: (...args: unknown[]) => dispatchMock(...args),
  },
}))

const { runAgent } = await import("../packages/core/src/agent/index.ts")

describe("runAgent streaming policy", () => {
  beforeEach(() => {
    dispatchMock.mockReset()
  })

  it("does not grant web execution from required tool names without a capability receipt", async () => {
    dispatchMock.mockClear()
    getAllMock.mockReturnValueOnce([
      {
        name: "web_search",
        description: "search web",
        parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
      },
      {
        name: "web_fetch",
        description: "fetch web page",
        parameters: { type: "object", properties: { url: { type: "string" } }, required: ["url"] },
      },
      {
        name: "shell_exec",
        description: "run shell",
        parameters: { type: "object", properties: {} },
      },
    ])
    let round = 0
    const provider = {
      chat: vi.fn(async function* () {
        if (round++ === 0) {
          yield {
            type: "tool_use",
            id: "call-web-search",
            name: "web_search",
            input: { query: "SK하이닉스 현재 주가" },
          } as const
        } else {
          yield { type: "text_delta", delta: "확인된 현재가를 보고합니다." } as const
        }
        yield { type: "message_stop", usage: { input_tokens: 1, output_tokens: 1 } } as const
      }),
    }

    const chunks = []
    for await (const chunk of runAgent({
      config: DEFAULT_CONFIG,
      ...testAgentRuntime,
      userMessage: "SK 하이닉스 현재 주가 확인해줘",
      requiredToolNames: ["web_search", "web_fetch"],
      sessionId: "session-current-stock-price",
      runId: "run-current-stock-price",
      model: "gpt-5",
      provider: provider as never,
      source: "telegram",
    })) {
      chunks.push(chunk)
    }

    const firstCall = provider.chat.mock.calls[0]?.[0]
    expect(firstCall.toolChoice).toBeUndefined()
    expect(firstCall.tools.map((tool: { name: string }) => tool.name)).toEqual(["shell_exec"])
    expect(dispatchMock).not.toHaveBeenCalled()
    expect(chunks).toContainEqual({
      type: "tool_end",
      toolName: "web_search",
      success: false,
      output: "",
      details: {
        kind: "tool_admission_failure",
        reasonCode: "tool_not_admitted",
      },
    })
    expect(chunks).toContainEqual({ type: "text", delta: "확인된 현재가를 보고합니다.", textSource: "llm_generated" })
  })

  it("uses the same run-scoped admission for model Tool exposure and dispatch", async () => {
    dispatchMock.mockClear()
    getAllMock.mockReturnValueOnce([
      {
        name: "web_search",
        description: "search web",
        parameters: { type: "object", properties: {} },
      },
      {
        name: "web_fetch",
        description: "fetch web page",
        parameters: { type: "object", properties: {} },
      },
      {
        name: "shell_exec",
        description: "run shell",
        parameters: { type: "object", properties: {} },
      },
    ])
    let round = 0
    const provider = {
      chat: vi.fn(async function* () {
        if (round++ === 0) {
          yield {
            type: "tool_use",
            id: "call-injected-shell",
            name: "shell_exec",
            input: {},
          } as const
        } else {
          yield { type: "text_delta", delta: "허용된 범위로 계속합니다." } as const
        }
        yield { type: "message_stop", usage: { input_tokens: 1, output_tokens: 1 } } as const
      }),
    }

    for await (const chunk of runAgent({
      config: DEFAULT_CONFIG,
      ...testAgentRuntime,
      userMessage: "현재 정보를 확인해줘",
      requiredToolNames: ["web_search", "web_fetch"],
      admittedCapabilityExecutionScope: {
        schemaVersion: 1,
        runId: "run-scoped-web",
        ownerAgentId: "agent:main",
        receiptId: "receipt:selection:run-scoped-web",
        capabilitySnapshotFingerprint: `sha256:${"a".repeat(64)}`,
        selectedCapabilityId: "skill:web-research",
        toolNames: ["web_fetch", "web_search"],
      },
      agentId: "agent:main",
      agentType: "knowbee",
      sessionId: "session-scoped-web",
      runId: "run-scoped-web",
      model: "gpt-5",
      provider: provider as never,
      source: "telegram",
    })) {
      // Consume the stream.
    }

    expect(provider.chat.mock.calls[0]?.[0].tools.map((tool: { name: string }) => tool.name))
      .toEqual(["web_search", "web_fetch"])
    expect(dispatchMock).not.toHaveBeenCalled()
  })

  it("routes an admitted user URL through bounded evidence before the final agent answer", async () => {
    dispatchMock.mockClear()
    insertMessageMock.mockClear()
    insertAuditLogMock.mockClear()
    getAllMock.mockReturnValueOnce([
      {
        name: "web_search",
        description: "search web",
        parameters: { type: "object", properties: { query: { type: "string" } } },
      },
      {
        name: "web_fetch",
        description: "fetch web page",
        parameters: { type: "object", properties: { url: { type: "string" } } },
      },
    ])
    const url = "https://example.com/current"
    const markdown = `# Current\n\nCurrent value is 100 at 10:00 KST. ${Array.from(
      { length: 340 },
      (_, index) => `fact${index}`,
    ).join(" ")}`
    dispatchMock.mockResolvedValueOnce({
      success: true,
      output: "RAW FETCH MARKDOWN MUST NOT REACH THE AGENT",
      details: {
        document: {
          evidenceRef: "document:direct",
          title: "Current report",
          url,
          markdown,
          truncated: false,
          sourceEvidence: {
            method: "direct_fetch",
            sourceKind: "first_party",
            reliability: "high",
            sourceUrl: url,
            sourceDomain: "example.com",
            sourceTimestamp: "2026-07-24T05:00:00.000Z",
            fetchTimestamp: "2026-07-24T05:01:00.000Z",
          },
        },
      },
    })
    let genericRound = 0
    const provider = {
      maxContextTokens: vi.fn(() => 8_000),
      chat: vi.fn(async function* (request: {
        observability?: { operationCode?: string }
        messages: Array<{ content: string }>
      }) {
        const operation = request.observability?.operationCode
        const evidenceOperation = operation?.startsWith("web_") === true
        if (!evidenceOperation) {
          if (genericRound++ === 0) {
            yield {
              type: "tool_use",
              id: "fetch-direct",
              name: "web_fetch",
              input: { url, freshnessPolicy: "strict_timestamp" },
            } as const
          } else {
            yield { type: "text_delta", delta: "현재 값은 100이며 기준 시각은 10:00 KST입니다." } as const
          }
        } else {
          const envelope = JSON.parse(request.messages[0]!.content) as {
            input: Record<string, any>
          }
          const input = envelope.input
          const receipt = buildDirectEvidenceReceipt(operation ?? "", input)
          yield { type: "text_delta", delta: JSON.stringify(receipt) } as const
        }
        yield { type: "message_stop", usage: { input_tokens: 1, output_tokens: 1 } } as const
      }),
    }
    const chunks = []
    for await (const chunk of runAgent({
      config: DEFAULT_CONFIG,
      ...testAgentRuntime,
      userMessage: `이 문서를 확인해줘: ${url}`,
      memorySearchQuery: `이 문서를 확인해줘: ${url}`,
      completionConditions: ["current value"],
      requiredToolNames: ["web_search", "web_fetch"],
      admittedCapabilityExecutionScope: {
        schemaVersion: 1,
        runId: "run-direct-web",
        ownerAgentId: "agent:main",
        receiptId: "receipt:selection:run-direct-web",
        capabilitySnapshotFingerprint: `sha256:${"a".repeat(64)}`,
        selectedCapabilityId: "skill:web-research",
        toolNames: ["web_fetch", "web_search"],
      },
      agentId: "agent:main",
      sessionId: "session-direct-web",
      runId: "run-direct-web",
      model: "gpt-5",
      provider: provider as never,
      source: "telegram",
    })) {
      chunks.push(chunk)
    }

    expect(dispatchMock).toHaveBeenCalledTimes(1)
    expect(dispatchMock).toHaveBeenCalledWith(
      "web_fetch",
      { url, freshnessPolicy: "strict_timestamp" },
      expect.objectContaining({
        runId: "run-direct-web",
        allowWebAccess: true,
        signal: expect.any(AbortSignal),
      }),
      undefined,
    )
    expect(chunks).toContainEqual({
      type: "tool_start",
      toolName: "web_fetch",
      params: { method: "fetch" },
    })
    expect(JSON.stringify(chunks)).not.toContain("RAW FETCH MARKDOWN")
    expect(JSON.stringify(insertMessageMock.mock.calls)).not.toContain("RAW FETCH MARKDOWN")
    const traceAudit = insertAuditLogMock.mock.calls
      .map(([entry]) => entry as {
        tool_name?: string
        params?: string
        output?: string
        result?: string
        error_code?: string | null
      })
      .find((entry) => entry.tool_name === "web_research_run_trace")
    expect(JSON.parse(traceAudit?.params ?? "{}")).toMatchObject({
      machineState: "COMPLETED",
      attemptedMethods: ["direct_fetch"],
    })
    expect(traceAudit).toMatchObject({ result: "success", error_code: null })
    expect(traceAudit?.output).not.toMatch(/RAW FETCH MARKDOWN|markdown|https?:/iu)
    expect(provider.chat.mock.calls.some(([request]) =>
      request.observability?.operationCode?.startsWith("web_"))).toBe(false)
    expect(chunks).toContainEqual({
      type: "text",
      delta: "현재 값은 100이며 기준 시각은 10:00 KST입니다.",
      textSource: "llm_generated",
    })
  })

  it("leaves semantic completion to canonical review after validating direct evidence", async () => {
    dispatchMock.mockClear()
    getAllMock.mockReturnValueOnce([
      {
        name: "web_fetch",
        description: "fetch web page",
        parameters: { type: "object", properties: { url: { type: "string" } } },
      },
    ])
    const url = "https://example.com/current"
    dispatchMock.mockResolvedValueOnce({
      success: true,
      output: "RAW DOCUMENT",
      details: {
        document: {
          evidenceRef: "document:admitted",
          title: "Current report",
          url,
          markdown: `# Current\n\nCurrent value is 100 at 10:00 KST. ${Array.from(
            { length: 340 },
            (_, index) => `fact${index}`,
          ).join(" ")}`,
          truncated: false,
          sourceEvidence: {
            method: "direct_fetch",
            sourceKind: "first_party",
            reliability: "high",
            sourceUrl: url,
            sourceDomain: "example.com",
            fetchTimestamp: "2026-07-24T05:01:00.000Z",
          },
        },
      },
    })
    let genericRound = 0
    const provider = {
      maxContextTokens: vi.fn(() => 8_000),
      chat: vi.fn(async function* (request: {
        observability?: { operationCode?: string }
        messages: Array<{ content: string }>
      }) {
        const operation = request.observability?.operationCode
        if (operation?.startsWith("web_")) {
          const envelope = JSON.parse(request.messages[0]!.content) as {
            input: Record<string, any>
          }
          const receipt = operation === "web_research_method"
            ? { kind: "propose_complete", evidenceRefs: ["document:foreign"] }
            : buildDirectEvidenceReceipt(operation, envelope.input)
          yield { type: "text_delta", delta: JSON.stringify(receipt) } as const
        } else if (genericRound++ === 0) {
          yield {
            type: "tool_use",
            id: "fetch-terminal-reject",
            name: "web_fetch",
            input: { url },
          } as const
        } else {
          yield { type: "text_delta", delta: "완료했다고 가정하지 않습니다." } as const
        }
        yield { type: "message_stop", usage: { input_tokens: 1, output_tokens: 1 } } as const
      }),
    }
    const chunks = []
    for await (const chunk of runAgent({
      config: DEFAULT_CONFIG,
      ...testAgentRuntime,
      userMessage: `확인해줘: ${url}`,
      completionConditions: ["current value"],
      requiredToolNames: ["web_fetch"],
      admittedCapabilityExecutionScope: {
        schemaVersion: 1,
        runId: "run-terminal-reject",
        ownerAgentId: "agent:main",
        receiptId: "receipt:selection:run-terminal-reject",
        capabilitySnapshotFingerprint: `sha256:${"a".repeat(64)}`,
        selectedCapabilityId: "skill:web-research",
        toolNames: ["web_fetch"],
      },
      agentId: "agent:main",
      sessionId: "session-terminal-reject",
      runId: "run-terminal-reject",
      model: "gpt-5",
      provider: provider as never,
      source: "telegram",
    })) {
      chunks.push(chunk)
    }

    expect(dispatchMock).toHaveBeenCalledTimes(1)
    expect(chunks).toContainEqual(expect.objectContaining({
      type: "tool_end",
      toolName: "web_fetch",
      success: true,
      details: expect.objectContaining({
        kind: "web_document_evidence",
      }),
    }))
    expect(JSON.stringify(chunks)).not.toContain("RAW DOCUMENT")
    expect(provider.chat.mock.calls.some(([request]) =>
      request.observability?.operationCode?.startsWith("web_"))).toBe(false)
  })

  it("records one admitted search followed by the main LLM selected direct fetch", async () => {
    dispatchMock.mockClear()
    insertAuditLogMock.mockClear()
    getAllMock.mockReturnValueOnce([
      {
        name: "web_search",
        description: "search web",
        parameters: { type: "object", properties: { query: { type: "string" } } },
      },
      {
        name: "web_fetch",
        description: "fetch web page",
        parameters: { type: "object", properties: { url: { type: "string" } } },
      },
    ])
    const sourceUrl = "https://example.com/current"
    const sourceEvidence = {
      method: "fast_text_search",
      sourceKind: "search_index",
      reliability: "medium",
      sourceUrl,
      sourceDomain: "example.com",
      sourceTimestamp: "2026-07-24T05:00:00.000Z",
      fetchTimestamp: "2026-07-24T05:01:00.000Z",
    }
    dispatchMock
      .mockResolvedValueOnce({
        success: true,
        output: "RAW SEARCH RESULTS",
        details: {
          provider: "DuckDuckGo",
          retrievedAt: "2026-07-24T05:01:00.000Z",
          results: [{
            evidenceRef: "search:current",
            rank: 1,
            title: "Current report",
            url: sourceUrl,
            domain: "example.com",
            snippet: "Current value report",
            sourceEvidence,
          }],
        },
      })
      .mockResolvedValueOnce({
        success: true,
        output: "RAW FETCH DOCUMENT",
        details: {
          document: {
            evidenceRef: "document:current",
            title: "Current report",
            url: sourceUrl,
            markdown: `# Current\n\nCurrent value is 100 at 10:00 KST. ${Array.from(
              { length: 340 },
              (_, index) => `fact${index}`,
            ).join(" ")}`,
            truncated: false,
            sourceEvidence: {
              ...sourceEvidence,
              method: "direct_fetch",
              sourceKind: "first_party",
              reliability: "high",
            },
          },
          linkObservations: [],
        },
      })
    let genericRound = 0
    const provider = {
      maxContextTokens: vi.fn(() => 8_000),
      chat: vi.fn(async function* (request: {
        observability?: { operationCode?: string }
        messages: Array<{ content: string }>
      }) {
        const operation = request.observability?.operationCode
        if (operation?.startsWith("web_")) {
          const envelope = JSON.parse(request.messages[0]!.content) as {
            input: Record<string, any>
          }
          yield {
            type: "text_delta",
            delta: JSON.stringify(buildDirectEvidenceReceipt(operation, envelope.input)),
          } as const
        } else if (genericRound++ === 0) {
          yield {
            type: "tool_use",
            id: "search-current",
            name: "web_search",
            input: { query: "current value" },
          } as const
        } else if (genericRound === 2) {
          yield {
            type: "tool_use",
            id: "fetch-current",
            name: "web_fetch",
            input: { url: sourceUrl },
          } as const
        } else {
          yield { type: "text_delta", delta: "현재 값은 100입니다." } as const
        }
        yield { type: "message_stop", usage: { input_tokens: 1, output_tokens: 1 } } as const
      }),
    }

    for await (const _chunk of runAgent({
      config: DEFAULT_CONFIG,
      ...testAgentRuntime,
      userMessage: "현재 값을 찾아줘",
      completionConditions: ["current value"],
      requiredToolNames: ["web_search", "web_fetch"],
      admittedCapabilityExecutionScope: {
        schemaVersion: 1,
        runId: "run-search-trace",
        ownerAgentId: "agent:main",
        receiptId: "receipt:selection:run-search-trace",
        capabilitySnapshotFingerprint: `sha256:${"a".repeat(64)}`,
        selectedCapabilityId: "skill:web-research",
        toolNames: ["web_fetch", "web_search"],
      },
      agentId: "agent:main",
      sessionId: "session-search-trace",
      runId: "run-search-trace",
      model: "gpt-5",
      provider: provider as never,
      source: "telegram",
    })) {
      // Consume the stream.
    }

    expect(dispatchMock.mock.calls.map(([name]) => name)).toEqual([
      "web_search",
      "web_fetch",
    ])
    expect(provider.chat.mock.calls[1]?.[0]).toMatchObject({
      tools: [expect.objectContaining({
        name: "web_fetch",
        input_schema: expect.objectContaining({
          properties: expect.objectContaining({
            url: expect.objectContaining({ enum: [sourceUrl] }),
          }),
        }),
      })],
    })
    expect(provider.chat.mock.calls[1]?.[0]).not.toHaveProperty("toolChoice")
    expect(provider.chat).toHaveBeenCalledTimes(3)
    const traceAudit = insertAuditLogMock.mock.calls
      .map(([entry]) => entry as {
        tool_name?: string
        params?: string
        output?: string
        result?: string
        error_code?: string | null
      })
      .find((entry) => entry.tool_name === "web_research_run_trace")
    expect(JSON.parse(traceAudit?.params ?? "{}")).toMatchObject({
      machineState: "COMPLETED",
      attemptedMethods: ["fast_text_search", "direct_fetch"],
    })
    expect(traceAudit).toMatchObject({ result: "success", error_code: null })
    expect(JSON.parse(traceAudit?.output ?? "{}").evidenceLedger.entries).toEqual([
      expect.objectContaining({ evidenceRef: "search:current", parentEvidenceRefs: [] }),
      expect.objectContaining({
        evidenceRef: "document:current",
        parentEvidenceRefs: ["search:current"],
      }),
    ])
    expect(traceAudit?.output).not.toMatch(/RAW SEARCH|RAW FETCH|markdown|https?:/iu)
  })

  it("lets the LLM stop after validated search evidence without forcing fetch", async () => {
    dispatchMock.mockClear()
    insertAuditLogMock.mockClear()
    getAllMock.mockReturnValueOnce([
      {
        name: "web_search",
        description: "search web",
        parameters: { type: "object", properties: { query: { type: "string" } } },
      },
      {
        name: "web_fetch",
        description: "fetch web page",
        parameters: { type: "object", properties: { url: { type: "string" } } },
      },
    ])
    const sourceUrl = "https://example.com/current"
    dispatchMock.mockResolvedValueOnce({
      success: true,
      output: "RAW SEARCH RESULTS",
      details: {
        provider: "DuckDuckGo",
        retrievedAt: "2026-07-24T05:01:00.000Z",
        results: [{
          evidenceRef: "search:current",
          rank: 1,
          title: "Current report",
          url: sourceUrl,
          domain: "example.com",
          snippet: "Current value is 100 at 10:00 KST.",
          sourceEvidence: {
            method: "fast_text_search",
            sourceKind: "search_index",
            reliability: "medium",
            sourceUrl,
            sourceDomain: "example.com",
            sourceTimestamp: "2026-07-24T05:00:00.000Z",
            fetchTimestamp: "2026-07-24T05:01:00.000Z",
          },
        }],
      },
    })
    let genericRound = 0
    const provider = {
      maxContextTokens: vi.fn(() => 8_000),
      chat: vi.fn(async function* () {
        if (genericRound++ === 0) {
          yield {
            type: "tool_use",
            id: "search-current",
            name: "web_search",
            input: { query: "current value" },
          } as const
        } else {
          yield {
            type: "text_delta",
            delta: "검색 근거에 따르면 현재 값은 100입니다.",
          } as const
        }
        yield { type: "message_stop", usage: { input_tokens: 1, output_tokens: 1 } } as const
      }),
    }
    const chunks = []

    for await (const chunk of runAgent({
      config: DEFAULT_CONFIG,
      ...testAgentRuntime,
      userMessage: "현재 값을 찾아줘",
      completionConditions: ["current value"],
      requiredToolNames: ["web_search"],
      admittedCapabilityExecutionScope: {
        schemaVersion: 1,
        runId: "run-search-only",
        ownerAgentId: "agent:main",
        receiptId: "receipt:selection:run-search-only",
        capabilitySnapshotFingerprint: `sha256:${"a".repeat(64)}`,
        selectedCapabilityId: "skill:web-research",
        toolNames: ["web_fetch", "web_search"],
      },
      agentId: "agent:main",
      sessionId: "session-search-only",
      runId: "run-search-only",
      model: "gpt-5",
      provider: provider as never,
      source: "webui",
    })) {
      chunks.push(chunk)
    }

    expect(dispatchMock.mock.calls.map(([name]) => name)).toEqual(["web_search"])
    expect(provider.chat).toHaveBeenCalledTimes(2)
    expect(chunks).toContainEqual(expect.objectContaining({
      type: "text",
      delta: "검색 근거에 따르면 현재 값은 100입니다.",
    }))
  })

  it("offers only unattempted observed search URLs to web fetch across rounds", async () => {
    dispatchMock.mockClear()
    getAllMock.mockReturnValueOnce([
      {
        name: "web_search",
        description: "search web",
        parameters: { type: "object", properties: { query: { type: "string" } } },
      },
      {
        name: "web_fetch",
        description: "fetch web page",
        parameters: { type: "object", properties: { url: { type: "string" } } },
      },
    ])
    const firstUrl = "https://example.com/first"
    const secondUrl = "https://example.com/second"
    const sourceEvidence = (sourceUrl: string) => ({
      method: "fast_text_search",
      sourceKind: "search_index",
      reliability: "medium",
      sourceUrl,
      sourceDomain: "example.com",
      sourceTimestamp: "2026-07-24T05:00:00.000Z",
      fetchTimestamp: "2026-07-24T05:01:00.000Z",
    })
    dispatchMock
      .mockResolvedValueOnce({
        success: true,
        output: "RAW SEARCH RESULTS",
        details: {
          provider: "DuckDuckGo",
          retrievedAt: "2026-07-24T05:01:00.000Z",
          results: [firstUrl, secondUrl].map((url, index) => ({
            evidenceRef: `search:${index + 1}`,
            rank: index + 1,
            title: `Candidate ${index + 1}`,
            url,
            domain: "example.com",
            snippet: `Candidate ${index + 1} current value report`,
            sourceEvidence: sourceEvidence(url),
          })),
        },
      })
      .mockResolvedValueOnce({
        success: false,
        output: "RAW FIRST FETCH FAILURE",
        error: "web_document_too_large",
        details: { reasonCode: "web_document_too_large" },
      })
      .mockResolvedValueOnce({
        success: true,
        output: "RAW SECOND FETCH DOCUMENT",
        details: {
          document: {
            evidenceRef: "document:second",
            title: "Second candidate",
            url: secondUrl,
            markdown: `# Current\n\nCurrent value is 100 at 10:00 KST. ${Array.from(
              { length: 340 },
              (_, index) => `fact${index}`,
            ).join(" ")}`,
            truncated: false,
            sourceEvidence: {
              ...sourceEvidence(secondUrl),
              method: "direct_fetch",
              sourceKind: "first_party",
              reliability: "high",
            },
          },
          linkObservations: [],
        },
      })
    let genericRound = 0
    const genericRequests: Array<{
      tools?: Array<{ name: string; input_schema: { properties: Record<string, unknown> } }>
    }> = []
    const provider = {
      maxContextTokens: vi.fn(() => 8_000),
      chat: vi.fn(async function* (request: {
        observability?: { operationCode?: string }
        messages: Array<{ content: string }>
        tools?: Array<{ name: string; input_schema: { properties: Record<string, unknown> } }>
      }) {
        const operation = request.observability?.operationCode
        if (operation?.startsWith("web_")) {
          const envelope = JSON.parse(request.messages[0]!.content) as {
            input: Record<string, any>
          }
          yield {
            type: "text_delta",
            delta: JSON.stringify(buildDirectEvidenceReceipt(operation, envelope.input)),
          } as const
        } else {
          genericRequests.push(request)
          if (genericRound === 0) {
            yield {
              type: "tool_use",
              id: "search-candidates",
              name: "web_search",
              input: { query: "current value" },
            } as const
          } else if (genericRound === 1) {
            yield {
              type: "tool_use",
              id: "fetch-first",
              name: "web_fetch",
              input: { url: firstUrl },
            } as const
          } else if (genericRound === 2) {
            yield {
              type: "tool_use",
              id: "fetch-second",
              name: "web_fetch",
              input: { url: secondUrl },
            } as const
          } else {
            yield { type: "text_delta", delta: "두 번째 출처에서 현재 값 100을 확인했습니다." } as const
          }
          genericRound += 1
        }
        yield { type: "message_stop", usage: { input_tokens: 1, output_tokens: 1 } } as const
      }),
    }
    const webExecutionState = {
      discovery: { status: "not_attempted" as const },
      validatedEvidence: { status: "none" as const },
      observedFetchCandidates: [],
      observedSearchResults: [],
      attemptedFetchUrls: [],
    }

    for await (const _chunk of runAgent({
      config: DEFAULT_CONFIG,
      ...testAgentRuntime,
      userMessage: "현재 값을 찾아줘",
      completionConditions: ["current value"],
      requiredToolNames: ["web_search", "web_fetch"],
      admittedCapabilityExecutionScope: {
        schemaVersion: 1,
        runId: "run-search-candidate-enum",
        ownerAgentId: "agent:main",
        receiptId: "receipt:selection:run-search-candidate-enum",
        capabilitySnapshotFingerprint: `sha256:${"a".repeat(64)}`,
        selectedCapabilityId: "skill:web-research",
        toolNames: ["web_fetch", "web_search"],
      },
      webExecutionState,
      agentId: "agent:main",
      sessionId: "session-search-candidate-enum",
      runId: "run-search-candidate-enum",
      model: "gpt-5",
      provider: provider as never,
      source: "webui",
    })) {
      // Consume the stream.
    }

    expect(dispatchMock.mock.calls.map(([name, params]) => [name, params])).toEqual([
      ["web_search", { query: "current value", freshnessPolicy: "normal" }],
      ["web_fetch", { url: firstUrl, freshnessPolicy: "normal" }],
      ["web_fetch", { url: secondUrl, freshnessPolicy: "normal" }],
    ])
    expect(genericRequests[1]?.tools).toEqual([
      expect.objectContaining({
        name: "web_fetch",
        input_schema: expect.objectContaining({
          properties: expect.objectContaining({
            url: expect.objectContaining({ enum: [firstUrl, secondUrl] }),
          }),
        }),
      }),
    ])
    expect(genericRequests[2]?.tools).toEqual([
      expect.objectContaining({
        name: "web_fetch",
        input_schema: expect.objectContaining({
          properties: expect.objectContaining({
            url: expect.objectContaining({ enum: [secondUrl] }),
          }),
        }),
      }),
    ])
    expect(webExecutionState.attemptedFetchUrls).toEqual([firstUrl, secondUrl])
  })

  it("allows a changed admitted method after failure and blocks raw failure payloads", async () => {
    dispatchMock.mockClear()
    insertMessageMock.mockClear()
    getAllMock.mockReturnValueOnce([
      {
        name: "web_search",
        description: "search web",
        parameters: { type: "object", properties: { query: { type: "string" } } },
      },
      {
        name: "web_fetch",
        description: "fetch web page",
        parameters: { type: "object", properties: { url: { type: "string" } } },
      },
    ])
    const url = "https://example.com/current"
    dispatchMock
      .mockResolvedValueOnce({
        success: false,
        output: "RAW SEARCH PROVIDER FAILURE",
        error: "web_search_rate_limited",
        details: { reasonCode: "web_search_rate_limited", retryable: true },
      })
      .mockResolvedValueOnce({
        success: true,
        output: "RAW FETCH MARKDOWN",
        details: {
          document: {
            evidenceRef: "document:recovery",
            title: "Recovery report",
            url,
            markdown: `# Current\n\nCurrent value is 100 at 10:00 KST. ${Array.from(
              { length: 340 },
              (_, index) => `fact${index}`,
            ).join(" ")}`,
            truncated: false,
            sourceEvidence: {
              method: "direct_fetch",
              sourceKind: "first_party",
              reliability: "high",
              sourceUrl: url,
              sourceDomain: "example.com",
              sourceTimestamp: "2026-07-24T05:00:00.000Z",
              fetchTimestamp: "2026-07-24T05:01:00.000Z",
            },
          },
        },
      })
    let genericRound = 0
    const provider = {
      maxContextTokens: vi.fn(() => 8_000),
      chat: vi.fn(async function* (request: {
        observability?: { operationCode?: string }
        messages: Array<{ content: string }>
      }) {
        const operation = request.observability?.operationCode
        if (operation?.startsWith("web_")) {
          const envelope = JSON.parse(request.messages[0]!.content) as {
            input: Record<string, any>
          }
          yield {
            type: "text_delta",
            delta: JSON.stringify(buildDirectEvidenceReceipt(operation, envelope.input)),
          } as const
        } else if (genericRound++ === 0) {
          yield {
            type: "tool_use",
            id: "search-failed",
            name: "web_search",
            input: { query: "current report search" },
          } as const
        } else if (genericRound === 2) {
          yield {
            type: "tool_use",
            id: "fetch-recovery",
            name: "web_fetch",
            input: { url },
          } as const
        } else {
          yield { type: "text_delta", delta: "변경된 방법으로 현재 값 100을 확인했습니다." } as const
        }
        yield { type: "message_stop", usage: { input_tokens: 1, output_tokens: 1 } } as const
      }),
    }
    const chunks = []
    for await (const chunk of runAgent({
      config: DEFAULT_CONFIG,
      ...testAgentRuntime,
      userMessage: `현재 값을 확인해줘. 참고 URL: ${url}`,
      memorySearchQuery: `현재 값을 확인해줘. 참고 URL: ${url}`,
      completionConditions: ["current value"],
      requiredToolNames: ["web_search", "web_fetch"],
      admittedCapabilityExecutionScope: {
        schemaVersion: 1,
        runId: "run-web-recovery",
        ownerAgentId: "agent:main",
        receiptId: "receipt:selection:run-web-recovery",
        capabilitySnapshotFingerprint: `sha256:${"a".repeat(64)}`,
        selectedCapabilityId: "skill:web-research",
        toolNames: ["web_fetch", "web_search"],
      },
      agentId: "agent:main",
      sessionId: "session-web-recovery",
      runId: "run-web-recovery",
      model: "gpt-5",
      provider: provider as never,
      source: "telegram",
    })) {
      chunks.push(chunk)
    }

    expect(dispatchMock).toHaveBeenCalledTimes(2)
    expect(dispatchMock.mock.calls.map(([name]) => name)).toEqual([
      "web_search",
      "web_fetch",
    ])
    expect(JSON.stringify(chunks)).not.toMatch(/RAW SEARCH|RAW FETCH/u)
    expect(JSON.stringify(insertMessageMock.mock.calls)).not.toMatch(/RAW SEARCH|RAW FETCH/u)
    expect(chunks).toContainEqual({
      type: "text",
      delta: "변경된 방법으로 현재 값 100을 확인했습니다.",
      textSource: "llm_generated",
    })
  })

  it("allows only one discovery search even when the LLM changes the query", async () => {
    dispatchMock.mockClear()
    getAllMock.mockReturnValueOnce([
      {
        name: "web_search",
        description: "search web",
        parameters: { type: "object", properties: { query: { type: "string" } } },
      },
      {
        name: "web_fetch",
        description: "fetch web page",
        parameters: { type: "object", properties: { url: { type: "string" } } },
      },
    ])
    dispatchMock.mockResolvedValueOnce({
      success: false,
      output: "RAW PROVIDER FAILURE",
      error: "web_search_rate_limited",
      details: { reasonCode: "web_search_rate_limited" },
    })
    let round = 0
    const provider = {
      maxContextTokens: vi.fn(() => 8_000),
      chat: vi.fn(async function* () {
        if (round < 2) {
          yield {
            type: "tool_use",
            id: `same-search-${round}`,
            name: "web_search",
            input: { query: round === 0 ? "current query" : "rephrased current query" },
          } as const
        } else {
          yield { type: "text_delta", delta: "같은 실패 방법은 반복하지 않았습니다." } as const
        }
        round += 1
        yield { type: "message_stop", usage: { input_tokens: 1, output_tokens: 1 } } as const
      }),
    }
    const chunks = []
    for await (const chunk of runAgent({
      config: DEFAULT_CONFIG,
      ...testAgentRuntime,
      userMessage: "현재 값을 검색해줘",
      memorySearchQuery: "현재 값을 검색해줘",
      requiredToolNames: ["web_search", "web_fetch"],
      admittedCapabilityExecutionScope: {
        schemaVersion: 1,
        runId: "run-web-repeat",
        ownerAgentId: "agent:main",
        receiptId: "receipt:selection:run-web-repeat",
        capabilitySnapshotFingerprint: `sha256:${"a".repeat(64)}`,
        selectedCapabilityId: "skill:general-research",
        toolNames: ["web_fetch", "web_search"],
      },
      agentId: "agent:main",
      sessionId: "session-web-repeat",
      runId: "run-web-repeat",
      model: "gpt-5",
      provider: provider as never,
      source: "telegram",
    })) {
      chunks.push(chunk)
    }

    expect(dispatchMock).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(chunks)).not.toContain("RAW PROVIDER FAILURE")
    expect(chunks).toContainEqual(expect.objectContaining({
      type: "tool_end",
      toolName: "web_search",
      success: false,
      output: "",
      details: {
        kind: "web_evidence_pipeline_failure",
        reasonCode: "web_evidence_search_already_executed",
      },
    }))
    expect(chunks).toContainEqual({
      type: "execution_recovery",
      toolNames: ["web_search", "web_fetch"],
      summary: "웹 근거가 완료 조건을 충족하지 못해 변경된 방법 검토가 필요합니다.",
      reason: "web_search_rate_limited",
    })
  })

  it("preserves the discovery-search guard across execution passes in one workflow", async () => {
    dispatchMock.mockClear()
    getAllMock.mockReturnValue([
      {
        name: "web_search",
        description: "search web",
        parameters: { type: "object", properties: { query: { type: "string" } } },
      },
      {
        name: "web_fetch",
        description: "fetch web page",
        parameters: { type: "object", properties: { url: { type: "string" } } },
      },
    ])
    dispatchMock.mockResolvedValue({
      success: false,
      output: "RAW PROVIDER FAILURE",
      error: "web_search_rate_limited",
      details: { reasonCode: "web_search_rate_limited" },
    })
    const webExecutionState = {
      discovery: { status: "not_attempted" as const },
      validatedEvidence: { status: "none" as const },
      observedFetchCandidates: [],
      observedSearchResults: [],
    }

    for (let pass = 0; pass < 2; pass += 1) {
      let round = 0
      const provider = {
        maxContextTokens: vi.fn(() => 8_000),
        chat: vi.fn(async function* () {
          if (round === 0) {
            yield {
              type: "tool_use",
              id: `workflow-search-${pass}`,
              name: "web_search",
              input: { query: pass === 0 ? "current query" : "rephrased current query" },
            } as const
          } else {
            yield { type: "text_delta", delta: "검색 반복 없이 결과를 정리합니다." } as const
          }
          round += 1
          yield { type: "message_stop", usage: { input_tokens: 1, output_tokens: 1 } } as const
        }),
      }

      for await (const _chunk of runAgent({
        config: DEFAULT_CONFIG,
        ...testAgentRuntime,
        userMessage: "현재 값을 검색해줘",
        memorySearchQuery: "현재 값을 검색해줘",
        requiredToolNames: ["web_search", "web_fetch"],
        admittedCapabilityExecutionScope: {
          schemaVersion: 1,
          runId: "run-web-workflow",
          ownerAgentId: "agent:main",
          receiptId: "receipt:selection:run-web-workflow",
          capabilitySnapshotFingerprint: `sha256:${"a".repeat(64)}`,
          selectedCapabilityId: "skill:web-research",
          toolNames: ["web_fetch", "web_search"],
        },
        webExecutionState,
        agentId: "agent:main",
        sessionId: "session-web-workflow",
        runId: "run-web-workflow",
        model: "gpt-5",
        provider: provider as never,
        source: "webui",
      })) {
        // Consume both execution passes.
      }
    }

    expect(webExecutionState.discovery).toEqual({ status: "attempted" })
    expect(dispatchMock).toHaveBeenCalledTimes(1)
  })

  it("preserves completed web evidence for a response-only follow-up pass", async () => {
    dispatchMock.mockClear()
    getAllMock.mockReturnValueOnce([
      {
        name: "web_search",
        description: "search web",
        parameters: { type: "object", properties: { query: { type: "string" } } },
      },
      {
        name: "web_fetch",
        description: "fetch web page",
        parameters: { type: "object", properties: { url: { type: "string" } } },
      },
    ])
    const provider = {
      maxContextTokens: vi.fn(() => 8_000),
      chat: vi.fn(async function* () {
        yield { type: "text_delta", delta: "기존 검증 근거로 최종 답변합니다." } as const
        yield { type: "message_stop", usage: { input_tokens: 1, output_tokens: 1 } } as const
      }),
    }

    const chunks = []
    for await (const chunk of runAgent({
      config: DEFAULT_CONFIG,
      ...testAgentRuntime,
      userMessage: "기존 근거로 최종 답변해줘",
      memorySearchQuery: "현재 값을 검색해줘",
      requiredToolNames: [],
      admittedCapabilityExecutionScope: {
        schemaVersion: 1,
        runId: "run-web-response-only",
        ownerAgentId: "agent:main",
        receiptId: "receipt:selection:run-web-response-only",
        capabilitySnapshotFingerprint: `sha256:${"a".repeat(64)}`,
        selectedCapabilityId: "skill:web-research",
        toolNames: ["web_fetch", "web_search"],
      },
      webExecutionState: {
        discovery: { status: "attempted" },
        validatedEvidence: { status: "available" },
        observedFetchCandidates: [],
        observedSearchResults: [
          {
            sourceUrl: "https://example.com/current",
            evidenceRef: "search:current",
          },
        ],
      },
      agentId: "agent:main",
      sessionId: "session-web-response-only",
      runId: "run-web-response-only",
      model: "gpt-5",
      provider: provider as never,
      source: "webui",
    })) {
      chunks.push(chunk)
    }

    expect(provider.chat).toHaveBeenCalledOnce()
    expect(provider.chat.mock.calls[0]?.[0]).toMatchObject({ tools: [] })
    expect(dispatchMock).not.toHaveBeenCalled()
    expect(chunks).toContainEqual({
      type: "text",
      delta: "기존 검증 근거로 최종 답변합니다.",
      textSource: "llm_generated",
    })
  })

  it("allows an explicit changed fetch follow-up after earlier web evidence completed", async () => {
    dispatchMock.mockClear()
    getAllMock.mockReturnValueOnce([
      {
        name: "web_search",
        description: "search web",
        parameters: { type: "object", properties: { query: { type: "string" } } },
      },
      {
        name: "web_fetch",
        description: "fetch web page",
        parameters: { type: "object", properties: { url: { type: "string" } } },
      },
    ])
    const sourceUrl = "https://example.com/changed-source"
    dispatchMock.mockResolvedValueOnce({
      success: true,
      output: "RAW CHANGED SOURCE",
      details: {
        document: {
          evidenceRef: "document:changed-source",
          title: "Changed source",
          url: sourceUrl,
          markdown: "Current value is 100 at 10:00 KST.",
          truncated: false,
          sourceEvidence: {
            method: "direct_fetch",
            sourceKind: "first_party",
            reliability: "high",
            sourceUrl,
            sourceDomain: "example.com",
            sourceTimestamp: "2026-07-24T05:00:00.000Z",
            fetchTimestamp: "2026-07-24T05:01:00.000Z",
          },
        },
        linkObservations: [],
      },
    })
    let round = 0
    const provider = {
      maxContextTokens: vi.fn(() => 8_000),
      chat: vi.fn(async function* () {
        if (round++ === 0) {
          yield {
            type: "tool_use",
            id: "fetch-changed-source",
            name: "web_fetch",
            input: { url: sourceUrl },
          } as const
        } else {
          yield { type: "text_delta", delta: "변경된 출처로 답변을 보완했습니다." } as const
        }
        yield { type: "message_stop", usage: { input_tokens: 1, output_tokens: 1 } } as const
      }),
    }

    for await (const _chunk of runAgent({
      config: DEFAULT_CONFIG,
      ...testAgentRuntime,
      userMessage: "변경된 직접 출처를 확인해줘",
      memorySearchQuery: "현재 값을 검색해줘",
      requiredToolNames: ["web_fetch"],
      admittedCapabilityExecutionScope: {
        schemaVersion: 1,
        runId: "run-web-required-followup",
        ownerAgentId: "agent:main",
        receiptId: "receipt:selection:run-web-required-followup",
        capabilitySnapshotFingerprint: `sha256:${"a".repeat(64)}`,
        selectedCapabilityId: "skill:web-research",
        toolNames: ["web_fetch", "web_search"],
      },
      webExecutionState: {
        discovery: { status: "attempted" },
        validatedEvidence: { status: "available" },
        observedFetchCandidates: [],
        observedSearchResults: [{
          sourceUrl,
          evidenceRef: "search:changed-source",
        }],
        attemptedFetchUrls: ["https://example.com/previous-source"],
      },
      agentId: "agent:main",
      sessionId: "session-web-required-followup",
      runId: "run-web-required-followup",
      model: "gpt-5",
      provider: provider as never,
      source: "webui",
    })) {
      // Consume the stream.
    }

    expect(provider.chat.mock.calls[0]?.[0]).toMatchObject({
      toolChoice: "required",
      tools: [expect.objectContaining({
        name: "web_fetch",
        input_schema: expect.objectContaining({
          properties: expect.objectContaining({
            url: expect.objectContaining({ enum: [sourceUrl] }),
          }),
        }),
      })],
    })
    expect(dispatchMock.mock.calls.map(([name]) => name)).toEqual(["web_fetch"])
  })

  it("does not traverse a document link that was not admitted by search or user input", async () => {
    dispatchMock.mockClear()
    getAllMock.mockReturnValueOnce([
      {
        name: "web_search",
        description: "search web",
        parameters: { type: "object", properties: { query: { type: "string" } } },
      },
      {
        name: "web_fetch",
        description: "fetch web page",
        parameters: { type: "object", properties: { url: { type: "string" } } },
      },
    ])
    const rootUrl = "https://example.com/root"
    const detailUrl = "https://example.com/detail"
    const documentResult = (url: string, evidenceRef: string, links: unknown[]) => ({
      success: true,
      output: `RAW ${evidenceRef}`,
      details: {
        document: {
          evidenceRef,
          title: evidenceRef,
          url,
          markdown: `# Current\n\nCurrent value is 100 at 10:00 KST. ${Array.from(
            { length: 340 },
            (_, index) => `fact${index}`,
          ).join(" ")}`,
          truncated: false,
          sourceEvidence: {
            method: "direct_fetch",
            sourceKind: "first_party",
            reliability: "high",
            sourceUrl: url,
            sourceDomain: "example.com",
            sourceTimestamp: "2026-07-24T05:00:00.000Z",
            fetchTimestamp: "2026-07-24T05:01:00.000Z",
          },
        },
        linkObservations: links,
      },
    })
    dispatchMock
      .mockResolvedValueOnce(documentResult(rootUrl, "document:root", [
        { ordinal: 1, url: detailUrl },
      ]))
      .mockResolvedValueOnce(documentResult(detailUrl, "document:detail", []))
    let genericRound = 0
    let chunkSelectionRound = 0
    const genericRequests: Array<{ messages: Array<{ content: unknown }> }> = []
    const provider = {
      maxContextTokens: vi.fn(() => 8_000),
      chat: vi.fn(async function* (request: {
        observability?: { operationCode?: string }
        messages: Array<{ content: string }>
      }) {
        const operation = request.observability?.operationCode
        if (operation?.startsWith("web_")) {
          const envelope = JSON.parse(request.messages[0]!.content) as {
            input: Record<string, any>
          }
          const receipt =
            operation === "web_chunk_selection" && chunkSelectionRound++ === 0
              ? {}
              : buildDirectEvidenceReceipt(operation, envelope.input)
          yield { type: "text_delta", delta: JSON.stringify(receipt) } as const
        } else {
          genericRequests.push(request as never)
          if (genericRound++ === 0) {
            yield {
              type: "tool_use",
              id: "fetch-root",
              name: "web_fetch",
              input: { url: rootUrl },
            } as const
          } else if (genericRound === 2) {
            yield {
              type: "tool_use",
              id: "fetch-observed-detail",
              name: "web_fetch",
              input: { url: detailUrl },
            } as const
          } else {
            yield { type: "text_delta", delta: "연결 문서에서 현재 값 100을 확인했습니다." } as const
          }
        }
        yield { type: "message_stop", usage: { input_tokens: 1, output_tokens: 1 } } as const
      }),
    }
    const chunks = []
    const webExecutionState = {
      discovery: { status: "not_attempted" as const },
      validatedEvidence: { status: "none" as const },
      observedFetchCandidates: [],
      observedSearchResults: [],
    }
    for await (const chunk of runAgent({
      config: DEFAULT_CONFIG,
      ...testAgentRuntime,
      userMessage: `연결된 자료까지 확인해줘: ${rootUrl}`,
      memorySearchQuery: `연결된 자료까지 확인해줘: ${rootUrl}`,
      completionConditions: ["current value"],
      requiredToolNames: ["web_search", "web_fetch"],
      admittedCapabilityExecutionScope: {
        schemaVersion: 1,
        runId: "run-web-link",
        ownerAgentId: "agent:main",
        receiptId: "receipt:selection:run-web-link",
        capabilitySnapshotFingerprint: `sha256:${"a".repeat(64)}`,
        selectedCapabilityId: "skill:web-research",
        toolNames: ["web_fetch", "web_search"],
      },
      webExecutionState,
      agentId: "agent:main",
      sessionId: "session-web-link",
      runId: "run-web-link",
      model: "gpt-5",
      provider: provider as never,
      source: "telegram",
    })) {
      chunks.push(chunk)
    }

    expect(dispatchMock.mock.calls.map(([name, params]) => [name, params])).toEqual([
      ["web_fetch", { url: rootUrl, freshnessPolicy: "normal" }],
    ])
    expect(JSON.stringify(chunks)).not.toContain("internalObservedFetchCandidates")
    expect(webExecutionState.observedFetchCandidates).toEqual([])
    expect(chunks).toContainEqual(expect.objectContaining({
      type: "tool_end",
      toolName: "web_fetch",
      success: false,
      details: expect.objectContaining({
        reasonCode: "web_evidence_already_completed",
      }),
    }))
    expect(JSON.stringify(insertMessageMock.mock.calls)).not.toContain(
      "internalObservedFetchCandidates",
    )
    expect(JSON.stringify(
      insertMessageMock.mock.calls.filter(([message]) =>
        (message as { role?: string }).role === "user"),
    )).not.toContain(detailUrl)
    expect(JSON.stringify(chunks)).not.toMatch(/RAW document/u)
    expect(chunks).toContainEqual({
      type: "text",
      delta: "연결 문서에서 현재 값 100을 확인했습니다.",
      textSource: "llm_generated",
    })
  })

  it("answers Korean self-name questions through the model with identity context", async () => {
    const provider = {
      chat: vi.fn(async function* () {
        yield { type: "text_delta", delta: "제 이름은 노비입니다." } as const
        yield {
          type: "message_stop",
          usage: { input_tokens: 1, output_tokens: 1 },
        } as const
      }),
    }

    const chunks = []
    for await (const chunk of runAgent({
      config: DEFAULT_CONFIG,
      ...testAgentRuntime,
      userMessage: "니 이름이 뭐니?",
      sessionId: "session-agent-self-name-ko",
      runId: "run-agent-self-name-ko",
      model: "gpt-5",
      provider: provider as never,
      source: "telegram",
      toolsEnabled: false,
    })) {
      chunks.push(chunk)
    }

    expect(provider.chat).toHaveBeenCalledTimes(1)
    expect(provider.chat.mock.calls[0]?.[0].system).toContain("[Trusted Main Agent Identity]")
    expect(provider.chat.mock.calls[0]?.[0].system).toContain("Current main-agent self name:")
    expect(chunks).toHaveLength(2)
    expect(chunks[0]).toMatchObject({ type: "text" })
    expect(chunks[0]).toHaveProperty("delta", expect.stringMatching(/^제 이름은 .+입니다\.$/))
    expect(JSON.stringify(chunks)).not.toContain("Knowbee")
    expect(chunks.at(-1)).toEqual({ type: "done", totalTokens: 2 })
  })

  it("does not leak partial assistant text when the AI round fails", async () => {
    const provider = {
      chat: vi.fn(async function* () {
        yield { type: "text_delta", delta: "메인 화면을 지금 캡처해서 이 채팅에 바로 보여드릴게요." } as const
        throw new Error("403 forbidden")
      }),
    }

    const chunks = []
    for await (const chunk of runAgent({
      config: DEFAULT_CONFIG,
      ...testAgentRuntime,
      userMessage: "메인 전체 화면 캡처",
      sessionId: "session-agent-streaming-failure",
      runId: "run-agent-streaming-failure",
      model: "gpt-5",
      provider: provider as never,
      source: "telegram",
      toolsEnabled: false,
    })) {
      chunks.push(chunk)
    }

    expect(chunks.some((chunk) => chunk.type === "text")).toBe(false)
    expect(chunks).toEqual([{
      type: "ai_recovery",
      summary: "AI 응답 생성 중 오류가 발생해 다른 방법을 다시 시도합니다.",
      reason: "인증 또는 접근 차단 문제 때문에 모델 호출이 실패했습니다.",
      message: "인증 또는 접근 차단 문제로 요청이 실패했습니다.",
    }])
  })

  it("preserves a bounded provider contract reason for recovery policy", async () => {
    const provider = {
      chat: vi.fn(async function* () {
        throw new AIProviderInvocationError("provider_contract_rejected")
      }),
    }

    const chunks = []
    for await (const chunk of runAgent({
      config: DEFAULT_CONFIG,
      ...testAgentRuntime,
      userMessage: "카메라로 사진을 찍어줘",
      sessionId: "session-provider-contract-rejected",
      runId: "run-provider-contract-rejected",
      model: "gpt-5",
      provider: provider as never,
      source: "telegram",
      toolsEnabled: false,
    })) {
      chunks.push(chunk)
    }

    expect(chunks).toEqual([expect.objectContaining({
      type: "ai_recovery",
      providerFailureReasonCode: "provider_contract_rejected",
    })])
  })

  it("emits the buffered assistant text only after a successful non-tool round", async () => {
    insertMessageMock.mockClear()
    const provider = {
      chat: vi.fn(async function* () {
        yield { type: "text_delta", delta: "작업을 완료했습니다." } as const
        yield {
          type: "message_stop",
          usage: { input_tokens: 1, output_tokens: 1 },
        } as const
      }),
    }

    const chunks = []
    for await (const chunk of runAgent({
      config: DEFAULT_CONFIG,
      ...testAgentRuntime,
      userMessage: "상태 알려줘",
      sessionId: "session-agent-streaming-success",
      runId: "run-agent-streaming-success",
      model: "gpt-5",
      provider: provider as never,
      source: "telegram",
      toolsEnabled: false,
    })) {
      chunks.push(chunk)
    }

    expect(chunks).toEqual([
      { type: "text", delta: "작업을 완료했습니다.", textSource: "llm_generated" },
      { type: "done", totalTokens: 2 },
    ])
    expect(insertMessageMock.mock.calls.some(([message]) => {
      return (message as { role?: string }).role === "assistant"
    })).toBe(false)
    expect(provider.chat.mock.calls[0]?.[0].system).toContain("[Trusted Main Agent Identity]")
    expect(provider.chat.mock.calls[0]?.[0].system).toContain("Current main-agent self name:")
    expect(provider.chat.mock.calls[0]?.[0].system).not.toContain("You are Knowbee.")
  })

  it("stops after a successful isolated Yeonjang camera list tool round", async () => {
    getAllMock.mockReturnValueOnce([{
      name: "yeonjang_camera_list",
      description: "camera list",
      parameters: { type: "object", properties: {} },
    }])
    dispatchMock.mockResolvedValueOnce({
      success: true,
      output: "연장 \"yeonjang-main\" 카메라 2개:\n- FaceTime HD Camera\n- iPhone Camera",
      details: {
        via: "yeonjang",
        responseOwnership: "final_text",
      },
    })

    const provider = {
      chat: vi.fn(async function* () {
        yield {
          type: "tool_use",
          id: "tool-1",
          name: "yeonjang_camera_list",
          input: {},
        } as const
        yield {
          type: "message_stop",
          usage: { input_tokens: 1, output_tokens: 1 },
        } as const
      }),
    }

    const chunks = []
    for await (const chunk of runAgent({
      config: DEFAULT_CONFIG,
      ...testAgentRuntime,
      userMessage: "카메라 몇 개 있는지 알려줘",
      sessionId: "session-agent-camera-list",
      runId: "run-agent-camera-list",
      model: "gpt-5",
      provider: provider as never,
      source: "telegram",
      toolsEnabled: true,
    })) {
      chunks.push(chunk)
    }

    expect(provider.chat).toHaveBeenCalledTimes(1)
    expect(chunks).toEqual([
      { type: "tool_start", toolName: "yeonjang_camera_list", params: {} },
      {
        type: "tool_end",
        toolName: "yeonjang_camera_list",
        success: true,
        output: "연장 \"yeonjang-main\" 카메라 2개:\n- FaceTime HD Camera\n- iPhone Camera",
        details: { via: "yeonjang", responseOwnership: "final_text" },
      },
      { type: "done", totalTokens: 2 },
    ])
  })

  it("passes explicit sub-agent identity to memory context and tool context", async () => {
    getAllMock.mockReturnValueOnce([{
      name: "memory_store",
      description: "store memory",
      parameters: { type: "object", properties: {} },
    }])
    dispatchMock.mockResolvedValueOnce({
      success: true,
      output: "stored",
    })
    let callCount = 0
    const provider = {
      chat: vi.fn(async function* () {
        callCount += 1
        if (callCount === 1) {
          yield {
            type: "tool_use",
            id: "tool-sub-agent-memory",
            name: "memory_store",
            input: { content: "sub-agent note" },
          } as const
        } else {
          yield { type: "text_delta", delta: "stored ok" } as const
        }
        yield {
          type: "message_stop",
          usage: { input_tokens: 1, output_tokens: 1 },
        } as const
      }),
    }

    const chunks = []
    for await (const chunk of runAgent({
      config: DEFAULT_CONFIG,
      ...testAgentRuntime,
      userMessage: "기억해",
      sessionId: "session-sub-agent-memory",
      runId: "run-sub-agent-memory",
      model: "gpt-5",
      provider: provider as never,
      source: "webui",
      toolsEnabled: true,
      agentType: "sub_agent",
      agentId: "agent:researcher",
    })) {
      chunks.push(chunk)
    }

    expect(buildMemoryContextMock).toHaveBeenLastCalledWith(expect.objectContaining({
      ownerScope: { ownerType: "sub_agent", ownerId: "agent:researcher" },
      recipientScope: { ownerType: "sub_agent", ownerId: "agent:researcher" },
    }))
    expect(dispatchMock).toHaveBeenLastCalledWith(
      "memory_store",
      { content: "sub-agent note" },
      expect.objectContaining({
        agentType: "sub_agent",
        agentId: "agent:researcher",
      }),
    )
    expect(chunks).toEqual([
      { type: "tool_start", toolName: "memory_store", params: { content: "sub-agent note" } },
      { type: "tool_end", toolName: "memory_store", success: true, output: "stored" },
      { type: "text", delta: "stored ok", textSource: "llm_generated" },
      { type: "done", totalTokens: 4 },
    ])
  })

  it("stops after successful artifact delivery instead of asking the AI to send it again", async () => {
    getAllMock.mockReturnValueOnce([{
      name: "telegram_send_file",
      description: "send telegram file",
      parameters: { type: "object", properties: {} },
    }])
    dispatchMock.mockResolvedValueOnce({
      success: true,
      output: "텔레그램 파일 전송 요청을 생성했습니다.",
      details: {
        kind: "artifact_delivery",
        channel: "telegram",
        filePath: "/tmp/capture.jpg",
        size: 128,
        source: "telegram",
      },
    })

    const provider = {
      chat: vi.fn(async function* () {
        yield {
          type: "tool_use",
          id: "tool-3",
          name: "telegram_send_file",
          input: { filePath: "/tmp/capture.jpg" },
        } as const
        yield {
          type: "message_stop",
          usage: { input_tokens: 1, output_tokens: 1 },
        } as const
      }),
    }

    const chunks = []
    for await (const chunk of runAgent({
      config: DEFAULT_CONFIG,
      ...testAgentRuntime,
      userMessage: "사진을 텔레그램으로 보내줘",
      sessionId: "session-agent-telegram-file-success",
      runId: "run-agent-telegram-file-success",
      model: "gpt-5",
      provider: provider as never,
      source: "telegram",
      toolsEnabled: true,
    })) {
      chunks.push(chunk)
    }

    expect(provider.chat).toHaveBeenCalledTimes(1)
    expect(chunks).toEqual([
      {
        type: "tool_start",
        toolName: "telegram_send_file",
        params: { filePath: "/tmp/capture.jpg" },
      },
      {
        type: "tool_end",
        toolName: "telegram_send_file",
        success: true,
        output: "텔레그램 파일 전송 요청을 생성했습니다.",
        details: {
          kind: "artifact_delivery",
          channel: "telegram",
          filePath: "/tmp/capture.jpg",
          size: 128,
          source: "telegram",
        },
      },
      { type: "done", totalTokens: 2 },
    ])
  })

  it("stops after successful slack screen capture artifact delivery instead of continuing with extra tools", async () => {
    getAllMock.mockReturnValueOnce([{
      name: "screen_capture",
      description: "screen capture",
      parameters: { type: "object", properties: {} },
    }])
    dispatchMock.mockResolvedValueOnce({
      success: true,
      output: "Yeonjang 스크린샷 캡처 완료.",
      details: {
        kind: "artifact_delivery",
        channel: "slack",
        filePath: "/tmp/screen.png",
        size: 128,
        source: "slack",
      },
    })

    const provider = {
      chat: vi.fn(async function* () {
        yield {
          type: "tool_use",
          id: "tool-screen-slack-1",
          name: "screen_capture",
          input: { extensionId: "yeonjang-main" },
        } as const
        yield {
          type: "message_stop",
          usage: { input_tokens: 1, output_tokens: 1 },
        } as const
      }),
    }

    const chunks = []
    for await (const chunk of runAgent({
      config: DEFAULT_CONFIG,
      ...testAgentRuntime,
      userMessage: "메인 화면 캡쳐해서 보여줘",
      sessionId: "session-agent-slack-screen-success",
      runId: "run-agent-slack-screen-success",
      model: "gpt-5",
      provider: provider as never,
      source: "slack",
      toolsEnabled: true,
    })) {
      chunks.push(chunk)
    }

    expect(provider.chat).toHaveBeenCalledTimes(1)
    expect(chunks).toEqual([
      {
        type: "tool_start",
        toolName: "screen_capture",
        params: { extensionId: "yeonjang-main" },
      },
      {
        type: "tool_end",
        toolName: "screen_capture",
        success: true,
        output: "Yeonjang 스크린샷 캡처 완료.",
        details: {
          kind: "artifact_delivery",
          channel: "slack",
          filePath: "/tmp/screen.png",
          size: 128,
          source: "slack",
        },
      },
      { type: "done", totalTokens: 2 },
    ])
  })

  it("stops after a terminal screen capture failure instead of exploring keyboard or shell fallbacks", async () => {
    getAllMock.mockReturnValueOnce([{
      name: 'screen_capture',
      description: 'screen capture',
      parameters: { type: 'object', properties: {} },
    }])
    dispatchMock.mockResolvedValueOnce({
      success: false,
      output: 'Windows 연장의 `screen.capture` 내부 경로 처리 오류 때문에 화면 캡처가 실패했습니다.\n이 문제는 다른 도구 조합으로 우회하기보다 Windows Yeonjang을 최신 버전으로 다시 빌드하고 재시작해야 해결됩니다.\nWindows에서 `build-yeonjang-windows.bat`로 재빌드하고 `start-yeonjang-windows.bat --restart` 후 다시 시도해 주세요.',
      error: 'YEONJANG_SCREEN_CAPTURE_PATH_BUG',
      details: {
        via: 'yeonjang',
        stopAfterFailure: true,
        failureKind: 'path_bug',
        extensionId: 'yeonjang-windows',
      },
    })

    const provider = {
      chat: vi.fn(async function* () {
        yield {
          type: 'tool_use',
          id: 'tool-screen-1',
          name: 'screen_capture',
          input: { extensionId: 'yeonjang-windows' },
        } as const
        yield {
          type: 'message_stop',
          usage: { input_tokens: 1, output_tokens: 1 },
        } as const
      }),
    }

    const chunks = []
    for await (const chunk of runAgent({
      config: DEFAULT_CONFIG,
      ...testAgentRuntime,
      userMessage: '윈도우 메인화면 캡처해서 보여줘',
      sessionId: 'session-agent-screen-failure',
      runId: 'run-agent-screen-failure',
      model: 'gpt-5',
      provider: provider as never,
      source: 'telegram',
      toolsEnabled: true,
    })) {
      chunks.push(chunk)
    }

    expect(provider.chat).toHaveBeenCalledTimes(1)
    expect(chunks).toEqual([
      {
        type: 'tool_start',
        toolName: 'screen_capture',
        params: { extensionId: 'yeonjang-windows' },
      },
      {
        type: 'tool_end',
        toolName: 'screen_capture',
        success: false,
        output: 'Windows 연장의 `screen.capture` 내부 경로 처리 오류 때문에 화면 캡처가 실패했습니다.\n이 문제는 다른 도구 조합으로 우회하기보다 Windows Yeonjang을 최신 버전으로 다시 빌드하고 재시작해야 해결됩니다.\nWindows에서 `build-yeonjang-windows.bat`로 재빌드하고 `start-yeonjang-windows.bat --restart` 후 다시 시도해 주세요.',
        details: {
          via: 'yeonjang',
          stopAfterFailure: true,
          failureKind: 'path_bug',
          extensionId: 'yeonjang-windows',
        },
      },
      {
        type: 'text',
        delta: 'Windows 연장의 `screen.capture` 내부 경로 처리 오류 때문에 화면 캡처가 실패했습니다.\n이 문제는 다른 도구 조합으로 우회하기보다 Windows Yeonjang을 최신 버전으로 다시 빌드하고 재시작해야 해결됩니다.\nWindows에서 `build-yeonjang-windows.bat`로 재빌드하고 `start-yeonjang-windows.bat --restart` 후 다시 시도해 주세요.',
        textSource: 'runtime_deterministic',
        notice: {
          kind: 'agent_terminal_failure',
          toolName: 'screen_capture',
          failureTrust: 'trusted_deterministic',
          reason: 'path_bug',
          deliveryMode: 'diagnostic',
          textSource: 'agent_terminal_failure_notice',
          renderingRequired: 'llm_final_response',
          finalAnswer: false,
          assistantIdentityClaim: false,
        },
      },
      { type: 'done', totalTokens: 2 },
    ])
  })

  it("stops after telegram file send fails in the telegram channel instead of asking the AI again", async () => {
    getAllMock.mockReturnValueOnce([{
      name: "telegram_send_file",
      description: "send telegram file",
      parameters: { type: "object", properties: {} },
    }])
    dispatchMock.mockResolvedValueOnce({
      success: false,
      output: "단순 확인/요약/상태 결과는 파일 첨부가 아니라 일반 메시지로 전달해야 합니다.",
      error: "DOCUMENT_ATTACHMENT_NOT_REQUESTED",
    })

    const provider = {
      chat: vi.fn(async function* () {
        yield {
          type: "tool_use",
          id: "tool-2",
          name: "telegram_send_file",
          input: { filePath: "/tmp/result.txt" },
        } as const
        yield {
          type: "message_stop",
          usage: { input_tokens: 1, output_tokens: 1 },
        } as const
      }),
    }

    const chunks = []
    for await (const chunk of runAgent({
      config: DEFAULT_CONFIG,
      ...testAgentRuntime,
      userMessage: "카메라 목록을 텔레그램으로 전달해줘",
      sessionId: "session-agent-telegram-file-failure",
      runId: "run-agent-telegram-file-failure",
      model: "gpt-5",
      provider: provider as never,
      source: "telegram",
      toolsEnabled: true,
    })) {
      chunks.push(chunk)
    }

    expect(provider.chat).toHaveBeenCalledTimes(1)
    expect(chunks).toEqual([
      {
        type: "tool_start",
        toolName: "telegram_send_file",
        params: { filePath: "/tmp/result.txt" },
      },
      {
        type: "tool_end",
        toolName: "telegram_send_file",
        success: false,
        output: "단순 확인/요약/상태 결과는 파일 첨부가 아니라 일반 메시지로 전달해야 합니다.",
      },
      { type: "done", totalTokens: 2 },
    ])
  })

  it("does not emit execution recovery for unsupported continuity camera facing requests", async () => {
    getAllMock.mockReturnValueOnce([{
      name: "yeonjang_camera_capture",
      description: "camera capture",
      parameters: { type: "object", properties: {} },
    }])
    dispatchMock.mockResolvedValueOnce({
      success: false,
      output: [
        "선택한 카메라 \"SamJokO's iPhone-17 Pro Max\" 에서는 전면 카메라를 Knowbee/Yeonjang에서 강제로 선택할 수 없습니다.",
        "iPhone 연속성 카메라는 현재 렌즈(전면/후면) 전환 제어를 노출하지 않습니다.",
      ].join("\n"),
      error: "CAMERA_FACING_SELECTION_UNSUPPORTED",
    })

    const provider = {
      chat: vi.fn()
        .mockImplementationOnce(async function* () {
          yield {
            type: "tool_use",
            id: "tool-unsupported-facing",
            name: "yeonjang_camera_capture",
            input: { deviceId: "iphone-camera" },
          } as const
          yield {
            type: "message_stop",
            usage: { input_tokens: 1, output_tokens: 1 },
          } as const
        })
        .mockImplementationOnce(async function* () {
          yield {
            type: "message_stop",
            usage: { input_tokens: 1, output_tokens: 1 },
          } as const
        }),
    }

    const chunks = []
    for await (const chunk of runAgent({
      config: DEFAULT_CONFIG,
      ...testAgentRuntime,
      userMessage: "아이폰 전면 카메라로 한 장 찍어줘",
      sessionId: "session-agent-unsupported-facing",
      runId: "run-agent-unsupported-facing",
      model: "gpt-5",
      provider: provider as never,
      source: "telegram",
      toolsEnabled: true,
    })) {
      chunks.push(chunk)
    }

    expect(chunks).toEqual([
      {
        type: "tool_start",
        toolName: "yeonjang_camera_capture",
        params: { deviceId: "iphone-camera" },
      },
      {
        type: "tool_end",
        toolName: "yeonjang_camera_capture",
        success: false,
        output: [
          "선택한 카메라 \"SamJokO's iPhone-17 Pro Max\" 에서는 전면 카메라를 Knowbee/Yeonjang에서 강제로 선택할 수 없습니다.",
          "iPhone 연속성 카메라는 현재 렌즈(전면/후면) 전환 제어를 노출하지 않습니다.",
        ].join("\n"),
      },
      { type: "done", totalTokens: 4 },
    ])
  })

  it("returns one typed recovery event for a run-scoped pre-dispatch failure", async () => {
    getAllMock.mockReturnValue([{
      name: "yeonjang_camera_capture",
      description: "camera capture",
      parameters: {
        type: "object",
        properties: { extensionId: { type: "string" } },
      },
    }])
    let round = 0
    const provider = {
      chat: vi.fn(async function* () {
        if (round < 2) {
          yield {
            type: "tool_use",
            id: `tool-scope-failure-${round}`,
            name: "yeonjang_camera_capture",
            input: round === 0
              ? { extensionId: "model-target-one" }
              : { extensionId: "model-target-two", outputPath: "/changed/path" },
          } as const
        } else {
          yield { type: "text_delta", delta: "scope failure ignored" } as const
        }
        round += 1
        yield {
          type: "message_stop",
          usage: { input_tokens: 1, output_tokens: 1 },
        } as const
      }),
    }

    const chunks = []
    for await (const chunk of runAgent({
      config: DEFAULT_CONFIG,
      ...testAgentRuntime,
      userMessage: "카메라로 사진 찍어줘",
      sessionId: "session-agent-scope-failure",
      runId: "run-agent-scope-failure",
      agentId: "agent:main",
      model: "gpt-5",
      provider: provider as never,
      source: "telegram",
      toolsEnabled: true,
      admittedCapabilityExecutionScope: {
        schemaVersion: 1,
        kind: "tool_bundle_skill",
        runId: "run-agent-scope-failure",
        ownerAgentId: "agent:main",
        receiptId: "receipt:scope-failure",
        capabilitySnapshotFingerprint: `sha256:${"a".repeat(64)}`,
        selectedCapabilityId: "yeonjang_camera_capture",
        selectedTargetIds: ["yeonjang-main", "yeonjang-backup"],
        toolNames: ["yeonjang_camera_capture"],
      },
    })) {
      chunks.push(chunk)
    }

    expect(provider.chat).toHaveBeenCalledTimes(1)
    expect(dispatchMock).not.toHaveBeenCalled()
    expect(chunks.filter((chunk) => chunk.type === "execution_recovery")).toEqual([
      {
        type: "execution_recovery",
        toolNames: ["yeonjang_camera_capture"],
        summary: "실행 범위 계약을 다시 계획해야 합니다.",
        reason: "External effect did not start because execution scope validation failed.",
        reasonCode: "run_scoped_target_ambiguous",
        evidenceRefs: [
          expect.stringMatching(
            /^run-scoped-pre-dispatch:sha256:[a-f0-9]{64}$/u,
          ),
        ],
      },
    ])
    expect(JSON.stringify(
      chunks.filter((chunk) => chunk.type !== "tool_start"),
    )).not.toMatch(
      /model-target|changed\/path|yeonjang-backup/u,
    )
  })

  it("uses run-local messages and scoped memory when context mode is handoff", async () => {
    const provider = {
      chat: vi.fn(async function* () {
        yield { type: "text_delta", delta: "handoff ok" } as const
        yield {
          type: "message_stop",
          usage: { input_tokens: 1, output_tokens: 1 },
        } as const
      }),
    }

    const chunks = []
    for await (const chunk of runAgent({
      config: DEFAULT_CONFIG,
      ...testAgentRuntime,
      userMessage: "후속 작업 진행",
      sessionId: "session-handoff",
      requestGroupId: "group-handoff",
      runId: "run-handoff",
      model: "gpt-5",
      provider: provider as never,
      source: "webui",
      toolsEnabled: false,
      contextMode: "handoff",
    })) {
      chunks.push(chunk)
    }

    expect(getMessagesForRunMock).toHaveBeenCalledWith("session-handoff", "run-handoff")
    expect(buildMemoryContextMock).toHaveBeenCalledWith(expect.objectContaining({
      query: "후속 작업 진행",
      sessionId: "session-handoff",
      requestGroupId: "group-handoff",
      runId: "run-handoff",
      ownerScope: { ownerType: "knowbee", ownerId: "agent:knowbee" },
      recipientScope: { ownerType: "knowbee", ownerId: "agent:knowbee" },
      budget: expect.objectContaining({ maxChunks: 3 }),
    }))
    expect(chunks).toEqual([
      { type: "text", delta: "handoff ok", textSource: "llm_generated" },
      { type: "done", totalTokens: 2 },
    ])
  })

  it("applies a selected instruction Skill only to its admitted run", async () => {
    const systems: string[] = []
    const provider = {
      chat: vi.fn(async function* (request: { system?: string }) {
        systems.push(request.system ?? "")
        yield { type: "text_delta", delta: "done" } as const
        yield {
          type: "message_stop",
          usage: { input_tokens: 1, output_tokens: 1 },
        } as const
      }),
    }

    for await (const _chunk of runAgent({
      config: DEFAULT_CONFIG,
      ...testAgentRuntime,
      userMessage: "Review this interface",
      sessionId: "session-instruction-scope",
      runId: "run-instruction-scope",
      agentId: "agent:main",
      model: "gpt-5",
      provider: provider as never,
      source: "webui",
      toolsEnabled: false,
      admittedCapabilityExecutionScope: {
        schemaVersion: 1,
        kind: "instruction_skill",
        runId: "run-instruction-scope",
        ownerAgentId: "agent:main",
        receiptId: "receipt:instruction-scope",
        capabilitySnapshotFingerprint: `sha256:${"d".repeat(64)}`,
        selectedCapabilityId: "skill:ui-guidance",
        toolNames: [],
        instruction: {
          content: "Review controls for clarity.",
          checksum: `sha256:${"e".repeat(64)}`,
        },
      },
    })) {
      // Consume the stream.
    }

    for await (const _chunk of runAgent({
      config: DEFAULT_CONFIG,
      ...testAgentRuntime,
      userMessage: "Answer normally",
      sessionId: "session-without-instruction",
      runId: "run-without-instruction",
      agentId: "agent:main",
      model: "gpt-5",
      provider: provider as never,
      source: "webui",
      toolsEnabled: false,
    })) {
      // Consume the stream.
    }

    expect(systems[0]).toContain("Review controls for clarity.")
    expect(systems[1]).not.toContain("Review controls for clarity.")
  })

  it("repairs a multi-tool model turn before dispatching any external action", async () => {
    dispatchMock.mockClear()
    getAllMock.mockReturnValueOnce([
      {
        name: "memory_store",
        description: "store memory",
        parameters: { type: "object", properties: { content: { type: "string" } } },
      },
      {
        name: "screen_capture",
        description: "capture screen",
        parameters: { type: "object", properties: {} },
      },
    ])
    let round = 0
    const provider = {
      maxContextTokens: vi.fn(() => 8_000),
      chat: vi.fn(async function* () {
        if (round === 0) {
          yield {
            type: "tool_use",
            id: "multi-tool:memory",
            name: "memory_store",
            input: { content: "private" },
          } as const
          yield {
            type: "tool_use",
            id: "multi-tool:screen",
            name: "screen_capture",
            input: {},
          } as const
        } else {
          yield {
            type: "text_delta",
            delta: "한 번에 하나의 다음 행동으로 다시 판단했습니다.",
          } as const
        }
        round += 1
        yield {
          type: "message_stop",
          usage: { input_tokens: 1, output_tokens: 1 },
        } as const
      }),
    }

    const chunks = []
    for await (const chunk of runAgent({
      config: DEFAULT_CONFIG,
      ...testAgentRuntime,
      userMessage: "안전하게 다음 행동을 선택해줘",
      sessionId: "session-multi-tool-repair",
      runId: "run-multi-tool-repair",
      agentId: "agent:main",
      model: "gpt-5",
      provider: provider as never,
      source: "webui",
    })) {
      chunks.push(chunk)
    }

    expect(dispatchMock).not.toHaveBeenCalled()
    expect(provider.chat).toHaveBeenCalledTimes(2)
    expect(chunks).toContainEqual({
      type: "text",
      delta: "한 번에 하나의 다음 행동으로 다시 판단했습니다.",
      textSource: "llm_generated",
    })
    expect(JSON.stringify(provider.chat.mock.calls[1]?.[0])).toContain(
      "canonical_next_action_multiple_tools",
    )
  })
})
