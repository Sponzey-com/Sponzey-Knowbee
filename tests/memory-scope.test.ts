import { describe, expect, it, vi, beforeEach } from "vitest"

const storeOwnerScopedMemoryMock = vi.fn(async () => ({
  documentId: "document-id-1",
  chunkIds: ["chunk-id-1"],
  deduplicated: false,
}))
const searchOwnerScopedMemoryMock = vi.fn(async () => ({
  accessMode: "owner_direct",
  memoryResults: [],
  exchangeRefs: [],
}))

vi.mock("../packages/core/src/memory/isolation.js", () => ({
  storeOwnerScopedMemory: (...args: unknown[]) => storeOwnerScopedMemoryMock(...args),
  searchOwnerScopedMemory: (...args: unknown[]) => searchOwnerScopedMemoryMock(...args),
}))

const { memoryStoreTool, memorySearchTool } = await import("../packages/core/src/tools/builtin/memory.ts")

describe("memory tool scope", () => {
  beforeEach(() => {
    storeOwnerScopedMemoryMock.mockClear()
    searchOwnerScopedMemoryMock.mockClear()
  })

  it("stores main-agent long-term memories in the Knowbee owner scope", async () => {
    await memoryStoreTool.execute({
      content: "사용자는 한글 답변을 선호함",
    }, {
      sessionId: "session-1",
      runId: "run-1",
      requestGroupId: "group-1",
      workDir: "/tmp",
      userMessage: "이걸 기억해줘",
      source: "webui",
      allowWebAccess: false,
      onProgress: () => {},
      signal: new AbortController().signal,
      memoryConfig: { sessionRetentionDays: 30, longTermRetentionDays: 365 },
    })

    expect(storeOwnerScopedMemoryMock).toHaveBeenCalledWith(expect.objectContaining({
      owner: { ownerType: "knowbee", ownerId: "agent:knowbee" },
      rawText: "사용자는 한글 답변을 선호함",
      retentionPolicy: "long_term",
      visibility: "private",
      sourceType: "user_fact",
      metadata: expect.objectContaining({
        productMemoryPolicyDecision: "long_term_allowed",
        productMemoryPolicyReasonCode: "explicit_user_save_request",
      }),
    }))
  })

  it("stores sub-agent long-term memories in the sub-agent owner scope", async () => {
    await memoryStoreTool.execute({
      content: "리서처는 출처를 먼저 확인한다",
      tags: ["agent"],
      importance: "high",
    }, {
      sessionId: "session-1",
      runId: "run-1",
      requestGroupId: "group-1",
      workDir: "/tmp",
      userMessage: "이걸 기억해줘",
      source: "webui",
      allowWebAccess: false,
      onProgress: () => {},
      signal: new AbortController().signal,
      agentType: "sub_agent",
      agentId: "agent:researcher",
      memoryConfig: { sessionRetentionDays: 30, longTermRetentionDays: 365 },
    })

    expect(storeOwnerScopedMemoryMock).toHaveBeenCalledWith(expect.objectContaining({
      owner: { ownerType: "sub_agent", ownerId: "agent:researcher" },
      rawText: "리서처는 출처를 먼저 확인한다",
      retentionPolicy: "long_term",
      visibility: "private",
      sourceType: "user_fact",
      metadata: expect.objectContaining({
        tags: ["agent"],
        importance: "high",
        productMemoryPolicyDecision: "long_term_allowed",
        productMemoryPolicyReasonCode: "explicit_user_save_request",
      }),
    }))
  })

  it("does not call long-term storage when runtime retention is not configured", async () => {
    const result = await memoryStoreTool.execute({
      content: "설정 없는 장기 저장 요청",
    }, {
      sessionId: "session-no-retention",
      runId: "run-no-retention",
      workDir: "/tmp",
      userMessage: "이걸 기억해줘",
      source: "webui",
      allowWebAccess: false,
      onProgress: () => {},
      signal: new AbortController().signal,
      memoryConfig: { sessionRetentionDays: 30 },
    })

    expect(result).toMatchObject({
      success: false,
      error: "LONG_TERM_MEMORY_RETENTION_NOT_CONFIGURED",
      details: { reasonCode: "runtime_long_term_retention_missing" },
    })
    expect(storeOwnerScopedMemoryMock).not.toHaveBeenCalled()
  })

  it("searches visible memories using the current agent owner scope", async () => {
    searchOwnerScopedMemoryMock.mockResolvedValueOnce({
      accessMode: "owner_direct",
      memoryResults: [],
      exchangeRefs: [],
    })

    await memorySearchTool.execute({
      query: "최근 실패 원인",
      limit: 3,
    }, {
      sessionId: "session-2",
      runId: "run-2",
      requestGroupId: "group-2",
      workDir: "/tmp",
      userMessage: "최근 실패 원인 찾아줘",
      source: "cli",
      allowWebAccess: false,
      onProgress: () => {},
      signal: new AbortController().signal,
    })

    expect(searchOwnerScopedMemoryMock).toHaveBeenCalledWith({
      requester: { ownerType: "knowbee", ownerId: "agent:knowbee" },
      owner: { ownerType: "knowbee", ownerId: "agent:knowbee" },
      query: "최근 실패 원인",
      limit: 3,
      filters: {
        sessionId: "session-2",
        runId: "run-2",
        requestGroupId: "group-2",
      },
    })
  })
})
