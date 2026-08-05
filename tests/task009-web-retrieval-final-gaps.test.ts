import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { DEFAULT_CONFIG } from "../packages/core/src/config/types.ts"
import {
  createWebRetrievalMachine,
  transitionWebRetrieval,
} from "../packages/core/src/runs/web-retrieval-state-machine.ts"
import { ToolDispatcher } from "../packages/core/src/tools/dispatcher.ts"

describe("task009 final web retrieval gaps", () => {
  it("routes failures through rediagnosis and rejects duplicate strategies", () => {
    let machine = createWebRetrievalMachine()
    for (const event of [
      { type: "search_planned", attemptFingerprint: "query:a" },
      { type: "search_started" },
      { type: "search_failed", reasonCode: "web_search_no_results" },
    ] as const) {
      const result = transitionWebRetrieval(machine, event)
      expect(result.ok).toBe(true)
      if (result.ok) machine = result.value
    }
    expect(machine.state).toBe("REDIAGNOSING")
    expect(transitionWebRetrieval(machine, {
      type: "search_planned",
      attemptFingerprint: "query:a",
    })).toEqual({ ok: false, reasonCode: "web_retrieval_attempt_duplicate" })
    const changed = transitionWebRetrieval(machine, {
      type: "search_planned",
      attemptFingerprint: "query:b",
    })
    expect(changed.ok && changed.value.state).toBe("SEARCH_PLANNED")
  })

  it("keeps terminal states terminal", () => {
    const cancelled = transitionWebRetrieval(createWebRetrievalMachine(), {
      type: "cancelled",
    })
    expect(cancelled.ok).toBe(true)
    if (!cancelled.ok) return
    expect(transitionWebRetrieval(cancelled.value, {
      type: "search_planned",
      attemptFingerprint: "query:a",
    })).toEqual({ ok: false, reasonCode: "web_retrieval_terminal_state" })
  })

  it("allows multiple admitted document fetches before verification", () => {
    let machine = createWebRetrievalMachine()
    for (const event of [
      { type: "search_planned", attemptFingerprint: "query:a" },
      { type: "search_started" },
      { type: "search_succeeded" },
      { type: "fetch_planned", attemptFingerprint: "fetch:a" },
      { type: "fetch_started" },
      { type: "fetch_succeeded" },
      { type: "fetch_planned", attemptFingerprint: "fetch:b" },
      { type: "fetch_started" },
      { type: "fetch_succeeded" },
      { type: "verification_started" },
      { type: "verification_completed" },
    ] as const) {
      const result = transitionWebRetrieval(machine, event)
      expect(result).toEqual(expect.objectContaining({ ok: true }))
      if (result.ok) machine = result.value
    }
    expect(machine.state).toBe("COMPLETED")
  })

  it("keeps purpose logs explicit and raw inputs out of log calls", () => {
    const source = [
      readFileSync("packages/core/src/tools/builtin/web-search.ts", "utf8"),
      readFileSync("packages/core/src/tools/builtin/web-fetch.ts", "utf8"),
    ].join("\n")
    expect(source).toContain(".product(")
    expect(source).toContain(".fieldDebug(")
    expect(source).toContain(".development(")
    expect(source).not.toMatch(/log\.(?:product|fieldDebug|development)\([^)]*params\.(?:query|url)/su)
  })

  it("rejects agent-scoped web execution without an explicit binding", async () => {
    const dispatcher = new ToolDispatcher({ config: DEFAULT_CONFIG })
    const result = await dispatcher.dispatchAgentScoped({
      toolName: "web_search",
      params: { query: "Knowbee" },
      capabilityBindingId: "",
      resultSharing: "summary",
      ctx: {
        agentId: "sub-agent-1",
        auditId: "audit-1",
        sessionId: "session-1",
        runId: "run-1",
        workDir: process.cwd(),
        userMessage: "search",
        source: "webui",
        allowWebAccess: true,
        onProgress: () => undefined,
        signal: new AbortController().signal,
      },
    })
    expect(result).toMatchObject({
      success: false,
      error: "capability_binding_id_required",
    })
  })
})
