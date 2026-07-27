import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { DEFAULT_CONFIG } from "../packages/core/src/config/types.ts"
import { closeDb, insertSession, listAuditLogsForRun } from "../packages/core/src/db/index.js"
import { produceWebLiveAcceptanceEvidence } from "../packages/core/src/release/web-live-acceptance-evidence.ts"
import { createRootRun } from "../packages/core/src/runs/store.ts"
import {
  type WebRetrievalLiveCandidate,
  WebRetrievalLiveRunnerError,
  runWebRetrievalLiveScenario,
} from "../packages/core/src/runs/web-retrieval-live-runner.ts"
import type { WebRetrievalLiveSmokeScenario } from "../packages/core/src/runs/web-retrieval-smoke.ts"
import { createWebRetrievalToolDispatchAdapter } from "../packages/core/src/runs/web-retrieval-tool-dispatch-adapter.ts"
import { ToolDispatcher } from "../packages/core/src/tools/dispatcher.ts"
import type { ToolContext } from "../packages/core/src/tools/types.ts"
import { createTestAgentRuntimeDependencies } from "./fixtures/agent-runtime.ts"
import { initializeTestDbRuntime } from "./fixtures/runtime-db.ts"

const NOW = Date.parse("2026-07-17T19:00:00.000Z")
const RUN_ID = "web-live-run:166"
const tempDirs: string[] = []

const scenario: WebRetrievalLiveSmokeScenario = {
  id: "current-fact",
  title: "Current fact evidence",
  request: "현재 값을 확인해줘",
  target: { rawQuery: "current fact target" },
  freshnessPolicy: "strict_timestamp",
  minimumMethods: ["fast_text_search", "direct_fetch"],
  completionConditions: ["value, target, source and basis time are verified"],
}

function candidate(): WebRetrievalLiveCandidate {
  return {
    evidenceRef: `tool-result:web-search:${"a".repeat(64)}`,
    sourceUrl: "https://quote.example/current?id=private-query",
    sourceDomain: "quote.example",
    sourceTimestamp: "2026-07-17T18:59:00.000Z",
    fetchedAt: "2026-07-17T18:59:05.000Z",
  }
}

function plan(current = candidate()) {
  return {
    diagnosedBy: "llm" as const,
    status: "selected" as const,
    contextFingerprint: `sha256:${"b".repeat(64)}` as const,
    selectedEvidenceRef: current.evidenceRef,
    selectedSourceUrl: current.sourceUrl,
    requestedTargetFingerprint: `sha256:${"c".repeat(64)}` as const,
  }
}

function diagnosis(evidenceRef: string) {
  return {
    diagnosedBy: "llm" as const,
    status: "complete" as const,
    contextFingerprint: `sha256:${"d".repeat(64)}` as const,
    criterionKeys: ["existence", "accuracy", "freshness", "target_match"],
    conditionCount: 1,
    evidenceRefs: [evidenceRef],
    targetBinding: {
      status: "verified" as const,
      requestedTargetFingerprint: `sha256:${"c".repeat(64)}` as const,
      evidenceTargetFingerprint: `sha256:${"c".repeat(64)}` as const,
    },
  }
}

