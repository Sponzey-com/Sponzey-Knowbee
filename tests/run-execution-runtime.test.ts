import { describe, expect, it, vi } from "vitest"
import { createExecutionChunkStream } from "../packages/core/src/runs/execution-runtime.ts"

describe("execution runtime helper", () => {
  it("always routes execution through the configured AI agent runtime", async () => {
    const runAgent = vi.fn(async function* () {
      yield { type: "text", delta: "agent" } as const
    })

    const stream = createExecutionChunkStream({
      userMessage: "do work",
      memorySearchQuery: "original request",
      sessionId: "session-1",
      runId: "run-1",
      workDir: process.cwd(),
      source: "cli",
      signal: new AbortController().signal,
      isRootRequest: true,
      requestGroupId: "group-1",
      contextMode: "full",
    }, {
      runAgent,
    })

    const chunks = []
    for await (const chunk of stream) {
      chunks.push(chunk)
    }

    expect(runAgent).toHaveBeenCalledOnce()
    expect(runAgent.mock.calls[0]?.[0].userMessage).toBe("do work")
    expect(chunks).toEqual([{ type: "text", delta: "agent" }])
  })

  it("routes normal execution through runAgent and preserves request group for followups", async () => {
    const runAgent = vi.fn(async function* () {
      yield { type: "text", delta: "agent" } as const
    })

    const stream = createExecutionChunkStream({
      userMessage: "follow up",
      memorySearchQuery: "original request",
      sessionId: "session-2",
      runId: "run-2",
      workDir: process.cwd(),
      source: "webui",
      signal: new AbortController().signal,
      toolsEnabled: true,
      isRootRequest: false,
      requestGroupId: "group-2",
      contextMode: "summary",
    }, {
      runAgent,
    })

    const chunks = []
    for await (const chunk of stream) {
      chunks.push(chunk)
    }

    expect(runAgent).toHaveBeenCalledOnce()
    expect(runAgent.mock.calls[0]?.[0].requestGroupId).toBe("group-2")
    expect(runAgent.mock.calls[0]?.[0].memorySearchQuery).toBe("original request")
    expect(chunks).toEqual([{ type: "text", delta: "agent" }])
  })

  it("passes explicit agent identity into runAgent params", async () => {
    const runAgent = vi.fn(async function* () {
      yield { type: "text", delta: "agent" } as const
    })

    const stream = createExecutionChunkStream({
      userMessage: "sub task",
      memorySearchQuery: "sub request",
      sessionId: "session-3",
      runId: "run-3",
      workDir: process.cwd(),
      source: "webui",
      agentType: "sub_agent",
      agentId: "agent:researcher",
      signal: new AbortController().signal,
      toolsEnabled: true,
      isRootRequest: false,
      requestGroupId: "group-3",
      contextMode: "handoff",
    }, {
      runAgent,
    })

    const chunks = []
    for await (const chunk of stream) {
      chunks.push(chunk)
    }

    expect(runAgent).toHaveBeenCalledOnce()
    expect(runAgent.mock.calls[0]?.[0]).toMatchObject({
      agentType: "sub_agent",
      agentId: "agent:researcher",
      requestGroupId: "group-3",
    })
    expect(chunks).toEqual([{ type: "text", delta: "agent" }])
  })

  it("passes the immutable run-scoped Tool admission into runAgent", async () => {
    const runAgent = vi.fn(async function* () {
      yield { type: "text", delta: "agent" } as const
    })
    const admittedCapabilityExecutionScope = {
      schemaVersion: 1 as const,
      runId: "run-4",
      ownerAgentId: "agent:main",
      receiptId: "receipt:selection:run-4",
      capabilitySnapshotFingerprint: `sha256:${"a".repeat(64)}` as const,
      selectedCapabilityId: "skill:web-research",
      toolNames: ["web_fetch", "web_search"],
    }
    const webExecutionState = {
      discovery: { status: "not_attempted" as const },
      validatedEvidence: { status: "none" as const },
      observedFetchCandidates: [],
      observedSearchResults: [],
    }

    const stream = createExecutionChunkStream({
      userMessage: "research",
      requiredToolNames: ["web_search"],
      completionConditions: ["current price", "quote time"],
      admittedCapabilityExecutionScope,
      webExecutionState,
      memorySearchQuery: "research",
      sessionId: "session-4",
      runId: "run-4",
      workDir: process.cwd(),
      source: "webui",
      signal: new AbortController().signal,
      isRootRequest: true,
      requestGroupId: "group-4",
      contextMode: "full",
    } as never, { runAgent })

    for await (const _chunk of stream) {
      // Consume the stream.
    }

    expect(runAgent.mock.calls[0]?.[0].admittedCapabilityExecutionScope).toBe(
      admittedCapabilityExecutionScope,
    )
    expect(runAgent.mock.calls[0]?.[0].webExecutionState).toBe(webExecutionState)
    expect(runAgent.mock.calls[0]?.[0].completionConditions).toEqual([
      "current price",
      "quote time",
    ])
  })
})
