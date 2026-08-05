import { createRequire } from "node:module"
import { mkdtempSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { registerAdminRoute } from "../packages/core/src/api/routes/admin.ts"
import { installApiRuntimeConfig } from "../packages/core/src/api/runtime-context.ts"
import { recordControlEvent } from "../packages/core/src/control-plane/timeline.ts"
import { closeDb, insertSession } from "../packages/core/src/db/index.js"
import { recordMessageLedgerEvent } from "../packages/core/src/runs/message-ledger.ts"
import { createRootRun } from "../packages/core/src/runs/store.ts"
import {
  createTestRuntimeConfigFixture,
  type TestRuntimeConfigFixture,
} from "./fixtures/runtime-config.ts"
import { initializeTestDbRuntime } from "./fixtures/runtime-db.ts"

const require = createRequire(import.meta.url)
const Fastify = require("../packages/core/node_modules/fastify") as (options: { logger: boolean }) => {
  ready(): Promise<void>
  close(): Promise<void>
  inject(options: { method: string; url: string; payload?: unknown }): Promise<{ statusCode: number; json(): any }>
}

const tempDirs: string[] = []
let runtimeFixture: TestRuntimeConfigFixture

function useTempRuntime(): void {
  closeDb()
  const rootDir = mkdtempSync(join(tmpdir(), "knowbee-admin-tool-lab-"))
  tempDirs.push(rootDir)
  runtimeFixture = createTestRuntimeConfigFixture({ rootDir })
  initializeTestDbRuntime(runtimeFixture.paths.stateDir)
}

function disposeTempRuntime(): void {
  closeDb()
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
}

function seedRun(): { runId: string; requestGroupId: string; sessionKey: string } {
  const now = Date.now()
  const runId = "run-task012-tool-lab"
  const requestGroupId = "group-task012-tool-lab"
  const sessionKey = "session-task012-tool-lab"
  insertSession({
    id: sessionKey,
    source: "telegram",
    source_id: "chat-task012",
    created_at: now,
    updated_at: now,
    summary: "task012 admin tool lab session",
  })
  createRootRun({
    id: runId,
    sessionId: sessionKey,
    requestGroupId,
    prompt: "지금 코스피 지수 얼마야",
    source: "telegram",
  })
  return { runId, requestGroupId, sessionKey }
}

function adminRuntimeOptions() {
  return {
    uiModeRuntime: {
      adminActivation: {
        env: { KNOWBEE_ADMIN_UI: "1" },
        nodeEnv: undefined,
      },
      rollbackActivation: { env: {} },
    },
  }
}

beforeEach(() => {
  useTempRuntime()
})

afterEach(() => {
  disposeTempRuntime()
})

describe("task012 admin tool calls and web retrieval lab", () => {
  it("shows tool calls with redacted params, approval state, result, duration, and retry count", async () => {
    const { runId, requestGroupId } = seedRun()
    recordMessageLedgerEvent({
      runId,
      eventKind: "tool_started",
      status: "started",
      summary: "web_fetch started",
      detail: { toolName: "web_fetch", params: { url: "https://www.google.com/finance/quote/KOSPI:KRX", apiKey: "sk-task012-secret-1234567890" } },
    })
    recordMessageLedgerEvent({
      runId,
      eventKind: "approval_requested",
      status: "pending",
      summary: "web_fetch approval requested",
      detail: { toolName: "web_fetch" },
    })
    recordMessageLedgerEvent({
      runId,
      eventKind: "approval_received",
      status: "succeeded",
      summary: "web_fetch approval approved",
      detail: { toolName: "web_fetch", decision: "approved" },
    })
    recordMessageLedgerEvent({
      runId,
      eventKind: "tool_done",
      status: "succeeded",
      summary: "web_fetch done",
      detail: { toolName: "web_fetch", durationMs: 42, retryCount: 1, output: { text: "Bearer sk-task012-output-secret-1234567890 KOSPI 3085.42" } },
    })

    const app = Fastify({ logger: false })
    installApiRuntimeConfig(app as never, runtimeFixture.config, runtimeFixture.paths)
    registerAdminRoute(app, adminRuntimeOptions())
    await app.ready()
    try {
      const response = await app.inject({ method: "GET", url: `/api/admin/tool-lab?requestGroupId=${encodeURIComponent(requestGroupId)}&limit=50` })
      expect(response.statusCode).toBe(200)
      const body = response.json()
      const call = body.toolCalls.calls.find((item: any) => item.toolName === "web_fetch")
      expect(call).toEqual(expect.objectContaining({
        toolName: "web_fetch",
        status: "succeeded",
        approvalState: "approved",
        durationMs: 42,
        signalCount: 1,
      }))
      expect(JSON.stringify(call)).not.toMatch(/sk-task012|Bearer sk-/i)
      expect(call.redactionApplied).toBe(true)
    } finally {
      await app.close()
    }
  })

  it("tracks provenance attempts and the LLM result-diagnosis receipt", async () => {
    const { runId, requestGroupId } = seedRun()
    recordMessageLedgerEvent({
      runId,
      eventKind: "tool_started",
      status: "started",
      summary: "web_search started",
      detail: { toolName: "web_search", params: { query: "지금 코스피 지수 얼마야" } },
    })
    recordMessageLedgerEvent({
      runId,
      eventKind: "tool_done",
      status: "succeeded",
      summary: "web_search done",
      detail: { toolName: "web_search", output: { source: "search_index", value: "3085.42" } },
    })
    recordControlEvent({
      eventType: "web_retrieval.source.checked",
      component: "web_retrieval",
      runId,
      requestGroupId,
      summary: "finance source checked",
      detail: {
        sourceEvidence: {
          method: "direct_fetch",
          sourceKind: "first_party",
          reliability: "high",
          sourceUrl: "https://www.google.com/finance/quote/KOSPI:KRX",
          sourceDomain: "www.google.com",
          sourceLabel: "KOSPI",
          sourceTimestamp: null,
          fetchTimestamp: "2026-04-17T05:55:24.000Z",
          freshnessPolicy: "latest_approximate",
        },
      },
    })
    recordControlEvent({
      eventType: "web_retrieval.result_diagnosis.completed",
      component: "web_retrieval",
      runId,
      requestGroupId,
      summary: "LLM result diagnosis completed",
      detail: {
        status: "complete",
        contextReceipt: {
          contextFingerprint: `sha256:${"a".repeat(64)}`,
          criterionKeys: ["existence", "accuracy", "freshness", "target_match"],
          conditionCount: 1,
          evidenceRefs: [`tool-result:tool:${"b".repeat(64)}`],
        },
      },
    })

    const app = Fastify({ logger: false })
    installApiRuntimeConfig(app as never, runtimeFixture.config, runtimeFixture.paths)
    registerAdminRoute(app, adminRuntimeOptions())
    await app.ready()
    try {
      const response = await app.inject({ method: "GET", url: `/api/admin/tool-lab?requestGroupId=${encodeURIComponent(requestGroupId)}&query=${encodeURIComponent("지금 코스피 지수 얼마야")}` })
      expect(response.statusCode).toBe(200)
      const session = response.json().webRetrieval.sessions[0]
      expect(session.queryVariants).toEqual(expect.arrayContaining(["지금 코스피 지수 얼마야"]))
      expect(session.fetchAttempts.length).toBeGreaterThanOrEqual(1)
      expect(session.resultDiagnosis).toBe("[internal-llm-data-hidden]")
      expect(JSON.stringify(session)).not.toMatch(
        /contextFingerprint|criterionKeys|conditionCount|evidenceRefs/u,
      )
      expect(session.policySeparation).toEqual({ evidence: "provenance_only", completion: "llm_result_diagnosis", semanticComparisonAllowed: false })
    } finally {
      await app.close()
    }
  })

  it("replays web retrieval fixtures offline without semantic string checks", async () => {
    const app = Fastify({ logger: false })
    installApiRuntimeConfig(app as never, runtimeFixture.config, runtimeFixture.paths)
    registerAdminRoute(app, adminRuntimeOptions())
    await app.ready()
    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/admin/web-retrieval-fixtures/replay",
        payload: { fixtureIds: ["finance-kospi-latest", "finance-nasdaq-browser-timeout-fallback", "weather-dongcheon-partial"] },
      })
      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.networkUsed).toBe(false)
      expect(body.semanticComparisonAllowed).toBe(false)
      expect(body.verificationMode).toBe("llm_result_diagnosis_contract")
      expect(body.fixtureCount).toBe(3)
      expect(body.summary.status).toBe("passed")
      expect(body.results.map((result: any) => result.fixtureId)).toEqual(["finance-kospi-latest", "finance-nasdaq-browser-timeout-fallback", "weather-dongcheon-partial"])
      expect(JSON.stringify(body)).not.toMatch(/canAnswer|acceptedValue|evidenceSufficiency/i)
    } finally {
      await app.close()
    }
  })
})