describe("Task 166 Web retrieval live runner", () => {
  it("runs search, LLM selection, direct fetch and LLM result diagnosis in order", async () => {
    const calls: string[] = []
    const current = candidate()
    const trace = await runWebRetrievalLiveScenario({
      runId: RUN_ID,
      scenario,
      search: async () => {
        calls.push("search")
        return {
          candidates: [current],
          auditEventId: "audit:web-search:166",
          diagnosisPayload: { output: "private search output" },
        }
      },
      plan: async () => {
        calls.push("plan")
        return plan(current)
      },
      fetch: async () => {
        calls.push("fetch")
        return {
          evidenceRef: `tool-result:web-fetch:${"e".repeat(64)}`,
          sourceDomain: current.sourceDomain,
          sourceTimestamp: current.sourceTimestamp,
          fetchedAt: current.fetchedAt,
          auditEventId: "audit:web-fetch:166",
          diagnosisPayload: { output: "private fetched current value" },
        }
      },
      diagnose: async ({ evidenceRef }) => {
        calls.push("diagnose")
        return diagnosis(evidenceRef)
      },
      signal: new AbortController().signal,
    })

    expect(calls).toEqual(["search", "plan", "fetch", "diagnose"])
    expect(trace.answerProduced).toBe(true)
    expect(trace.resultDiagnosis?.diagnosedBy).toBe("llm")
    expect(trace.liveAcceptance?.sourceEvidence).toHaveLength(1)
    expect(JSON.stringify(trace)).not.toMatch(/private search|private fetched|private-query/u)
  })

  it("does not fetch when LLM selection is non-LLM, foreign or malformed", async () => {
    const fetch = vi.fn()
    await expect(
      runWebRetrievalLiveScenario({
        runId: RUN_ID,
        scenario,
        search: async () => ({
          candidates: [candidate()],
          auditEventId: "audit:web-search:166",
          diagnosisPayload: {},
        }),
        plan: async () => ({
          ...plan(),
          diagnosedBy: "rule",
          selectedEvidenceRef: `tool-result:foreign:${"f".repeat(64)}`,
        }),
        fetch,
        diagnose: vi.fn(),
        signal: new AbortController().signal,
      }),
    ).rejects.toEqual(expect.objectContaining({ code: "web_live_llm_source_selection_invalid" }))
    expect(fetch).not.toHaveBeenCalled()
  })

  it.each([
    ["web_live_search_evidence_invalid", { candidates: [], auditEventId: "audit:search" }],
    ["web_live_search_audit_missing", { candidates: [candidate()], auditEventId: null }],
  ])("rejects invalid search observation with %s", async (code, observation) => {
    await expect(
      runWebRetrievalLiveScenario({
        runId: RUN_ID,
        scenario,
        search: async () => ({ ...observation, diagnosisPayload: {} }),
        plan: vi.fn(),
        fetch: vi.fn(),
        diagnose: vi.fn(),
        signal: new AbortController().signal,
      }),
    ).rejects.toEqual(expect.objectContaining({ code }))
  })

  it("rejects tool success without source time, audit or matching LLM diagnosis", async () => {
    await expect(
      runWebRetrievalLiveScenario({
        runId: RUN_ID,
        scenario,
        search: async () => ({
          candidates: [candidate()],
          auditEventId: "audit:web-search:166",
          diagnosisPayload: {},
        }),
        plan: async () => plan(),
        fetch: async () => ({
          evidenceRef: `tool-result:web-fetch:${"e".repeat(64)}`,
          sourceDomain: "quote.example",
          sourceTimestamp: null,
          fetchedAt: "2026-07-17T18:59:05.000Z",
          auditEventId: null,
          diagnosisPayload: {},
        }),
        diagnose: async ({ evidenceRef }) => ({
          ...diagnosis(evidenceRef),
          diagnosedBy: "fixture",
        }),
        signal: new AbortController().signal,
      }),
    ).rejects.toBeInstanceOf(WebRetrievalLiveRunnerError)
  })

  it("stops before external calls when cancelled", async () => {
    const controller = new AbortController()
    controller.abort()
    const search = vi.fn()
    await expect(
      runWebRetrievalLiveScenario({
        runId: RUN_ID,
        scenario,
        search,
        plan: vi.fn(),
        fetch: vi.fn(),
        diagnose: vi.fn(),
        signal: controller.signal,
      }),
    ).rejects.toEqual(expect.objectContaining({ code: "web_live_cancelled" }))
    expect(search).not.toHaveBeenCalled()
  })

  it("keeps tool, DB, provider, filesystem and environment access behind ports", () => {
    const source = readFileSync(
      join(process.cwd(), "packages/core/src/runs/web-retrieval-live-runner.ts"),
      "utf8",
    )
    expect(source).not.toContain("process.env")
    expect(source).not.toMatch(
      /node:fs|tools\/dispatcher|db\/|ai\/|globalThis\.fetch|await\s+fetch\(/u,
    )
  })
})

describe("Task 166 ToolDispatcher integration", () => {
  let stateDir: string

  beforeEach(() => {
    closeDb()
    stateDir = mkdtempSync(join(tmpdir(), "knowbee-task166-web-"))
    tempDirs.push(stateDir)
    initializeTestDbRuntime(stateDir)
    insertSession({
      id: "session:task166",
      source: "webui",
      source_id: null,
      created_at: NOW,
      updated_at: NOW,
      summary: null,
    })
    createRootRun({
      id: RUN_ID,
      sessionId: "session:task166",
      prompt: scenario.request,
      source: "webui",
      requestGroupId: RUN_ID,
    })
  })

  afterEach(() => {
    closeDb()
    while (tempDirs.length > 0) {
      const path = tempDirs.pop()
      if (path) rmSync(path, { recursive: true, force: true })
    }
  })

  it("uses actual dispatcher executions and persisted audit rows without leaking raw output", async () => {
    const dispatcher = new ToolDispatcher({
      config: {
        ...DEFAULT_CONFIG,
        security: { ...DEFAULT_CONFIG.security, approvalMode: "off" },
      },
    })
    dispatcher.register({
      name: "web_search",
      description: "live search probe",
      parameters: { type: "object", properties: {} },
      riskLevel: "safe",
      requiresApproval: false,
      async execute() {
        return {
          success: true,
          output: "private search body",
          details: {
            sourceEvidence: [
              {
                sourceUrl: candidate().sourceUrl,
                sourceDomain: candidate().sourceDomain,
                sourceTimestamp: candidate().sourceTimestamp,
                fetchTimestamp: candidate().fetchedAt,
              },
            ],
          },
        }
      },
    })
    dispatcher.register({
      name: "web_fetch",
      description: "live fetch probe",
      parameters: { type: "object", properties: {} },
      riskLevel: "safe",
      requiresApproval: false,
      async execute() {
        return {
          success: true,
          output: "private fetched body",
          details: {
            sourceEvidence: {
              sourceUrl: candidate().sourceUrl,
              sourceDomain: candidate().sourceDomain,
              sourceTimestamp: candidate().sourceTimestamp,
              fetchTimestamp: candidate().fetchedAt,
            },
          },
        }
      },
    })
    const runtime = createTestAgentRuntimeDependencies(stateDir)
    const context: ToolContext = {
      artifactStorage: runtime.artifactStorage,
      sessionId: "session:task166",
      runId: RUN_ID,
      requestGroupId: RUN_ID,
      workDir: stateDir,
      userMessage: scenario.request,
      source: "webui",
      allowWebAccess: true,
      onProgress: () => undefined,
      signal: new AbortController().signal,
    }
    const adapter = createWebRetrievalToolDispatchAdapter({
      dispatcher,
      contextFor: ({ signal }) => ({ ...context, signal }),
      findAuditEventId: ({ runId, toolName }) =>
        listAuditLogsForRun(runId).findLast((row) => row.tool_name === toolName)?.id ?? null,
    })
    const planPort = vi.fn(async ({ candidates, diagnosisPayload }) => {
      expect(diagnosisPayload).toEqual(
        expect.objectContaining({
          role: "external_data",
          policyAuthority: "none",
          trustClass: "untrusted_external",
          instructionIsolation: "data_only",
          redactionState: "redacted",
        }),
      )
      return plan(candidates[0])
    })
    const diagnosePort = vi.fn(async ({ evidenceRef, diagnosisPayload }) => {
      expect(diagnosisPayload).toEqual(
        expect.objectContaining({
          role: "external_data",
          policyAuthority: "none",
          trustClass: "untrusted_external",
          instructionIsolation: "data_only",
          redactionState: "redacted",
        }),
      )
      return diagnosis(evidenceRef)
    })
    const trace = await runWebRetrievalLiveScenario({
      runId: RUN_ID,
      scenario,
      search: adapter.search,
      plan: planPort,
      fetch: adapter.fetch,
      diagnose: diagnosePort,
      signal: context.signal,
    })

    expect(listAuditLogsForRun(RUN_ID).map((row) => row.tool_name)).toEqual([
      "web_search",
      "web_fetch",
    ])
    expect(planPort).toHaveBeenCalledOnce()
    expect(diagnosePort).toHaveBeenCalledOnce()
    expect(trace.liveAcceptance?.auditEventId).toBeTruthy()
    expect(JSON.stringify(trace)).not.toMatch(
      /private search body|private fetched body|private-query/u,
    )
    const summary = {
      kind: "web_retrieval.live_smoke" as const,
      mode: "live-run" as const,
      smokeId: "web-smoke:task166",
      policyVersion: "web-evidence-llm-diagnosis-v2",
      startedAt: new Date(NOW - 1_000).toISOString(),
      finishedAt: new Date(NOW).toISOString(),
      status: "passed" as const,
      counts: { total: 1, passed: 1, failed: 0, skipped: 0 },
      results: [
        {
          scenario,
          status: "passed" as const,
          failures: [],
          trace,
          startedAt: new Date(NOW - 1_000).toISOString(),
          finishedAt: new Date(NOW).toISOString(),
        },
      ],
    }
    expect(
      produceWebLiveAcceptanceEvidence({
        run: summary,
        now: NOW,
        maxSourceAgeMs: 5 * 60_000,
      }).accepted,
    ).toHaveLength(1)
  })
})
